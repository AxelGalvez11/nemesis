import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "path";

// Phase 6b-4 gate: the first WRITE path (watchlist CRUD) + Compare, run as real
// authenticated users against cloud. Self-contained: it seeds its OWN two users
// (A = the acting user, B = the isolation probe) and generates A's digest with the
// REAL generator, then tears them down. Asserts AC7 (follow ≥3 via UI + paywall),
// AC8 (a generated weekly digest renders), Compare (6 doc-11 groups + sources), and —
// the new dimension for a write path — cross-user RLS isolation (pure REST, two JWTs).

const SB_URL = process.env.SB_URL!;
const SERVICE_KEY = process.env.SERVICE_KEY!;
const ANON_KEY = process.env.ANON_KEY!;
const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const userHdrs = (jwt: string) => ({ apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });

interface Seed { id: string; email: string; password: string; jwt: string }
let A: Seed; // acting user
let B: Seed; // isolation probe
let sema: string; // semaglutide (has updates → a non-empty digest)
let others: string[] = []; // 3 more drug ids: follows #2/#3 + the 4th (paywall) / compare-right

async function seedUser(tag: string): Promise<Seed> {
  const email = `phase6b4${tag}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@pharmabro.test`;
  const password = `Pb!${Math.random().toString(36).slice(2)}Aa1`;
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: svc, body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const id = created?.id ?? created?.user?.id;
  if (!id) throw new Error(`seed ${tag} failed: ${JSON.stringify(created).slice(0, 160)}`);
  const jwt = (await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  return { id, email, password, jwt };
}

async function rest(jwt: string, path: string, init?: RequestInit) {
  return fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...userHdrs(jwt), ...(init?.headers ?? {}) } });
}

test.beforeAll(async () => {
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("SB_URL + SERVICE_KEY + ANON_KEY required");
  A = await seedUser("a");
  B = await seedUser("b");

  // Resolve a followable set: semaglutide (has updates) + 3 other approved drugs.
  const s = await fetch(`${SB_URL}/rest/v1/drug_entities?normalized_name=eq.semaglutide&select=id&limit=1`, { headers: svc }).then((r) => r.json());
  sema = s?.[0]?.id;
  // ORDER BY pins WHICH entities are chosen — PostgREST row order is otherwise undefined,
  // which would make the gate non-reproducible (a future run could pick entities compare
  // can't pair). Deterministic = the discipline.
  const o = await fetch(`${SB_URL}/rest/v1/drug_entities?id=neq.${sema}&approved_status=eq.approved&select=id&order=canonical_name&limit=3`, { headers: svc }).then((r) => r.json());
  others = (Array.isArray(o) ? o : []).map((r: { id: string }) => r.id);
  if (!sema || others.length < 3) throw new Error("could not resolve 4 drug entities for the gate");

  // AC8 setup — generate A's digest with the REAL generator, then unfollow so A starts
  // at 0 follows (the digest is a captured snapshot; it persists). Wide window brackets
  // the corpus updates regardless of their exact detected_at.
  await rest(A.jwt, "watchlist_items", { method: "POST", body: JSON.stringify({ item_type: "drug", item_ref: sema }) });
  execFileSync("deno", [
    "run", "--allow-net", "--allow-env", path.resolve(__dirname, "../../../scripts/generate-digest.ts"),
    `--user=${A.id}`, "--period-start=2026-01-01T00:00:00Z", "--period-end=2027-01-01T00:00:00Z",
  ], { env: process.env, stdio: "pipe" });
  const dg = await rest(A.jwt, `digests?select=update_count&user_id=eq.${A.id}`).then((r) => r.json());
  if (!Array.isArray(dg) || !dg[0] || dg[0].update_count < 1) {
    throw new Error(`AC8 setup: A's digest is empty (${JSON.stringify(dg)})`);
  }
  await rest(A.jwt, `watchlist_items?item_type=eq.drug&item_ref=eq.${sema}`, { method: "DELETE" });
});

