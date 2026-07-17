#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * MVP entitlement validation (0122). Mutates only disposable *.test users.
 *
 * Usage:
 *   SB_URL=... SERVICE_KEY=... ANON_KEY=... deno run -A scripts/phase8-mvp-validate.ts
 */

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(2);
}

const svc = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

interface UserSeed {
  id: string;
  email: string;
  password: string;
  jwt: string;
}

const users: UserSeed[] = [];
let failures = 0;

function ok(label: string, pass: boolean, detail = "") {
  if (pass) console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures++;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function seedUser(label: string): Promise<UserSeed> {
  const email = `phase8-${label}+${crypto.randomUUID()}@nemesis.test`;
  const password = `Pb!${crypto.randomUUID()}Aa1`;
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const id = created?.id ?? created?.user?.id;
  if (!id) throw new Error(`failed to seed user: ${JSON.stringify(created).slice(0, 200)}`);

  const token = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  if (!token?.access_token) throw new Error(`failed to sign in seeded user: ${JSON.stringify(token).slice(0, 200)}`);

  const user = { id, email, password, jwt: token.access_token };
  users.push(user);
  return user;
}

async function serviceRpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function userRpc<T>(jwt: string, fn: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function promotePlus(userId: string) {
  const res = await fetch(`${SB_URL}/rest/v1/subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      plan: "plus",
      status: "active",
      stripe_customer_id: `cus_test_${userId.replaceAll("-", "").slice(0, 24)}`,
      stripe_subscription_id: `sub_test_${userId.replaceAll("-", "").slice(0, 24)}`,
      stripe_price_id: "price_test_plus",
      stripe_status: "active",
      current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`promote plus failed: ${res.status} ${await res.text()}`);
}

async function drugIds(count: number): Promise<string[]> {
  const res = await fetch(`${SB_URL}/rest/v1/drug_entities?select=id&limit=${count}`, { headers: svc });
  if (!res.ok) throw new Error(`drug id fetch failed: ${res.status}`);
  const rows = await res.json() as Array<{ id: string }>;
  return rows.map((r) => r.id).filter(Boolean);
}

async function insertFollow(jwt: string, id: string): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/watchlist_items`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ item_type: "drug", item_ref: id }),
  });
  return res.status;
}

try {
  console.log("[phase8] seeding users");
  const free = await seedUser("free");
  const plus = await seedUser("plus");
  await promotePlus(plus.id);

  console.log("[phase8] entitlements");
  const freeEnt = await userRpc<{ plan: string; entitlements: Record<string, unknown> }>(free.jwt, "get_my_entitlements");
  const plusEnt = await userRpc<{ plan: string; entitlements: Record<string, unknown> }>(plus.jwt, "get_my_entitlements");
  ok("free entitlements", freeEnt.plan === "free" && freeEnt.entitlements.ask_daily_limit === 10 && freeEnt.entitlements.watchlist_limit === 3);
  ok("plus entitlements", plusEnt.plan === "plus" && plusEnt.entitlements.ask_daily_limit === 100 && plusEnt.entitlements.watchlist_limit === 50);

  console.log("[phase8] usage counter");
  let last: { allowed: boolean; used: number; limit: number } | null = null;
  for (let i = 0; i < 10; i++) {
    last = await serviceRpc("consume_usage", { p_user_id: free.id, p_counter_key: "ask_daily", p_cost: 1, p_metadata: { test: true } });
  }
  ok("free can consume 10 ask credits", last?.allowed === true && last.used === 10 && last.limit === 10);
  const denied = await serviceRpc<{ allowed: boolean; reason: string; used: number; limit: number }>("consume_usage", {
    p_user_id: free.id,
    p_counter_key: "ask_daily",
    p_cost: 1,
    p_metadata: { test: true },
  });
  ok("free 11th ask credit denied", denied.allowed === false && denied.reason === "quota_exceeded" && denied.used === 10 && denied.limit === 10);

  console.log("[phase8] direct watchlist writes");
  const ids = await drugIds(4);
  ok("have 4 drug ids", ids.length >= 4, `${ids.length}`);
  for (const id of ids.slice(0, 3)) {
    ok(`free follow ${id.slice(0, 8)}`, (await insertFollow(free.jwt, id)) === 201);
  }
  ok("free 4th follow denied by DB trigger", (await insertFollow(free.jwt, ids[3])) >= 400);
  await promotePlus(free.id);
  ok("plus can follow beyond free cap", (await insertFollow(free.jwt, ids[3])) === 201);

  const usage = await userRpc<{ counters: { ask_daily: { used: number; limit: number } } }>(free.jwt, "get_my_usage");
  ok("usage snapshot reads own counter", usage.counters.ask_daily.used === 10 && usage.counters.ask_daily.limit === 100);
} catch (e) {
  failures++;
  console.error(e);
} finally {
  for (const user of users) {
    await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: svc }).catch(() => {});
  }
}

if (failures) {
  console.error(`❌ phase8 MVP validation failed: ${failures}`);
  Deno.exit(1);
}
console.log("✅ PHASE 8 MVP ENTITLEMENT VALIDATION PASS");
