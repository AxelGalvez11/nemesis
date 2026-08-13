// The durable knowledge behind one canvas's sources, and whether the policy runtime may own it.
//
// 🔴 THE SAME PATH IN EVERY CANVAS, AND THAT IS WHAT MAKES THE CROSS-SESSION CLAIM TRUE. There is
// deliberately no canvas → knowledge lookup table. A canvas resolves its knowledge by re-deriving
// it from the source and storing it, and storage converges on `(user_id, identity_key)`. So a
// second canvas over the same material does not "find" the first canvas's rows — it independently
// computes the same identity and lands on the same rows. Convergence is a property of the identity
// function rather than of a join, which is why it survives the first canvas being deleted.
//
// 🔴 AND THE EXTRACTION IS BEST-EFFORT, ALWAYS. Attaching material must never fail because the
// knowledge layer did. "The file is in and unreadable to this lane" and "the file did not upload"
// are opposite facts for the learner, and the second is the one that loses their work.
//
// 🔴 READ, THEN DECIDE, THEN WRITE — IN THAT ORDER. Reading a canvas's sources and extracting from
// them is pure and cheap; persisting knowledge is neither. What may be written is therefore decided
// from the extraction alone, and rows are written only for a canvas this lane could actually read.
// A canvas whose parse cannot be trusted costs a read and leaves nothing behind.
//
// 🔴 AND THE DECIDING SIGNAL IS TRUST, NOT COVERAGE — see the gate below. "Did we read this
// reliably?" gates; "did we account for all of it?" discloses. Fusing them is what refused every
// real document, and the two have separate homes now: `knowledge-production.ts` and
// `knowledge-coverage.ts`. Neither can see the other's input.

import { constructTerritory } from "./canvas-api";
import { loadCanonicalSource } from "./canvas-sources";
import { loadCanvasTerritory, saveCanvasTerritory } from "./canvas-store";
import { frozenTopic, materialSubject, territoryReuse } from "./canvas-territory";
import type { LearningCanvas } from "./canvas-model";
import { KNOWLEDGE_IDENTITY_VERSION } from "./knowledge-identity";
import { extractKnowledgeObjects, type ExtractionOutcome } from "./knowledge-extraction";
import {
  coverageOfSource,
  emptyCoverage,
  policyOwnsCanvas,
  withSourceCoverage,
  type CanvasCoverage,
  type OwnershipDecision,
} from "./knowledge-coverage";
import { knowledgeProductionFor } from "./knowledge-production";
import type { KnowledgeObject } from "./knowledge-types";
import { saveKnowledge, type StoredObjective } from "./learner-store";
import type { ThinkingPhase } from "./thinking-phases";

/**
 * Constructions already running, so two callers that arrive together pay for ONE.
 *
 * 🔴 THE RACE IS REAL AND IT IS ON THE COMMONEST PATH THERE IS — attaching a file.
 * `ensureKnowledgeForCanvas` has two callers, and the moment a durable source lands they both fire:
 * the attach handler calls it directly, and `usePolicyRuntime`'s effect re-runs because
 * `knowledgeSignature` just changed from `topic:…` to `sources:…`. Both read `loadCanvasTerritory`
 * and get null, because the marker is written LAST by design.
 *
 * For the deterministic grid lane that cost nothing: same input, same identity keys, both upserts
 * ignore duplicates. For a model reading 120,000 characters of the learner's lecture it is two paid
 * samplings, and a model samples a subject DIFFERENTLY every time — so the two sets do not converge,
 * they accumulate. That is the 2 → 26 → 50 growth `groundedReuse` exists to stop, arriving inside a
 * single attach where the build-once marker cannot see it.
 *
 * 🔴 IN-FLIGHT ONLY, AND IT CANNOT BECOME THE BUG IT SITS NEXT TO. The entry is deleted the moment
 * the promise settles, so nothing here remembers having run and a later call rebuilds exactly as it
 * would have. *Is one running right now* and *has one ever run* are different questions, and only
 * the first is asked here — the second belongs to the durable marker. The front door was closed
 * once by an effect that ran too early and could never run again; a guard that outlived its
 * construction would close it a second way.
 *
 * Keyed by the SUBJECT as well as the canvas, so attaching a second lecture while the first is
 * still building is a different construction rather than a wait for the wrong one.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function onlyOnceAtATime<T>(key: string, build: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return (await running) as T;
  const started = build().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** One objective, with the knowledge it is a capability over. */
export interface ResolvedObjective {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
}

