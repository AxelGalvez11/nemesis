#!/usr/bin/env -S deno run --allow-net --allow-env --allow-run
/**
 * Phase 5 acceptance gate (AC7 + AC8), run AS VERIFIED AUTHENTICATED end-users
 * (real app path, role=authenticated JWT — never the service key for the reads).
 *
 *   AC7  user can follow 3 items; they persist + GET /watchlist returns them.
 *   AC8  a weekly digest can be generated: a real corpus event (semaglutide
 *        pubmed_new) becomes an `updates` row, the live get_watchlist_updates feed
 *        surfaces it, and the user's `digests` snapshot CONTAINS that exact update.
 *
 * Self-contained: creates its own users, shells the service-role host scripts
 * (detect-updates --only=semaglutide, then generate-digest --user) so one run
 * proves the whole follow → detect → digest path. Idempotent host scripts make
 * re-runs safe. Requires migration 0116 applied first (db push).
 *
 * Also gates the seam + the security posture:
 *   - the semaglutide follow stores item_ref = entity_id (the locked invariant),
 *     and the matched update carries the same item_ref;
 *   - a second user who follows nothing sees NONE of user-1's updates and cannot
 *     read user-1's digest (RLS owner-only);
 *   - get_watchlist_updates: anon DENIED, authenticated OK.
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... ANON_KEY=... \
 *     deno run --allow-net --allow-env --allow-run scripts/phase5-validate.ts
 */

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(2);
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const svc = { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` };
const anon = { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };
const bearer = (jwt: string) => ({ apikey: ANON_KEY!, Authorization: `Bearer ${jwt}` });

async function rest(headers: Record<string, string>, path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function rpc(headers: Record<string, string>, fn: string, args: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const userIds: string[] = [];
async function makeUser(): Promise<{ id: string; jwt: string }> {
  const email = `phase5-validator+${crypto.randomUUID().slice(0, 8)}@nemesis.test`;
  const password = crypto.randomUUID();
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json()).catch(() => ({}));
  const id = created?.id ?? created?.user?.id;
  if (id) userIds.push(id);
  const signin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  return { id, jwt: signin.access_token };
}

async function teardown() {
  for (const id of userIds) {
    await fetch(`${SB_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: svc }).catch(() => {});
  }
}

/** Run a service-role host script as a subprocess; inherit stdout so progress shows. */
async function runScript(script: string, args: string[]): Promise<boolean> {
  console.log(`  $ deno run … ${script} ${args.join(" ")}`);
  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-net", "--allow-env", script, ...args],
    env: Deno.env.toObject(),
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  return code === 0;
}

