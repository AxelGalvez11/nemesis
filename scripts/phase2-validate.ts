#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 2 acceptance gate (AC1/AC4/AC5/AC6).
 *
 * Proves the loop a user actually walks, AS AN AUTHENTICATED USER (not the
 * service key — service_role bypasses RLS + has blanket grants, so it would not
 * exercise the real app path the advisor flagged). Mints a throwaway auth user
 * via the admin API, signs in for a role=authenticated JWT, then runs the §8
 * read RPCs with that JWT:
 *
 *   AC1  search "ozempic"  -> resolves to the "Semaglutide" canonical entity
 *        search "semaglutide" -> same entity
 *   AC4  get_drug_label    -> extracted label sections + a citation (url/license)
 *   AC5  get_drug_trials   -> ClinicalTrials.gov studies + citation
 *   AC6  get_drug_pubmed   -> PubMed articles + citation
 *        get_drug          -> overview with non-zero label/trial/pubmed counts
 *                            + cited Layer-A sources
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... ANON_KEY=... \
 *     deno run --allow-net --allow-env scripts/phase2-validate.ts [--entity=semaglutide] [--brand=ozempic]
 */

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(2);
}
const arg = (n: string, d: string) =>
  Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const ENTITY = arg("entity", "semaglutide");
const BRAND = arg("brand", "ozempic");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// A throwaway end-user with a RANDOM password + a unique *.test email, torn down
// in finally — no standing pre-authed account with a repo-known password.
let JWT: string | undefined;
let userId: string | undefined;

async function rpc(fn: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { __error: `${res.status} ${(await res.text()).slice(0, 160)}` };
  return res.json();
}

async function teardown() {
  if (!userId) return;
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
  }).catch(() => {});
}

async function main() {
  // ---- authenticate as a throwaway end-user (role=authenticated) ----
  const email = `phase2-validator+${crypto.randomUUID().slice(0, 8)}@nemesis.test`;
  const password = crypto.randomUUID();
  const createRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = await createRes.json().catch(() => ({}));
  userId = created?.id ?? created?.user?.id;

  const signin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const signinBody = await signin.json();
  JWT = signinBody.access_token as string | undefined;
  check("authenticated sign-in (role=authenticated JWT)", !!JWT,
    JWT ? "token acquired" : JSON.stringify(signinBody).slice(0, 120));
  if (!JWT) throw new Error("authenticated sign-in failed");

// ---- AC1: search by brand alias + generic ----
console.log(`\n[AC1] search (authenticated)`);
const byBrand = await rpc("search_entities", { q: BRAND }) as Array<Record<string, unknown>>;
const brandHit = Array.isArray(byBrand)
  ? byBrand.find((r) => String(r.name).toLowerCase() === ENTITY) : undefined;
check(`search "${BRAND}" resolves to "${ENTITY}"`, !!brandHit,
  brandHit ? `top results: ${byBrand.slice(0, 3).map((r) => r.name).join(", ")}`
           : `got: ${JSON.stringify(byBrand).slice(0, 160)}`);

const byGeneric = await rpc("search_entities", { q: ENTITY }) as Array<Record<string, unknown>>;
const genHit = Array.isArray(byGeneric)
  ? byGeneric.find((r) => String(r.name).toLowerCase() === ENTITY) : undefined;
check(`search "${ENTITY}" resolves to "${ENTITY}"`, !!genHit);

const entityId = (brandHit?.id ?? genHit?.id) as string | undefined;
if (!entityId) throw new Error(`could not resolve ${ENTITY}`);

// ---- get_drug overview + counts + cited sources ----
console.log(`\n[overview] get_drug`);
const drug = await rpc("get_drug", { p_id: entityId }) as Record<string, any>;
const counts = drug?.counts ?? {};
check("get_drug returns the entity", String(drug?.canonical_name).toLowerCase() === ENTITY);
check("overview cites Layer-A sources", Array.isArray(drug?.sources) && drug.sources.length > 0,
  `sources=${drug?.sources?.length ?? 0}`);
check("counts: labels>=1, trials>=1, pubmed>=1",
  (counts.labels ?? 0) >= 1 && (counts.trials ?? 0) >= 1 && (counts.pubmed ?? 0) >= 1,
  JSON.stringify(counts));

// ---- AC4: label sections + citation ----
console.log(`\n[AC4] get_drug_label`);
const labels = await rpc("get_drug_label", { p_id: entityId }) as Array<Record<string, any>>;
const lab = Array.isArray(labels) ? labels[0] : undefined;
const secKeys = lab?.extracted_sections ? Object.keys(lab.extracted_sections) : [];
check("label present", !!lab);
check("label has extracted sections", secKeys.length > 0, secKeys.slice(0, 8).join(", "));
check("label carries a citation (url+license)", !!lab?.citation_url && !!lab?.license,
  lab ? `${lab.provider} / ${lab.license}` : "");

// ---- AC5: trials + citation ----
console.log(`\n[AC5] get_drug_trials`);
const trials = await rpc("get_drug_trials", { p_id: entityId }) as Array<Record<string, any>>;
check("trials present", Array.isArray(trials) && trials.length > 0, `n=${trials?.length ?? 0}`);
check("every trial carries a citation_url", Array.isArray(trials) && trials.length > 0 && trials.every((t) => !!t.citation_url),
  trials?.[0] ? `e.g. ${trials[0].nct_id} → ${trials[0].citation_url}` : "");

// ---- AC6: pubmed + citation ----
console.log(`\n[AC6] get_drug_pubmed`);
const pubmed = await rpc("get_drug_pubmed", { p_id: entityId }) as Array<Record<string, any>>;
check("pubmed present", Array.isArray(pubmed) && pubmed.length > 0, `n=${pubmed?.length ?? 0}`);
check("every article carries a citation_url", Array.isArray(pubmed) && pubmed.length > 0 && pubmed.every((a) => !!a.citation_url),
  pubmed?.[0] ? `e.g. PMID ${pubmed[0].pmid} → ${pubmed[0].citation_url}` : "");

  console.log(`\n  entity=${ENTITY} id=${entityId}`);
}

let exitCode = 0;
try {
  await main();
  exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error(`\nFAIL: ${(e as Error).message}`);
  exitCode = 1;
} finally {
  await teardown();
}
console.log(`\n${exitCode === 0 ? "✅ PHASE 2 ACCEPTANCE PASS" : `❌ ${failures} CHECK(S) FAILED / fatal`} — ${ENTITY}`);
Deno.exit(exitCode);