export interface CanvasKnowledge {
  /** 🔴 EMPTY UNLESS THE EXTRACTION COULD BE TRUSTED — NOT UNLESS THE DOCUMENT WAS COVERED.
   *  Nothing is stored for a canvas whose sources this lane could not read reliably, so there are
   *  no objectives to resolve. `outcome` says which case that is.
   *
   *  🔴 A NON-EMPTY LIST IS NOT A CLAIM THAT THE DOCUMENT IS COVERED. These are objectives over the
   *  knowledge that was actually extracted; `coverage.unrepresented` says how much was not, and it
   *  stays true and reported beside them. Reading this array as "the canvas is accounted for" is the
   *  exact conflation that made a whole-document question decide a per-knowledge action. */
  objectives: ResolvedObjective[];
  /**
   * 🔴 STATED, NEVER INFERRED FROM `objectives.length`. Zero objectives is several different facts:
   * this material teaches no associations, its structure did not survive parsing, nothing was
   * readable at all, or the canvas simply is not owned. An empty array cannot tell them apart.
   */
  outcome: ExtractionOutcome | "no-durable-source";
  coverage: CanvasCoverage;
  /** Whether this runtime may take the surface, and why not when it may not. */
  ownership: OwnershipDecision;
}

/**
 * Every association objective this canvas's durable sources support — when the policy owns it.
 *
 * Idempotent: both upserts conflict on identity and do nothing, so calling this on every open of
 * every canvas converges on one set of rows rather than accumulating copies.
 */
