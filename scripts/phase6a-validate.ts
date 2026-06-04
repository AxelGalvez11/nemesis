#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 6a gate — the two §8 backend endpoints the mobile app depends on, run AS A
 * VERIFIED AUTHENTICATED end-user (role=authenticated JWT, not the service key).
 *
 *   get_source (GET /sources/{id})  — the Source Viewer record (doc-12).
 *   compare    (GET /compare?left&right) — structured side-by-side (doc-11).
 *
 * Asserts the shapes the app renders + the security posture (anon DENIED on both;
 * bad input rejected). Requires migration 0118 applied + the compare function
 * deployed.
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... ANON_KEY=... \
 *     deno run --allow-net --allow-env scripts/phase6a-validate.ts
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

let userId: string | undefined;
async function makeUser(): Promise<string> {
  const email = `phase6a-validator+${crypto.randomUUID().slice(0, 8)}@pharmabro.test`;
  const password = crypto.randomUUID();
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...svc, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json()).catch(() => ({}));
  userId = created?.id ?? created?.user?.id;
  const signin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  return signin.access_token;
}
async function teardown() {
  if (userId) await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc }).catch(() => {});
}

async function rpc(headers: Record<string, string>, fn: string, args: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function compareFn(headers: Record<string, string>, qs: string) {
  const res = await fetch(`${SB_URL}/functions/v1/compare?${qs}`, { headers });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function entityId(jwt: string, name: string): Promise<string | undefined> {
  const res = await fetch(
    `${SB_URL}/rest/v1/drug_entities?normalized_name=eq.${encodeURIComponent(name)}&select=id&limit=1`,
    { headers: bearer(jwt) },
  );
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body[0]?.id : undefined;
}

async function main() {
  const jwt = await makeUser();
  check("authenticated sign-in (role=authenticated JWT)", !!jwt);
  if (!jwt) throw new Error("sign-in failed");

  const sema = await entityId(jwt, "semaglutide");
  check("resolve semaglutide entity", !!sema, sema);
  // A second, distinct entity for compare.
  const others = await fetch(
    `${SB_URL}/rest/v1/drug_entities?id=neq.${sema}&select=id,canonical_name&limit=1`,
    { headers: bearer(jwt) },
  ).then((r) => r.json()).catch(() => null);
  const other: string | undefined = Array.isArray(others) ? others[0]?.id : undefined;
  if (!sema || !other) throw new Error("need two entities");

  // ---- get_source (GET /sources/{id}) ----
  console.log("\n[6a] get_source — the Source Viewer record");
  const { body: drug } = await rpc(bearer(jwt), "get_drug", { p_id: sema });
  const srcId: string | undefined = Array.isArray(drug?.sources) ? drug.sources[0]?.source_id : undefined;
  check("semaglutide has a cited source to view", !!srcId, srcId);
  if (srcId) {
    const { status, body } = await rpc(bearer(jwt), "get_source", { p_id: srcId });
    check("get_source returns the record (authenticated)", status === 200 && body && body.source_id === srcId,
      `status=${status}`);
    if (body) {
      check("  └ provider + title + url present", !!body.provider && !!body.title && !!body.url);
      check("  └ external_id (provider_id) present", !!body.external_id);
      check("  └ is_current is a boolean (drives 'outdated' state)", typeof body.is_current === "boolean",
        String(body.is_current));
      check("  └ sections is an array", Array.isArray(body.sections), `${body.sections?.length ?? "?"} sections`);
    }
  }
  const anonSrc = await rpc(anon, "get_source", { p_id: srcId ?? sema });
  check("anon → get_source DENIED", anonSrc.status === 401 || anonSrc.status === 403, `status=${anonSrc.status}`);

  // ---- compare (GET /compare?left&right) ----
  console.log("\n[6a] compare — structured side-by-side (7 section groups)");
  const cmp = await compareFn(bearer(jwt), `left=${sema}&right=${other}`);
  check("compare returns 200 (authenticated)", cmp.status === 200, `status=${cmp.status}`);
  if (cmp.status === 200 && cmp.body) {
    const s = cmp.body.sections ?? {};
    check("  └ left/right headers present", !!cmp.body.left?.id && !!cmp.body.right?.id);
    for (const key of ["mechanism", "approved_uses", "evidence_strength", "trial_status", "safety", "cost_access"]) {
      check(`  └ section '${key}' has left+right`, !!s[key] && "left" in s[key] && "right" in s[key]);
    }
    check("  └ sources is an array", Array.isArray(cmp.body.sources), `${cmp.body.sources?.length ?? "?"} sources`);
    check("  └ trial_status.left has a count", typeof s.trial_status?.left?.count === "number");
  }
  const anonCmp = await compareFn(anon, `left=${sema}&right=${other}`);
  check("anon → compare DENIED", anonCmp.status === 401 || anonCmp.status === 403, `status=${anonCmp.status}`);
  const badCmp = await compareFn(bearer(jwt), `left=not-a-uuid&right=${other}`);
  check("compare rejects a non-uuid (400)", badCmp.status === 400, `status=${badCmp.status}`);
  const sameCmp = await compareFn(bearer(jwt), `left=${sema}&right=${sema}`);
  check("compare rejects left===right (400)", sameCmp.status === 400, `status=${sameCmp.status}`);

  console.log(`\n${failures === 0 ? "✅ PHASE 6a GATE PASS (get_source + compare)" : `❌ ${failures} FAILURE(S)`}`);
}

main().catch((e) => {
  console.error("fatal:", e.message);
  failures++;
}).finally(async () => {
  await teardown();
  Deno.exit(failures === 0 ? 0 : 1);
});
