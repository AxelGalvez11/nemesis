// Where the learner's durable knowledge, capabilities and evidence are read and written.
//
// 🔴 THE WRITE ORDER IS FORCED BY THE SCHEMA AND IS STATED HERE SO IT IS NOT DISCOVERED AS A FAILED
// INSERT: knowledge object, then its objectives, then evidence. `learner_evidence.objective_id` is
// a real foreign key, so evidence for an objective that has never been stored simply cannot exist.
//
// 🔴 AND STATE IS NEVER WRITTEN. There is no learner-state table and nothing here updates one.
// A caller that wants to know where a learner stands reads the evidence and projects it
// (`projectLearnerState`), which is what makes "the log is the truth" true rather than aspirational.
// If you find yourself adding `updateLearnerState`, the projection has stopped being the projection.

import { supabase } from "@/lib/supabase";

import type { LearnerEvidence, EvidenceVerdict } from "./learner-evidence";
import type { KnowledgeObject } from "./knowledge-types";
import { objectivesForKnowledge, type LearningObjective, type ObjectiveCapability } from "./learning-objective";
import { KNOWLEDGE_IDENTITY_VERSION } from "./knowledge-identity";

/** A table that does not exist yet is a deployment state, not a bug worth shouting about. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || (error?.message ?? "").includes("does not exist");
}

export interface StoredObjective extends LearningObjective {
  /** The database row id. Evidence points at this, not at the identity key. */
  rowId: string;
}

/**
 * Store a knowledge object and every objective it supports, and return the objectives with their
 * row ids.
 *
 * 🔴 IDEMPOTENT BY IDENTITY, NOT BY "HAVE I SEEN THIS BEFORE". Both upserts conflict on
 * `(user_id, identity_key)` and do nothing, so meeting the same fact in a second document converges
 * on the existing rows rather than inserting a rival copy. That convergence is the entire reason
 * identity is content-derived; without the constraint it would be a property nothing enforced.
 */
export async function saveKnowledge(
  userId: string | null,
  knowledge: KnowledgeObject,
): Promise<StoredObjective[]> {
  if (!userId) return [];
  const identityKey = knowledge.identityKey;
  if (!identityKey) return [];

  const { error: knowledgeError } = await supabase.from("knowledge_objects").upsert(
    {
      extraction_version: knowledge.extractionVersion ?? null,
      identity_key: identityKey,
      identity_version: KNOWLEDGE_IDENTITY_VERSION,
      payload: { anchors: knowledge.sourceAnchors ?? [], pair: knowledge.pair ?? null },
      relation_kind: knowledge.relationKind ?? null,
      statement: knowledge.statement,
      type: knowledge.type,
      user_id: userId,
    },
    { ignoreDuplicates: true, onConflict: "user_id,identity_key" },
  );
  if (knowledgeError && !isMissingTable(knowledgeError)) {
    console.warn("[learn] knowledge upsert failed", knowledgeError.message);
    return [];
  }

  // Read back rather than trusting the upsert's return: with `ignoreDuplicates` a row that already
  // existed returns nothing, and that is the common case once a learner meets a fact twice.
  // 🔴 SCOPED TO THE USER EXPLICITLY, NOT LEFT TO RLS. The uniqueness constraint is on
  // `(user_id, identity_key)`, so identity alone is not unique across the table — two learners
  // meeting the same fact hold two rows. RLS would very likely hide the other one, but
  // `maybeSingle()` ERRORS on two rows rather than picking one, and this read is the step the
  // whole cross-canvas proof rests on: get it wrong and evidence attaches to nothing.
  const { data: knowledgeRow, error: readError } = await supabase
    .from("knowledge_objects")
    .select("id")
    .eq("user_id", userId)
    .eq("identity_key", identityKey)
    .maybeSingle();
  if (readError || !knowledgeRow) {
    if (readError && !isMissingTable(readError)) console.warn("[learn] knowledge read-back failed", readError.message);
    return [];
  }
  const knowledgeRowId = (knowledgeRow as { id: string }).id;

  const objectives = objectivesForKnowledge(knowledge);
  if (objectives.length === 0) return [];

  const { error: objectiveError } = await supabase.from("learning_objectives").upsert(
    objectives.map((objective) => ({
      capability: objective.capability,
      identity_key: objective.identityKey,
      identity_version: objective.identityVersion,
      knowledge_object_id: knowledgeRowId,
      label: objective.label,
      parameters: objective.parameters,
      user_id: userId,
    })),
    { ignoreDuplicates: true, onConflict: "user_id,identity_key" },
  );
  if (objectiveError && !isMissingTable(objectiveError)) {
    console.warn("[learn] objective upsert failed", objectiveError.message);
    return [];
  }

  const { data: rows, error: rowsError } = await supabase
    .from("learning_objectives")
    .select("id,identity_key")
    .eq("user_id", userId)
    .in("identity_key", objectives.map((o) => o.identityKey));
  if (rowsError || !rows) {
    if (rowsError && !isMissingTable(rowsError)) console.warn("[learn] objective read-back failed", rowsError.message);
    return [];
  }
  const rowIdFor = new Map((rows as { id: string; identity_key: string }[]).map((r) => [r.identity_key, r.id]));
  return objectives
    .filter((objective) => rowIdFor.has(objective.identityKey))
    .map((objective) => ({ ...objective, rowId: rowIdFor.get(objective.identityKey)! }));
}

