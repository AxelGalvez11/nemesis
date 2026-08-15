// When a topic-first canvas may reuse the territory it already has.
//
// 🔴 THE PROBLEM THIS EXISTS FOR, MEASURED IN PRODUCTION. Opening one topic canvas twice produced:
//
//     knowledge objects    2  →  26  →  50
//     learning objectives  4  →  51  →  99
//
// All 48 model-provenance identity keys DISTINCT, all 48 statements distinct. So this is NOT
// duplication — the model genuinely samples a topic differently every time it is asked, and each
// open produced a whole new map of the same subject. Unbounded, paid for on every open, and it
// dilutes the thing it builds: a coherent territory becomes an ever-growing pile the policy then
// has to choose among.
//
// 🔴 WHICH IS WHY DEDUPLICATION IS THE WRONG FIX AND IS DELIBERATELY NOT WHAT THIS DOES. Dropping
// facts that match an existing identity key would slow the growth, not stop it, because the new
// facts do not match. The question here is "have we already built a territory", never "have we
// already got this fact".
//
// 🔴 AND IT IS TOPIC-ONLY, ON PURPOSE. The source path never had this problem:
// `extractKnowledgeObjects` reads a `SourceContext` and nothing else, deterministically and with no
// model, so re-reading the same document lands on the same identity keys and both upserts ignore
// duplicates. Re-opening a document canvas has always been free. That is why nobody saw this until
// the topic-first front door opened, and why a general cache would be solving a problem the other
// path does not have.

import { needsReprocess, type ReprocessReason, type ReprocessVerdict } from "./reprocess";
import type { KnowledgeObject } from "./knowledge-types";

/**
 * WHICH MATERIAL a stored marker was reached over — the bytes and the parse, never the row.
 *
 * 🔴 THIS IS THE HALF `buildRules` SAYS IT IS MISSING. Its own header states the gap: *"IT DOES NOT
 * CARRY THE DOCUMENT'S PARSE VERSION, AND THAT GAP IS STATED RATHER THAN HIDDEN. A re-parse of the
 * same file can genuinely change what is extractable, and this fingerprint will not notice."* So a
 * document re-read by a better parser stayed locked behind a stale "we found nothing" marker until
 * an extraction-rules bump happened to come along. This closes it by carrying the other two
 * dimensions beside the rules instead of concatenating them into them — see `needsReprocess`.
 *
 * 🔴 THE BYTES, NEVER THE ROW ID. `materialSubject` below already names WHICH sources a build was
 * over, and that is a different question: a learner who replaces a file keeps the same source id
 * and the same canvas, and only the content hash notices. "The source itself changed" has to mean
 * the content changed, or a rename would cost a model call.
 *
 * Absent on every marker written before this existed, which reads as UNKNOWN — and unknown is
 * handled by `needsReprocess`'s null rules, never silently as "unchanged".
 */
export interface MaterialStamp {
  /** Fingerprint over the sources' content hashes. */
  contentHash: string;
  /** Fingerprint over the sources' parser versions. */
  parserVersion: string;
}

/**
 * The territory a topic-first canvas has ALREADY been given.
 *
 * 🔴 A CACHE OF AN EXPENSIVE CONSTRUCTION, NOT A SECOND SOURCE OF TRUTH. `knowledge_objects` and
 * `learning_objectives` remain the only record of what a learner is being taught. This answers one
 * question — "has this canvas already been given a territory, and for which topic?" — so a model is
 * not asked twice for a map it already drew. Nothing downstream may read it as a claim about the
 * learner, and nothing may read its ABSENCE as a claim either: a null means "build one", never
 * "this canvas has nothing".
 */
