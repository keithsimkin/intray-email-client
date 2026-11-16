import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AI_SECRET_IDS,
  type AiSecretId,
  type AiSecretStore,
} from "./secretAccess";

function defaultDir(): string {
  const base =
    process.env.APPDATA ||
    join(homedir(), process.platform === "win32" ? "AppData/Roaming" : ".config");
  return join(base, "Intray");
}

/**
 * Local secret file for the dev host, outside the repo.
 * The Electron app does not use this — it stores keys with DPAPI.
 */
export function fileSecretStore(dir = defaultDir()): AiSecretStore {
  const file = join(dir, "ai-secrets.json");

  const read = (): Partial<Record<AiSecretId, string>> => {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<
        Record<AiSecretId, string>
      >;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const write = (data: Partial<Record<AiSecretId, string>>) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      /* Windows may ignore POSIX modes. The file stays in the user profile. */
    }
  };

  return {
    load(id) {
      const value = read()[id];
      return typeof value === "string" && value.trim() ? value : null;
    },
    save(id, value) {
      const data = read();
      const trimmed = value.trim();
      if (!trimmed) delete data[id];
      else data[id] = trimmed;
      write(data);
    },
    status() {
      const data = read();
      return {
        openai: Boolean(data.openai),
        grok: Boolean(data.grok),
        anthropic: Boolean(data.anthropic),
        gemini: Boolean(data.gemini),
        ollama: Boolean(data.ollama),
      };
    },
  };
}

export function isAiSecretId(value: string): value is AiSecretId {
  return (AI_SECRET_IDS as string[]).includes(value);
}
