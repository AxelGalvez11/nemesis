// eval/lib/corpus.ts
// Shared auth + corpus resolution for the eval harnesses. Mirrors scripts/phase3-validate.ts.
import {
  type CiRun,
  newCiRun,
  recordCiAccount,
  teardownCiRun,
} from "../../scripts/lib/ci-account-cleanup.ts";

export interface Env { SB_URL: string; SERVICE_KEY: string; ANON_KEY: string; }

export function readEnv(): Env {
  const SB_URL = Deno.env.get("SB_URL");
  const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
  const ANON_KEY = Deno.env.get("ANON_KEY");
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
    console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
    Deno.exit(2);
  }
  return { SB_URL, SERVICE_KEY, ANON_KEY };
}

export interface TestUser { userId: string; jwt: string; }

/**
 * The run this process minted, kept so teardown can prove the account is its own.
 * Written to disk inside `recordCiAccount` as well, so a killed run still leaves
 * a record the `if: always()` cleanup step can act on — this eval job runs on
 * EVERY pull request, and a cancelled one used to leak an account each time.
 */
let currentRun: CiRun | null = null;

export async function mintUser(env: Env): Promise<TestUser> {
  const run = newCiRun("eval");
  const password = crypto.randomUUID();
  const created = await fetch(`${env.SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: run.email, password, email_confirm: true }),
  }).then((r) => r.json());
  const userId = created?.id ?? created?.user?.id;
  // Recorded BEFORE sign-in, so even a failure two lines down leaves a trail.
  if (userId) {
    currentRun = run;
    await recordCiAccount(run, userId);
  }
  const jwt = (await fetch(`${env.SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: run.email, password }),
  }).then((r) => r.json())).access_token;
  if (!userId || !jwt) throw new Error("mintUser failed");
  return { userId, jwt };
}

export async function teardownUser(env: Env, userId: string): Promise<void> {
  // Goes through the provenance gate, so this can only remove an account the
  // database agrees was created after this run started.
  if (!currentRun) return;
  await teardownCiRun(env, currentRun, userId);
}

/** Only for /ask-exercising jobs (answer-eval). Retrieval-eval does NOT need this. */
export async function grantEnterprise(env: Env, userId: string): Promise<void> {
  const res = await fetch(`${env.SB_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, plan: "enterprise", status: "active" }),
  });
  if (!res.ok) throw new Error(`grantEnterprise failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

export interface MatchRow { id: string; source_id: string; similarity: number; provider: string; chunk_text: string; }

/** Call the live retriever (authenticated). match_count high + threshold 0 = unbiased ranking. */
export async function matchChunks(
  env: Env, jwt: string, embedding: number[], matchCount = 50, matchThreshold = 0,
): Promise<MatchRow[]> {
  const res = await fetch(`${env.SB_URL}/rest/v1/rpc/match_core_source_chunks`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query_embedding: embedding, match_count: matchCount, match_threshold: matchThreshold }),
  });
  if (!res.ok) throw new Error(`match RPC failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return await res.json();
}

/** Resolve gold (provider, provider_id) pairs to corpus source_ids. Unresolved = not in corpus.
 *  Strict: a row is kept only when BOTH its provider AND provider_id were requested. The query
 *  filters on provider_id alone (PostgREST in-list), so without the provider check a set-id that
 *  exists under two providers (e.g. an SPL set-id under both openfda and dailymed) would resolve
 *  to two rows and silently inflate gold size. Matching the exact (provider, provider_id) pair
 *  keeps gold honest as the golden set grows. */
export async function resolveSourceIds(
  env: Env, pairs: Array<{ provider: string; provider_id: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // key `${provider}:${provider_id}` -> source_id
  if (pairs.length === 0) return out;
  const wanted = new Set(pairs.map((p) => `${p.provider}:${p.provider_id}`));
  const ids = [...new Set(pairs.map((p) => p.provider_id))];
  const inList = ids.map((x) => `"${x.replaceAll('"', '')}"`).join(",");
  const rows = await fetch(
    `${env.SB_URL}/rest/v1/core_sources?select=id,provider,provider_id&provider_id=in.(${inList})`,
    { headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}` } },
  ).then((r) => r.json());
  for (const r of rows as Array<{ id: string; provider: string; provider_id: string }>) {
    const key = `${r.provider}:${r.provider_id}`;
    if (wanted.has(key)) out.set(key, r.id); // only the requested (provider, provider_id)
  }
  return out;
}