export async function ensureKnowledgeForCanvas(
  userId: string | null,
  canvas: LearningCanvas,
  options: {
    /**
     * Called as each real step begins.
     *
     * 🔴 REPORTED, NOT SIMULATED. The caller shows this to the learner, so it must correspond to
     * work genuinely starting — never to a timer walking a list of plausible-sounding stages. If a
     * step is fast, its phase is emitted and superseded within milliseconds and the caller's own
     * threshold means nothing is ever shown for it. That is correct: the honest answer to "what
     * took so long?" is sometimes "nothing did".
     */
    onPhase?: (phase: ThinkingPhase) => void;
    /**
     * Store this canvas's knowledge even though the policy does not own it.
     *
     * 🔴 IT BYPASSES OWNERSHIP. IT DOES NOT — AND CANNOT — BYPASS TRUST. Ownership is a judgement
     * about presentation ("should the policy take this page?") and overriding it writes nothing
     * untrue. Whether the source was actually read is a FACT, and a flag that overrode it would
     * mint knowledge from a parse we know was flattened, into a real learner's tables, with no
     * marker distinguishing it from a true one ever after. See the gate below.
     *
     * 🔴 IT CHANGES WHAT IS WRITTEN, NEVER WHAT IS DECIDED. `ownership` in the result still says
     * `owns: false` and still names the refusal, so a caller running a forced session can — and
     * must — disclose it. A bypass that rewrote the verdict would delete the only record that this
     * was not the ordinary path, which is the flaw in the `?policy=1` opt-in it replaces.
     *
     * 🔴 AND THE EVIDENCE SEMANTICS ARE UNCHANGED. A demonstration made in a forced session is a
     * real demonstration of a real objective, so it is written exactly as any other. What is
     * bypassed is which runtime got the surface, not what counts as having learned something.
     */
    bypassOwnership?: boolean;
  } = {},
): Promise<CanvasKnowledge> {
  const { bypassOwnership = false, onPhase } = options;
  // 🔴 DURABLE SOURCES ONLY. An ephemeral source has no library row, so anchors minted from it
  // point at something no later canvas can resolve — knowledge that cannot outlive its session is
  // exactly what this layer exists to stop producing.
  const sourceIds = canvas.sources
    .map((source) => source.librarySourceId)
    .filter((id): id is string => Boolean(id));

  const nothingToRead = (): CanvasKnowledge => {
    const coverage = emptyCoverage(canvas.sources.length);
    return {
      coverage,
      objectives: [],
      outcome: "no-durable-source",
      ownership: policyOwnsCanvas({ coverage, outcome: "no-durable-source" }),
    };
  };

  // Nobody to store knowledge for. A bypass cannot help — it changes what is written, not whether
  // there is anyone to write it for.
  if (!userId) return nothingToRead();

  // 🔴 THE FRONT DOOR. This is the line that used to read `|| sourceIds.length === 0`, and it closed
  // the product's PRIMARY entrance: someone who typed a topic instead of uploading a file got
  // material with nothing to do, because a canvas with no durable source was refused here before
  // anything else ran.
  //
  // 🔴 THE CLAUSE CONFLATED IDENTITY WITH PROVENANCE. Its stated reason is sound and is not being
  // weakened — an anchor minted from an ephemeral source points at something no later canvas can
  // resolve. But that is an argument about ANCHORS, and it was being applied to KNOWLEDGE.
  // `knowledgeIdentityKey` hashes only type, relation kind and the pair: no source, no anchor. So a
  // topic-first fact is perfectly resolvable by a later canvas — it simply has no source, and the
  // refusal treated those as the same thing.
  //
  // So the refusal moves from "no source" to "no honest provenance". A topic has one: model
  // knowledge, stated as such, carrying no anchor and therefore no citation marker it cannot honour.
  //
  // 🔴 AND IT CONSTRUCTS KNOWLEDGE DIRECTLY, NEVER A LESSON TO EXTRACT FROM. Generating prose and
  // reading facts back out of it would launder model output into something shaped like source
  // material, which §M forbids. `parseTerritory` returns `KnowledgeObject[]` and cannot write a
  // block, so that pipeline is unrepresentable here rather than merely discouraged.
  if (sourceIds.length === 0) return topicTerritory(userId, canvas, onPhase);

  // 🔴 AND A CANVAS HOLDING ANY SOURCE THIS LAYER CANNOT READ IS ALREADY UNOWNABLE, so it is
  // answered before a single round trip. This is not only an optimisation: it is the check that
  // stops a durable glossary beside an ephemeral lecture reporting full coverage of the glossary
  // and taking the page, with the lecture nowhere.
  //
  // Skipped under a bypass, where the whole intent is to reach the durable material anyway.
  if (sourceIds.length !== canvas.sources.length && !bypassOwnership) return nothingToRead();

  const extracted: KnowledgeObject[] = [];
  let coverage = emptyCoverage(canvas.sources.length);
  let outcome: ExtractionOutcome = "complete";

  // 🔴 READ TOGETHER, NOT ONE AFTER ANOTHER, AND THAT IS NOW LOAD-BEARING. Every canvas runs this
  // on open — it is how ownership is decided — and the canvas paints nothing until it finishes, so
  // a four-source canvas used to wait for four round trips in a row before showing anything at all.
  // Reading them at once bounds the wait to the slowest single source.
  //
  // The two phases move out here with it, which is more honest rather than less: "reading your
  // sources" and "mapping what you know" are each one step that genuinely runs once, instead of a
  // pair flickering per source.
  onPhase?.("reading_source");
  const loaded = await Promise.all(sourceIds.map((sourceId) => loadCanonicalSource(sourceId)));
  onPhase?.("mapping_knowledge");

  for (const canonical of loaded) {
    if (!canonical.ok) {
      // Not counted as accounted for: what this source holds is now unknown, and unknown is not
      // empty. Ownership refuses on that alone.
      outcome = "failed";
      continue;
    }
    const extraction = extractKnowledgeObjects(canonical.context);
    // The worst outcome across the canvas's sources wins: one source read completely does not make
    // the canvas complete when another was flattened.
    if (extraction.outcome === "failed") outcome = "failed";
    else if (extraction.outcome === "degraded" && outcome !== "failed") outcome = "degraded";

    coverage = withSourceCoverage(
      coverage,
      coverageOfSource({ context: canonical.context, objects: extraction.objects }),
    );
    extracted.push(...extraction.objects);
  }

  // 🔴 STILL DECIDED, STILL REPORTED — IT JUST NO LONGER DECIDES WHETHER KNOWLEDGE IS MINTED.
  // Ownership is a whole-document question and it is the honest answer to "could this runtime
  // account for all of this?" It is carried out on the return value, the surface discloses it, and
  // a forced session is still told apart from an ordinary one by it. What changed is its JOB.
  const ownership = policyOwnsCanvas({ coverage, outcome });

  // 🔴 PRODUCTION IS GATED ON TRUST, NEVER ON COVERAGE — RUNTIME-005.
  //
  // The gate that used to stand here asked `!ownership.owns`, and that was right while the policy
  // REPLACED the page: taking a canvas it could only partly teach deleted the rest of the document
  // from the learner's reach. Under composition the task sits BESIDE the unsupported material, so
  // the whole-document question became a category error — it answered "no" for every real document
  // and refused 6 of 6 production canvases. `RUNTIME-001` removed the identical gate where a task
  // is CONSUMED; this one zeroed its input, so deleting that one alone changed nothing observable.
  //
  // The two facts the old gate fused are separate signals and always were:
  //   outcome                → did we read this reliably?      → GATE  (here)
  //   coverage.unrepresented → did we account for all of it?   → DISCLOSE (on the return value)
  //
  // 🔴 THE CONCERN IN THE OLD COMMENT SURVIVES AND IS SPLIT IN TWO. "Rows produced by opening a
  // document rather than by learning anything from it" was two worries wearing one gate. The first
  // — do not mint knowledge we cannot trust — is exactly what `outcome` answers, and better than
  // coverage did. The second — do not mint knowledge nobody will be asked about — turned out not to
  // be a real trade-off: extraction here is DETERMINISTIC AND MODEL-FREE (see the header of
  // `knowledge-extraction.ts`), so minting on open costs a database upsert and nothing more, and
  // both upserts ignore duplicates on identity, so re-opening the same canvas is free. Writing on
  // open is correct for v1; there is no "studied" concept to build and no spend to weigh.
  //
  // 🔴 AND THIS GATE IS NOT BYPASSABLE — DELIBERATELY, AND IT IS THE ONE GATE THAT IS NOT.
  //
  // `bypassOwnership` skips OWNERSHIP, which is a judgement about presentation: should the policy
  // take this page? Reasonable to override, and overriding it writes nothing untrue. Trust is a
  // different kind of claim — it is a FACT about whether the source was read — and overriding a
  // fact stores a falsehood.
  //
  // What makes it unrecoverable is durability and provenance. `saveKnowledge` upserts on
  // `(user_id, identity_key)`, so a knowledge object minted from a flattened parse under
  // `?policy=force` lands in a REAL learner's table, carries no forced marker, and converges with
  // genuine extractions of the same identity — indistinguishable from a true one forever. From
  // there a false knowledge object becomes a false objective becomes a question about something the
  // source never said, and the learner's wrong answer is recorded as THEIR gap. A source gap
  // becoming a learner gap, introduced by a query parameter.
  //
  // So the bypass's own contract — "it changes what is WRITTEN, never what is DECIDED" — is exactly
  // why it must stop here: this is the case where writing IS the decision.
  const production = knowledgeProductionFor({ outcome });
  if (!production.produce) return { coverage, objectives: [], outcome, ownership };

  // 🔴 THE GRID LANE FOUND NOTHING, AND THAT IS THE ORDINARY CASE FOR A LECTURE — §24's real
  // blocker, measured rather than assumed.
  //
  // `extractKnowledgeObjects` is the structured-TABLE lane and says so in its own header. The
  // document the owner uploaded on 2026-08-13 is a 15-page PDF whose stored parse reports
  // `table_count: 0`, so it produced zero objects, zero objectives and nothing for the policy to
  // ask. That is why opening a document still had to write a summary: it was the only thing that
  // could be shown. Removing the summary without this would have opened the owner's own lecture on
  // a blank page.
  //
  // 🔴 A FALLBACK, NEVER A REPLACEMENT. The grid lane is deterministic, model-free, re-derivable by
  // reading the document, and free to re-run. It stays first and stays untouched, because "refusing
  // to guess is a feature of the lane; do not weaken it to raise a count." This runs only where it
  // found nothing at all.
  //
  // 🔴 AND IT DOES NOT TOUCH COVERAGE. `coverage` still reports what the deterministic lane
  // accounted for, so these objects never make a document look more represented than it is. The
  // error is deliberately in the under-claiming direction: a canvas may hold knowledge that
  // coverage does not credit, and it must never be the other way round.
  // 🔴 ATTACHING A SOURCE MUST NOT EMPTY A CANVAS THAT WAS ALREADY TEACHING — measured live on
  // 2026-08-13, and it is the same defect from the other side.
  //
  // A canvas with a healthy topic territory (24 objects, a question on every open) was given a
  // spreadsheet. Everything beneath the boundary worked: real library row, parsed cleanly, both
  // worksheets recovered. The canvas then rendered NOTHING. The reason is the branch above — the
  // moment `sourceIds` is non-empty this function stops taking the path that was working and takes
  // the document path, and the territory the canvas already had is never consulted again.
  //
  // 🔴 THE INVARIANT IN THE OWNER'S OWN WORDS: "changing provenance must not change knowledge
  // identity, learner evidence history, or objective continuity." Attaching a source is a
  // PROVENANCE event. A canvas that was answering questions must still be answering the same
  // questions one second afterwards. New material ADDS to what is known; it never replaces the
  // route to it.
  //
  // Replayed through `storeTerritory` exactly as the topic lane replays it, so this converges on
  // the rows that already exist and picks up any enrichment they have gained rather than being a
  // second implementation of the step the cross-canvas claim rests on.
  const carried = await carriedTerritory(userId, canvas);

  // 🔴 THE GRID LANE FOUND NOTHING, AND THAT IS THE ORDINARY CASE FOR A LECTURE — §24's real
  // blocker, measured rather than assumed.
  //
  // `extractKnowledgeObjects` is the structured-TABLE lane and says so in its own header. The
  // document the owner uploaded on 2026-08-13 is a 15-page PDF whose stored parse reports
  // `table_count: 0`, so it produced zero objects, zero objectives and nothing for the policy to
  // ask. That is why opening a document still had to write a summary: it was the only thing that
  // could be shown. Removing the summary without this would have opened the owner's own lecture on
  // a blank page.
  //
  // 🔴 A FALLBACK, NEVER A REPLACEMENT. The grid lane is deterministic, model-free, re-derivable by
  // reading the document, and free to re-run. It stays first and stays untouched, because "refusing
  // to guess is a feature of the lane; do not weaken it to raise a count." This runs only where it
  // found nothing at all.
  //
  // 🔴 AND IT DOES NOT RUN WHEN A CARRIED TERRITORY ALREADY ANSWERS. Its marker is the canvas's
  // one territory column, so building here would overwrite the topic the canvas was started from
  // and re-topic it to its own filenames. The honest cost is stated rather than hidden: a document
  // attached to a canvas that ALREADY has a model-built territory contributes only what the grid
  // lane can read from it. That is a real gap and it is a follow-up; it is not a blank canvas,
  // which is what shipping the clobber instead would have cost.
  //
  // 🔴 AND IT DOES NOT TOUCH COVERAGE. `coverage` still reports what the deterministic lane
  // accounted for, so these objects never make a document look more represented than it is. The
  // error is deliberately in the under-claiming direction: a canvas may hold knowledge that
  // coverage does not credit, and it must never be the other way round.
  if (extracted.length === 0 && carried.length === 0) {
    const grounded = await groundedTerritory({ canvas, coverage, onPhase, outcome, ownership, sourceIds, userId });
    if (grounded) return grounded;
  }

  const fromDocument: ResolvedObjective[] = [];
  for (const knowledge of extracted) {
    const stored = await saveKnowledge(userId, knowledge);
    for (const objective of stored) fromDocument.push({ knowledge, objective });
  }
  const resolved = mergeObjectives(fromDocument, carried);

  // 🔴 ORDERED BY IDENTITY, EXPLICITLY. The runtime acts on the first objective that is owed
  // something, so leaving the order to whatever PostgREST returned would make "which question did
  // Nemesis ask?" depend on row layout — the same canvas could ask a different thing on a reload
  // and nothing would look wrong. This is ARBITRATION, NOT A CURRICULUM: it decides ties, it does
  // not encode what should be learned first. A real ordering is a later, separate decision.
  resolved.sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));
  return { coverage, objectives: resolved, outcome, ownership };
}

