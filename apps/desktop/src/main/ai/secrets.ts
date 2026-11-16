import { safeStorage } from "electron";
import { configureAiSecrets } from "./secretAccess";
import {
  deleteSecret,
  getSecretPayload,
  listSecretKeys,
  setSecretPayload,
} from "../db";

export type AiSecretId =
  | "openai"
  | "grok"
  | "anthropic"
  | "gemini"
  | "ollama";

const KEY_PREFIX = "ai.";

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "OS encryption (DPAPI) is unavailable. Cannot store AI API keys.",
    );
  }
}

export function saveAiSecret(id: AiSecretId, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    deleteSecret(`${KEY_PREFIX}${id}`);
    return;
  }
  assertEncryption();
  const encrypted = safeStorage.encryptString(trimmed);
  setSecretPayload(`${KEY_PREFIX}${id}`, encrypted.toString("base64"));
}

export function loadAiSecret(id: AiSecretId): string | null {
  const b64 = getSecretPayload(`${KEY_PREFIX}${id}`);
  if (!b64) return null;
  assertEncryption();
  try {
    return safeStorage.decryptString(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

export function listConfiguredAiSecrets(): AiSecretId[] {
  return listSecretKeys()
    .filter((k) => k.startsWith(KEY_PREFIX))
    .map((k) => k.slice(KEY_PREFIX.length) as AiSecretId)
    .filter((id) =>
      ["openai", "grok", "anthropic", "gemini", "ollama"].includes(id),
    );
}

export function aiSecretStatus(): Record<AiSecretId, boolean> {
  return {
    openai: Boolean(loadAiSecret("openai")),
    grok: Boolean(loadAiSecret("grok")),
    anthropic: Boolean(loadAiSecret("anthropic")),
    gemini: Boolean(loadAiSecret("gemini")),
    ollama: Boolean(loadAiSecret("ollama")),
  };
}

configureAiSecrets({
  load: loadAiSecret,
  save: saveAiSecret,
  status: aiSecretStatus,
});
