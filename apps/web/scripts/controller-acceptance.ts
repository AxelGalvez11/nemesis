/**
 * Does the teaching controller that now ships as the default ACTUALLY decide, in production?
 *
 * 🔴🔴 THE FOURTH WORD. `docs/canvas-v1-acceptance.md`'s envelope separates implemented / merged /
 * deployed / **integration-proven**, and only the fourth counts. #648 made `llm_teacher` the default
 * arm; the served bundle carries it (verified by fetching the chunk). Neither of those facts says a
 * real model, reached through the real metered door, with a real learner's JWT, over the owner's real
 * parsed material, returns a move this system can act on.
 *
 * This is not a unit test with a scripted transport. It signs in a throwaway learner, reads real
 * knowledge out of a real production parse, and calls `controllerFor` — which is the exact function
 * `use-policy-runtime.ts` calls on every turn.
 *
 * Usage, from apps/web:
 *
 *     NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
 *       ../../node_modules/.bin/tsx scripts/controller-acceptance.ts
 */
import { supabase } from "@/lib/supabase";
import { readDocumentModel } from "@nemesis/shared";
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { sourceContextFromModel } from "@/lib/learn/canvas-sources";
import { objectivesForKnowledge } from "@/lib/learn/learning-objective";
import { supportedObjectives } from "@/lib/learn/policy-runtime";
import { controllerFor } from "@/lib/learn/strategy-registry";
import { DEFAULT_STRATEGY } from "@/lib/learn/teaching-strategy";
import type { ResolvedObjective } from "@/lib/learn/canvas-knowledge";
import type { StoredObjective } from "@/lib/learn/learner-store";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

/** The owner's real diabetes lecture — a parsed production document, not a fixture. */
const SOURCE = "d00a28d9-633f-460d-8526-890162b1e9bb";

let failures = 0;
function check(id: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}
function note(id: string, detail: string): void {
  console.log(`NOTE  ${id} — ${detail}`);
}

async function main(): Promise<void> {
  const stamp = Math.random().toString(16).slice(2, 10);
  const email = `controller-${stamp}@nemesis.test`;
  const password = `Ctrl-${stamp}-${stamp}`;

  const created = (await fetch(`${SB}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers: svc,
    method: "POST",
  }).then((r) => r.json())) as { id?: string };
  if (!created.id) throw new Error("could not seed a learner");

  const token = (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: ANON, "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json())) as { access_token?: string; refresh_token?: string };
  if (!token.access_token || !token.refresh_token) throw new Error("could not sign the learner in");
  const { error } = await supabase.auth.setSession({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
  });
  if (error) throw new Error(`setSession failed: ${error.message}`);
  console.log(`learner      ${created.id}  (${email})`);

  // ── real production material ────────────────────────────────────────────────
  const src = (await fetch(
    `${SB}/rest/v1/library_sources?id=eq.${SOURCE}&select=parsed_document_id,file_name`,
    { headers: svc },
  ).then((r) => r.json())) as { parsed_document_id: string; file_name: string }[];
  const row = src[0];
  if (!row?.parsed_document_id) throw new Error("that source has no parse");
  const parsed = (await fetch(
    `${SB}/rest/v1/parsed_documents?id=eq.${row.parsed_document_id}&select=structure,doc_kind,parser_version`,
    { headers: svc },
  ).then((r) => r.json())) as { structure: unknown; doc_kind: string; parser_version: string }[];
  const doc = parsed[0];
  if (!doc) throw new Error("parse row missing");
  console.log(`material     ${row.file_name}`);
  console.log(`parser       ${doc.parser_version}`);

  const model = readDocumentModel(doc.structure);
  if (!model) throw new Error("the parse did not survive readDocumentModel");
  const context = sourceContextFromModel({
    model,
    sourceId: SOURCE,
    sourceKind: (doc.doc_kind ?? "pdf") as never,
  });
  const knowledge = extractKnowledgeObjects(context).objects;
  const resolved: ResolvedObjective[] = knowledge.flatMap((k) =>
    objectivesForKnowledge(k).map((o) => ({
      knowledge: k,
      objective: { ...o, rowId: `probe-${o.identityKey}` } as StoredObjective,
    })),
  );
  const staged = supportedObjectives(resolved);
  check("MATERIAL", staged.length > 0, `${knowledge.length} knowledge objects → ${staged.length} stageable objectives`);

  // ── the decision the runtime makes on every turn ────────────────────────────
  check("DEFAULT-ARM", DEFAULT_STRATEGY === "llm_teacher", `DEFAULT_STRATEGY = ${DEFAULT_STRATEGY}`);

  const started = Date.now();
  const outcome = await controllerFor(DEFAULT_STRATEGY, {
    attention: { activeMs: 4 * 60_000, availableMs: null },
    evidence: [],
    now: new Date(),
    objectives: staged,
    uid: created.id,
  });
  const tookMs = Date.now() - started;

  check(
    "REACHED-A-MODEL",
    outcome.strategy === "llm_teacher",
    outcome.strategy === "llm_teacher"
      ? `the model arm decided in ${tookMs}ms`
      : `🔴 FELL BACK to ${outcome.strategy} after "${outcome.refusal ?? "?"}" — the model was not reached`,
  );
  check("A-DECISION-EXISTS", Boolean(outcome.decision), outcome.decision ? "" : `refusal=${outcome.refusal}`);
  if (outcome.decision) {
    const { action, objective, rationale } = outcome.decision;
    check(
      "CHOSE-FROM-THE-CANVAS",
      staged.some((entry) => entry.objective.identityKey === objective.identityKey),
      `objective=${objective.identityKey}`,
    );
    console.log(`\n  move       ${action.type}${action.type === "retrieve" ? ` @ ${action.rung}` : ""}`);
    console.log(`  about      ${objective.label}`);
    console.log(`  because    ${"because" in action ? action.because : ""}`);
    if (rationale.by === "llm_teacher") console.log(`  candidates ${rationale.candidates}`);
  }

  // ── the second turn: it must not repeat itself ──────────────────────────────
  const second = await controllerFor(DEFAULT_STRATEGY, {
    actedOn: outcome.decision ? [outcome.decision.objective.identityKey] : [],
    attention: { activeMs: 5 * 60_000, availableMs: null },
    evidence: [],
    now: new Date(),
    objectives: staged,
    recentActs: outcome.decision
      ? [{ action: outcome.decision.action.type, atMs: Date.now(), objectiveIdentityKey: outcome.decision.objective.identityKey }]
      : [],
    uid: created.id,
  });
  check(
    "DOES-NOT-REPEAT",
    Boolean(second.decision) &&
      second.decision!.objective.identityKey !== outcome.decision?.objective.identityKey,
    second.decision
      ? `turn 2 → ${second.decision.objective.identityKey} (turn 1 was ${outcome.decision?.objective.identityKey})`
      : `turn 2 produced no decision: ${second.refusal}`,
  );

  if (second.movedOn?.length) {
    note("MOVED-ON", `the controller passed over ${second.movedOn.length}: ${second.movedOn.map((m) => `${m.action}(${m.objectiveIdentityKey.slice(0, 18)})`).join(", ")}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error("controller acceptance failed:", error);
  process.exit(1);
});
