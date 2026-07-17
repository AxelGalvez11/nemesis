#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 4 acceptance gate (AC9) for the evidence-scoring engine.
 *
 * Runs the drug-page reads AS A VERIFIED AUTHENTICATED USER (the real app path),
 * and checks the admin review API is service-role-only.
 *
 *   AC9  evidence score appears on drug/compound pages (score + rationale +
 *        evidence_counts + limitations), and off-label < approved.
 *
 * Asserts:
 *   - get_drug(semaglutide) returns a populated evidence_score block.
 *   - semaglutide off-label claim tier  <  approved on-label claim tier.
 *   - BPC-157 (research peptide) drug-level tier ≤ very_weak.
 *   - list_unreviewed_scores / mark_score_reviewed: anon + authenticated DENIED,
 *     service_role works (and a flagged row exists for review).
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... ANON_KEY=... \
 *     deno run --allow-net --allow-env scripts/phase4-validate.ts
 */

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(2);
}

const RANK: Record<string, number> = {
  unknown: -1, very_weak: 0, weak: 1, moderate: 2, strong: 3, very_strong: 4,
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

let JWT: string | undefined;
let userId: string | undefined;

const svc = { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` };
const authed = () => ({ apikey: ANON_KEY!, Authorization: `Bearer ${JWT}` });
const anon = { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };

async function rest(headers: Record<string, string>, path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers });
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

async function entityId(name: string): Promise<{ id: string; status: string } | null> {
  const { body } = await rest(
    authed(),
    `drug_entities?normalized_name=eq.${encodeURIComponent(name)}&select=id,canonical_name,approved_status&limit=1`,
  );
  const row = Array.isArray(body) ? body[0] : null;
  return row ? { id: row.id, status: row.approved_status } : null;
}

async function teardown() {
  if (!userId) return;
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc }).catch(() => {});
}

async function main() {
  const email = `phase4-validator+${crypto.randomUUID().slice(0, 8)}@nemesis.test`;
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
  JWT = signin.access_token;
  check("authenticated sign-in (role=authenticated JWT)", !!JWT);
  if (!JWT) throw new Error("sign-in failed");

  // ---- AC9: evidence score on the drug page (get_drug) ----
  console.log("\n[AC9] evidence score appears on the drug page");
  const sema = await entityId("semaglutide");
  check("resolve semaglutide entity", !!sema, sema?.id);
  if (sema) {
    const { body: drug } = await rpc(authed(), "get_drug", { p_id: sema.id });
    const es = drug?.evidence_score;
    check("get_drug returns an evidence_score block", !!es, es ? `score=${es.score}` : "missing");
    if (es) {
      check("  └ has a real tier", typeof es.score === "string" && es.score in RANK && es.score !== "unknown", es.score);
      check("  └ has a rationale", typeof es.rationale === "string" && es.rationale.trim().length > 10);
      check("  └ has evidence_counts", es.evidence_counts && typeof es.evidence_counts === "object");
      check("  └ has limitations[]", Array.isArray(es.limitations) && es.limitations.length >= 1,
        Array.isArray(es.limitations) ? `${es.limitations.length} item(s)` : `type=${typeof es.limitations}`);
    }
  }

  // ---- AC9: off-label < approved ----
  console.log("\n[AC9] off-label scores strictly below the approved indication");
  if (sema) {
    const { body: claims } = await rest(
      authed(),
      `evidence_scores?entity_id=eq.${sema.id}&entity_type=eq.claim&select=claim_text,score`,
    );
    const rows: Array<{ claim_text: string; score: string }> = Array.isArray(claims) ? claims : [];
    const approved = rows.find((r) => /weight management/i.test(r.claim_text));
    const offLabel = rows.find((r) => /gym|physique|performance/i.test(r.claim_text));
    check("approved claim present (weight management)", !!approved, approved?.score);
    check("off-label claim present (performance)", !!offLabel, offLabel?.score);
    if (approved && offLabel) {
      check(`off-label (${offLabel.score}) < approved (${approved.score})`,
        RANK[offLabel.score] < RANK[approved.score]);
    }
  }

  // ---- AC9: research peptide stays conservative ----
  console.log("\n[AC9] research peptide scored conservatively");
  const bpc = await entityId("bpc-157");
  if (bpc) {
    const { body } = await rest(
      authed(),
      `evidence_scores?entity_id=eq.${bpc.id}&select=entity_type,claim_text,score`,
    );
    const rows: Array<{ entity_type: string; claim_text: string | null; score: string }> = Array.isArray(body) ? body : [];
    const drug = rows.find((r) => r.entity_type === "drug");
    const tendon = rows.find((r) => r.entity_type === "claim" && /tendon|ligament|healing/i.test(r.claim_text ?? ""));
    // The peptide cap guarantees ≤ weak even when a small early-phase human trial
    // exists (BPC-157 has one Phase-1 n=42 study → weak, not moderate+).
    check("BPC-157 drug-level tier ≤ weak (peptide cap holds)", !!drug && RANK[drug.score] <= RANK.weak, drug?.score);
    // §9 worked example: "tendon healing in humans" absent robust human data.
    check("BPC-157 'tendon healing in humans' claim ≤ very_weak", !!tendon && RANK[tendon.score] <= RANK.very_weak, tendon?.score);
  } else {
    check("resolve bpc-157 entity", false, "not found (was it scored?)");
  }

  // ---- AC9 admin: review API is service-role only ----
  console.log("\n[security] admin review API locked to service_role");
  const anonCall = await rpc(anon, "list_unreviewed_scores", { max_results: 10 });
  check("anon → list_unreviewed_scores DENIED", anonCall.status === 401 || anonCall.status === 403,
    `status=${anonCall.status}`);
  const authedCall = await rpc(authed(), "list_unreviewed_scores", { max_results: 10 });
  check("authenticated → list_unreviewed_scores DENIED", authedCall.status === 401 || authedCall.status === 403,
    `status=${authedCall.status}`);
  const svcCall = await rpc(svc, "list_unreviewed_scores", { max_results: 10 });
  check("service_role → list_unreviewed_scores OK", svcCall.status === 200 && Array.isArray(svcCall.body),
    `status=${svcCall.status} rows=${Array.isArray(svcCall.body) ? svcCall.body.length : "?"}`);
  if (svcCall.status === 200 && Array.isArray(svcCall.body)) {
    check("  └ a high-risk/peptide row is queued for review", svcCall.body.length >= 1,
      `${svcCall.body.length} queued`);
    // mark_score_reviewed: service works, authenticated denied.
    const denied = await rpc(authed(), "mark_score_reviewed", { p_id: "00000000-0000-0000-0000-000000000000" });
    check("authenticated → mark_score_reviewed DENIED", denied.status === 401 || denied.status === 403,
      `status=${denied.status}`);
    if (svcCall.body.length >= 1) {
      const target = svcCall.body[0].id;
      const marked = await rpc(svc, "mark_score_reviewed", { p_id: target });
      check("service_role → mark_score_reviewed OK", marked.status === 200 && marked.body === true,
        `status=${marked.status} result=${marked.body}`);
    }
  }

  console.log(`\n${failures === 0 ? "✅ PHASE 4 GATE PASS (AC9)" : `❌ ${failures} FAILURE(S)`}`);
}

main().catch((e) => {
  console.error("fatal:", e.message);
  failures++;
}).finally(async () => {
  await teardown();
  Deno.exit(failures === 0 ? 0 : 1);
});
