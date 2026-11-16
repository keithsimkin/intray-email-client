import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { accessSync, constants } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";
import { parseCursorModelList } from "./cursorModels";
import { loadAiSecret, type AiSecretId } from "./secretAccess";

export type AiProviderId =
  | "openai"
  | "grok"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "claude-code"
  | "codex"
  | "cursor"
  | "opencode"
  | "none";

export type AiCompleteInput = {
  provider: AiProviderId;
  prompt: string;
  system?: string;
  model?: string;
  bridgePath?: string;
  maxTokens?: number;
};

export type AiCompleteResult = {
  text: string;
  provider: AiProviderId;
  model?: string;
};

export type AiModelChoice = {
  id: string;
  label: string;
};

export type AiModelList = {
  connected: boolean;
  models: AiModelChoice[];
  detail?: string;
};

type ListedModels = {
  models: AiModelChoice[];
  detail?: string;
};

export type AiProviderStatus = {
  id: AiProviderId;
  available: boolean;
  reason?: string;
  defaultModel?: string;
  /** Resolved CLI binary, when this provider is a local CLI. */
  path?: string;
  /** Models discovered on this PC (Ollama tags). */
  models?: AiModelChoice[];
};

function existsFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Common install locations when Electron's PATH is thinner than a login shell. */
function wellKnownBins(cmd: string): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const local = process.env.LOCALAPPDATA || "";
  const win = process.platform === "win32";
  if (cmd === "cursor-agent") {
    return win
      ? [
          join(local, "cursor-agent", "cursor-agent.cmd"),
          join(local, "cursor-agent", "agent.cmd"),
          join(local, "Programs", "cursor", "resources", "app", "bin", "cursor-agent.cmd"),
        ]
      : [
          join(home, ".local", "bin", "cursor-agent"),
          join(home, ".cursor", "bin", "cursor-agent"),
          "/usr/local/bin/cursor-agent",
        ];
  }
  if (cmd === "claude") {
    return win
      ? [
          join(home, ".local", "bin", "claude.exe"),
          join(local, "Programs", "claude", "claude.exe"),
        ]
      : [join(home, ".local", "bin", "claude"), "/usr/local/bin/claude"];
  }
  if (cmd === "codex") {
    return win
      ? [join(local, "Programs", "OpenAI", "Codex", "bin", "codex.exe")]
      : [join(home, ".local", "bin", "codex"), "/usr/local/bin/codex"];
  }
  if (cmd === "opencode") {
    return win
      ? [join(local, "opencode", "opencode.exe"), join(home, ".opencode", "bin", "opencode.exe")]
      : [join(home, ".opencode", "bin", "opencode"), "/usr/local/bin/opencode"];
  }
  return [];
}

