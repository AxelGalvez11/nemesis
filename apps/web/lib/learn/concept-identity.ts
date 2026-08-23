// The identity of a CANONICAL CONCEPT — an idea a curriculum can point at, across canvases and
// across learners.
//
// 🔴🔴 THIS IS NOT A SECOND KNOWLEDGE MODEL, AND THE DIFFERENCE IS THE WHOLE REASON IT MAY EXIST.
//
//     A KnowledgeObject is a CLAIM.       "ACE inhibitors raise serum potassium."
//     A CanonicalConcept is an ENTITY.    "ACE inhibitors."
//
// `knowledgeIdentityKey` owns claim identity and has owned it since the extractor existed. It is
// untouched by this file, nothing here computes one, and the registries this file serves hold no
// claims at all — every claim a learner ever meets is still minted by one of the two producers
// `docs/canvas-interaction-model.md` fixes the count at. The owner's hardest constraint on this
// work was *"do not create duplicate concepts/objectives if the current knowledge infrastructure
// already solves those identities"*, and the honest answer is that it never solved this one:
//
//     canvas-model.ts, on CanvasConcept:
//     "Nemesis has no global concept entity (we checked — no table, no id, no field anywhere), so
//      a canvas carries its own short list."
//
// 🔴 AND THAT COMMENT'S NEXT SENTENCE — "Deliberately not a new global taxonomy" — IS NOT A RULING
// AGAINST THIS FILE. It declines a taxonomy *for the diagnosis's own use*: to say which ideas are
// blocking one learner on one canvas, a canvas-local list is enough. A curriculum needs the thing
// the diagnosis never did — an id that means the same thing next week, on a different canvas, for
// a different person. `CanvasConcept.id` cannot be that: its ids come out of a lesson-generation
// model's JSON and are meaningless outside the canvas that minted them.
//
// 🔴 THE REGISTRY CARRIES NO LEARNER STATE, EVER. No progress, no mastery, no "seen". A concept row
// is a fact about an idea; what a person has shown about it lives in learner evidence and is
// projected by `projectLearnerState`. Putting the two in one row is the defect `canvas-objectives.ts`
// names as `minimap_progress` — a second copy of the truth that can disagree with the first.
//
// PURE. No React, no I/O, no model call.

import { causalNodeKey, fnv1a64, normalizeForIdentity } from "./knowledge-identity";

/**
 * The version of the concept-identity ALGORITHM, carried inside every key it produces.
 *
 * 🔴 INSIDE THE KEY, NOT BESIDE IT, for the reason `KNOWLEDGE_IDENTITY_VERSION` records: a key
 * computed under old rules and one computed under new rules are both just hex, and nothing can tell
 * them apart afterwards. Curriculum nodes are stored against these keys, so the key is what has to
 * say which rules made it. Bump this whenever `conceptIdentityBasis` changes what it returns for
 * the same input.
 *
 * 🔴 IT IS ITS OWN NUMBER, NOT A COPY OF THE KNOWLEDGE ONE. The two algorithms change for unrelated
 * reasons; sharing a counter would force a corpus rebuild every time an extractor rule moved.
 */
export const CONCEPT_IDENTITY_VERSION = 1;

/**
 * How a concept is named on the way in.
 *
 * `domain` is required and is the reason this file exists in the shape it does — see
 * `conceptIdentityBasis`. `subdomain` is optional because most concepts do not need one and an
 * invented one would be a distinction nobody made.
 */
export interface ConceptNaming {
  readonly domain: string;
  readonly label: string;
  readonly subdomain?: string;
}

/**
 * The canonical string a concept key is computed from. Exported for the same reason
 * `identityBasis` is: a disagreement about why two concepts did or did not merge should be
 * answerable by looking, rather than by guessing at a hash.
 *
 * 🔴🔴 SCOPED BY DOMAIN, AND THIS IS THE CORRECTION THAT MATTERS MOST IN THIS FILE.
 *
 * An earlier draft keyed a concept on its normalised label alone, so one word named one concept for
 * every discipline at once. That is wrong on the most ordinary vocabulary there is:
 *
 *     "balance"       accounting · chemistry · physiology · mechanical engineering
 *     "moment"        physics · statistics · history
 *     "consideration" contract law · ordinary English
 *     "stress"        materials · psychology · phonology
 *     "argument"      logic · rhetoric · mathematics · programming
 *     "root"          botany · algebra · linguistics · dentistry
 *
 * Unscoped, whichever field was ingested first captures the word permanently and every other
 * field's learner resolves to the wrong concept — a cross-field false join arriving *by
 * construction*, not by accident, and invisible because both sides look like valid keys.
 *
 * It is also a direct failure of CLAUDE.md's design test: *would this work for a law student and a
 * mechanical engineering student?* An unscoped "consideration" cannot serve both. `knowledge-identity.ts`
 * had already written the remedy for its own case — *"if real collisions turn up, the fix is to add
 * a scope to the key"* — and here the collisions are not hypothetical, they are the first week.
 *
 * 🔴 DOMAIN, NOT CURRICULUM. Scoping to a curriculum would be tighter still and is wrong: two
 * chemistry curricula that both teach titration must land on ONE concept, or a curriculum cannot
 * reuse anything and the registry becomes a pile of near-duplicates — the exact failure
 * `canvas-territory.ts` measured in production (2 → 26 → 50 knowledge objects across three opens of
 * one topic, every identity key distinct). Domain is the widest scope that keeps homonyms apart.
 */