// ----------------------------------------------------------------- topic-first

/**
 * How many pairs to ask a topic for.
 *
 * Not tuned, and deliberately not derived from the topic. A ceiling on one request, never a quota to
 * fill: the prompt says fewer is better than padded and `parseTerritory` drops anything failing a
 * rule, so the number that survives is routinely lower and that is the intended shape.
 */
const TERRITORY_TARGET = 24;

/**
 * A topic-first canvas, turned into knowledge the policy can act on.
 *
 * 🔴 DEFINED BELOW `ensureKnowledgeForCanvas` ON PURPOSE, AND MOVING IT UP BREAKS A REAL GUARD.
 * `knowledge-coverage.test.ts` asserts the SOURCE path's ordering — read, then decide trust, then
 * gate, then write — by first occurrence in this file. This function names several of the same
 * calls, so defining it above would shift those positions and silently retarget an assertion that
 * has been protecting the write path since `RUNTIME-005`. Hoisting means the call site above still
 * works; the position is what matters.
 *
 * 🔴 EVERY OBJECT IT PRODUCES CARRIES `unanchoredProvenance: ["model"]` AND NO ANCHOR, so nothing
 * downstream can render a citation for it. The quiet marker promises an excerpt, and there is none.
 *
 * 🔴 AND ITS IDENTITY IS THE ORDINARY ONE, WHICH IS THE WHOLE PAYOFF. These objects are keyed by the
 * same content-derived `identityKey` as document-extracted ones, so a pair minted from a typed topic
 * and the same pair later extracted from an uploaded lecture are ONE object. Upload the lecture
 * afterwards and it lands on knowledge the topic already created, with the learner's demonstrations
 * still attached. Nothing special was done to get that; it falls out of identity not depending on
 * provenance.
 */
