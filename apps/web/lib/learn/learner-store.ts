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
import { objectivesForKnowledge, type LearningObjective } from "./learning-objective";
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
      response_id: evidence.responseId ?? null,
      response_text: evidence.responseText ?? null,
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
    .select("id,objective_id,occurred_at,demonstration_obtained,verdict,confidence,misconceptions,canvas_id,evaluator_version")
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
    }));
}