async function main() {
  const u1 = await makeUser();
  const u2 = await makeUser();
  check("authenticated sign-in (two end-users)", !!u1.jwt && !!u2.jwt);
  if (!u1.jwt || !u2.jwt) throw new Error("sign-in failed");

  // Resolve semaglutide (the AC8 anchor) + two more distinct drugs to follow.
  const { body: sema } = await rest(bearer(u1.jwt),
    "drug_entities?normalized_name=eq.semaglutide&select=id,canonical_name&limit=1");
  const semaId: string | undefined = Array.isArray(sema) ? sema[0]?.id : undefined;
  check("resolve semaglutide entity", !!semaId, semaId);
  const { body: others } = await rest(bearer(u1.jwt),
    `drug_entities?id=neq.${semaId}&select=id,canonical_name&limit=2`);
  const otherIds: string[] = Array.isArray(others) ? others.map((r) => r.id) : [];
  if (!semaId || otherIds.length < 2) throw new Error("could not resolve 3 entities to follow");

  // ---- AC7: follow 3 items (drug follows: item_ref = entity_id) ----
  console.log("\n[AC7] follow 3 items; they persist + GET /watchlist returns them");
  const follows = [semaId, ...otherIds].map((id) => ({
    item_type: "drug", item_ref: id, alert_types: ["pubmed_new"], frequency: "weekly",
  }));
  const ins = await rest(bearer(u1.jwt), "watchlist_items", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(follows),
  });
  check("insert 3 watchlist follows", ins.status === 201 && Array.isArray(ins.body) && ins.body.length === 3,
    `status=${ins.status} rows=${Array.isArray(ins.body) ? ins.body.length : "?"}`);
  const semaFollow = Array.isArray(ins.body) ? ins.body.find((r) => r.item_ref === semaId) : null;
  check("  └ semaglutide follow stores item_ref = entity_id (locked seam)", semaFollow?.item_ref === semaId);

  const { body: wl } = await rest(bearer(u1.jwt), "watchlist_items?select=id,item_type,item_ref,frequency");
  check("GET /watchlist returns the user's 3 follows", Array.isArray(wl) && wl.length === 3,
    Array.isArray(wl) ? `${wl.length} rows` : "none");

  // ---- exercise the real path: detect-updates (sema) → generate-digest (user1) ----
  console.log("\n[AC8] run the real follow → detect → digest path");
  const detected = await runScript("scripts/detect-updates.ts", ["--only=semaglutide"]);
  check("detect-updates --only=semaglutide succeeded", detected);

  const endISO = new Date(Date.now() + 86_400_000).toISOString();
  const startISO = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const generated = await runScript("scripts/generate-digest.ts",
    [`--user=${u1.id}`, `--period-start=${startISO}`, `--period-end=${endISO}`]);
  check("generate-digest --user succeeded", generated);

  // ---- AC8 assertions, as the authenticated end-user ----
  console.log("\n[AC8] the feed + digest contain the specific semaglutide update");
  const feed = await rpc(bearer(u1.jwt), "get_watchlist_updates", { max_results: 100 });
  const feedRows: Array<Record<string, unknown>> = Array.isArray(feed.body) ? feed.body : [];
  const semaUpdate = feedRows.find((r) => r.item_ref === semaId && r.update_type === "pubmed_new");
  check("get_watchlist_updates surfaces a semaglutide pubmed_new", !!semaUpdate,
    semaUpdate ? String(semaUpdate.title).slice(0, 60) : `${feedRows.length} rows, none matched`);
  check("  └ matched update carries item_ref = entity_id (seam end-to-end)",
    semaUpdate?.item_ref === semaId);
  const targetId = semaUpdate?.id as string | undefined;

  const { body: digests } = await rest(bearer(u1.jwt),
    "digests?select=update_count,items,period_start&order=generated_at.desc&limit=1");
  const digest = Array.isArray(digests) ? digests[0] : null;
  check("user has a digest row", !!digest, digest ? `update_count=${digest.update_count}` : "none");
  check("  └ digest is non-empty", !!digest && digest.update_count > 0);
  const items: Array<Record<string, unknown>> = Array.isArray(digest?.items) ? digest.items : [];
  check("  └ digest CONTAINS the specific semaglutide update (not just non-empty)",
    !!targetId && items.some((it) => it.id === targetId),
    `${items.length} items; target ${targetId?.slice(0, 8) ?? "?"}`);

  // ---- cross-user isolation ----
  console.log("\n[security] a user sees only their own updates + digest");
  const feed2 = await rpc(bearer(u2.jwt), "get_watchlist_updates", { max_results: 100 });
  const feed2Rows = Array.isArray(feed2.body) ? feed2.body : [];
  check("user-2 (follows nothing) gets an empty feed", feed2Rows.length === 0, `${feed2Rows.length} rows`);
  const { body: d2 } = await rest(bearer(u2.jwt), "digests?select=id");
  check("user-2 cannot read user-1's digest (RLS owner-only)", Array.isArray(d2) && d2.length === 0,
    Array.isArray(d2) ? `${d2.length} rows` : "?");

  // ---- anon denial ----
  console.log("\n[security] get_watchlist_updates locked from anon");
  const anonCall = await rpc(anon, "get_watchlist_updates", { max_results: 10 });
  check("anon → get_watchlist_updates DENIED", anonCall.status === 401 || anonCall.status === 403,
    `status=${anonCall.status}`);

  console.log(`\n${failures === 0 ? "✅ PHASE 5 GATE PASS (AC7 + AC8)" : `❌ ${failures} FAILURE(S)`}`);
}

main().catch((e) => {
  console.error("fatal:", e.message);
  failures++;
}).finally(async () => {
  await teardown();
  Deno.exit(failures === 0 ? 0 : 1);
});
