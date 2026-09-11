// ── Who an outside AI is acting for ─────────────────────────────────────────────────────────────────────────────────
//
// ChatGPT, Claude and other AI tools reach Nemesis through the door at /api/mcp (docs/space/PLAN.md, M11) with an access
// token from Supabase Auth's OAuth 2.1 server, issued after the person approves the tool on /oauth/consent. Supabase
// itself checks the token (/auth/v1/user answers only for a live, correctly signed one), and the token has to name the
// AI tool it was issued to: an ordinary Nemesis session token, lifted from a browser, is not a door key.

import type { AuthInfo } from "@modelcontextprotocol/server";

export interface AgentIdentity {
  userId: string;
  email: string | null;
  clientId: string;
}

/** The token's claims, read without trusting them. Only what Supabase confirms is relied on. */
export function tokenClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The door's token check (withMcpAuth in app/api/mcp/route.ts). Undefined means a 401 that points the tool at sign-in. */
export async function verifyAgentToken(
  token: string | undefined,
  env: { supabaseUrl: string; anonKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AuthInfo | undefined> {
  if (!token || !env.supabaseUrl || !env.anonKey) return undefined;
  const claims = tokenClaims(token);
  const clientId = typeof claims?.client_id === "string" && claims.client_id ? claims.client_id : null;
  if (!clientId) return undefined;
  let res: Response;
  try {
    res = await fetchImpl(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` } });
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;
  const user = (await res.json().catch(() => null)) as { id?: unknown; email?: unknown; is_anonymous?: unknown } | null;
  if (!user || typeof user.id !== "string" || user.is_anonymous === true) return undefined;
  if (typeof claims?.sub === "string" && claims.sub !== user.id) return undefined;
  return {
    token,
    clientId,
    scopes: typeof claims?.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    ...(typeof claims?.exp === "number" ? { expiresAt: claims.exp } : {}),
    extra: { userId: user.id, email: typeof user.email === "string" ? user.email : null },
  };
}

/** The person and the tool behind a verified request. */
export function agentOf(auth: AuthInfo | undefined): AgentIdentity | null {
  const userId = auth?.extra?.userId;
  if (!auth || typeof userId !== "string") return null;
  const email = auth.extra?.email;
  return { userId, email: typeof email === "string" ? email : null, clientId: auth.clientId };
}
