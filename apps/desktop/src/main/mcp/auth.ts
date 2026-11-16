import { randomBytes, timingSafeEqual } from "node:crypto";
import { safeStorage } from "electron";
import { deleteSecret, getSecretPayload, setSecretPayload } from "../db";

const TOKEN_KEY = "mcp.token";

let cached: string | null = null;

function persist(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) return;
  try {
    const encrypted = safeStorage.encryptString(token);
    setSecretPayload(TOKEN_KEY, encrypted.toString("base64"));
  } catch {
    // In-memory token still protects this session; it just won't survive
    // a restart (clients must re-read it from Settings).
  }
}

function loadPersisted(): string | null {
  const b64 = getSecretPayload(TOKEN_KEY);
  if (!b64 || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const token = safeStorage.decryptString(Buffer.from(b64, "base64"));
    return token.length >= 20 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Bearer token for the localhost MCP endpoint.
 *
 * The server used to be completely unauthenticated with `Access-Control-
 * Allow-Origin: *`, which let any page the user visited read their mail over
 * `http://127.0.0.1:47821`. A per-install capability token closes that hole.
 */
export function getMcpToken(): string {
  if (cached) return cached;
  cached = loadPersisted() ?? randomBytes(32).toString("base64url");
  persist(cached);
  return cached;
}

export function rotateMcpToken(): string {
  cached = randomBytes(32).toString("base64url");
  deleteSecret(TOKEN_KEY);
  persist(cached);
  return cached;
}

export function verifyMcpToken(presented: string | undefined): boolean {
  if (!presented) return false;
  const expected = getMcpToken();
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