async function topicTerritory(
  userId: string,
  canvas: LearningCanvas,
  onPhase?: (phase: ThinkingPhase) => void,
): Promise<CanvasKnowledge> {
  const coverage = emptyCoverage(0);
  const answer = (outcome: ExtractionOutcome | "no-durable-source", objectives: ResolvedObjective[] = []) => ({
    coverage,
    objectives,
    outcome,
    ownership: policyOwnsCanvas({ coverage, outcome }),
  });

  // 🔴 BUILD ONCE. THIS IS THE GATE, AND IT IS ON THE CONSTRUCTOR RATHER THAN ON THE EFFECT.
  //
  // Without it, every open of a topic canvas built a WHOLE NEW TERRITORY: production measured
  // 2 → 26 → 50 knowledge objects and 4 → 51 → 99 objectives over two opens, all 48 identity keys
  // distinct, zero duplicate statements. Not duplication — the model genuinely samples a topic
  // differently each time, so a deduplicate would have slowed the growth rather than stopped it.
  // The question is "have we already built one", never "have we already got this fact".
  //
  // 🔴 AND IT CANNOT RECREATE THE BUG IT SITS NEXT TO. The front door was shut by an effect that
  // ran ONCE, too early, and could never run again. Nothing here remembers having run: the effect's
  // dependency key is unchanged and still fires on every mount, and "already built" is read from a
  // durable column, not from a ref or a mount-local flag. *Has a territory been built for this
  // canvas* and *has this effect already run* are different questions, and only the first is asked.
  //
  // 🔴 IT LIVES HERE BECAUSE THIS IS THE ONLY PLACE IT CANNOT BE WALKED AROUND. `constructTerritory`
  // has exactly one caller — the line below. `ensureKnowledgeForCanvas` has two (open, and attaching
  // a source), so a gate up there is bypassed by the next caller anyone adds.
  const stored = await loadCanvasTerritory(userId, canvas.id);

  // 🔴 THE TOPIC IS FROZEN AT THE FIRST BUILD, AND THE TITLE IS A LABEL AFTER THAT. The Library
  // lets a learner rename a canvas to tidy their shelf; on a topic-first canvas the title IS the
  // topic, so reading it fresh each time would let a filing action silently re-topic what Nemesis
  // teaches. See `frozenTopic` — it also decides which subject an identity-version rebuild uses.
  const topic = frozenTopic({ stored, title: canvas.title });
  // No material and no topic is genuinely nothing to work from — an empty canvas, not a refusal.
  if (!topic) return answer("no-durable-source");

  const reuse = territoryReuse({ identityVersion: KNOWLEDGE_IDENTITY_VERSION, stored });
  if (reuse.reuse) {
    const replayed = await storeTerritory(userId, reuse.objects);
    if (replayed.length > 0) return answer("complete", replayed);
    // 🔴 A CACHE MUST NEVER BE ABLE TO TRAP A LEARNER. A replay that resolves nothing means the
    // write path failed, not that the topic is empty — and returning here would leave the marker in
    // place and the canvas blank on EVERY open, for ever. That is precisely the shape of the
    // front-door bug this file just recovered from, so an empty replay falls through and rebuilds.
    // It costs a model call in a session where the learner's own data layer is already failing;
    // the alternative costs them the canvas.
  }

  // 🔴 SHARED WITH ANY CONSTRUCTION ALREADY RUNNING FOR THIS CANVAS AND THIS TOPIC. Two callers can
  // reach this at once and the marker is written last, so neither sees the other through storage.
  // `onlyOnceAtATime` dedupes what is IN FLIGHT and remembers nothing once it settles.
  return onlyOnceAtATime(`topic:${userId}:${canvas.id}:${topic}`, async () => {
  onPhase?.("mapping_knowledge");
  const { value } = await constructTerritory(userId, topic, TERRITORY_TARGET);

  // 🔴 THE TRUST DECISION FOR MODEL KNOWLEDGE HAPPENS BEFORE THIS LINE, AND NOTHING IS WRITTEN UNTIL
  // IT HAS. There is no source to have read reliably, so `knowledgeProductionFor` has nothing to
  // judge; what stands in its place is `parseTerritory`'s validation rules, which drop every
  // candidate that fails one. A territory where nothing survived writes NO rows — the same
  // protection as the source path, decided by rules rather than by a parse outcome.
  //
  // `failed`, not `no-durable-source`: a topic Nemesis could not turn into checkable facts is a
  // different thing from a canvas with nothing on it, and reporting them as one hides the case worth
  // knowing about — the surface can say "name it more narrowly" only if it can tell them apart.
  if (!value || value.objects.length === 0) return answer("failed");

  const resolved = await storeTerritory(userId, value.objects);

  // 🔴 NOTHING RESOLVED MEANS NOTHING TO ASK, AND NOTHING IS MARKED. The topic produced facts and
  // the write path lost them, so this is `failed` — the honest "we could not turn this into
  // something to answer" — and because no marker was written the next open retries it.
  if (resolved.length === 0) return answer("failed");

  // 🔴 WRITTEN LAST, AND ONLY ON A COMPLETE BUILD. This is what makes an interrupted build safe: a
  // tab closed mid-construction marks nothing, so the next open rebuilds rather than locking the
  // learner at half a map — and the rows the interrupted run did manage to write converge with the
  // rebuild by identity instead of doubling.
  await saveCanvasTerritory(userId, canvas, {
    identityVersion: KNOWLEDGE_IDENTITY_VERSION,
    objects: value.objects,
    topic,
  });
  return answer("complete", resolved);
  });
}

