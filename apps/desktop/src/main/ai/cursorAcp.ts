import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { usageLimitMessage } from "../../shared/aiError";

/**
 * One long-lived Cursor agent (`agent acp`) for mail questions.
 * Print mode (`agent -p`) exits after every prompt, so summaries and replies
 * paid a full process start each time. This session stays up, answers in ask
 * mode, and refuses tool calls so it cannot read or edit the disk.
 * A fresh ACP session is used per question so earlier mail does not stay in
 * the prompt. The process itself is reused until it exits or the binary changes.
 */

export type CursorLaunch = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

export class CursorAcpError extends Error {
  constructor(
    message: string,
    /** When false, a one-shot process would only repeat this failure. */
    readonly fallback: boolean,
  ) {
    super(message);
    this.name = "CursorAcpError";
  }
}

export function cursorAcpShouldFallback(error: unknown): boolean {
  return !(error instanceof CursorAcpError) || error.fallback;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type RpcMessage = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};

const SESSION_CAP = 12;
const START_TIMEOUT_MS = 60_000;
const PROMPT_TIMEOUT_MS = 180_000;

function launchKey(launch: CursorLaunch): string {
  return `${launch.command}\0${launch.args.join("\0")}`;
}

function acpFailure(message: string): CursorAcpError {
  const limit = usageLimitMessage(message);
  if (limit) return new CursorAcpError(limit, false);
  if (
    /authentication required|not logged in|not signed in|please log in|login required/i.test(
      message,
    )
  ) {
    return new CursorAcpError(
      "Cursor CLI is installed but not signed in. Run cursor-agent login, then try again.",
      false,
    );
  }
  return new CursorAcpError(message, true);
}

function textOf(result: unknown): string {
  return typeof result === "string" ? result : "";
}

function permissionOutcome(params: Record<string, unknown> | undefined): {
  outcome: string;
  optionId?: string;
} {
  const options = Array.isArray(params?.options) ? params.options : [];
  for (const option of options) {
    if (!option || typeof option !== "object") continue;
    const row = option as { kind?: string; optionId?: string };
    if (
      (row.kind === "reject_once" || row.kind === "reject_always") &&
      typeof row.optionId === "string"
    ) {
      return { outcome: "selected", optionId: row.optionId };
    }
  }
  return { outcome: "cancelled" };
}

export class CursorAcpClient {
  private child: ChildProcess | null = null;
  private key = "";
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private chain: Promise<void> = Promise.resolve();
  private idleSessionId: string | null = null;
  private opened = 0;
  private answer = "";
  private thoughts = "";

  constructor(private spawnImpl: typeof spawn = spawn) {}

  warm(launch: CursorLaunch, model?: string): Promise<void> {
    return this.enqueue(() => this.prepare(launch, model));
  }