export function conceptIdentityBasis(naming: ConceptNaming): string {
  const domain = normalizeForIdentity(naming.domain);
  const label = normalizeForIdentity(naming.label);
  const subdomain = naming.subdomain ? normalizeForIdentity(naming.subdomain) : "";
  // 🔴 JSON, NOT A JOINED STRING, AND THE FIRST DRAFT OF THIS LINE IS WHY.
  //
  // It was `${domain}<sep>${subdomain}<sep>${label}` with a NUL byte as the separator — invisible in
  // every editor, and Postgres refuses \u0000 in a `text` column, so the one string this module
  // exports FOR HUMANS TO READ could not be logged or stored the moment anyone tried.
  //
  // Any single-character separator is wrong here anyway. `normalizeForIdentity` strips punctuation
  // only at the ENDS of a part, so a label legitimately contains spaces, pipes, colons and dashes —
  // `{domain:"chemistry", label:"a|b"}` and `{domain:"chemistry", subdomain:"a", label:"b"}` would
  // collide under `|`, and picking a rarer character only moves the collision somewhere less
  // testable. JSON delimits by construction, is printable, and is readable in a log line, which is
  // the entire reason this function is exported rather than inlined.
  return JSON.stringify([domain, subdomain, label]);
}

/**
 * The stable identity of one canonical concept.
 *
 * 🔴 A DIFFERENT NAMESPACE FROM CLAIM IDENTITY, DELIBERATELY AND VISIBLY. The prefix is `concept:`
 * where `knowledgeIdentityKey` writes the knowledge type (`causal:`, `association:`, …), so the two
 * key spaces cannot be confused in a log, a column, or a mistaken join. A row holding one where the
 * other belongs is readable as wrong at a glance rather than after a query.
 */
export function conceptIdentityKey(naming: ConceptNaming): string {
  return `concept:v${CONCEPT_IDENTITY_VERSION}:${fnv1a64(conceptIdentityBasis(naming))}`;
}

/**
 * The key an ALIAS is looked up by — the join between a canonical concept's surface forms and the
 * text a canvas actually holds.
 *
 * 🔴🔴 IT IS `causalNodeKey`, RE-EXPORTED UNDER A NAME THAT SAYS WHY, AND IT MUST STAY THAT WAY.
 * `causalNodeKey` is already the one key shared by causal edge endpoints, association pair sides,
 * and the `requires`/`establishes` terms `objective-prerequisites.ts` joins on. An alias reduced by
 * the same function joins to all three with no downstream change whatsoever. A private normaliser
 * here — folding punctuation a little differently, say — would produce keys that agree with nothing
 * else in the system, and the disagreement would be silent: a concept that fails to join looks
 * exactly like a canvas that does not hold it.
 *
 * 🔴🔴 WHICH MEANS `normalizeForIdentity` IS NOW LOAD-BEARING IN A THIRD PLACE AND MUST NOT CHANGE.
 * It is called from inside `identityBasis`, so altering it re-keys every knowledge object ever
 * minted and orphans every `learner_evidence` row pointing at one. It was already true before this
 * file; this file makes a second corpus depend on it. If it ever genuinely must change, that is a
 * versioned migration of both key spaces, not an edit.
 *
 * 🔴🔴 AND IT DOES NOT JOIN TO `glossaryKey`. `vocabulary-lookup.ts` keys stored definitions with
 * `term.trim().toLowerCase().replace(NON_WORD, " ")` — which replaces punctuation INSIDE the string
 * — while `normalizeForIdentity` strips it only at the ends. So:
 *
 *     "acid-base"  →  glossaryKey            "acid base"
 *     "acid-base"  →  conceptSurfaceKey      "acid-base"
 *
 * These are two different term spaces that happen to hold similar-looking strings. Neither may be
 * substituted for the other, and a lookup that "nearly works" across them is worse than one that
 * plainly does not, because it succeeds on the words without punctuation and fails on the ones with.
 */
export function conceptSurfaceKey(surface: string): string {
  return causalNodeKey(surface);
}

/**
 * Every distinct surface key a concept should be recognised by, from its label and aliases.
 *
 * 🔴 EMPTY SURFACES ARE DROPPED RATHER THAN STORED. A blank key would match every other blank key,
 * turning any unparsed alias into a join with every other unparsed alias — the same failure
 * `prerequisiteMap` guards against by dropping empty terms.
 *
 * Deterministic order, so a row rebuilt from the same input is byte-identical and a diff of the
 * corpus shows real changes only.
 */
export function conceptSurfaceKeys(naming: { label: string; aliases?: readonly string[] }): readonly string[] {
  const keys = new Set<string>();
  for (const surface of [naming.label, ...(naming.aliases ?? [])]) {
    const key = conceptSurfaceKey(surface);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}
