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
import { ERROR_TYPES, type ErrorType, type LearnerInputModality } from "./canvas-model";
import { objectivesForKnowledge, type LearningObjective, type ObjectiveCapability } from "./learning-objective";
import { readRung, type ObjectiveEvidence, type ScaffoldRung } from "./scaffold-rung";
import { isTeachingStrategy, type TeachingStrategyId } from "./teaching-strategy";
import { KNOWLEDGE_IDENTITY_VERSION } from "./knowledge-identity";

/**
 * A table that does not exist yet is a deployment state, not a bug worth shouting about.
 *
 * 🔴 A MISSING **COLUMN** IS THE OPPOSITE, AND THIS USED TO SWALLOW IT. Postgres reports both as
 * `... does not exist`, so the message fallback below classified `42703` (undefined_column) as a
 * missing table and every caller then failed silently — no warning, no error, an empty array.
 *
 * That is not hypothetical here: `EVIDENCE_SELECT` names columns added by migration, and PostgREST
 * rejects the WHOLE select if one is absent. Merging a release ahead of its migration would
 * therefore make `loadEvidence` return `[]` for every learner, `projectLearnerState` answer
 * `unknown` for everything, and the policy re-ask the entire territory from scratch — with nothing
 * in the console. A missing table is a deployment state; a missing column on a table that exists is
 * a BROKEN deploy, and the two must not read the same.
 */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  // Checked before the message fallback, because the message alone cannot tell them apart.
  if (error?.code === "42703") return false;
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
 * A stable identity for one way of knowing, so merging two provenance sets cannot store the same
 * anchor twice.
 *
 * 🔴 SUBTRACTIVE, LIKE `knowledgePayload`, AND FOR THE SAME REASON. Enumerating the fields that
 * identify an anchor — `sourceId`, `unitId`, `page`, `quote` — would make any field added to
 * `CanonicalSourceAnchor` later invisible to this key, so two anchors differing ONLY in that new
 * field would collapse into one and the second would be dropped on the way to the database. That is
 * the exact failure `COLUMN_FIELDS` exists to prevent, one layer along. So the whole anchor is the
 * key, with object keys sorted so that two anchors built in a different field order still match.
 */