test.afterAll(async () => {
  for (const u of [A, B]) {
    if (u?.id) await fetch(`${SB_URL}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: svc }).catch(() => {});
  }
});

async function signIn(page: Page, u: Seed) {
  await page.goto("/", { timeout: 120_000 });
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("email").fill(u.email);
  await page.getByTestId("password").fill(u.password);
  await page.getByTestId("age-ack").click();
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });
}

test("6b-4: cross-user RLS isolation (watchlist_items + digests + get_watchlist_updates)", async () => {
  const feed = (jwt: string) =>
    fetch(`${SB_URL}/rest/v1/rpc/get_watchlist_updates`, { method: "POST", headers: userHdrs(jwt), body: JSON.stringify({ max_results: 100 }) }).then((r) => r.json());

  // A follows semaglutide; B follows a DIFFERENT drug — so "B sees nothing of A" is a
  // real bidirectional proof, not "B is empty by construction".
  await rest(A.jwt, "watchlist_items", { method: "POST", body: JSON.stringify({ item_type: "drug", item_ref: sema }) });
  await rest(B.jwt, "watchlist_items", { method: "POST", body: JSON.stringify({ item_type: "drug", item_ref: others[0] }) });

  // Each sees EXACTLY its own follow, never the other's.
  const aRefs = (await rest(A.jwt, "watchlist_items?select=item_ref").then((r) => r.json())).map((x: { item_ref: string }) => x.item_ref);
  const bRefs = (await rest(B.jwt, "watchlist_items?select=item_ref").then((r) => r.json())).map((x: { item_ref: string }) => x.item_ref);
  expect(aRefs).toContain(sema);
  expect(aRefs).not.toContain(others[0]); // A cannot see B's follow
  expect(bRefs).toContain(others[0]);
  expect(bRefs).not.toContain(sema); // B cannot see A's follow

  // SECURITY DEFINER feed is auth.uid()-scoped: A's feed has sema updates; B's never does.
  const aFeed = await feed(A.jwt);
  const bFeed = await feed(B.jwt);
  expect(Array.isArray(aFeed) && aFeed.length).toBeGreaterThan(0);
  expect((bFeed as { item_ref: string }[]).some((u) => u.item_ref === sema)).toBe(false);

  // digests is owner-read: A has one (beforeAll); B must see none.
  const bDigests = await rest(B.jwt, "digests?select=id").then((r) => r.json());
  expect(Array.isArray(bDigests) ? bDigests.length : -1).toBe(0);

  // B cannot plant a row owned by A. Use a drug A does NOT follow, assert the SPECIFIC
  // 403 (WITH CHECK), and ground-truth with the service key that no row was planted —
  // so a 409-dup or a 204-masked success can't make this pass spuriously.
  const evil = await rest(B.jwt, "watchlist_items", { method: "POST", body: JSON.stringify({ user_id: A.id, item_type: "drug", item_ref: others[2] }) });
  expect(evil.status).toBe(403);
  const planted = await fetch(`${SB_URL}/rest/v1/watchlist_items?user_id=eq.${A.id}&item_ref=eq.${others[2]}&select=id`, { headers: svc }).then((r) => r.json());
  expect(Array.isArray(planted) ? planted.length : -1).toBe(0);

  // Reset both users to 0 follows so AC7 starts clean.
  await rest(A.jwt, `watchlist_items?item_ref=eq.${sema}`, { method: "DELETE" });
  await rest(B.jwt, `watchlist_items?item_ref=eq.${others[0]}`, { method: "DELETE" });
});

test("6b-4: follow 3 items via UI (AC7) + weekly digest renders (AC8) + paywall stub", async ({ page }) => {
  await signIn(page, A);

  // Follow 3 drugs via the drug-page follow button (the write path through the UI).
  for (const id of [sema, others[0], others[1]]) {
    await page.goto(`/drug/${id}`, { timeout: 60_000 });
    await expect(page.getByTestId("follow-btn")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("follow-btn").click();
    await expect(page.getByTestId("unfollow-btn")).toBeVisible({ timeout: 30_000 }); // write confirmed
  }

  // AC7 — the watchlist holds the 3 follows.
  await page.goto("/watchlist", { timeout: 60_000 });
  await expect(page.getByTestId("watchlist-item-0")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("watchlist-item-2")).toBeVisible();

  // AC8 — the generated weekly digest renders with ≥1 real update.
  await expect(page.getByTestId("watchlist-digest")).toBeVisible();
  await expect(page.getByTestId("digest-item-0")).toBeVisible();

  // Paywall stub — a 4th (not-yet-followed) drug shows the upgrade affordance at the limit.
  await page.goto(`/drug/${others[2]}`, { timeout: 60_000 });
  await expect(page.getByTestId("follow-paywall")).toBeVisible({ timeout: 30_000 });
});

test("6b-4: compare renders the 6 doc-11 groups + unioned sources", async ({ page }) => {
  await signIn(page, A);
  await page.goto(`/compare?left=${sema}&right=${others[0]}`, { timeout: 60_000 });
  await expect(page.getByTestId("comparison-view")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("compare-left")).toBeVisible();
  await expect(page.getByTestId("compare-right")).toBeVisible();
  for (const k of ["mechanism", "approved_uses", "evidence_strength", "trial_status", "safety", "cost_access"]) {
    await expect(page.getByTestId(`compare-section-${k}`)).toBeVisible();
  }
  await expect(page.getByTestId("compare-sources")).toBeVisible();
});
