import assert from "node:assert/strict";
import { test } from "node:test";

import { agentOf, tokenClaims, verifyAgentToken } from "./agent-auth";

const jwt = (claims: Record<string, unknown>) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const env = { supabaseUrl: "https://project.example", anonKey: "anon-key" };

test("🔴 only a live token issued to an approved AI tool gets in, and it acts as the person Supabase confirms", async () => {
  const asked: string[] = [];
  const supabase = (async (url: string, init?: RequestInit) => {
    asked.push(`${url} ${new Headers(init?.headers).get("Authorization")}`);
    return new Response(JSON.stringify({ id: "user-1", email: "sam@example.com" }), { status: 200 });
  }) as unknown as typeof fetch;
  const token = jwt({ sub: "user-1", client_id: "client-9", exp: 2_000_000_000, scope: "openid email" });

  const auth = await verifyAgentToken(token, env, supabase);
  assert.deepEqual(auth, { token, clientId: "client-9", scopes: ["openid", "email"], expiresAt: 2_000_000_000, extra: { userId: "user-1", email: "sam@example.com" } });
  assert.deepEqual(asked, [`https://project.example/auth/v1/user Bearer ${token}`], "Supabase checks the token itself");
  assert.deepEqual(agentOf(auth), { userId: "user-1", email: "sam@example.com", clientId: "client-9" });

  assert.equal(await verifyAgentToken(jwt({ sub: "user-1", exp: 2_000_000_000 }), env, supabase), undefined, "a Nemesis session token is not an AI tool's token");
  assert.equal(await verifyAgentToken(jwt({ sub: "someone-else", client_id: "client-9" }), env, supabase), undefined, "the token has to be the confirmed person's");
  const refused = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
  assert.equal(await verifyAgentToken(token, env, refused), undefined, "an expired or revoked token is refused");
  assert.equal(await verifyAgentToken(undefined, env, supabase), undefined);
  assert.equal(tokenClaims("not-a-token"), null);
  assert.equal(agentOf(undefined), null);
});