export interface CanvasTerritory {
  /** What it was built FOR — and, once set, what this canvas stays about however it is renamed.
   *  See `frozenTopic`: the title is a label after the first build, never a re-request. */
  topic: string;
  /**
   * `KNOWLEDGE_IDENTITY_VERSION` at build time.
   *
   * 🔴 A MISMATCH IS A MISS, NOT A REPAIR. Replaying objects keyed under older identity rules would
   * store them under keys that no longer converge with fresh extractions of the same fact — exactly
   * the silent version drift `extraction_version` exists to make findable.
   */
  identityVersion: number;
  /** Replayed through `saveKnowledge` on a hit — idempotent by identity, so it converges on the
   *  rows that already exist and picks up any enrichment they have gained since. */
  objects: KnowledgeObject[];
  /**
   * The rules under which this canvas's material has already been read for MECHANISMS.
   *
   * 🔴 ITS OWN KEY, BESIDE THE PAIR LANE'S, BECAUSE THE TWO LANES ARE INDEPENDENT AND THEIR MARKERS
   * MUST BE TOO. Reading mechanisms is not a fallback for the pair lane failing — a document can
   * carry a glossary and a mechanism, and finding one says nothing about the other. Sharing one
   * marker would mean the first lane to run silenced the second for ever.
   *
   * 🔴 AND IT IS A RULES FINGERPRINT, NOT A BOOLEAN, for the same reason `emptyUnder` is: a document
   * that yielded no mechanisms deserves another read when the extractor improves, and a flag would
   * lock it out permanently. Absent means never read.
   */
  mechanismsUnder?: string;
  /** The MATERIAL `mechanismsUnder` was read over — see `MaterialStamp`. Absent means unknown. */
  mechanismsOver?: MaterialStamp;
  /**
   * Set ONLY when a completed build produced nothing — the rules it produced nothing UNDER.
   *
   * 🔴🔴 THIS EXISTS BECAUSE "FOUND NOTHING" WAS INDISTINGUISHABLE FROM "NEVER TRIED", AND THE
   * DIFFERENCE IS PAID FOR ON EVERY OPEN. The marker is written last and only on a build that
   * resolved something, so a document neither lane could read wrote no marker at all — and the next
   * open rebuilt, and the next, and every one of them spent model calls to reach the same empty
   * answer. Recording only "built" would fix the cost and create a worse bug: the canvas would
   * insist for ever that it had been done, and a better parser or a better extractor could never
   * reach that document again.
   *
   * 🔴 SO IT IS A FINGERPRINT, NOT A BOOLEAN. It names the rules in force when nothing was found;
   * when those rules change, the stored answer stops applying and the document gets exactly one
   * more chance under the new ones. "We tried and found nothing" is a claim with a shelf life, and
   * this is the shelf life written down.
   *
   * Absent on every ordinary territory, which is what keeps a non-empty one unambiguous.
   */
  emptyUnder?: string;
  /**
   * The MATERIAL nothing was found in — see `MaterialStamp`.
   *
   * 🔴 THIS IS THE OWNER'S *"remembered … against which source content"*. Without it "we looked and
   * found nothing" was a claim about a canvas's SOURCE IDS, and a learner who replaced the file
   * behind one of those ids kept the old verdict for ever. Absent on markers written before this
   * field existed, which reads as unknown rather than as unchanged.
   */
  emptyOver?: MaterialStamp;
}

/**
 * Why a territory could not be reused. Stated rather than inferred from a null, because the two
 * cases mean completely different things and only one of them is ordinary.
 *
 * 🔴 THERE IS NO `topic-renamed` HERE, AND ITS ABSENCE IS THE POINT — see `frozenTopic`.
 */
export type TerritoryMiss =
  /** Nothing has been built for this canvas yet — the ordinary first open. */
  | "never-built"
  /** Built under older identity rules, so replaying it would write keys that no longer converge. */
  | "identity-version-changed"
  /**
   * A previous build found nothing, and something has moved since — worth one more attempt.
   *
   * 🔴 RENAMED FROM `empty-under-older-rules`, BECAUSE THE OLD NAME WAS ABOUT TO START LYING. Rules
   * were once the only thing that could supersede an empty answer; a re-parse and a replaced file
   * can now too, and a miss called "older-rules" would report a content change as a rules change.
   * `reason` on the result names which it actually was — the wider vocabulary is carried, never
   * mapped down onto this one word.
   */
  | "empty-answer-superseded";

export type TerritoryReuse =
  | { reuse: true; objects: readonly KnowledgeObject[] }
  /** `reason` is present exactly when the miss came from `needsReprocess` — it names WHAT moved. */
  | { reuse: false; miss: TerritoryMiss; reason?: ReprocessReason }
  /**
   * Built under these exact rules, and there was nothing to find.
   *
   * 🔴 NEITHER A HIT NOR A MISS, AND FORCING IT TO BE EITHER IS THE BUG. As a hit it would replay an
   * empty list and the caller would treat the canvas as taught. As a miss it would rebuild, which is
   * the unbounded spend this whole field exists to stop. It is its own answer: do not build, and do
   * not pretend there is anything here.
   */
  | { reuse: "known-empty" };

