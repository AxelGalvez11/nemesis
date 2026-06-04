import { test, expect, type Page } from "@playwright/test";

// Phase 7-1 gate: AC10 "deletion must work" + data export, end-to-end as real users on
// cloud. Self-seeds its own users and tears them down. Proves: export_my_data returns the
// caller's OWN rows (auth.uid()-scoped) and nothing of another user's; anon cannot call
// it; account-delete cascades every owned table (service-key readback = 0 rows + the auth
// user gone) and requires explicit confirmation. Both the REST contract and the UI flow.
//
// REQUIRES the 0119 migration applied + the account-delete edge fn deployed (a cloud
// change authorized separately). Until then this spec cannot pass.

const SB_URL = process.env.SB_URL!;
const SERVICE_KEY = process.env.SERVICE_KEY!;
const ANON_KEY = process.env.ANON_KEY!;
const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const anonHdrs = { apikey: ANON_KEY, "Content-Type": "application/json" };
const userHdrs = (jwt: string) => ({ apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });

interface Seed { id: string; email: string; password: string; jwt: string }
let A: Seed; // export actor (+ UI delete, last)
let B: Seed; // cross-user probe
let C: Seed; // REST delete-cascade subject

async function seedUser(tag: string): Promise<Seed> {
  const email = `phase71${tag}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@pharmabro.test`;
  const password = `Pb!${Math.random().toString(36).slice(2)}Aa1`;
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: svc, body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const id = created?.id ?? created?.user?.id;
  if (!id) throw new Error(`seed ${tag} failed: ${JSON.stringify(created).slice(0, 160)}`);
  const jwt = (await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: anonHdrs, body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  return { id, email, password, jwt };
}

const DUMMY_DRUG = "00000000-0000-0000-0000-0000000000aa";

// Give a user one row in each owned table the cascade must clear. `ageMarker` is a
// per-user sentinel so cross-user export isolation is provable (not vacuous). The
// generated_answers + subscriptions rows are service-role writes (no authenticated
// INSERT policy); generated_answers is the ON DELETE SET NULL (anonymize) probe.
async function seedData(u: Seed, ageMarker: string) {
  await fetch(`${SB_URL}/rest/v1/watchlist_items`, { method: "POST", headers: userHdrs(u.jwt), body: JSON.stringify({ item_type: "drug", item_ref: DUMMY_DRUG }) });
  await fetch(`${SB_URL}/rest/v1/user_health_context`, { method: "POST", headers: userHdrs(u.jwt), body: JSON.stringify({ user_id: u.id, consent_version: "test-v1", age_range: ageMarker }) });
  await fetch(`${SB_URL}/rest/v1/saved_reports`, { method: "POST", headers: userHdrs(u.jwt), body: JSON.stringify({ user_id: u.id, title: "t", kind: "answer", payload: {} }) });
  await fetch(`${SB_URL}/rest/v1/profiles`, { method: "POST", headers: userHdrs(u.jwt), body: JSON.stringify({ user_id: u.id }) });
  await fetch(`${SB_URL}/rest/v1/generated_answers`, { method: "POST", headers: svc, body: JSON.stringify({ user_id: u.id, question: `ga-${u.id}`, answer: "test", model_name: "test", prompt_version: "test" }) });
  await fetch(`${SB_URL}/rest/v1/subscriptions`, { method: "POST", headers: svc, body: JSON.stringify({ user_id: u.id, plan: "free", status: "active" }) });
}

const rpc = (jwt: string, fn: string) =>
  fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: userHdrs(jwt), body: "{}" });
const callDelete = (jwt: string, body: unknown) =>
  fetch(`${SB_URL}/functions/v1/account-delete`, { method: "POST", headers: userHdrs(jwt), body: JSON.stringify(body) });
const countFor = async (uid: string, table: string) => {
  const rows = await fetch(`${SB_URL}/rest/v1/${table}?user_id=eq.${uid}&select=user_id`, { headers: svc }).then((r) => r.json());
  return Array.isArray(rows) ? rows.length : -1;
};

test.beforeAll(async () => {
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("SB_URL + SERVICE_KEY + ANON_KEY required");
  A = await seedUser("a");
  B = await seedUser("b");
  C = await seedUser("c");
  await seedData(A, "A-RANGE");
  await seedData(B, "B-RANGE");
  await seedData(C, "C-RANGE");
});

