import { test, expect, type Page } from "@playwright/test";

// Phase 6b-5 gate: Profile + My Health Context (the second authenticated WRITE path,
// and the most sensitive — PII) + the AC10 legal/data affordances + the doc-06 8-state
// matrix's live cells (offline, guest). Self-seeds its own two users (A = actor, B =
// isolation probe) and tears them down. Health-context CRUD is verified end-to-end
// through the UI (which also de-risks the write path: this is the first INSERT into
// user_health_context), and cross-user isolation is verified at the REST layer with the
// same rigor as the watchlist gate PLUS an explicit anon-cannot-read probe — because
// allergies/pregnancy/conditions are the rows that most need RLS to hold.

const SB_URL = process.env.SB_URL!;
const SERVICE_KEY = process.env.SERVICE_KEY!;
const ANON_KEY = process.env.ANON_KEY!;
const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const anonHdrs = { apikey: ANON_KEY, "Content-Type": "application/json" };
const userHdrs = (jwt: string) => ({ apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });

interface Seed { id: string; email: string; password: string; jwt: string }
let A: Seed; // actor
let B: Seed; // isolation probe

async function seedUser(tag: string): Promise<Seed> {
  const email = `phase6b5${tag}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@pharmabro.test`;
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

function hc(jwt: string, init?: RequestInit) {
  return fetch(`${SB_URL}/rest/v1/user_health_context`, { ...init, headers: { ...userHdrs(jwt), ...(init?.headers ?? {}) } });
}

test.beforeAll(async () => {
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("SB_URL + SERVICE_KEY + ANON_KEY required");
  A = await seedUser("a");
  B = await seedUser("b");
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

test("6b-5: My Health Context CRUD round-trip through the UI (the new write path)", async ({ page }) => {
  await signIn(page, A);

  // Edit + consent + save (the first INSERT into user_health_context — de-risks the GRANT).
  await page.goto("/profile/health-context", { timeout: 60_000 });
  await expect(page.getByTestId("hc-screen")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("hc-age").fill("30-39");
  await page.getByTestId("hc-allergies").fill("penicillin, sulfa");
  await page.getByTestId("hc-kidney-no").click();
  await page.getByTestId("hc-consent").click(); // doc-18 consent gate
  await page.getByTestId("hc-save").click();
  await expect(page.getByTestId("hc-saved")).toBeVisible({ timeout: 30_000 });

  // Persisted: reload the screen and the saved value seeds the form.
  await page.goto("/profile/health-context", { timeout: 60_000 });
  await expect(page.getByTestId("hc-age")).toHaveValue("30-39", { timeout: 30_000 });
  await expect(page.getByTestId("hc-allergies")).toHaveValue(/penicillin/);

  // Independent delete (doc-18): removes ONLY the health context; the affordance vanishes.
  await page.getByTestId("hc-delete").click();
  await expect(page.getByTestId("hc-delete")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("hc-consent")).toBeVisible(); // back to the un-saved state
  const remaining = await hc(A.jwt, { method: "GET" }).then((r) => r.json());
  expect(Array.isArray(remaining) ? remaining.length : -1).toBe(0);
});

test("6b-5: health-context cross-user RLS isolation + anon cannot read (PII)", async () => {
  const body = (uid: string, age: string) =>
    JSON.stringify({ user_id: uid, consent_version: "2026-06-04", age_range: age });

  // A and B each save their own row — bidirectional, so "neither sees the other" is real.
  const aIns = await hc(A.jwt, { method: "POST", body: body(A.id, "A-range") });
  const bIns = await hc(B.jwt, { method: "POST", body: body(B.id, "B-range") });
  expect(aIns.status).toBe(201);
  expect(bIns.status).toBe(201);

  // Each reads EXACTLY its own row, never the other's.
  const aRows = await hc(A.jwt, { method: "GET" }).then((r) => r.json());
  const bRows = await hc(B.jwt, { method: "GET" }).then((r) => r.json());
  expect(aRows.length).toBe(1);
  expect(aRows[0].age_range).toBe("A-range");
  expect(bRows.length).toBe(1);
  expect(bRows[0].age_range).toBe("B-range");

  // B cannot UPDATE A's row either — UPDATE rides the same USING predicate as SELECT,
  // so A's row is invisible to B: the PATCH matches 0 rows and A's data is unchanged.
  const evilUpd = await fetch(`${SB_URL}/rest/v1/user_health_context?user_id=eq.${A.id}`, {
    method: "PATCH",
    headers: { ...userHdrs(B.jwt), Prefer: "return=representation" },
    body: JSON.stringify({ age_range: "hijacked" }),
  });
  const updated = await evilUpd.json();
  expect(Array.isArray(updated) ? updated.length : -1).toBe(0); // 0 rows in B's view
  const aStill = await fetch(`${SB_URL}/rest/v1/user_health_context?user_id=eq.${A.id}&select=age_range`, { headers: svc }).then((r) => r.json());
  expect(aStill[0]?.age_range).toBe("A-range"); // ground truth: untouched

  // Anon must read NOTHING — the policies are TO authenticated, but Supabase default
  // privileges GRANT anon at the table level, so RLS is the only guard. Assert the
  // precise secure invariant: a 200 that is RLS-FILTERED to empty (both A+B rows exist,
  // so a disabled-RLS table would leak ≥2 rows here) — this proves RLS is ENABLED, not
  // merely that the grant happens to be absent.
  const anonRes = await fetch(`${SB_URL}/rest/v1/user_health_context?select=age_range`, { headers: anonHdrs });
  const anonBody = await anonRes.json();
  expect(anonRes.status).toBe(200);
  expect(Array.isArray(anonBody) ? anonBody.length : -1).toBe(0);

  // Delete A's row so the evil insert below hits the WITH CHECK (403), not a UNIQUE (409).
  await fetch(`${SB_URL}/rest/v1/user_health_context?user_id=eq.${A.id}`, { method: "DELETE", headers: userHdrs(A.jwt) });

  // B cannot plant a row owned by A: assert the SPECIFIC 403 (WITH CHECK), then ground-
  // truth with the service key that nothing was written.
  const evil = await hc(B.jwt, { method: "POST", body: body(A.id, "evil") });
  expect(evil.status).toBe(403);
  const planted = await fetch(`${SB_URL}/rest/v1/user_health_context?user_id=eq.${A.id}&select=age_range`, { headers: svc }).then((r) => r.json());
  expect(Array.isArray(planted) ? planted.length : -1).toBe(0);

  // Cleanup B's row.
  await fetch(`${SB_URL}/rest/v1/user_health_context?user_id=eq.${B.id}`, { method: "DELETE", headers: userHdrs(B.jwt) });
});

test("6b-5: AC10 affordances are present on Profile and each screen is reachable", async ({ page }) => {
  await signIn(page, A);
  await page.goto("/profile", { timeout: 60_000 });

  // Present: the affordances are linked from the Profile hub.
  for (const id of ["nav-health-context", "nav-privacy", "nav-terms", "nav-disclaimer", "nav-export", "nav-delete-account"]) {
    await expect(page.getByTestId(id)).toBeVisible({ timeout: 30_000 });
  }

  // Reachable (live click-through proves the wiring): Profile → Privacy.
  await page.getByTestId("nav-privacy").click();
  await expect(page.getByTestId("legal-privacy")).toBeVisible({ timeout: 30_000 });

  // The rest render (privacy/terms/disclaimer = AC10 legal; delete + export = AC10 data).
  await page.goto("/profile/legal?doc=terms", { timeout: 60_000 });
  await expect(page.getByTestId("legal-terms")).toBeVisible();
  await page.goto("/profile/legal?doc=disclaimer", { timeout: 60_000 });
  await expect(page.getByTestId("disclaimer-body")).toBeVisible();
  await page.goto("/profile/delete-account", { timeout: 60_000 });
  await expect(page.getByTestId("delete-account-screen")).toBeVisible();
  await page.getByTestId("request-deletion").click();
  await expect(page.getByTestId("delete-account-status")).toBeVisible(); // honest "at launch" — no real delete
  await page.goto("/profile/export", { timeout: 60_000 });
  await expect(page.getByTestId("export-screen")).toBeVisible();
});

test("6b-5: 8-state matrix — empty cells (deterministic) on Search/Drug/Watchlist", async ({ page }) => {
  // These three empties ARE deterministic (unlike error injection vs cloud), so the
  // matrix proves them live rather than leaning on the primitive alone. A signed in has
  // 0 follows in this spec, so the watchlist empty is genuine.
  await signIn(page, A);

  await page.goto("/explore", { timeout: 60_000 });
  await page.getByTestId("search-input").fill("zzqxqzznotadrug");
  await expect(page.getByTestId("search-empty")).toBeVisible({ timeout: 30_000 }); // Search/empty

  await page.goto("/drug/11111111-1111-1111-1111-111111111111", { timeout: 60_000 });
  await expect(page.getByTestId("drug-empty")).toBeVisible({ timeout: 30_000 }); // Drug/empty (valid id, absent)

  await page.goto("/watchlist", { timeout: 60_000 });
  await expect(page.getByTestId("watchlist-empty")).toBeVisible({ timeout: 30_000 }); // Watchlist/empty
});

test("6b-5: 8-state matrix — global offline banner + guest affordances on the key screens", async ({ page }) => {
  // Offline: a signed-in session, then drop the network → the global banner appears on
  // any route, and clears when back online. (Dispatch the events too, so the assertion
  // is deterministic regardless of whether emulation auto-fires them.)
  await signIn(page, A);
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByTestId("offline-banner")).toBeVisible({ timeout: 30_000 });
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("offline-banner")).toBeHidden({ timeout: 30_000 });

  // Sign out → guest. Each key screen shows its guest affordance (the matrix guest cell).
  await page.goto("/profile", { timeout: 60_000 });
  await page.getByTestId("signout").click();
  await expect(page.getByTestId("signin-screen")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("age-ack").click();
  await page.getByTestId("continue-guest").click();
  await expect(page.getByTestId("tab-ask")).toBeVisible({ timeout: 30_000 });
  // Bottom tabs keep every visited screen mounted, so state-guest appears once per
  // visited tab — scope each assertion to its tab container.
  await expect(page.getByTestId("tab-ask").getByTestId("state-guest")).toBeVisible(); // Ask guest

  // Client-side tab nav (NOT page.goto — the guest flag is in-memory; a hard reload
  // drops a guest back to sign-in via the tabs guard). The target label is the only
  // match on the current screen, so the text click is unambiguous.
  await page.getByText("Explore", { exact: true }).click();
  await expect(page.getByTestId("tab-explore").getByTestId("state-guest")).toBeVisible(); // Explore guest
  await page.getByText("Watchlist", { exact: true }).click();
  await expect(page.getByTestId("tab-watchlist").getByTestId("state-guest")).toBeVisible(); // Watchlist guest

  // Drug + Source gate on !session alone (no guest flag), so a deep-link holds the state.
  await page.goto("/drug/00000000-0000-0000-0000-000000000000");
  await expect(page.getByTestId("drug-auth-required")).toBeVisible(); // Drug guest
  await page.goto("/source/00000000-0000-0000-0000-000000000000");
  await expect(page.getByTestId("source-auth-required")).toBeVisible(); // Source Viewer guest
});