/**
 * The rules in force for a build, as one comparable string.
 *
 * 🔴 EVERY VERSION THAT COULD CHANGE THE ANSWER, AND NOTHING ELSE. If any lane's rules move, a
 * document that yielded nothing deserves another look; if none have, it does not. Leaving one out
 * would strand documents behind an improvement that was supposed to reach them — which is precisely
 * the failure a plain "we tried" boolean would have had for all of them at once.
 *
 * 🔴 IT DOES NOT CARRY THE DOCUMENT'S PARSE VERSION, AND THAT GAP IS STATED RATHER THAN HIDDEN. A
 * re-parse of the same file can genuinely change what is extractable, and this fingerprint will not
 * notice. Reaching it means a query per source at exactly the point the caller is trying to avoid
 * work; the honest cost is that a re-parsed document needs an extraction-rules bump to be revisited,
 * and those two things move together in practice.
 */
export function buildRules(versions: readonly string[]): string {
  return [...versions].sort().join("+");
}

/**
 * Does a stored "we already did this, and here is what we found" marker still stand?
 *
 * 🔴 THE ONE PLACE A CANVAS MARKER MEETS `needsReprocess`, AND THAT IS THE POINT. Both markers on
 * this type — `emptyUnder` and `mechanismsUnder` — record a completed piece of paid work and are
 * consulted to decide whether to pay again. Until now each was compared with its own bare `===` at
 * its own call site, which is two independent retry decisions in the same file: the shape the
 * owner's *"DO NOT CREATE A SECOND INDEPENDENT RETRY SYSTEM"* forbids. Everything about WHEN a
 * stored answer expires now lives in one predicate, and this is the only adapter onto it.
 *
 * Returns the verdict rather than a boolean, so the caller can say WHY it is paying again.
 *
 * 🔴 AN ABSENT `under` IS `never-processed`, NOT "still stands". No marker means the work was never
 * done — or was interrupted before it could be recorded — and either way the answer is unknown.
 */
export function markerStands(input: {
  /** The rules recorded on the marker. Absent means no marker: never done. */
  under: string | undefined;
  /** The material recorded on the marker. Absent means an older marker that did not record it. */
  over: MaterialStamp | undefined;
  /**
   * The rules in force now. Absent means "do not revisit on a rules change" — the conservative
   * reading for a caller that does not track rules, which can only ever suppress a rebuild.
   */
  rules?: string;
  /** The material as it stands now. Absent likewise suppresses, never causes, a rebuild. */
  material?: MaterialStamp;
}): ReprocessVerdict {
  const { material, over, rules, under } = input;
  return needsReprocess({
    current: {
      contentHash: material?.contentHash ?? null,
      parserVersion: material?.parserVersion ?? null,
      rulesetVersion: rules ?? null,
    },
    stored: under
      ? {
          contentHash: over?.contentHash ?? null,
          parserVersion: over?.parserVersion ?? null,
          rulesetVersion: under,
        }
      : null,
  });
}

/**
 * One comparable fingerprint over several sources' parses.
 *
 * 🔴 ALL OR NOTHING, AND THE NOTHING IS DELIBERATE. A canvas's answer was reached over ALL of its
 * material, so a fingerprint missing one source's hash cannot say whether the material changed.
 * Returning null then — rather than a fingerprint over the sources that happened to load — is what
 * makes the unknown case suppress a rebuild instead of causing one: a transient read failure must
 * not look like a replaced file and buy a model call.
 *
 * Sorted, so the order the learner attached two files in is not a different material.
 */