export interface EvidenceToRecord {
  objectiveRowId: string;
  occurredAt: string;
  demonstrationObtained: boolean;
  verdict: EvidenceVerdict | null;
  confidence?: number | null;
  misconceptions?: readonly string[];
  canvasId?: string | null;
  evaluatorVersion?: string | null;
  /** 🔴 THE IDEMPOTENCY KEY. The id of the response this is evidence for. */
  responseId?: string | null;
  responseText?: string | null;
  taskId?: string | null;
  // ── Observations about the attempt ────────────────────────────────────────
  //
  // 🔴 WHAT WAS MEASURED, NEVER WHAT IT MEANS. There is no `fluency`, no `automaticity` and no
  // banded latency here, and there must never be: an interpretation written into the log cannot be
  // revised afterwards, because rows recorded under the old rule mean something different from rows
  // recorded under the new one and nothing can tell them apart.
  //
  // 🔴 OPTIONAL BECAUSE ABSENT MEANS NOT OBSERVED — never defaulted, never backfilled.
  /** Which cognitive operation was demanded. */
  operation?: ObjectiveCapability | null;
  /** Milliseconds from the prompt appearing to submission, as measured. Raw. */
  responseLatencyMs?: number | null;
  /** How much assistance the runtime offered during the attempt. 0 is the prompt alone. */
  scaffoldingLevel?: number | null;
}

/**
 * Record one demonstration.
 *
 * 🔴 `ignoreDuplicates` IS THE WHOLE POINT AND NOT A CONVENIENCE. One submitted answer can reach
 * the server several times — a network retry, an effect replaying, a double click, a restored tab.
 * Each arrival would otherwise be an independent demonstration, and `demonstrationCount` is exactly
 * what the policy reads to decide whether a capability has been shown repeatedly. A doubled row
 * credits the learner with practice they never did.
 *
 * So a retry is a NO-OP rather than an error: it must neither fail loudly nor succeed twice.
 */
/**
 * Exactly the row one demonstration becomes.
 *
 * 🔴 PURE, AND SEPARATE FROM THE WRITE, SO THE READ CAN BE CHECKED AGAINST IT. While this lived
 * inline inside the upsert, the only way to know which columns existed was to read the function and
 * remember — and that is precisely how `response_id`, `response_text` and `task_id` came to be
 * written on every row and selected by nothing. A test now compares this shape against the select
 * list, so a field added here and forgotten there fails immediately instead of years later.
 */
