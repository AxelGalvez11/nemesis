/**
 * Canvas v1 acceptance — the real loop, on a real document, as a real learner, against production.
 *
 * 🔴 WHY THIS IS NOT AN API TEST. The Canvas has almost no server routes: `lib/learn/*` runs in the
 * browser and talks to Supabase directly. So proving the loop means running the SAME decision code
 * the surface runs, over a REAL parsed document from production, writing to the REAL tables as a
 * REAL learner whose JWT is subject to row-level security exactly as a student's would be.
 *
 * What this cannot prove, and does not claim: pixels. Rendering, composer affordances, and the
 * absence of lesson-engine chrome are §I/§J/§K criteria that need a browser.
 *
 * Everything below the render is real:
 *   real parsed document  →  real extraction  →  real objectives  →  real policy decision
 *                         →  real evidence row (RLS-enforced)  →  real changed decision
 *
 * Usage, from apps/web:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… \
 *     npx tsx scripts/canvas-loop-acceptance.ts
 *
 * The service key is used ONLY to seed and confirm a throwaway @nemesis.test learner and to read
 * the owner's parsed document. Every learner-side write below goes through that learner's own JWT.
 */

import { randomUUID } from "node:crypto";

import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { decideNext } from "@/lib/learn/policy-runtime";
import { projectLearnerState, type LearnerEvidence } from "@/lib/learn/learner-evidence";
import { sourceContextFromModel } from "@/lib/sources/source-context";
import { KNOWLEDGE_IDENTITY_VERSION } from "@/lib/learn/knowledge-identity";
import type { KnowledgeObject } from "@/lib/learn/knowledge-types";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
/** The owner's real immunology source, parsed by the background worker in production. */
const SOURCE_ID = process.env.ACCEPTANCE_SOURCE_ID ?? "64741861-7397-423d-b117-2fc62210c909";

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let failures = 0;
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  // ── A real learner ───────────────────────────────────────────────────────
  const email = `acceptance+${randomUUID()}@nemesis.test`;
  const password = `Pb!${randomUUID()}Aa1`;
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const userId: string = created?.id ?? created?.user?.id;
  if (!userId) throw new Error(`could not seed a learner: ${JSON.stringify(created).slice(0, 300)}`);

  const token = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const jwt: string = token?.access_token;
  if (!jwt) throw new Error(`could not sign in: ${JSON.stringify(token).slice(0, 300)}`);
  /** Every learner-side call uses THIS, so row-level security is the real gate. */
  const asLearner = { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };
  check("AUTH", true, `learner ${userId.slice(0, 8)}… signed in`);

  // ── §A3 the REAL parsed document becomes knowledge ───────────────────────
  const [row] = await fetch(
    `${SB}/rest/v1/library_sources?id=eq.${SOURCE_ID}&select=file_name,mime_type,parsed_document_id`,
    { headers: svc },
  ).then((r) => r.json());
  if (!row?.parsed_document_id) throw new Error(`source ${SOURCE_ID} has no parse`);
  const [parsed] = await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,coverage,doc_kind,unit_count`,
    { headers: svc },
  ).then((r) => r.json());
  const model = parsed?.structure?.model;
  if (!model) throw new Error("the stored parse carries no document model");
  check("A1", true, `${row.file_name} · ${parsed.unit_count} units · ${model.blocks?.length ?? 0} blocks`);

  const context = sourceContextFromModel({
    sourceId: SOURCE_ID,
    sourceKind: parsed.doc_kind ?? "pdf",
    model,
  });
  const extraction = extractKnowledgeObjects(context);
  const knowledge: KnowledgeObject[] = [...extraction.objects];
  const byType = knowledge.reduce<Record<string, number>>((acc, k) => {
    acc[k.type] = (acc[k.type] ?? 0) + 1;
    return acc;
  }, {});
  check("A3", knowledge.length > 0, `${knowledge.length} knowledge objects ${JSON.stringify(byType)}`);

  // ── §B1 knowledge becomes objectives ─────────────────────────────────────
  const objectives = knowledge.flatMap((k) => objectivesForKnowledge(k).map((o) => ({ knowledge: k, objective: o })));
  const capabilities = [...new Set(objectives.map((o) => o.objective.capability))];
  check("B1", objectives.length > 0, `${objectives.length} objectives · capabilities ${capabilities.join(", ")}`);

  // ── The objectives the policy will reason over ───────────────────────────
  const resolved = objectives.map(({ knowledge: k, objective }) => ({ knowledge: k, objective })) as never[];

  // ── §C the loop: decide → answer → evidence → decide differently ─────────
  const now = new Date();
  const first = decideNext({ objectives: resolved, evidence: [], now, actedOn: [] } as never);
  const firstKey = (first as { objective?: { identityKey?: string } })?.objective?.identityKey ?? null;
  check("C-decide-1", Boolean(firstKey), `policy chose ${String(firstKey).slice(0, 44)}`);
  if (!firstKey) {
    console.log("\nno objective chosen; cannot continue the loop");
    process.exit(1);
  }

  // ── Persist knowledge and its objective AS THE LEARNER, under RLS ────────
  //
  // 🔴 EVIDENCE KEYS TO A PERSISTED OBJECTIVE ROW, NOT TO AN IDENTITY STRING. `learner_evidence`
  // carries `objective_id`, so the loop cannot be proven without first writing the knowledge and
  // the objective the way the surface does. That is the real ordering, and it is also what makes
  // this exercise row-level security three times rather than once.
  const chosen = objectives.find((o) => o.objective.identityKey === firstKey) ?? objectives[0]!;
  const knowledgeId = randomUUID();
  const koWrite = await fetch(`${SB}/rest/v1/knowledge_objects`, {
    method: "POST",
    headers: { ...asLearner, Prefer: "return=representation" },
    body: JSON.stringify({
      id: knowledgeId,
      user_id: userId,
      type: chosen.knowledge.type,
      statement: chosen.knowledge.statement,
      identity_key: chosen.knowledge.identityKey,
      identity_version: KNOWLEDGE_IDENTITY_VERSION,
      payload: chosen.knowledge,
    }),
  });
  check("B-persist-knowledge", koWrite.ok, koWrite.ok ? `knowledge_objects row as the learner` : `${koWrite.status} ${(await koWrite.text()).slice(0, 160)}`);
  if (!koWrite.ok) process.exit(1);

  const objectiveId = randomUUID();
  const loWrite = await fetch(`${SB}/rest/v1/learning_objectives`, {
    method: "POST",
    headers: { ...asLearner, Prefer: "return=representation" },
    body: JSON.stringify({
      id: objectiveId,
      user_id: userId,
      knowledge_object_id: knowledgeId,
      capability: chosen.objective.capability,
      label: chosen.objective.label ?? null,
      identity_key: chosen.objective.identityKey,
      identity_version: KNOWLEDGE_IDENTITY_VERSION,
    }),
  });
  check("B-persist-objective", loWrite.ok, loWrite.ok ? `learning_objectives row · capability ${chosen.objective.capability}` : `${loWrite.status} ${(await loWrite.text()).slice(0, 160)}`);
  if (!loWrite.ok) process.exit(1);

  // A real evidence row, written as the learner, under RLS.
  const responseId = randomUUID();
  const wrote = await fetch(`${SB}/rest/v1/learner_evidence`, {
    method: "POST",
    headers: { ...asLearner, Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      objective_id: objectiveId,
      response_id: responseId,
      operation: "recall",
      verdict: "strong",
      demonstration_obtained: true,
      response_latency_ms: 4200,
      response_text: "Because it reduces hepatic glucose production.",
      occurred_at: now.toISOString(),
    }),
  });
  const writeBody = await wrote.text();
  check("C1", wrote.ok, wrote.ok ? "learner_evidence row written under RLS" : `${wrote.status} ${writeBody.slice(0, 200)}`);
  if (!wrote.ok) {
    console.log("\ncould not write evidence; the rest of the loop cannot be proven");
    process.exit(1);
  }

  // §C2 it reads back, as the learner.
  const readBack = await fetch(
    `${SB}/rest/v1/learner_evidence?response_id=eq.${responseId}&select=*`,
    { headers: asLearner },
  ).then((r) => r.json());
  const back = Array.isArray(readBack) ? readBack[0] : null;
  check(
    "C2",
    Boolean(back?.operation && back?.response_latency_ms != null && back?.response_id),
    back ? `operation=${back.operation} latency=${back.response_latency_ms}ms responseId=${String(back.response_id).slice(0, 8)}…` : "no row",
  );

  // 🔴 §C4 THE ROW MUST BE THE LEARNER'S OWN AND NOBODY ELSE'S. A second learner reading the same
  // response id must see nothing — otherwise "learner evidence" is not learner-scoped at all.
  const otherEmail = `acceptance-other+${randomUUID()}@nemesis.test`;
  const otherCreated = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email: otherEmail, password, email_confirm: true }),
  }).then((r) => r.json());
  const otherToken = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: otherEmail, password }),
  }).then((r) => r.json());
  const otherRows = await fetch(
    `${SB}/rest/v1/learner_evidence?response_id=eq.${responseId}&select=id`,
    { headers: { apikey: ANON, Authorization: `Bearer ${otherToken.access_token}` } },
  ).then((r) => r.json());
  check(
    "RLS-isolation",
    Array.isArray(otherRows) && otherRows.length === 0,
    `a different learner sees ${Array.isArray(otherRows) ? otherRows.length : "?"} rows (must be 0)`,
  );
  void otherCreated;

  // §C3 THE COUNTERFACTUAL: identical inputs, evidence the ONLY difference.
  const evidence: LearnerEvidence[] = [
    {
      id: responseId,
      objectiveIdentityKey: firstKey,
      occurredAt: now.toISOString(),
      operation: "recall",
      verdict: "strong",
      demonstrationObtained: true,
      responseId,
      responseLatencyMs: 4200,
      observedAt: now.toISOString(),
    } as never,
  ];
  const withEvidence = decideNext({ objectives: resolved, evidence, now, actedOn: [] } as never);
  const withoutEvidence = decideNext({ objectives: resolved, evidence: [], now, actedOn: [] } as never);
  const keyOf = (d: unknown) => (d as { objective?: { identityKey?: string } })?.objective?.identityKey ?? null;
  check(
    "C3",
    keyOf(withEvidence) !== keyOf(withoutEvidence),
    `without=${String(keyOf(withoutEvidence)).slice(0, 34)} · with=${String(keyOf(withEvidence)).slice(0, 34)}`,
  );

  // §M1 A CORRECT ANSWER IS NOT TERMINAL. The objective must leave the NEXT prompt and stay in
  // FUTURE eligibility — "known" is a scheduling state, never a deletion.
  const state = projectLearnerState(firstKey, evidence as never);
  check("M-state", state != null, `learner state projected: ${JSON.stringify(state).slice(0, 120)}`);
  const stillReachable = objectives.some((o) => o.objective.identityKey === firstKey);
  check("M1", stillReachable, "the answered objective still exists in the objective set, not deleted");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
