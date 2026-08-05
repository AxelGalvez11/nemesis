// PROD SMOKE (manual, post-LIVE_SOURCES=on): verify against the DEPLOYED /ask that
//   (1) retatrutide now surfaces PubMed evidence (the live-evidence fix), and
//   (2) the answer format ADAPTS to the question (lean overview/mechanism vs an
//       interaction answer that carries substantive safety_notes + routing).
// Self-provisions an ephemeral enterprise-quota user (mirrors guardrail-suite) and
// tears it down. Read-mostly: each /ask writes one trace, deleted in teardown.
//
// SCOPE CAVEAT — this checks DANGER-FREE (detectViolations) + EVIDENCE-PRESENT, NOT
// SOURCE PROVENANCE. It once reported "PASS" on the openFDA fraudulent-name-drop bug:
// the answer was danger-free and cited "openFDA labels", but those labels were fake.
// Provenance (an investigational drug must pull ZERO openFDA labels) is gated by
// eval/live-accuracy-probe.ts — run BOTH; a green here alone does not prove accuracy.
//
//   SB_URL=https://<ref>.supabase.co deno run --allow-net --allow-env \
//     --env-file=supabase/functions/.env eval/live-prod-smoke.ts
import { detectViolations } from "../supabase/functions/ask/safety.ts";
import { newCiRun, recordCiAccount, teardownCiRun } from "../scripts/lib/ci-account-cleanup.ts";

const RUN = newCiRun("smoke");

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(2);
}

let JWT: string | undefined;
let userId: string | undefined;

interface Point { text: string; citation_ids?: string[] }
interface AskResponse {
  intent: string;
  plain_english_summary: string;
  evidence_grade: string;
  answer_sections: {
    what_we_know: Point[];
    safety_notes: Point[];
    what_we_do_not_know: Point[];
    questions_to_ask?: string[];
  };
  citations: Array<{ source_type: string; title: string | null; url: string | null }>;
  template?: string;
}

async function ask(question: string): Promise<AskResponse> {
  const res = await fetch(`${SB_URL}/functions/v1/ask`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`ask ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

function sectionShape(r: AskResponse): string {
  const s = r.answer_sections;
  const parts: string[] = [];
  if (s.what_we_know?.length) parts.push(`know:${s.what_we_know.length}`);
  if (s.safety_notes?.length) parts.push(`safety:${s.safety_notes.length}`);
  if (s.what_we_do_not_know?.length) parts.push(`gaps:${s.what_we_do_not_know.length}`);
  if (s.questions_to_ask?.length) parts.push(`questions:${s.questions_to_ask.length}`);
  return parts.length ? parts.join(" · ") : "(bottom_line only)";
}

function providerCounts(r: AskResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of r.citations) {
    const p = c.source_type.toLowerCase();
    const key = p.includes("pubmed") ? "pubmed" : p.includes("trial") || p.includes("nct") ? "clinicaltrials"
      : p.includes("openfda") || p.includes("label") ? "openfda" : p.includes("faers") ? "faers"
      : p.includes("europepmc") ? "europepmc" : p;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function fullText(r: AskResponse): string {
  const s = r.answer_sections;
  return [r.plain_english_summary, ...(s.what_we_know ?? []).map((p) => p.text),
    ...(s.safety_notes ?? []).map((p) => p.text), ...(s.what_we_do_not_know ?? []).map((p) => p.text)].join("  ");
}

async function teardown() {
  // Through the provenance gate, and only for an account this run can prove is
  // its own. The manifest also survives the process, so a killed run is cleaned
  // up by the workflow's always-runs step instead of leaking an account.
  await teardownCiRun({ SB_URL: SB_URL!, SERVICE_KEY: SERVICE_KEY! }, RUN, userId);
}

async function main() {
  const email = RUN.email;
  const password = crypto.randomUUID();
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  userId = created?.id ?? created?.user?.id;
  if (!userId) throw new Error("user create failed");
  await recordCiAccount(RUN, userId);

  const grant = await fetch(`${SB_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, plan: "enterprise", status: "active" }),
  });
  if (!grant.ok) throw new Error(`grant failed (${grant.status})`);

  JWT = (await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  if (!JWT) throw new Error("sign-in failed");

  const probes = [
    { q: "What is retatrutide?", expectPubMed: true, expectSafetyHeavy: false },
    { q: "What is the mechanism of metformin?", expectPubMed: false, expectSafetyHeavy: false },
    { q: "Is lisinopril safe to take with spironolactone?", expectPubMed: false, expectSafetyHeavy: true },
  ];

  let issues = 0;
  console.log("PROD SMOKE — deployed /ask, LIVE_SOURCES=on\n");
  for (const p of probes) {
    const r = await ask(p.q);
    const prov = providerCounts(r);
    const provStr = Object.entries(prov).map(([k, v]) => `${k}:${v}`).join(" ") || "(none)";
    const violations = detectViolations(fullText(r));
    const hasPubMed = (prov.pubmed ?? 0) > 0 || (prov.europepmc ?? 0) > 0;
    const hasSafety = (r.answer_sections.safety_notes?.length ?? 0) > 0;

    console.log(`Q: ${p.q}`);
    console.log(`   intent=${r.intent} grade=${r.evidence_grade} template=${r.template ?? "none"}`);
    console.log(`   sources: ${provStr}   (${r.citations.length} total)`);
    console.log(`   format: ${sectionShape(r)}`);
    console.log(`   summary: ${r.plain_english_summary.slice(0, 140)}`);

    if (violations.length) { issues++; console.log(`   ✗ SAFETY: detectViolations found ${JSON.stringify(violations)}`); }
    if (p.expectPubMed && !hasPubMed) { issues++; console.log(`   ✗ EXPECTED PubMed/EuropePMC evidence, got none`); }
    if (p.expectPubMed && hasPubMed) console.log(`   ✓ live PubMed/EuropePMC evidence present`);
    if (p.expectSafetyHeavy && !hasSafety) { issues++; console.log(`   ✗ EXPECTED safety_notes on an interaction answer, got none`); }
    if (p.expectSafetyHeavy && hasSafety) console.log(`   ✓ safety_notes present on the interaction answer`);
    console.log("");
  }

  console.log(issues === 0 ? "✅ PROD SMOKE PASS" : `✗ ${issues} issue(s)`);
  if (issues > 0) Deno.exit(1);
}

try { await main(); } finally { await teardown(); }