function anchorKey(anchor: unknown): string {
  return JSON.stringify(anchor, (_field, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

/**
 * The payload a stored row should hold once this object's ways of knowing are added to it.
 * `null` when the row already accounts for every one of them and nothing needs writing.
 *
 * 🔴 THIS EXISTS BECAUSE ENRICHMENT WAS A SILENT NO-OP. `saveKnowledge` upserts with
 * `ignoreDuplicates`, so a fact Nemesis first knew from model knowledge and LATER found in the
 * learner's own lecture kept `provenance: model` and no anchor for ever — and the write reported
 * success. The citation marker stayed dark on a claim that had a real excerpt behind it, and no
 * error was ever raised, because doing nothing is what `ignoreDuplicates` is for.
 *
 * 🔴 ACCUMULATING, NEVER EXCLUSIVE — the rule `waysOfKnowing()` already states. Grounding a model
 * claim ADDS a source; it does not delete the fact that Nemesis also knew it independently. A
 * learner asking "how do you know this?" is entitled to both answers, and the tidier half alone is
 * a false answer to a question about trust.
 *
 * 🔴 THE STORED PAYLOAD IS SPREAD FIRST AND ONLY THE TWO PROVENANCE COLLECTIONS ARE OVERRIDDEN.
 * Rebuilding the payload from the incoming object would delete every field the stored row carries
 * that this object happens not to have — which is the write-only-payload defect that already cost
 * this codebase six structural fields. A merge is not a rewrite.
 *
 * 🔴 IDENTITY IS UNTOUCHED, AND THAT IS THE INVARIANT THIS WHOLE FUNCTION SERVES. `identityBasis`
 * accepts only `type`, `statement`, `pair`, `relation` and `relationKind`, and
 * `objectiveIdentityKey` only a capability and parameters — neither can read provenance, so no
 * change here can move a key. If grounding minted a second object instead, the learner's
 * demonstrations would stay attached to the abandoned one and someone who proved they knew a fact
 * would be asked it again as though for the first time, their history orphaned by an improvement.
 *
 * 🔴 KNOWN LIMIT, STATED RATHER THAN HIDDEN: two concurrent saves that both read the old payload
 * lose one set of anchors. Fixing that durably needs a jsonb merge in SQL — a migration, and a
 * wider change than this boundary. The loss is a missed enrichment, recoverable the next time the
 * same fact is met, and never a wrong claim about a learner.
 */
export function mergedKnowledgePayload(
  storedPayload: Record<string, unknown> | null | undefined,
  incoming: Pick<KnowledgeObject, "sourceAnchors" | "unanchoredProvenance">,
): Record<string, unknown> | null {
  const stored = storedPayload ?? {};
  const storedAnchors = Array.isArray(stored.anchors) ? (stored.anchors as unknown[]) : [];
  const storedUnanchored = Array.isArray(stored.unanchoredProvenance)
    ? (stored.unanchoredProvenance as string[])
    : [];

  const anchors = [...storedAnchors];
  const seenAnchors = new Set(storedAnchors.map(anchorKey));
  for (const anchor of incoming.sourceAnchors ?? []) {
    const key = anchorKey(anchor);
    if (seenAnchors.has(key)) continue;
    seenAnchors.add(key);
    anchors.push(anchor);
  }

  const unanchored = [...storedUnanchored];
  const seenKinds = new Set<string>(storedUnanchored);
  for (const kind of incoming.unanchoredProvenance ?? []) {
    if (seenKinds.has(kind)) continue;
    seenKinds.add(kind);
    unanchored.push(kind);
  }

  // 🔴 NOTHING NEW MEANS NO WRITE AT ALL, WHICH IS NOT MERELY AN OPTIMISATION. `updated_at` is the
  // only timestamp a later audit can read, and touching a row that did not change would make every
  // ordinary re-encounter look like an edit — the "cleanup needs positive provenance" trap, where
  // rows appear to have been authored by whatever last ran.
  if (anchors.length === storedAnchors.length && unanchored.length === storedUnanchored.length) {
    return null;
  }

  return { ...stored, anchors, unanchoredProvenance: unanchored };
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
    // 🔴 A ROW WRITTEN BEFORE THIS FIELD EXISTED HAS NO UNANCHORED WAYS OF KNOWING, AND THAT IS
    // PROVABLE RATHER THAN A GUESS. Until the provenance contract, the ONLY path that minted
    // knowledge was `extractKnowledgeObjects(context: SourceContext)`, which cannot run without a
    // durable library source — `canvas-knowledge.ts` returned before reaching it otherwise. So every
    // pre-existing row is anchored by construction, and its ways of knowing are already in
    // `anchors`. An empty list is the accurate reading of those rows, not a fallback.
    unanchoredProvenance: Array.isArray(rest.unanchoredProvenance) ? rest.unanchoredProvenance : [],
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
    .select("id,payload")
    .eq("user_id", userId)
    .eq("identity_key", identityKey)
    .maybeSingle();
  if (readError || !knowledgeRow) {
    if (readError && !isMissingTable(readError)) console.warn("[learn] knowledge read-back failed", readError.message);
    return [];
  }
  const knowledgeRowId = (knowledgeRow as { id: string }).id;

  // 🔴 THE UPSERT ABOVE CANNOT ENRICH, SO THE ENRICHMENT IS A SECOND WRITE. `ignoreDuplicates` makes
  // a conflicting upsert do NOTHING — which is exactly right for identity and exactly wrong for
  // provenance, because the second time Nemesis meets a fact is precisely when it may have learned a
  // new way of knowing it. Without this, a model-known claim that later turns up in the learner's own
  // lecture keeps `provenance: model` and no anchor for ever, and the write reports success.
  //
  // 🔴 SCOPED BY `user_id` AND `identity_key`, THE SAME PAIR THE UPSERT CONFLICTS ON. Updating by
  // `id` would work too; using the identity pair keeps the row this touches provably the row that
  // was just read, and keeps two learners holding the same fact strictly apart.
  //
  // 🔴 A FAILED ENRICHMENT IS NOT A FAILED SAVE. The knowledge object and its objectives exist and
  // the learner can be taught; what is lost is a citation marker. Returning `[]` here would throw
  // away a usable canvas over a missing footnote.
  const enriched = mergedKnowledgePayload(
    (knowledgeRow as { payload?: Record<string, unknown> | null }).payload,
    knowledge,
  );
  if (enriched) {
    const { error: enrichError } = await supabase
      .from("knowledge_objects")
      .update({ payload: enriched })
      .eq("user_id", userId)
      .eq("identity_key", identityKey);
    if (enrichError && !isMissingTable(enrichError)) {
      console.warn("[learn] knowledge enrichment failed", enrichError.message);
    }
  }

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
  /**
   * WHICH KIND OF FAILURE THE EVALUATOR ESTABLISHED, when it established one.
   *
   * 🔴 IT SITS HERE, WITH `verdict` AND `misconceptions`, AND NOT IN THE OBSERVATIONS BLOCK BELOW.
   * That block's rule is *what was measured, never what it means* — and everything in it is known
   * BEFORE the learner answers. This is the opposite: a claim made about the answer after reading
   * it. Filing it below would put a judgement under a heading that promises there are none.
   *
   * 🔴 ABSENT MEANS NO KIND WAS NAMED. `canvas-judge.ts` already drops a value it does not
   * recognise, so a row without one is a row where the judge genuinely said nothing — never a
   * default, never inferred from the verdict, and never backfilled. `incorrect` with no kind is a
   * real and common state: the performance fell short and we do not know why.
   */
  errorType?: ErrorType | null;
  misconceptions?: readonly string[];
  canvasId?: string | null;
  evaluatorVersion?: string | null;
  /**
   * 🔴 THE IDEMPOTENCY KEY, AND REQUIRED FOR A REASON THE DATABASE CANNOT ENFORCE.
   *
   * The unique index behind the upsert is `(user_id, objective_id, response_id)` and it is
   * `NULLS DISTINCT` — the Postgres default. Two rows whose `response_id` is NULL therefore never
   * collide, and the deduplication `ignoreDuplicates` exists to provide **silently does not apply
   * to them**. A retried answer written without one becomes a second demonstration, crediting the
   * learner with practice they never did.
   *
   * 🔴 AND NO INDEX CHANGE CAN FIX IT. `NULLS NOT DISTINCT` would collapse every unidentified row
   * for an objective into one, which is wrong in the other direction: two genuinely separate
   * answers that both failed to carry an id are two demonstrations. A retry is only recognisable as
   * a retry if the answer said which answer it was. So the type is the enforcement — evidence
   * without a response identity is not a weaker record, it is an uncountable one.
   *
   * 🔴 IT IDENTIFIES THE ANSWER, NEVER THE OBJECTIVE. One submission demonstrating several things
   * carries ONE id across every row it writes. Deriving it from anything objective-specific turns
   * one performance into several — see `performanceKey` in `learner-evidence.ts`.
   */
  responseId: string;
  responseText?: string | null;
  /** Raw input provenance. Absent means the legacy writer did not observe it. */
  responseModality?: LearnerInputModality | null;
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
  /**
   * At what rung of the scaffolding ladder this response was produced — §33.
   *
   * 🔴 AN OBSERVATION, WHICH IS WHY IT SITS HERE AND NOT BESIDE `verdict`. The runtime knows which
   * kind of task it set before the learner answers, so nothing about this is inferred from the
   * response. That is what keeps it on the right side of this block's rule: what was measured,
   * never what it means. Whether a recognition tap is "enough" is a policy question, and policy
   * questions must stay rewritable.
   */
  scaffoldRung?: ScaffoldRung | null;
  /**
   * What this response said about THIS objective specifically.
   *
   * 🔴 THE FOURTH VALUE IS THE POINT. One answer put to several objectives establishes some and
   * says nothing about others, and `demonstrationObtained: false` cannot distinguish "they never
   * mentioned it" from "they tried and produced nothing". See `ObjectiveEvidence`.
   */
  objectiveEvidence?: ObjectiveEvidence | null;
  /** Milliseconds from the prompt appearing to submission, as measured. Raw. */
  responseLatencyMs?: number | null;
  /** How much assistance the runtime offered during the attempt. 0 is the prompt alone. */
  scaffoldingLevel?: number | null;
  /**
   * Which teaching controller chose this opportunity — the experiment's grouping key.
   *
   * 🔴 AN OBSERVATION, LIKE EVERY FIELD IN THIS BLOCK: which controller decided, known before the
   * learner answered, never inferred from what came back. It belongs here for exactly the reason
   * `scaffoldRung` does — the runtime knows it at the moment it sets the task.
   *
   * 🔴 OPTIONAL AND NULLABLE BECAUSE ABSENT IS A REAL STATE. A caller outside the strategy layer —
   * the legacy six-stage path, a future import, a repair script — genuinely does not know which arm
   * a row belongs to, and `nemesis_policy` would be a fabrication rather than a default. Every
   * metric excludes absent rows rather than assuming one.
   */
  teachingStrategy?: TeachingStrategyId | null;
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
    // 🔴 `?? null` IS "THE JUDGE NAMED NO KIND", and it is the only honest value for a row the
    // evaluator did not diagnose. Never a fallback kind, and — because absent is so much more
    // common than any one value — never the most frequent one either.
    error_type: evidence.errorType ?? null,
    evaluator_version: evidence.evaluatorVersion ?? null,
    misconceptions: evidence.misconceptions ?? [],
    objective_evidence: evidence.objectiveEvidence ?? null,
    objective_id: evidence.objectiveRowId,
    occurred_at: evidence.occurredAt,
    // 🔴 `?? null` IS "NOT OBSERVED", AND THAT IS WHY IT IS NOT `?? 0`. A zero latency asserts an
    // instantaneous answer; a zero scaffolding level asserts an unaided attempt. Both are real
    // claims, and writing either when nothing measured it puts a fact into the log that never
    // happened — which no later migration can distinguish from one that did.
    operation: evidence.operation ?? null,
    // 🔴 NO `?? null`, UNLIKE EVERY OBSERVATION AROUND IT. The others are nullable because absent
    // means not observed; this one is required because an absent response identity does not mean
    // "not observed", it means the row cannot be counted or deduplicated at all.
    response_id: evidence.responseId,
    response_latency_ms: evidence.responseLatencyMs ?? null,
    response_modality: evidence.responseModality ?? null,
    response_text: evidence.responseText ?? null,
    scaffold_rung: evidence.scaffoldRung ?? null,
    scaffolding_level: evidence.scaffoldingLevel ?? null,
    task_id: evidence.taskId ?? null,
    // 🔴 `?? null` MEANS "NO ARM RECORDED", AND IT MUST NEVER BECOME `?? DEFAULT_STRATEGY`. Writing
    // the control arm's name onto a row nobody assigned would enrol it into an experiment it was
    // never part of, and the resulting comparison would silently include rows from paths that have
    // no controller at all. Absent is the honest value and every metric already handles it.
    teaching_strategy: evidence.teachingStrategy ?? null,
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
  responseId: "",
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
  "id,objective_id,canvas_id,confidence,demonstration_obtained,error_type,evaluator_version,misconceptions,objective_evidence,occurred_at,operation,response_id,response_latency_ms,response_modality,response_text,scaffold_rung,scaffolding_level,task_id,teaching_strategy,verdict";

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
    // 🔴 VALIDATED, NOT CAST. A rung comes back out of a text column that a future migration, a
    // manual fix or an older writer could put anything into, and `as ScaffoldRung` would let an
    // unknown string flow into `rungRank`, which returns -1 for it — silently ranking it BELOW
    // `taught` and making every entailment check pass. `readRung` returns null instead, which every
    // consumer already has to handle because rows written before this column exist.
    ...(readRung(row.scaffold_rung) === null ? {} : { scaffoldRung: readRung(row.scaffold_rung)! }),
    ...(row.objective_evidence == null
      ? {}
      : { objectiveEvidence: row.objective_evidence as ObjectiveEvidence }),
    ...(row.response_latency_ms == null ? {} : { responseLatencyMs: row.response_latency_ms as number }),
    ...(row.response_modality === "typed" || row.response_modality === "spoken" || row.response_modality === "written"
      ? { responseModality: row.response_modality }
      : {}),
    ...(row.scaffolding_level == null ? {} : { scaffoldingLevel: row.scaffolding_level as number }),
    ...(row.response_id == null ? {} : { responseId: row.response_id as string }),
    ...(row.response_text == null ? {} : { responseText: row.response_text as string }),
    ...(row.task_id == null ? {} : { taskId: row.task_id as string }),
    // 🔴 VALIDATED, NOT CAST — the same rule `scaffold_rung` above is under, and for a sharper
    // reason. This comes out of a text column that a migration, a manual fix or an older writer
    // could put anything into, and `as TeachingStrategyId` would let an unknown string flow into
    // every grouping in `strategy-outcomes.ts`, where it becomes a THIRD cohort that each metric
    // reports separately and nobody notices — an experiment quietly running three arms. An
    // unrecognised value reads as absent, which is what an unrecognised value means.
    ...(isTeachingStrategy(row.teaching_strategy) ? { teachingStrategy: row.teaching_strategy } : {}),
    // 🔴 VALIDATED, NOT CAST — the third field under this rule, for the same reason as the two
    // above it. The column is permissive text on purpose (a CHECK constraint would make a future
    // kind fail the whole INSERT, and `recordEvidence` swallows that into a warning, so ONE
    // unrecognised value would silently discard an entire demonstration). The validation therefore
    // has to be here: an unknown string reads as absent, which is what an unknown string means.
    ...(readErrorType(row.error_type) === null ? {} : { errorType: readErrorType(row.error_type)! }),
  };
}

/** A stored kind of failure, or null for anything this build does not recognise. */
function readErrorType(value: unknown): ErrorType | null {
  return typeof value === "string" && (ERROR_TYPES as readonly string[]).includes(value)
    ? (value as ErrorType)
    : null;
}
