export type AiSecretId =
  | "openai"
  | "grok"
  | "anthropic"
  | "gemini"
  | "ollama";

export const AI_SECRET_IDS: AiSecretId[] = [
  "openai",
  "grok",
  "anthropic",
  "gemini",
  "ollama",
];

export type AiSecretStore = {
  load(id: AiSecretId): string | null;
  save(id: AiSecretId, value: string): void;
  status(): Record<AiSecretId, boolean>;
};

function emptyStatus(): Record<AiSecretId, boolean> {
  return {
    openai: false,
    grok: false,
    anthropic: false,
    gemini: false,
    ollama: false,
  };
}

const emptyStore: AiSecretStore = {
  load: () => null,
  save: () => undefined,
  status: emptyStatus,
};

let store: AiSecretStore = emptyStore;

/** Electron registers DPAPI. The dev host registers a local file. */
export function configureAiSecrets(next: AiSecretStore): void {
  store = next;
}

export function loadAiSecret(id: AiSecretId): string | null {
  return store.load(id);
}

export function saveAiSecret(id: AiSecretId, value: string): void {
  if (!AI_SECRET_IDS.includes(id)) {
    throw new Error("Unknown secret id");
  }
  store.save(id, value);
}

export function aiSecretStatus(): Record<AiSecretId, boolean> {
  return store.status();
}