function which(cmd: string, extraPath?: string): string | null {
  if (extraPath && isAbsolute(extraPath) && existsFile(extraPath)) {
    return extraPath;
  }
  const pathEnv = process.env.PATH ?? "";
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
      : [""];
  const names =
    process.platform === "win32"
      ? [cmd, ...exts.map((e) => `${cmd}${e}`)]
      : [cmd];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate =
        process.platform === "win32"
          ? `${dir.replace(/[/\\]+$/, "")}\\${name}`
          : `${dir.replace(/\/+$/, "")}/${name}`;
      if (existsFile(candidate)) return candidate;
    }
  }
  for (const candidate of wellKnownBins(cmd)) {
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the Cursor agent binary. Prefer cursor-agent over a bare `agent`,
 * which often collides with unrelated tools (e.g. Grok's agent.exe).
 */
function resolveCursorAgent(bridgePath?: string): string | null {
  if (bridgePath && isAbsolute(bridgePath) && existsFile(bridgePath)) {
    return bridgePath;
  }
  const dedicated = which("cursor-agent", bridgePath);
  if (dedicated) return dedicated;
  // Only accept bare `agent` when it lives under a cursor-agent install.
  const bare = which("agent", bridgePath);
  if (bare && /cursor-agent|cursor[\\/].*agent/i.test(bare)) return bare;
  for (const candidate of wellKnownBins("cursor-agent")) {
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Windows `.cmd` shims break when the path contains a space (`C:\Users\CORE i5\...`):
 * `shell: true` splits on that space. Cursor's shim is PowerShell calling a local
 * node.exe, so run that binary directly and keep the prompt out of cmd.exe.
 */
export function commandForSpawn(
  command: string,
  args: string[],
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) {
    return { command, args };
  }
  const dir = dirname(command);
  const node = join(dir, "node.exe");
  const index = join(dir, "index.js");
  if (existsFile(node) && existsFile(index)) {
    return {
      command: node,
      args: [index, ...args],
      env: { CURSOR_INVOKED_AS: basename(command) },
    };
  }
  const ps1 = command.replace(/\.(cmd|bat)$/i, ".ps1");
  if (existsFile(ps1)) {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    return {
      command: join(
        systemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, ...args],
      env: { CURSOR_INVOKED_AS: basename(command) },
    };
  }
  return { command, args };
}

async function runProcess(
  command: string,
  args: string[],
  opts?: { input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const launched = commandForSpawn(command, args);
    const child = spawn(launched.command, launched.args, {
      // Mail prompts must not inherit the app repo as a trusted workspace.
      cwd: tmpdir(),
      env: { ...process.env, ...launched.env, ...opts?.env },
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out running ${command}`));
    }, opts?.timeoutMs ?? 120_000);
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    if (opts?.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

async function openAiCompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<AiCompleteResult> {
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI HTTP ${res.status}: ${body.slice(0, 280)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty completion from provider");
  return { text, provider: "openai", model: json.model ?? opts.model };
}

async function anthropicComplete(opts: {
  apiKey: string;
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<AiCompleteResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 280)}`);
  }
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    model?: string;
  };
  const text = json.content
    ?.filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Empty completion from Anthropic");
  return { text, provider: "anthropic", model: json.model ?? opts.model };
}

async function geminiComplete(opts: {
  apiKey: string;
  model: string;
  system?: string;
  prompt: string;
}): Promise<AiCompleteResult> {
  const model = opts.model.trim();
  if (!model) throw new Error("Gemini model missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts: { text: string }[] = [];
  if (opts.system) parts.push({ text: `System: ${opts.system}\n\n` });
  parts.push({ text: opts.prompt });
  const res = await fetch(url, {
    method: "POST",
    // Key goes in a header, not the query string, so it never lands in logs
    // or proxy access trails.
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": opts.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 280)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";
  if (!text) throw new Error("Empty completion from Gemini");
  return { text, provider: "gemini", model };
}

/**
 * Ollama is documented as local-only. If a user pastes a remote URL into the
 * Ollama field, refuse instead of silently shipping mail bodies to it.
 */
function localOnlyHost(raw: string | undefined): string {
  const fallback = "http://127.0.0.1:11434";
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const local =
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]";
    if (!local || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return fallback;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

async function ollamaComplete(opts: {
  model: string;
  system?: string;
  prompt: string;
  host?: string;
}): Promise<AiCompleteResult> {
  const model = opts.model.trim();
  if (!model) throw new Error("Ollama model missing");
  const host = localOnlyHost(opts.host);
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 280)}`);
  }
  const json = (await res.json()) as {
    message?: { content?: string };
    model?: string;
  };
  const text = json.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty completion from Ollama");
  return { text, provider: "ollama", model: json.model ?? opts.model };
}

/** Drop embedding, speech, and image models. Everything else is whatever the account returned. */
function isChatModelId(id: string): boolean {
  return !/(embed|whisper|tts|dall-e|moderation|transcri|audio|realtime|^text-|^davinci|^babbage|^ada$|similarity|search-|image)/i.test(
    id,
  );
}

async function listOpenAiModels(
  baseUrl: string,
  apiKey: string,
): Promise<ListedModels> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    return {
      models: [],
      detail: `The provider refused the model list (HTTP ${res.status}). Check the API key, then check the connection again.`,
    };
  }
  const json = (await res.json()) as { data?: { id?: string }[] };
  const models = (json.data ?? [])
    .map((row) => (row.id ?? "").trim())
    .filter((id) => id && isChatModelId(id))
    .map((id) => ({ id, label: id }));
  return { models };
}

async function listAnthropicModels(apiKey: string): Promise<ListedModels> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    return {
      models: [],
      detail: `Anthropic refused the model list (HTTP ${res.status}). Check the API key, then check the connection again.`,
    };
  }
  const json = (await res.json()) as {
    data?: { id?: string; display_name?: string }[];
  };
  const models = (json.data ?? [])
    .map((row) => {
      const id = (row.id ?? "").trim();
      const label = (row.display_name ?? "").trim() || id;
      return id ? { id, label } : null;
    })
    .filter((row): row is AiModelChoice => Boolean(row));
  return { models };
}

async function listGeminiModels(apiKey: string): Promise<ListedModels> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    return {
      models: [],
      detail: `Gemini refused the model list (HTTP ${res.status}). Check the API key, then check the connection again.`,
    };
  }
  const json = (await res.json()) as {
    models?: {
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }[];
  };
  const models = (json.models ?? [])
    .filter((row) =>
      (row.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((row) => {
      const id = (row.name ?? "").replace(/^models\//, "").trim();
      const label = (row.displayName ?? "").trim() || id;
      return id ? { id, label } : null;
    })
    .filter((row): row is AiModelChoice => Boolean(row));
  return { models };
}

async function listCursorModels(bin: string): Promise<ListedModels> {
  try {
    const { stdout, stderr } = await runProcess(bin, ["--list-models"], {
      timeoutMs: 4000,
      env: { NO_OPEN_BROWSER: "1" },
    });
    const models = parseCursorModelList(`${stdout}\n${stderr}`);
    if (models.length) return { models };
    const blob = `${stdout}\n${stderr}`.toLowerCase();
    if (blob.includes("authentication") || blob.includes("login")) {
      return {
        models: [],
        detail:
          "Cursor CLI is installed but not signed in. Run cursor-agent login, then check the connection.",
      };
    }
    return {
      models: [],
      detail: "Cursor CLI is installed, but it didn’t return a model list.",
    };
  } catch {
    return {
      models: [],
      detail: "Cursor CLI is installed, but the model list didn’t come back.",
    };
  }
}

function ollamaHost(): string {
  const raw = loadAiSecret("ollama") || "http://127.0.0.1:11434";
  return /^https?:\/\//i.test(raw)
    ? raw.replace(/\/$/, "")
    : "http://127.0.0.1:11434";
}

async function listOllamaModels(): Promise<AiModelList> {
  const host = ollamaHost();
  try {
    const res = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return {
        connected: false,
        models: [],
        detail: `Ollama at ${host} didn’t respond (HTTP ${res.status}). Start it, then check the connection.`,
      };
    }
    const json = (await res.json()) as { models?: { name?: string }[] };
    const models = (json.models ?? [])
      .map((row) => (row.name ?? "").trim())
      .filter(Boolean)
      .map((name) => ({ id: name, label: name }));
    if (!models.length) {
      return {
        connected: true,
        models: [],
        detail:
          "Ollama is running, but no models are installed. Pull a model, then check the connection.",
      };
    }
    return { connected: true, models };
  } catch {
    return {
      connected: false,
      models: [],
      detail: `Can’t reach Ollama at ${host}. Start it, then check the connection.`,
    };
  }
}

function missingCli(name: string, binary: string): AiModelList {
  return {
    connected: false,
    models: [],
    detail: `Connect ${name} on this PC — install ${binary} or paste its path — then check the connection.`,
  };
}

function cliWithoutModels(name: string, detail?: string): AiModelList {
  return {
    connected: true,
    models: [],
    detail:
      detail ??
      `${name} is installed, but it doesn’t report a model list. It uses the model from its own login.`,
  };
}

async function listKeyedModels(
  secretId: "openai" | "grok" | "anthropic" | "gemini",
  missing: string,
  load: (apiKey: string) => Promise<ListedModels>,
): Promise<AiModelList> {
  const key = loadAiSecret(secretId);
  if (!key) {
    return { connected: false, models: [], detail: missing };
  }
  try {
    const listed = await load(key);
    if (!listed.models.length) {
      return {
        connected: true,
        models: [],
        detail:
          listed.detail ??
          "The key is saved, but the provider didn’t return any models.",
      };
    }
    return { connected: true, models: listed.models };
  } catch {
    return {
      connected: true,
      models: [],
      detail:
        "The key is saved, but the model list didn’t come back. Check the connection again.",
    };
  }
}

/** Models the settings picker can offer. Never invents a catalog. */
export async function listProviderModels(
  provider: AiProviderId,
  bridgePath?: string,
): Promise<AiModelList> {
  switch (provider) {
    case "openai":
      return listKeyedModels(
        "openai",
        "Connect OpenAI by adding an API key above, then check the connection.",
        (key) => listOpenAiModels("https://api.openai.com/v1", key),
      );
    case "grok":
      return listKeyedModels(
        "grok",
        "Connect Grok by adding an API key above, then check the connection.",
        (key) => listOpenAiModels("https://api.x.ai/v1", key),
      );
    case "anthropic":
      return listKeyedModels(
        "anthropic",
        "Connect Anthropic by adding an API key above, then check the connection.",
        listAnthropicModels,
      );
    case "gemini":
      return listKeyedModels(
        "gemini",
        "Connect Gemini by adding an API key above, then check the connection.",
        listGeminiModels,
      );
    case "ollama":
      return listOllamaModels();
    case "claude-code": {
      const bin = which("claude", bridgePath);
      if (!bin) return missingCli("Claude Code", "claude");
      return cliWithoutModels("Claude Code");
    }
    case "codex": {
      const bin = which("codex", bridgePath);
      if (!bin) return missingCli("Codex", "codex");
      return cliWithoutModels("Codex");
    }
    case "cursor": {
      const bin = resolveCursorAgent(bridgePath);
      if (!bin) return missingCli("Cursor", "cursor-agent");
      const listed = await listCursorModels(bin);
      if (!listed.models.length) return cliWithoutModels("Cursor", listed.detail);
      return { connected: true, models: listed.models };
    }
    case "opencode": {
      const bin = which("opencode", bridgePath);
      if (!bin) return missingCli("OpenCode", "opencode");
      return cliWithoutModels("OpenCode");
    }
    default:
      return { connected: false, models: [] };
  }
}

async function cliPrompt(
  provider: AiProviderId,
  bin: string,
  args: string[],
  prompt: string,
  system?: string,
  opts?: { passPromptAsArg?: boolean },
): Promise<AiCompleteResult> {
  const full = system ? `${system}\n\n${prompt}` : prompt;
  const argv = opts?.passPromptAsArg ? [...args, full] : args;
  const { stdout, stderr, code } = await runProcess(bin, argv, {
    input: opts?.passPromptAsArg ? undefined : full,
    timeoutMs: 180_000,
    // A mail action must not open a login browser. Auth errors come back as text.
    env: { NO_OPEN_BROWSER: "1" },
  });
  const text = stdout.trim() || stderr.trim();
  const detail = [stdout, stderr]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/tracing to /i.test(line))
    .join("\n")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim();
  const blocked =
    /credit balance is too low|usage limit reached|not logged in|authentication required|please log in|login required|actionrequirederror/i;
  if ((code && code !== 0 && !stdout.trim()) || blocked.test(detail)) {
    throw new Error(detail || `${provider} exited with code ${code}`);
  }
  if (!text) throw new Error(`Empty output from ${provider}`);
  return { text, provider };
}

export async function detectProviders(
  bridgePath?: string,
): Promise<AiProviderStatus[]> {
  const secret = (id: AiSecretId) => Boolean(loadAiSecret(id));
  const ollamaHostRaw = loadAiSecret("ollama") || "http://127.0.0.1:11434";
  const ollamaHost = /^https?:\/\//i.test(ollamaHostRaw)
    ? ollamaHostRaw.replace(/\/$/, "")
    : "http://127.0.0.1:11434";
  let ollamaUp = false;
  let ollamaModels: AiModelChoice[] = [];
  try {
    const res = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      ollamaUp = true;
      const json = (await res.json()) as { models?: { name?: string }[] };
      ollamaModels = (json.models ?? [])
        .map((m) => (m.name ?? "").trim())
        .filter(Boolean)
        .map((name) => ({ id: name, label: name }));
    }
  } catch {
    ollamaUp = false;
  }

  const claudePath = which("claude", bridgePath);
  const codexPath = which("codex", bridgePath);
  const cursorPath = resolveCursorAgent(bridgePath);
  const opencodePath = which("opencode", bridgePath);

  return [
    {
      id: "openai",
      available: secret("openai"),
      reason: secret("openai") ? undefined : "Add an OpenAI API key in Settings",
    },
    {
      id: "grok",
      available: secret("grok"),
      reason: secret("grok") ? undefined : "Add an xAI / Grok API key in Settings",
    },
    {
      id: "anthropic",
      available: secret("anthropic"),
      reason: secret("anthropic")
        ? undefined
        : "Add an Anthropic API key in Settings",
    },
    {
      id: "gemini",
      available: secret("gemini"),
      reason: secret("gemini")
        ? undefined
        : "Add a Google AI Studio key in Settings",
    },
    {
      id: "ollama",
      available: ollamaUp,
      reason: ollamaUp ? undefined : `Ollama not reachable at ${ollamaHost}`,
      models: ollamaModels,
    },
    {
      id: "claude-code",
      available: Boolean(claudePath),
      path: claudePath ?? undefined,
      reason: claudePath
        ? undefined
        : "claude CLI not found on PATH or common install folders",
    },
    {
      id: "codex",
      available: Boolean(codexPath),
      path: codexPath ?? undefined,
      reason: codexPath
        ? undefined
        : "codex CLI not found on PATH or common install folders",
    },
    {
      id: "cursor",
      available: Boolean(cursorPath),
      path: cursorPath ?? undefined,
      reason: cursorPath
        ? undefined
        : "Cursor agent CLI not found (install cursor-agent or set its path)",
    },
    {
      id: "opencode",
      available: Boolean(opencodePath),
      path: opencodePath ?? undefined,
      reason: opencodePath
        ? undefined
        : "opencode CLI not found on PATH or common install folders",
    },
    { id: "none", available: true },
  ];
}

/** Use the user's pick, otherwise the first id the provider actually reported. */
export function pickLiveModel(
  requested: string | undefined,
  listed: { id: string }[],
): string | undefined {
  const picked = requested?.trim();
  if (picked) return picked;
  return listed.find((model) => model.id && model.id !== "auto")?.id;
}

const CLI_PROVIDERS = new Set<AiProviderId>([
  "claude-code",
  "codex",
  "cursor",
  "opencode",
]);

export async function completeAi(
  input: AiCompleteInput,
): Promise<AiCompleteResult> {
  const provider = input.provider;
  if (provider === "none") {
    throw new Error("AI is turned off. Pick a provider in Settings.");
  }

  let model = input.model?.trim() || undefined;
  if (!model && !CLI_PROVIDERS.has(provider)) {
    const listed = await listProviderModels(provider, input.bridgePath);
    model = pickLiveModel(undefined, listed.models);
    if (!model) {
      throw new Error(
        listed.detail ||
          "No model was reported. Check the connection, then pick a model in Settings.",
      );
    }
  }
  const system =
    input.system ??
    "You are Intray's local mail assistant. Be concise and accurate. Never invent emails that were not provided.";

  switch (provider) {
    case "openai": {
      const key = loadAiSecret("openai");
      if (!key) throw new Error("OpenAI API key missing");
      return openAiCompatible({
        baseUrl: "https://api.openai.com/v1",
        apiKey: key,
        model: model!,
        system,
        prompt: input.prompt,
        maxTokens: input.maxTokens,
      }).then((r) => ({ ...r, provider: "openai" }));
    }
    case "grok": {
      const key = loadAiSecret("grok");
      if (!key) throw new Error("Grok / xAI API key missing");
      return openAiCompatible({
        baseUrl: "https://api.x.ai/v1",
        apiKey: key,
        model: model!,
        system,
        prompt: input.prompt,
        maxTokens: input.maxTokens,
      }).then((r) => ({ ...r, provider: "grok" }));
    }
    case "anthropic": {
      const key = loadAiSecret("anthropic");
      if (!key) throw new Error("Anthropic API key missing");
      return anthropicComplete({
        apiKey: key,
        model: model!,
        system,
        prompt: input.prompt,
        maxTokens: input.maxTokens,
      });
    }
    case "gemini": {
      const key = loadAiSecret("gemini");
      if (!key) throw new Error("Gemini API key missing");
      return geminiComplete({
        apiKey: key,
        model: model!,
        system,
        prompt: input.prompt,
      });
    }
    case "ollama": {
      const host = loadAiSecret("ollama") || "http://127.0.0.1:11434";
      return ollamaComplete({
        model: model!,
        system,
        prompt: input.prompt,
        host: host.startsWith("http") ? host : "http://127.0.0.1:11434",
      });
    }
    case "claude-code": {
      const bin = which("claude", input.bridgePath);
      if (!bin) throw new Error("claude CLI not found");
      const args = ["-p", "--output-format", "text"];
      if (model) args.push("--model", model);
      return cliPrompt("claude-code", bin, args, input.prompt, system);
    }
    case "codex": {
      const bin = which("codex", input.bridgePath);
      if (!bin) throw new Error("codex CLI not found");
      const args = ["exec", "--sandbox", "read-only", "--skip-git-repo-check"];
      if (model) args.push("--model", model);
      args.push("-");
      return cliPrompt("codex", bin, args, input.prompt, system);
    }
    case "cursor": {
      const bin = resolveCursorAgent(input.bridgePath);
      if (!bin) throw new Error("Cursor agent CLI not found");
      // ask mode keeps mail assist read-only; pass prompt as argv (not stdin).
      // ask = read-only. --trust only acknowledges the temp cwd, not this repo.
      const args = ["-p", "--mode", "ask", "--trust", "--output-format", "text"];
      if (model) args.push("--model", model);
      return cliPrompt("cursor", bin, args, input.prompt, system, {
        passPromptAsArg: true,
      });
    }
    case "opencode": {
      const bin = which("opencode", input.bridgePath);
      if (!bin) throw new Error("opencode CLI not found");
      return cliPrompt("opencode", bin, ["run"], input.prompt, system);
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