test.afterAll(async () => {
  // generated_answers survives deletion (ON DELETE SET NULL = anonymized), so clean the
  // test rows explicitly by their sentinel question; then the users (A/C already gone via
  // their tests — guarded by catch; B cascades here).
  for (const u of [A, B, C]) {
    if (!u?.id) continue;
    await fetch(`${SB_URL}/rest/v1/generated_answers?question=eq.ga-${u.id}`, { method: "DELETE", headers: svc }).catch(() => {});
    await fetch(`${SB_URL}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: svc }).catch(() => {});
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

test("7-1: export_my_data returns the caller's own rows; cross-user + anon denied", async ({ page }) => {
  // A's export = A's own data only.
  const aExport = await rpc(A.jwt, "export_my_data").then((r) => r.json());
  expect(aExport.user_id).toBe(A.id);
  expect(Array.isArray(aExport.watchlist) && aExport.watchlist.length).toBeGreaterThan(0);
  expect(aExport.health_context?.age_range).toBe("A-RANGE");
  expect(Array.isArray(aExport.saved_reports) && aExport.saved_reports.length).toBeGreaterThan(0);
  expect(Array.isArray(aExport.answers) && aExport.answers.length).toBeGreaterThan(0);
  // Subscription is the user-facing projection ONLY (plan/status/current_period_end) — never the
  // RevenueCat internals (rc_app_user_id/rc_entitlement). Guards the security reviewer's build-time
  // PII-strip against a silent regression in export_my_data.
  expect(aExport.subscription?.plan).toBe("free");
  expect(aExport.subscription?.status).toBe("active");
  expect("current_period_end" in (aExport.subscription ?? {})).toBe(true);
  expect(aExport.subscription).not.toHaveProperty("rc_app_user_id");
  expect(aExport.subscription).not.toHaveProperty("rc_entitlement");

  // B's export is B's own — never A's. Assert non-empty FIRST (so .every isn't vacuously
  // true on an empty array), then that A's sentinel never appears in B's scalar PII.
  const bExport = await rpc(B.jwt, "export_my_data").then((r) => r.json());
  expect(bExport.user_id).toBe(B.id);
  expect(bExport.watchlist.length).toBeGreaterThan(0);
  expect((bExport.watchlist as { user_id?: string }[]).every((w) => w.user_id !== A.id)).toBe(true);
  expect(bExport.health_context?.age_range).toBe("B-RANGE");
  expect(bExport.health_context?.age_range).not.toBe("A-RANGE"); // A's PII never leaks into B's bundle

  // Anon cannot call it (REVOKE anon): no bundle reaches an anon caller.
  const anonRes = await fetch(`${SB_URL}/rest/v1/rpc/export_my_data`, { method: "POST", headers: anonHdrs, body: "{}" });
  expect(anonRes.ok).toBe(false); // 401/403 — execute not granted to anon
  expect(anonRes.status).toBeGreaterThanOrEqual(401);

  // UI: A triggers the export and sees it ready.
  await signIn(page, A);
  await page.goto("/profile/export", { timeout: 60_000 });
  await page.getByTestId("request-export").click();
  await expect(page.getByTestId("export-ready")).toBeVisible({ timeout: 30_000 });
});

test("7-1: account-delete cascades every owned table (REST) + requires confirmation", async () => {
  // C exists with data in each owned table.
  expect(await countFor(C.id, "user_health_context")).toBe(1);
  expect(await countFor(C.id, "watchlist_items")).toBeGreaterThan(0);
  expect(await countFor(C.id, "saved_reports")).toBeGreaterThan(0);

  // No confirmation → 400 (irreversible action is gated).
  expect((await callDelete(C.jwt, {})).status).toBe(400);
  // Unauthenticated (no bearer) → 401. (The is_anonymous-session branch isn't separately
  // tested: Supabase anonymous sign-in is disabled by design, so no anon JWT can be minted
  // here; the guard mirrors the `ask` fn and is exercised there.)
  expect((await fetch(`${SB_URL}/functions/v1/account-delete`, { method: "POST", headers: anonHdrs, body: JSON.stringify({ confirm: true }) })).status).toBe(401);

  // Confirmed delete → 200, then the cascade is real.
  const del = await callDelete(C.jwt, { confirm: true });
  expect(del.status).toBe(200);
  expect((await del.json()).deleted).toBe(true);

  // Service-key readback: every CASCADE-owned table is empty for C, and the auth user is gone.
  expect(await countFor(C.id, "user_health_context")).toBe(0);
  expect(await countFor(C.id, "watchlist_items")).toBe(0);
  expect(await countFor(C.id, "saved_reports")).toBe(0);
  expect(await countFor(C.id, "subscriptions")).toBe(0);
  const prof = await fetch(`${SB_URL}/rest/v1/profiles?user_id=eq.${C.id}&select=user_id`, { headers: svc }).then((r) => r.json());
  expect(Array.isArray(prof) ? prof.length : -1).toBe(0);
  const gone = await fetch(`${SB_URL}/auth/v1/admin/users/${C.id}`, { headers: svc });
  expect(gone.ok).toBe(false); // 404 — auth user removed

  // generated_answers is ON DELETE SET NULL = ANONYMIZED (not dropped): the row SURVIVES
  // with user_id severed. This is the §8 "anonymizes answers" guarantee — and the probe
  // that would catch a regression to ON DELETE CASCADE (which would destroy corpus data).
  const ga = await fetch(`${SB_URL}/rest/v1/generated_answers?question=eq.ga-${C.id}&select=id,user_id`, { headers: svc }).then((r) => r.json());
  expect(Array.isArray(ga) && ga.length).toBeGreaterThan(0);
  expect((ga as { user_id: string | null }[]).every((r) => r.user_id === null)).toBe(true);
});

test("7-1: delete-account through the UI signs the user out and removes the account", async ({ page }) => {
  await signIn(page, A);
  await page.goto("/profile/delete-account", { timeout: 60_000 });
  await page.getByTestId("delete-confirm").click();
  await page.getByTestId("request-deletion").click();
  // The session is dead → back to sign-in.
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 30_000 });
  // And A is actually gone.
  const gone = await fetch(`${SB_URL}/auth/v1/admin/users/${A.id}`, { headers: svc });
  expect(gone.ok).toBe(false);
});