export function evidenceRow(userId: string, evidence: EvidenceToRecord): Record<string, unknown> {
  return {
    canvas_id: evidence.canvasId ?? null,
    confidence: evidence.confidence ?? null,
    demonstration_obtained: evidence.demonstrationObtained,
    evaluator_version: evidence.evaluatorVersion ?? null,
    misconceptions: evidence.misconceptions ?? [],
    objective_id: evidence.objectiveRowId,
    occurred_at: evidence.occurredAt,
    // 🔴 `?? null` IS "NOT OBSERVED", AND THAT IS WHY IT IS NOT `?? 0`. A zero latency asserts an
    // instantaneous answer; a zero scaffolding level asserts an unaided attempt. Both are real
    // claims, and writing either when nothing measured it puts a fact into the log that never
    // happened — which no later migration can distinguish from one that did.
    operation: evidence.operation ?? null,
    response_id: evidence.responseId ?? null,
    response_latency_ms: evidence.responseLatencyMs ?? null,
    response_text: evidence.responseText ?? null,
    scaffolding_level: evidence.scaffoldingLevel ?? null,
    task_id: evidence.taskId ?? null,
    user_id: userId,
    verdict: evidence.verdict,
  };
}

/**
 * Columns written by `evidenceRow` that the reader deliberately does not select.
 *
 * 🔴 EVERY ENTRY NEEDS A REASON, BECAUSE THIS IS THE ONLY WAY A FIELD MAY LEGITIMATELY NOT COME
 * BACK. An unexplained name here is indistinguishable from the defect this guards against.
 */
export const EVIDENCE_WRITE_ONLY_COLUMNS: readonly string[] = [
  // The row's owner. Reading it back would tell a caller only what it already had to know to ask.
  "user_id",
  // Read as `objective_id` and immediately resolved to the objective's identity key, which is what
  // every consumer actually uses. The raw row id never leaves this file.
  "objective_id",
];

/**
 * What `loadEvidence` selects. 🔴 DERIVED FROM THE WRITE SHAPE, NEVER HAND-MAINTAINED — a list
 * typed out by hand is a list that drifts, which is the whole history of this boundary.
 *
 * 🔴 THE PROBE IS A REAL `EvidenceToRecord`, NOT A CAST. `{} as EvidenceToRecord` would compile
 * and would keep compiling after a required field was renamed, which is precisely how a cast has
 * already killed one field in this codebase. A genuine value makes the type checker an ally here.
 */
const COLUMN_PROBE: EvidenceToRecord = {
  demonstrationObtained: false,
  objectiveRowId: "",
  occurredAt: "",
  verdict: null,
};

export const EVIDENCE_COLUMNS: readonly string[] = [
  // Server-generated, so it is not in the write shape, but every consumer needs it — it is the
  // row's own identity and the fallback performance key for rows written before response ids.
  "id",
  // Not selected for its own sake: resolved to the objective's identity key and then dropped.
  "objective_id",
  ...Object.keys(evidenceRow("", COLUMN_PROBE)).filter(
    (column) => !EVIDENCE_WRITE_ONLY_COLUMNS.includes(column),
  ),
];

/**
 * The literal handed to PostgREST.
 *
 * 🔴 IT HAS TO BE A LITERAL, AND THAT IS THE ONLY REASON IT IS WRITTEN OUT TWICE. supabase-js
 * derives the row's TYPE from this string, so passing a computed `string` erases the result type
 * to `GenericStringError[]` and every field access below becomes an unchecked cast — trading a
 * drift bug for a much quieter one.
 *
 * 🔴 SO THE DUPLICATION IS GUARDED, NOT TOLERATED. A test asserts this matches `EVIDENCE_COLUMNS`
 * exactly, which makes the pair non-tautological in both directions: the derived list cannot drift
 * from the write shape, and this literal cannot drift from the derived list.
 */
export const EVIDENCE_SELECT =
  "id,objective_id,canvas_id,confidence,demonstration_obtained,evaluator_version,misconceptions,occurred_at,operation,response_id,response_latency_ms,response_text,scaffolding_level,task_id,verdict";

export async function recordEvidence(userId: string | null, evidence: EvidenceToRecord): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase.from("learner_evidence").upsert(
    evidenceRow(userId, evidence),
    { ignoreDuplicates: true, onConflict: "user_id,objective_id,response_id" },
  );
  if (error && !isMissingTable(error)) {
    console.warn("[learn] evidence insert failed", error.message);
    return false;
  }
  return !error;
}

