import { test, expect } from "@playwright/test";

// Phase 7-3 gate: the answer human-review queue (§11). REST-layer only — deliberately
// no /ask call, so the gate is DeepSeek-cost-free (the UI report button is a thin
// useMutation→report_answer wrapper covered by tsc + review; the full UI flow is
// exercised when the operator runs a cost-OK pass). Proves the security-critical RPCs:
// report_answer flags only the CALLER'S OWN answer (anon denied), and the review queue
// (list_flagged_answers / mark_answer_reviewed) is SERVICE-ROLE ONLY.
//
// REQUIRES the 0120 migration applied (db push) — a cloud change authorized separately.

const SB_URL = process.env.SB_URL!;
const SERVICE_KEY = process.env.SERVICE_KEY!;
const ANON_KEY = process.env.ANON_KEY!;
const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const anonHdrs = { apikey: ANON_KEY, "Content-Type": "application/json" };
const userHdrs = (jwt: string) => ({ apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });

interface Seed { id: string; email: string; password: string; jwt: string; answerId: string }
let A: Seed;
let B: Seed;
// A safety-flagged answer (A-owned, NOT user_reported) — exercises the queue's
// `safety_flags` branch independently of the user-report path (decouples test 2 from test 1).
let safetyFlaggedId: string;

async function seedUser(tag: string): Promise<Seed> {
  const email = `phase73${tag}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@pharmabro.test`;
  const password = `Pb!${Math.random().toString(36).slice(2)}Aa1`;
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: svc, body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const id = created?.id ?? created?.user?.id;
  if (!id) throw new Error(`seed ${tag} failed: ${JSON.stringify(created).slice(0, 160)}`);
  const jwt = (await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: anonHdrs, body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  // Seed one generated_answers row (service-role — no authenticated INSERT policy).
  const ans = await fetch(`${SB_URL}/rest/v1/generated_answers`, {
    method: "POST", headers: { ...svc, Prefer: "return=representation" },
    body: JSON.stringify({ user_id: id, question: `q-${tag}-${id}`, answer: "a", model_name: "test", prompt_version: "test" }),
  }).then((r) => r.json());
  return { id, email, password, jwt, answerId: ans?.[0]?.id };
}

const rpc = (headers: Record<string, string>, fn: string, body: unknown) =>
  fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
const reportedFlag = async (answerId: string): Promise<boolean | null> => {
  const rows = await fetch(`${SB_URL}/rest/v1/generated_answers?id=eq.${answerId}&select=user_reported`, { headers: svc }).then((r) => r.json());
  return Array.isArray(rows) && rows[0] ? rows[0].user_reported : null;
};

test.beforeAll(async () => {
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("SB_URL + SERVICE_KEY + ANON_KEY required");
  A = await seedUser("a");
  B = await seedUser("b");
  if (!A.answerId || !B.answerId) throw new Error("failed to seed generated_answers rows");
  // A safety-flagged answer (not user-reported) for the queue's safety_flags branch.
  const sf = await fetch(`${SB_URL}/rest/v1/generated_answers`, {
    method: "POST", headers: { ...svc, Prefer: "return=representation" },
    body: JSON.stringify({ user_id: A.id, question: `sf-${A.id}`, answer: "a", model_name: "test", prompt_version: "test", safety_flags: ["controlled_substance"] }),
  }).then((r) => r.json());
  safetyFlaggedId = sf?.[0]?.id;
  if (!safetyFlaggedId) throw new Error("failed to seed safety-flagged answer");
});

test.afterAll(async () => {
  for (const u of [A, B]) {
    if (!u?.id) continue;
    await fetch(`${SB_URL}/rest/v1/generated_answers?user_id=eq.${u.id}`, { method: "DELETE", headers: svc }).catch(() => {});
    await fetch(`${SB_URL}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: svc }).catch(() => {});
  }
});

test("7-3: report_answer flags only the caller's own answer; anon denied", async () => {
  // A reports A's own answer → true, and the row flips to user_reported = true.
  const ownRes = await rpc(userHdrs(A.jwt), "report_answer", { p_answer_id: A.answerId });
  expect(ownRes.status).toBe(200);
  expect(await ownRes.json()).toBe(true);
  expect(await reportedFlag(A.answerId)).toBe(true);

  // A reports B's answer → false (own-row filter matched 0 rows), and B's row is untouched.
  const crossRes = await rpc(userHdrs(A.jwt), "report_answer", { p_answer_id: B.answerId });
  expect(crossRes.status).toBe(200);
  expect(await crossRes.json()).toBe(false);
  expect(await reportedFlag(B.answerId)).toBe(false); // B's answer NOT flagged by A

  // Anon cannot call report_answer (REVOKE anon).
  const anonRes = await rpc(anonHdrs, "report_answer", { p_answer_id: A.answerId });
  expect(anonRes.ok).toBe(false);
  expect(anonRes.status).toBeGreaterThanOrEqual(401);
});

test("7-3: the review queue is service-role only + the review flow clears a flag", async () => {
  // An authenticated end-user is NOT an admin: the operator RPCs are denied.
  expect((await rpc(userHdrs(A.jwt), "list_flagged_answers", { max_results: 100 })).ok).toBe(false);
  expect((await rpc(anonHdrs, "list_flagged_answers", { max_results: 100 })).ok).toBe(false);
  expect((await rpc(userHdrs(A.jwt), "mark_answer_reviewed", { p_id: safetyFlaggedId })).ok).toBe(false);

  // Service-role sees the safety-flagged answer in the queue (the safety_flags branch,
  // flagged at seed time — so this test stands alone, independent of test 1).
  const queued = await rpc(svc, "list_flagged_answers", { max_results: 500 }).then((r) => r.json());
  expect(Array.isArray(queued)).toBe(true);
  expect((queued as { id: string }[]).some((a) => a.id === safetyFlaggedId)).toBe(true);

  // Mark it reviewed → it leaves the queue.
  const marked = await rpc(svc, "mark_answer_reviewed", { p_id: safetyFlaggedId });
  expect(await marked.json()).toBe(true);
  const after = await rpc(svc, "list_flagged_answers", { max_results: 500 }).then((r) => r.json());
  expect((after as { id: string }[]).some((a) => a.id === safetyFlaggedId)).toBe(false);
});
