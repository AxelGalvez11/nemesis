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

import type { KnowledgeObject } from "./knowledge-types";

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
  /** A previous build found nothing, but the rules have changed since — worth one more attempt. */
  | "empty-under-older-rules";

export type TerritoryReuse =
  | { reuse: true; objects: readonly KnowledgeObject[] }
  | { reuse: false; miss: TerritoryMiss }
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
   * Absent means "do not revisit empty builds", which is the conservative reading for a caller that
   * does not track rules: it can only suppress a rebuild, never cause one.
   */
  rules?: string;
}): TerritoryReuse {
  const { identityVersion, rules, stored } = input;
  if (!stored) return { miss: "never-built", reuse: false };
  if (stored.identityVersion !== identityVersion) return { miss: "identity-version-changed", reuse: false };
  // 🔴 CHECKED BEFORE THE HIT, BECAUSE AN EMPTY TERRITORY WOULD OTHERWISE READ AS A SUCCESSFUL ONE.
  // The identity check comes first on purpose: rules that moved matter less than keys that no longer
  // converge, and a version rebuild should not be pre-empted by a stale empty marker.
  if (stored.emptyUnder) {
    return stored.emptyUnder === rules
      ? { reuse: "known-empty" }
      : { miss: "empty-under-older-rules", reuse: false };
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
export function readTerritory(value: unknown): CanvasTerritory | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as { topic?: unknown; identityVersion?: unknown; objects?: unknown; emptyUnder?: unknown };
  if (typeof row.topic !== "string" || !row.topic.trim()) return null;
  if (typeof row.identityVersion !== "number" || !Number.isFinite(row.identityVersion)) return null;
  if (!Array.isArray(row.objects)) return null;
  const emptyUnder = typeof row.emptyUnder === "string" && row.emptyUnder.trim() ? row.emptyUnder : null;
  if (row.objects.length === 0 && !emptyUnder) return null;
  // 🔴 A NON-EMPTY LIST NEVER CARRIES THE STAMP. Both together would be a row claiming to be both a
  // territory and the absence of one, and every consumer would have to pick which half to believe.
  if (row.objects.length > 0 && emptyUnder) return null;
  return {
    ...(emptyUnder ? { emptyUnder } : {}),
    identityVersion: row.identityVersion,
    objects: row.objects as KnowledgeObject[],
    topic: row.topic,
  };
}