/**
 * Everything this canvas can ask about, from both lanes, counted once.
 *
 * 🔴 DEDUPLICATED BY OBJECTIVE IDENTITY, BECAUSE TWO LANES CAN NOW REACH THE SAME FACT. That is the
 * whole payoff of identity not depending on provenance: a fact the model knew and the same fact the
 * document states are ONE object. Left in twice it is still one row and one evidence history, but
 * the runtime would see two entries and the surface would count two things to learn where there is
 * one.
 *
 * 🔴 THE DOCUMENT'S OWN READING WINS A TIE, AND THAT IS THE ONLY REASON THE ORDER MATTERS. Both
 * entries name the same objective row, so nothing durable turns on this; what turns on it is which
 * `KnowledgeObject` the surface ends up holding, and only the anchored one can say where it came
 * from. Preferring the carried copy would silently cost the citation.
 *
 * Pure, so the merge rule is assertable without a database.
 */
export function mergeObjectives(
  preferred: readonly ResolvedObjective[],
  carried: readonly ResolvedObjective[],
): ResolvedObjective[] {
  const merged: ResolvedObjective[] = [];
  const seen = new Set<string>();
  for (const entry of [...preferred, ...carried]) {
    if (seen.has(entry.objective.identityKey)) continue;
    seen.add(entry.objective.identityKey);
    merged.push(entry);
  }
  return merged;
}

