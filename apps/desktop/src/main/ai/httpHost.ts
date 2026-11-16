import {
  completeAi,
  detectProviders,
  listProviderModels,
  type AiCompleteInput,
  type AiProviderId,
} from "./bridge";
import { isAiSecretId } from "./fileSecrets";
import { aiSecretStatus, saveAiSecret } from "./secretAccess";

const PROVIDERS = new Set<AiProviderId>([
  "openai",
  "grok",
  "anthropic",
  "gemini",
  "ollama",
  "claude-code",
  "codex",
  "cursor",
  "opencode",
  "none",
]);

export type AiHttpResult = { status: number; body: unknown };

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function providerOf(value: unknown): AiProviderId | null {
  return typeof value === "string" && PROVIDERS.has(value as AiProviderId)
    ? (value as AiProviderId)
    : null;
}

/**
 * Local AI host. The renderer is a client — same split T3 Code uses between
 * the browser and the process that actually drives a signed-in agent.
 * This handler never invents a model catalog.
 */
export async function handleAiRequest(req: {
  method: string;
  pathname: string;
  body?: unknown;
}): Promise<AiHttpResult> {
  try {
    const method = req.method.toUpperCase();
    const path = req.pathname;
    const body = asRecord(req.body);

    if (method === "GET" && path === "/__intray/ai/secrets") {
      return { status: 200, body: aiSecretStatus() };
    }

    if (method === "POST" && path === "/__intray/ai/secrets") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!isAiSecretId(id)) {
        return { status: 400, body: { error: "Unknown secret id" } };
      }
      saveAiSecret(id, typeof body.value === "string" ? body.value : "");
      return { status: 200, body: { ok: true } };
    }

    if (method === "POST" && path === "/__intray/ai/detect") {
      const bridgePath =
        typeof body.bridgePath === "string" ? body.bridgePath : undefined;
      return { status: 200, body: await detectProviders(bridgePath) };
    }

    if (method === "POST" && path === "/__intray/ai/models") {
      const provider = providerOf(body.provider);
      if (!provider) return { status: 400, body: { error: "Unknown provider" } };
      const bridgePath =
        typeof body.bridgePath === "string" ? body.bridgePath : undefined;
      return {
        status: 200,
        body: await listProviderModels(provider, bridgePath),
      };
    }

    if (method === "POST" && path === "/__intray/ai/complete") {
      const provider = providerOf(body.provider);
      if (!provider) return { status: 400, body: { error: "Unknown provider" } };
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      if (!prompt.trim()) {
        return { status: 400, body: { error: "Missing prompt" } };
      }
      const input: AiCompleteInput = {
        provider,
        prompt,
        system: typeof body.system === "string" ? body.system : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
        bridgePath:
          typeof body.bridgePath === "string" ? body.bridgePath : undefined,
        maxTokens:
          typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      };
      return { status: 200, body: await completeAi(input) };
    }

    return { status: 404, body: { error: "Unknown AI route" } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI host failed";
    return { status: 500, body: { error: message } };
  }
}