export function materialStamp(
  sources: readonly { contentHash: string | null; parserVersion: string | null; sourceId: string }[],
): MaterialStamp | null {
  if (sources.length === 0) return null;
  if (sources.some((source) => !source.contentHash || !source.parserVersion)) return null;
  const ordered = [...sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return {
    contentHash: ordered.map((source) => `${source.sourceId}:${source.contentHash}`).join(","),
    parserVersion: ordered.map((source) => `${source.sourceId}:${source.parserVersion}`).join(","),
  };
}

/**
 * What this canvas is ABOUT — frozen at the first build, after which the title is only a label.
 *
 * 🔴 RENAMING A CANVAS MUST NEVER CHANGE WHAT IT TEACHES, BECAUSE RENAMING IS A FILING ACTION.
 * The Library lets a learner rename canvases to tidy their shelf. On a topic-first canvas the title
 * IS the topic, so without this a learner reorganising their sessions would silently re-topic what
 * Nemesis teaches them next — "filing is not evidence", violated through the title rather than
 * through any import of the policy runtime. There is no code path to forbid; the channel is the
 * name itself.
 *
 * 🔴 AND THE LEARNER'S INTENT ON A RENAME IS GENUINELY UNKNOWABLE. "Diesel engines" is tidying;
 * "Diesel engine emissions" is a new request; nothing can tell them apart. So the system takes the
 * reading that cannot silently mislead. A learner who wants different material starts a new canvas
 * — one sentence, and it is the front door. A learner who renames and is quietly re-taught has no
 * way to find out it happened.
 *
 * 🔴 THIS ALSO SETTLES WHICH TOPIC AN IDENTITY-VERSION REBUILD USES. It rebuilds the subject the
 * canvas has always been about, under the new keys — not whatever the title happens to say now.
 */
export function frozenTopic(input: { stored: CanvasTerritory | null; title: string }): string {
  const built = input.stored?.topic.trim();
  return built || input.title.trim();
}

/**
 * May this canvas reuse what it already has?
 *
 * 🔴 IT DOES NOT LOOK AT THE TOPIC AT ALL. Once a territory exists it is reused, whatever the canvas
 * is now called — that is what `frozenTopic` means in practice. An earlier version compared the
 * stored topic against the current title and rebuilt when they differed; that turned a Library
 * rename into a new model call and a different subject, which is the defect this shape removes.
 *
 * 🔴 PURE, AND IT TAKES THE STORED TERRITORY RATHER THAN FETCHING IT. Every branch is decidable
 * without a network call, so each miss reason is separately assertable — the property that was
 * missing when a gate "was semantically correct and never executed".
 */
export function territoryReuse(input: {
  stored: CanvasTerritory | null;
  identityVersion: number;
  /**
   * The rules in force now — see `buildRules`. Only consulted for a territory that found nothing.
   *
   * 🔴 ABSENT MEANS "I CANNOT EVALUATE A RULES-STAMPED MARKER", WHICH RESOLVES TO A MISS — it can
   * only CAUSE a rebuild, never suppress one. (The header comment here used to say the opposite; the
   * code and `canvas-territory.test.ts` have always said this, and the topic lane depends on it. A
   * docstring that disagreed with its own function is exactly how a null rule gets inverted by
   * somebody reading only the prose.)
   */
  rules?: string;
  /**
   * The material as it stands now — see `MaterialStamp`. Only consulted for a territory that found
   * nothing, and absent means "do not revisit on a material change", the same conservative reading
   * `rules` gets.
   */
  material?: MaterialStamp;
}): TerritoryReuse {
  const { identityVersion, material, rules, stored } = input;
  if (!stored) return { miss: "never-built", reuse: false };
  if (stored.identityVersion !== identityVersion) return { miss: "identity-version-changed", reuse: false };
  // 🔴 CHECKED BEFORE THE HIT, BECAUSE AN EMPTY TERRITORY WOULD OTHERWISE READ AS A SUCCESSFUL ONE.
  // The identity check comes first on purpose: rules that moved matter less than keys that no longer
  // converge, and a version rebuild should not be pre-empted by a stale empty marker.
  //
  // 🔴 THE COMPARISON IS `needsReprocess`, NOT A `===` — and it is the same call the mechanism lane
  // and the parse lane make. What used to be "are the rules the string they were?" is now "is the
  // stored answer the answer the current rules would give over the current bytes?", which is a
  // strictly wider question and the one the owner asked for.
  if (stored.emptyUnder) {
    // 🔴🔴 A CALLER THAT TRACKS NO RULES CANNOT HONOUR A RULES-STAMPED MARKER, AND THIS LINE IS
    // PRE-EXISTING BEHAVIOUR PRESERVED ON PURPOSE. `topicTerritory` passes no `rules` at all, and it
    // has always relied on an empty grounded marker resolving to a MISS here so the topic gets asked
    // again. Letting `needsReprocess` see `rulesetVersion: null` would read it as "this consumer does
    // not track rules, so nothing is known to have moved" — perfectly correct as a SPEND rule, and
    // catastrophic here: the marker would stand, and a topic canvas that once hit an empty grounded
    // build would open blank on every open, for ever. That is the front-door bug this file already
    // recovered from once.
    //
    // The two directions are not in conflict, they answer different questions. Unknown MATERIAL is a
    // spend question and errs toward not paying. An unevaluatable MARKER is a learner question and
    // errs toward rebuilding. This is the second, so it is decided here rather than inside a
    // predicate that cannot tell "I do not track this" from "I could not compute it".
    //
    // No `reason`: nothing moved, we simply cannot check. `reason` is present exactly when the miss
    // came from `needsReprocess`, and inventing `ruleset-version-changed` here would report a change
    // that did not happen.
    if (!rules) return { miss: "empty-answer-superseded", reuse: false };

    const verdict = markerStands({ material, over: stored.emptyOver, rules, under: stored.emptyUnder });
    return verdict.reprocess
      ? { miss: "empty-answer-superseded", reason: verdict.reason, reuse: false }
      : { reuse: "known-empty" };
  }
  return { objects: stored.objects, reuse: true };
}

/**
 * What a GROUNDED territory was built over — the material itself, named durably.
 *
 * 🔴 THE DURABLE IDS, SORTED, NEVER THE TITLE. A document canvas's subject is the document, and
 * `librarySourceId` is the same string for every canvas that holds it. Sorting means the order the
 * learner happened to attach two files in does not read as a different subject.
 */
export function materialSubject(librarySourceIds: readonly string[]): string {
  return `sources:${[...librarySourceIds].sort().join(",")}`;
}

/**
 * A stored territory, or null when there is nothing usable to replay.
 *
 * 🔴 VALIDATED, NEVER TRUSTED. This comes out of a jsonb column, which can hold anything — including
 * something written by an older shape of this code. Every failure returns null, and null means
 * "build one", so a corrupt cache costs a rebuild rather than a blank canvas.
 *
 * 🔴 AN EMPTY `objects` IS A MISS **UNLESS IT SAYS WHY**. An empty list on its own is the shape a
 * corrupt or older row would have, and replaying it would leave the learner with a canvas that has
 * nothing to ask, for ever, because the marker would keep insisting it was built. An empty list
 * carrying `emptyUnder` is a different thing entirely: a deliberate record that a completed build
 * found nothing, stamped with the rules it found nothing under. The presence of the stamp is what
 * separates "we recorded an answer" from "this row is broken", and it is why the empty case could
 * not simply be allowed through.
 */
/** A material stamp out of jsonb, or null. BOTH halves or neither — a stamp missing one dimension
 *  would silently answer "unchanged" for the dimension it lost. */
function readMaterialStamp(value: unknown): MaterialStamp | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { contentHash?: unknown; parserVersion?: unknown };
  if (typeof raw.contentHash !== "string" || !raw.contentHash) return null;
  if (typeof raw.parserVersion !== "string" || !raw.parserVersion) return null;
  return { contentHash: raw.contentHash, parserVersion: raw.parserVersion };
}

