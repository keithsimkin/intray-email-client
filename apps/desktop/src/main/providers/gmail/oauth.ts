import {
  listenForOAuthRedirect,
  randomUrlSafe,
  sha256Base64Url,
} from "../../auth/oauth-loopback";
import type { GmailTokens } from "../../crypto/credentials";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
].join(" ");

export function getGmailClientConfig(): {
  clientId: string;
  clientSecret?: string;
} {
  const clientId =
    process.env.GMAIL_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.GMAIL_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    undefined;
  return { clientId, clientSecret };
}

export function gmailOAuthConfigured(): boolean {
  return Boolean(getGmailClientConfig().clientId);
}

export async function runGmailOAuth(): Promise<{
  tokens: GmailTokens;
  profile: { email: string; name: string };
}> {
  const { clientId, clientSecret } = getGmailClientConfig();
  if (!clientId) {
    throw new Error(
      "Set GMAIL_CLIENT_ID in the environment to connect Gmail.",
    );
  }

  const verifier = randomUrlSafe(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomUrlSafe(16);

  const { code, redirectUri } = await listenForOAuthRedirect((redirect) => {
    const u = new URL(AUTH);
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", redirect);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("state", state);
    return u.toString();
  });

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const tokenRes = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  if (!tokenJson.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Remove Intray from your Google Account permissions and try again.",
    );
  }

  const tokens: GmailTokens = {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiryMs: Date.now() + tokenJson.expires_in * 1000 - 60_000,
    tokenType: tokenJson.token_type,
    scope: tokenJson.scope,
  };

  const profile = await fetchGmailProfile(tokens.accessToken);
  return { tokens, profile };
}

export async function refreshGmailTokens(
  refreshToken: string,
): Promise<GmailTokens> {
  const { clientId, clientSecret } = getGmailClientConfig();
  if (!clientId) throw new Error("GMAIL_CLIENT_ID is not set");

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken,
    expiryMs: Date.now() + json.expires_in * 1000 - 60_000,
    tokenType: json.token_type,
    scope: json.scope,
  };
}

async function fetchGmailProfile(
  accessToken: string,
): Promise<{ email: string; name: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    // Fallback to Gmail profile
    const g = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!g.ok) throw new Error("Failed to load Google profile");
    const gp = (await g.json()) as { emailAddress: string };
    return { email: gp.emailAddress, name: gp.emailAddress.split("@")[0] };
  }
  const json = (await res.json()) as { email: string; name?: string };
  return {
    email: json.email,
    name: json.name?.trim() || json.email.split("@")[0],
  };
}