  complete(opts: {
    launch: CursorLaunch;
    model?: string;
    prompt: string;
    system?: string;
    timeoutMs?: number;
  }): Promise<string> {
    return this.enqueue(async () => {
      try {
        await this.prepare(opts.launch, opts.model);
        const sessionId = this.idleSessionId;
        this.idleSessionId = null;
        if (!sessionId) {
          throw new CursorAcpError("Cursor agent has no session", true);
        }
        this.answer = "";
        this.thoughts = "";
        const full = opts.system
          ? `${opts.system}\n\n${opts.prompt}`
          : opts.prompt;
        await this.request(
          "session/prompt",
          {
            sessionId,
            prompt: [{ type: "text", text: full }],
          },
          opts.timeoutMs ?? PROMPT_TIMEOUT_MS,
        );
        const text = (this.answer || this.thoughts).trim();
        const limit = usageLimitMessage(text);
        if (limit) throw new CursorAcpError(limit, false);
        if (!text) throw new CursorAcpError("Empty output from cursor", false);
        return text;
      } catch (error) {
        if (!(error instanceof CursorAcpError) || error.fallback) this.stop();
        throw error;
      }
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.key = "";
    this.buffer = "";
    this.idleSessionId = null;
    this.opened = 0;
    this.answer = "";
    this.thoughts = "";
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const waiter of pending) {
      waiter.reject(new CursorAcpError("Cursor agent stopped", true));
    }
    if (child && child.exitCode == null && !child.killed) {
      child.kill();
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async prepare(launch: CursorLaunch, model?: string): Promise<void> {
    await this.ensureProcess(launch);
    if (this.opened >= SESSION_CAP) {
      this.stop();
      await this.ensureProcess(launch);
    }
    if (!this.idleSessionId) {
      this.idleSessionId = await this.openSession(model);
    } else if (model) {
      await this.applyModel(this.idleSessionId, model);
    }
  }

  private async ensureProcess(launch: CursorLaunch): Promise<void> {
    const key = launchKey(launch);
    if (this.child && this.key === key && this.child.exitCode == null && !this.child.killed) {
      return;
    }
    this.stop();
    const child = this.spawnImpl(launch.command, launch.args, {
      cwd: tmpdir(),
      env: {
        ...process.env,
        ...launch.env,
        NO_OPEN_BROWSER: "1",
      },
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.key = key;
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.onData(chunk));
    child.on("error", (error) => {
      this.failAll(acpFailure(error.message));
    });
    child.on("close", () => {
      if (this.child !== child) return;
      this.child = null;
      this.failAll(new CursorAcpError("Cursor agent stopped", true));
    });
    try {
      await this.request(
        "initialize",
        {
          protocolVersion: 1,
          clientInfo: { name: "intray", version: "1" },
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        },
        START_TIMEOUT_MS,
      );
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private async openSession(model?: string): Promise<string> {
    const created = (await this.request(
      "session/new",
      { cwd: tmpdir(), mcpServers: [] },
      START_TIMEOUT_MS,
    )) as { sessionId?: string };
    const sessionId = created?.sessionId;
    if (!sessionId) {
      throw new CursorAcpError("Cursor agent did not open a session", true);
    }
    this.opened += 1;
    try {
      await this.request(
        "session/set_mode",
        { sessionId, modeId: "ask" },
        15_000,
      );
    } catch {
      // Ask mode is the safe default. A build without it still answers the prompt.
    }
    if (model) await this.applyModel(sessionId, model);
    return sessionId;
  }

  private async applyModel(sessionId: string, model: string): Promise<void> {
    try {
      await this.request(
        "session/set_model",
        { sessionId, modelId: model },
        15_000,
      );
    } catch {
      // The signed-in default model still answers.
    }
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const child = this.child;
    if (!child || !child.stdin) {
      return Promise.reject(new CursorAcpError("Cursor agent is not running", true));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CursorAcpError(`Timed out waiting for ${method}`, true));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    if (message.method && message.id != null) {
      this.onClientRequest(message);
      return;
    }
    if (message.id != null && !message.method) {
      const waiter = this.pending.get(Number(message.id));
      if (!waiter) return;
      this.pending.delete(Number(message.id));
      if (message.error) {
        waiter.reject(acpFailure(message.error.message || "Cursor agent failed"));
        return;
      }
      waiter.resolve(message.result);
      return;
    }
    if (message.method === "session/update") {
      this.onUpdate(message.params);
    }
  }

  private onClientRequest(message: RpcMessage): void {
    const child = this.child;
    if (!child?.stdin || message.id == null) return;
    if (message.method === "session/request_permission") {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { outcome: permissionOutcome(message.params) },
        })}\n`,
      );
      return;
    }
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Not available" },
      })}\n`,
    );
  }

  private onUpdate(params: Record<string, unknown> | undefined): void {
    const update = params?.update;
    if (!update || typeof update !== "object") return;
    const row = update as {
      sessionUpdate?: string;
      content?: { type?: string; text?: string };
    };
    const text = textOf(row.content?.text);
    if (!text) return;
    if (row.sessionUpdate === "agent_message_chunk") this.answer += text;
    if (row.sessionUpdate === "agent_thought_chunk") this.thoughts += text;
  }

  private failAll(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    this.idleSessionId = null;
    for (const waiter of pending) waiter.reject(error);
  }
}

let shared: CursorAcpClient | null = null;

export function cursorAcpClient(): CursorAcpClient {
  shared ??= new CursorAcpClient();
  return shared;
}

export function stopCursorAcp(): void {
  shared?.stop();
  shared = null;
}