/**
 * Every piece of evidence this learner holds for these objectives, across ALL canvases.
 *
 * 🔴 NEVER FILTERED BY CANVAS. That filter is the difference between remembering a learner and
 * remembering a session, and it is a single `.eq()` away at every call site — which is why the
 * function does not accept a canvas id at all.
 */
export async function loadEvidence(
  userId: string | null,
  objectives: readonly StoredObjective[],
): Promise<LearnerEvidence[]> {
  if (!userId || objectives.length === 0) return [];
  const keyFor = new Map(objectives.map((o) => [o.rowId, o.identityKey]));
  const { data, error } = await supabase
    .from("learner_evidence")
    // 🔴 THE OBSERVATIONS ARE READ BACK, NOT ONLY WRITTEN. A field that is stored and never
    // selected is this codebase's most-repeated defect — six structural fields have died at a
    // boundary exactly this way, each one passing every test on both sides. Nothing INTERPRETS
    // these yet; they are carried so the projection can, and so the round trip is provable now
    // rather than discovered to be broken when something finally needs them.
    // 🔴 AND IT HAPPENED ANYWAY, IN THE CODE THAT WARNS ABOUT IT. `response_id`, `response_text`
    // and `task_id` are written by `recordEvidence` on every row — `response_id` is the
    // idempotency key the upsert conflicts on — and all three were missing from this list, so
    // they were stored on every row and visible to nothing. Adding a column here is not enough on
    // its own: `EVIDENCE_COLUMNS` below is asserted against the write path, so the next field can
    // only die here if someone deletes that test.
    .select(EVIDENCE_SELECT)
    .in("objective_id", [...keyFor.keys()])
    // Ends in a unique column so a paged read cannot silently skip or repeat a row.
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1000);
  if (error || !data) {
    if (error && !isMissingTable(error)) console.warn("[learn] evidence read failed", error.message);
    return [];
  }
  return (data as Record<string, unknown>[])
    .filter((row) => keyFor.has(row.objective_id as string))
    .map((row) => evidenceFromRow(row, keyFor.get(row.objective_id as string)!));
}

/**
 * One stored row, as the rest of the system sees it.
 *
 * 🔴 EXTRACTED SO THE ROUND TRIP IS PROVABLE WITHOUT A DATABASE. While this lived inline in the
 * query, the only way to test that a written field came back was to reach production — so nothing
 * tested it, and three fields did not come back for as long as they existed.
 */
export function evidenceFromRow(
  row: Record<string, unknown>,
  objectiveIdentityKey: string,
): LearnerEvidence {
  return {
    canvasId: (row.canvas_id as string | null) ?? null,
    demonstrationObtained: row.demonstration_obtained as boolean,
    evaluatorVersion: (row.evaluator_version as string | null) ?? null,
    id: row.id as string,
    misconceptions: Array.isArray(row.misconceptions) ? (row.misconceptions as string[]) : [],
    objectiveIdentityKey,
    occurredAt: new Date(row.occurred_at as string).toISOString(),
    verdict: (row.verdict as EvidenceVerdict | null) ?? null,
    ...(row.confidence == null ? {} : { confidence: row.confidence as number }),
    // 🔴 OMITTED WHEN NULL RATHER THAN COERCED. A row written before these existed must read back
    // as "not observed", and `?? 0` would turn every one of them into a claim that the learner
    // answered instantly with no help. Spread-when-present keeps absent absent.
    ...(row.operation == null ? {} : { operation: row.operation as ObjectiveCapability }),
    ...(row.response_latency_ms == null ? {} : { responseLatencyMs: row.response_latency_ms as number }),
    ...(row.scaffolding_level == null ? {} : { scaffoldingLevel: row.scaffolding_level as number }),
    ...(row.response_id == null ? {} : { responseId: row.response_id as string }),
    ...(row.response_text == null ? {} : { responseText: row.response_text as string }),
    ...(row.task_id == null ? {} : { taskId: row.task_id as string }),
  };
}