/**
 * The territory this canvas ALREADY had, carried across the arrival of a source.
 *
 * 🔴 IT IS NOT A CACHE HIT AND IT MUST NOT BE CONFUSED WITH ONE. `groundedReuse` answers "may I skip
 * building?", which is a spend question about material. This answers "what did this canvas already
 * know?", which is a continuity question about the LEARNER, and the answer is the same whether the
 * territory was built from a topic or from a document. Reusing `groundedReuse` here would refuse a
 * topic-built territory as `material-changed` and empty the canvas — the exact regression.
 *
 * The identity version is still checked, for the reason it always is: replaying objects keyed under
 * older rules would store keys that no longer converge with fresh extractions of the same fact.
 *
 * Returns an empty list on any miss, and a miss is never an error — a canvas that never had a
 * territory is the ordinary first upload.
 */
async function carriedTerritory(userId: string, canvas: LearningCanvas): Promise<ResolvedObjective[]> {
  const stored = await loadCanvasTerritory(userId, canvas.id);
  if (!stored || stored.identityVersion !== KNOWLEDGE_IDENTITY_VERSION) return [];
  return storeTerritory(userId, stored.objects);
}

// -------------------------------------------------------------- grounded territory

/**
 * A document the grid lane could not read pairs from, turned into knowledge by READING IT.
 *
 * 🔴 IT IS THE SAME CONSTRUCTOR THE TOPIC LANE USES, AND THAT IS §18 RATHER THAN A SHORTCUT. "A
 * prompt, a document, several sources, a recording and a webpage all converge on one runtime." A
 * second constructor for documents would be a second product with its own drift.
 *
 * 🔴 THE STRICTER RULE IS IN THE PARSER, NOT HERE. Given material, every surviving pair must name an
 * excerpt that resolves to something we actually showed the model — so what comes back is anchored,
 * citable, and distinguishable for ever from a pair the model knew independently. A model holding
 * the learner's lecture and asserting something it cannot point at has left the document, and that
 * is refused rather than stored with a hopeful marker.
 *
 * 🔴 BUILD ONCE, AND `carriedTerritory` IS WHAT ENFORCES IT — NOT A GATE IN HERE. A model samples a
 * subject differently every time it is asked; production measured a topic canvas growing
 * 2 → 26 → 50 objects over two opens, and a lecture is a bigger and more expensive input. The
 * caller replays any stored territory BEFORE reaching this, and calls this only when that replay
 * produced nothing — so a canvas that has already been given a territory never arrives here at all.
 *
 * 🔴 THE HONEST CONSEQUENCE, WHICH IS A REAL GAP AND IS NOT A ROUNDING ERROR. "Already has a
 * territory" is a fact about the CANVAS, not about the MATERIAL. So attaching a SECOND lecture to a
 * canvas that already built one does not bring us back here: the new document contributes only what
 * the deterministic grid lane can read from it, and this lane never sees it.
 *
 * That is deliberate rather than overlooked. The marker is the canvas's ONE territory column, so
 * building here for new material would overwrite the subject the canvas was started from and
 * re-topic it to its own filenames — "renaming must never re-teach", through the back door. Making
 * it right needs the marker to hold an accumulating set of subjects, which is a data-shape change,
 * and doing that under a hotfix is how the shape gets decided badly. Filed, not fudged.
 *
 * Returns null when nothing usable came back, so the caller reports the outcome the SOURCE READ
 * produced. "We read your document fine and found no pairs in it" and "we could not read your
 * document" are different facts, and this lane must not overwrite the second with the first.
 */
