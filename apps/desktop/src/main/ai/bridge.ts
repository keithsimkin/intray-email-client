import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute } from "node:path";
import type { AiSecretId } from "./secrets";
import { loadAiSecret } from "./secrets";

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

export type AiProviderStatus = {
  id: AiProviderId;
  available: boolean;
  reason?: string;
  defaultModel?: string;
};

function which(cmd: string, extraPath?: string): string | null {
  if (extraPath && isAbsolute(extraPath)) {
    try {
      accessSync(extraPath, constants.X_OK);
      return extraPath;
    } catch {
      try {
        accessSync(extraPath, constants.F_OK);
        return extraPath;
      } catch {
        /* fall through */
      }
    }
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
    for (const name of names) {
      const full = `${dir}${dir.endsWith("\\") || dir.endsWith("/") ? "" : "\\"}${name}`.replace(
        /\\/g,
        process.platform === "win32" ? "\\" : "/",
      );
      // Normalize join
      const candidate =
        process.platform === "win32"
          ? `${dir.replace(/[/\\]+$/, "")}\\${name}`
          : `${dir.replace(/\/+$/, "")}/${name}`;
      try {
        accessSync(candidate, constants.F_OK);
        return candidate;
      } catch {
        void full;
      }
    }
  }
  return null;
}

async function runProcess(
  command: string,
  args: string[],
  opts?: { input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...opts?.env },
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
  const model = opts.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const parts: { text: string }[] = [];
  if (opts.system) parts.push({ text: `System: ${opts.system}\n\n` });
  parts.push({ text: opts.prompt });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
    }),
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

async function ollamaComplete(opts: {
  model: string;
  system?: string;
  prompt: string;
  host?: string;
}): Promise<AiCompleteResult> {
  const host = (opts.host || "http://127.0.0.1:11434").replace(/\/$/, "");
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model || "llama3.2",
      stream: false,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
    }),
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

async function cliPrompt(
  provider: AiProviderId,
  bin: string,
  args: string[],
  prompt: string,
  system?: string,
): Promise<AiCompleteResult> {
  const full = system ? `${system}\n\n${prompt}` : prompt;
  const { stdout, stderr, code } = await runProcess(bin, args, {
    input: full,
    timeoutMs: 180_000,
  });
  const text = stdout.trim() || stderr.trim();
  if (code && code !== 0 && !stdout.trim()) {
    throw new Error(stderr.trim() || `${provider} exited with code ${code}`);
  }
  if (!text) throw new Error(`Empty output from ${provider}`);
  return { text, provider };
}

export async function detectProviders(
  bridgePath?: string,
): Promise<AiProviderStatus[]> {
  const secret = (id: AiSecretId) => Boolean(loadAiSecret(id));
  let ollamaUp = false;
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(1500),
    });
    ollamaUp = res.ok;
  } catch {
    ollamaUp = false;
  }

  return [
    {
      id: "openai",
      available: secret("openai"),
      reason: secret("openai") ? undefined : "Add an OpenAI API key in Settings",
      defaultModel: "gpt-4o-mini",
    },
    {
      id: "grok",
      available: secret("grok"),
      reason: secret("grok") ? undefined : "Add an xAI / Grok API key in Settings",
      defaultModel: "grok-2-latest",
    },
    {
      id: "anthropic",
      available: secret("anthropic"),
      reason: secret("anthropic")
        ? undefined
        : "Add an Anthropic API key in Settings",
      defaultModel: "claude-sonnet-4-20250514",
    },
    {
      id: "gemini",
      available: secret("gemini"),
      reason: secret("gemini")
        ? undefined
        : "Add a Google AI Studio key in Settings",
      defaultModel: "gemini-2.0-flash",
    },
    {
      id: "ollama",
      available: ollamaUp,
      reason: ollamaUp ? undefined : "Ollama not reachable on localhost:11434",
      defaultModel: "llama3.2",
    },
    {
      id: "claude-code",
      available: Boolean(which("claude", bridgePath)),
      reason: which("claude", bridgePath)
        ? undefined
        : "claude CLI not found on PATH",
      defaultModel: "claude",
    },
    {
      id: "codex",
      available: Boolean(which("codex", bridgePath)),
      reason: which("codex", bridgePath)
        ? undefined
        : "codex CLI not found on PATH",
    },
    {
      id: "cursor",
      available: Boolean(
        which("cursor-agent", bridgePath) || which("agent", bridgePath),
      ),
      reason:
        which("cursor-agent", bridgePath) || which("agent", bridgePath)
          ? undefined
          : "Cursor agent CLI not found",
    },
    {
      id: "opencode",
      available: Boolean(which("opencode", bridgePath)),
      reason: which("opencode", bridgePath)
        ? undefined
        : "opencode CLI not found on PATH",
    },
    { id: "none", available: true },
  ];
}

export async function completeAi(
  input: AiCompleteInput,
): Promise<AiCompleteResult> {
  const provider = input.provider;
  if (provider === "none") {
    throw new Error("AI is turned off. Pick a provider in Settings.");
  }

  const model = input.model?.trim() || undefined;
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
        model: model || "gpt-4o-mini",
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
        model: model || "grok-2-latest",
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
        model: model || "claude-sonnet-4-20250514",
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
        model: model || "gemini-2.0-flash",
        system,
        prompt: input.prompt,
      });
    }
    case "ollama": {
      const host = loadAiSecret("ollama") || "http://127.0.0.1:11434";
      return ollamaComplete({
        model: model || "llama3.2",
        system,
        prompt: input.prompt,
        host: host.startsWith("http") ? host : "http://127.0.0.1:11434",
      });
    }
    case "claude-code": {
      const bin = which("claude", input.bridgePath);
      if (!bin) throw new Error("claude CLI not found");
      return cliPrompt(
        "claude-code",
        bin,
        ["-p", "--output-format", "text"],
        input.prompt,
        system,
      );
    }
    case "codex": {
      const bin = which("codex", input.bridgePath);
      if (!bin) throw new Error("codex CLI not found");
      return cliPrompt(
        "codex",
        bin,
        ["exec", "--full-auto", "-"],
        input.prompt,
        system,
      );
    }
    case "cursor": {
      const bin =
        which("cursor-agent", input.bridgePath) ||
        which("agent", input.bridgePath);
      if (!bin) throw new Error("Cursor agent CLI not found");
      return cliPrompt("cursor", bin, ["-p", "--print"], input.prompt, system);
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
