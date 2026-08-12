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
 * The fields `knowledge_objects` keeps in columns of their own. Everything else goes to `payload`.
 *
 * 🔴 THIS EXISTS BECAUSE PERSISTENCE USED TO ENUMERATE THE PAYLOAD BY HAND — `{ anchors, pair }` —
 * so every field of every FUTURE knowledge type was deleted on the way to the database before it was
 * ever written. Nothing could catch it, because nothing read a knowledge object back at all: the
 * payload was write-only. A causal relation would have stored as an empty object and the loss would
 * have surfaced weeks later as "the mechanism extractor doesn't work".
 *
 * 🔴 SO THE RULE IS SUBTRACTIVE, NOT ADDITIVE. Persistence names the fields it handles specially
 * and keeps everything else without knowing what any of it is. Adding a knowledge type must never
 * require editing this boundary again.
 */
const COLUMN_FIELDS: readonly string[] = [
  "type",
  "statement",
  "relationKind",
  "identityKey",
  "extractionVersion",
];

/**
 * Everything about an object that is not already a column, ready to store.
 *
 * 🔴 `sourceAnchors` IS WRITTEN AS `anchors`, WHICH IS NOT A STYLE CHOICE. Rows already in
 * production use that name, and renaming it here would make every existing object read back with no
 * provenance — a silent loss of precisely what anchors exist to prevent.
 */
export function knowledgePayload(knowledge: KnowledgeObject): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(knowledge)) {
    if (COLUMN_FIELDS.includes(field) || field === "sourceAnchors") continue;
    if (value !== undefined) rest[field] = value;
  }
  return { anchors: knowledge.sourceAnchors ?? [], ...rest };
}

/**
 * A stored row, back as the object it was.
 *
 * 🔴 THE MISSING HALF OF THE BOUNDARY. Until this existed, knowledge was written and never read, so
 * "does the payload survive?" was a question nothing in the system could answer — the exact shape of
 * the six structural fields this codebase has already lost at boundaries. The round-trip test that
 * pins causal payloads is only possible because this function exists.
 */
export function knowledgeFromRow(row: {
  type: string;
  statement: string;
  relation_kind?: string | null;
  identity_key: string;
  extraction_version?: string | null;
  payload?: Record<string, unknown> | null;
}): KnowledgeObject {
  const { anchors, ...rest } = (row.payload ?? {}) as Record<string, unknown>;
  return {
    ...(rest as Partial<KnowledgeObject>),
    id: typeof rest.id === "string" ? rest.id : row.identity_key,
    identityKey: row.identity_key,
    sourceAnchors: (anchors as KnowledgeObject["sourceAnchors"]) ?? [],
    statement: row.statement,
    type: row.type as KnowledgeObject["type"],
    ...(row.relation_kind ? { relationKind: row.relation_kind } : {}),
    ...(row.extraction_version ? { extractionVersion: row.extraction_version } : {}),
  };
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
      // 🔴 DERIVED, NOT ENUMERATED. See `knowledgePayload` — listing fields here is what silently
      // deleted every future knowledge type's payload.
      payload: knowledgePayload(knowledge),
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
export async function recordEvidence(userId: string | null, evidence: EvidenceToRecord): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase.from("learner_evidence").upsert(
    {
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
    },
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
    .select(
      "id,objective_id,occurred_at,demonstration_obtained,verdict,confidence,misconceptions,canvas_id,evaluator_version,operation,response_latency_ms,scaffolding_level",
    )
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
    .map((row) => ({
      canvasId: (row.canvas_id as string | null) ?? null,
      demonstrationObtained: row.demonstration_obtained as boolean,
      evaluatorVersion: (row.evaluator_version as string | null) ?? null,
      id: row.id as string,
      misconceptions: Array.isArray(row.misconceptions) ? (row.misconceptions as string[]) : [],
      objectiveIdentityKey: keyFor.get(row.objective_id as string)!,
      occurredAt: new Date(row.occurred_at as string).toISOString(),
      verdict: (row.verdict as EvidenceVerdict | null) ?? null,
      ...(row.confidence == null ? {} : { confidence: row.confidence as number }),
      // 🔴 OMITTED WHEN NULL RATHER THAN COERCED. A row written before these existed must read back
      // as "not observed", and `?? 0` would turn every one of them into a claim that the learner
      // answered instantly with no help. Spread-when-present keeps absent absent.
      ...(row.operation == null ? {} : { operation: row.operation as ObjectiveCapability }),
      ...(row.response_latency_ms == null ? {} : { responseLatencyMs: row.response_latency_ms as number }),
      ...(row.scaffolding_level == null ? {} : { scaffoldingLevel: row.scaffolding_level as number }),
    }));
}