async function groundedTerritory(input: {
  canvas: LearningCanvas;
  coverage: CanvasCoverage;
  onPhase?: (phase: ThinkingPhase) => void;
  outcome: ExtractionOutcome;
  ownership: OwnershipDecision;
  sourceIds: readonly string[];
  userId: string;
}): Promise<CanvasKnowledge | null> {
  const { canvas, coverage, onPhase, outcome, ownership, sourceIds, userId } = input;
  const answer = (objectives: ResolvedObjective[]): CanvasKnowledge => ({ coverage, objectives, outcome, ownership });

  // 🔴 A LABEL ON THE MARKER, NOT A KEY ANYTHING COMPARES. `CanvasTerritory.topic` must be a
  // non-empty string or `readTerritory` rejects the row, and for a document canvas the honest value
  // is the material it was built from. An earlier version compared it on the way back in; that
  // comparison was unreachable, because the caller's replay means a canvas with a stored territory
  // never reaches this function. A dead branch that looks like a freshness check is worse than no
  // check: it reads as though new material rebuilds, and nothing does.
  const subject = materialSubject(sourceIds);

  // 🔴 SHARED WITH ANY CONSTRUCTION ALREADY RUNNING FOR THIS CANVAS AND THIS MATERIAL. Attaching a
  // file fires this from two places at once — see `onlyOnceAtATime` — and the build-once marker is
  // written last, so neither caller can see the other through storage.
  return onlyOnceAtATime(`grounded:${userId}:${canvas.id}:${subject}`, async () => {
  onPhase?.("mapping_knowledge");
  const { value } = await constructTerritory(userId, canvas.title, TERRITORY_TARGET, {
    sources: canvas.sources,
  });
  if (!value || value.objects.length === 0) return null;

  const resolved = await storeTerritory(userId, value.objects);
  if (resolved.length === 0) return null;

  // Written last and only on a complete build, so a tab closed mid-construction marks nothing and
  // the next open rebuilds rather than locking the learner at half a map.
  await saveCanvasTerritory(userId, canvas, {
    identityVersion: KNOWLEDGE_IDENTITY_VERSION,
    objects: value.objects,
    topic: subject,
  });
  return answer(resolved);
  });
}

/**
 * Persist a territory's objects and resolve their objectives.
 *
 * 🔴 THE SAME CALL ON BOTH PATHS, WHICH IS WHAT MAKES A REPLAY EQUIVALENT TO A BUILD. A cached
 * territory goes through `saveKnowledge` exactly as a freshly constructed one does, so it converges
 * on the rows that already exist, picks up enrichment they have gained, and produces objective row
 * ids the evidence layer can attach to. A replay that took a shortcut here would be a second
 * implementation of the step the cross-canvas claim rests on.
 */
async function storeTerritory(userId: string, objects: readonly KnowledgeObject[]): Promise<ResolvedObjective[]> {
  const resolved: ResolvedObjective[] = [];
  for (const knowledge of objects) {
    const stored = await saveKnowledge(userId, knowledge);
    for (const objective of stored) resolved.push({ knowledge, objective });
  }
  // Ordered by identity for the same reason the source path is: which question is asked first must
  // not depend on the order rows came back in.
  resolved.sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));
  return resolved;
}