export function readTerritory(value: unknown): CanvasTerritory | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as {
    topic?: unknown;
    identityVersion?: unknown;
    objects?: unknown;
    emptyUnder?: unknown;
    emptyOver?: unknown;
    mechanismsUnder?: unknown;
    mechanismsOver?: unknown;
  };
  if (typeof row.topic !== "string" || !row.topic.trim()) return null;
  if (typeof row.identityVersion !== "number" || !Number.isFinite(row.identityVersion)) return null;
  if (!Array.isArray(row.objects)) return null;
  const emptyUnder = typeof row.emptyUnder === "string" && row.emptyUnder.trim() ? row.emptyUnder : null;
  if (row.objects.length === 0 && !emptyUnder) return null;
  // 🔴 A NON-EMPTY LIST NEVER CARRIES THE STAMP. Both together would be a row claiming to be both a
  // territory and the absence of one, and every consumer would have to pick which half to believe.
  if (row.objects.length > 0 && emptyUnder) return null;
  const mechanismsUnder =
    typeof row.mechanismsUnder === "string" && row.mechanismsUnder.trim() ? row.mechanismsUnder : null;
  // 🔴 A MALFORMED MATERIAL STAMP READS AS ABSENT, WHICH IS THE SAFE DIRECTION AND THE OPPOSITE OF
  // WHAT IT LOOKS LIKE. Absent means unknown, and `needsReprocess` lets an unknown stored dimension
  // trigger a rebuild when the current one is known — so a stamp that did not survive storage costs
  // one more read, never a wrongly-honoured "we already looked".
  const emptyOver = readMaterialStamp(row.emptyOver);
  const mechanismsOver = readMaterialStamp(row.mechanismsOver);
  return {
    ...(emptyUnder ? { emptyUnder } : {}),
    ...(emptyOver ? { emptyOver } : {}),
    ...(mechanismsUnder ? { mechanismsUnder } : {}),
    ...(mechanismsOver ? { mechanismsOver } : {}),
    identityVersion: row.identityVersion,
    objects: row.objects as KnowledgeObject[],
    topic: row.topic,
  };
}
