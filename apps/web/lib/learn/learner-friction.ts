// Where the LANGUAGE got in the way, as distinct from where the knowledge did.
//
// 🔴🔴 FRICTION IS NOT EVIDENCE, AND KEEPING THEM APART IS THE WHOLE VALUE OF THIS FILE. A learner
// who stops to ask what a word means has not attempted anything and has contradicted nothing — they
// have told us the wording is in the way. Filing that as a failed attempt would move their status
// toward "does not know this", which is a durable false claim about a person built out of a moment
// of ordinary curiosity. `learner_lookups` is a separate table for the same reason, and
// `projectLearnerState` never sees it.
//
// 🔴 THE OWNER ASKED FOR BOTH HALVES IN ONE SENTENCE: *"I want users to be able to highlight a word
// to define or explain and have nemesis keep track of that to provide the definition in the
// future."* The reuse half and the friction half are the same rows — a glossary that disagreed with
// the friction count would be two sources of truth about one event.
//
// 🔴 REPEATED, NOT MERELY PRESENT. Looking a term up once is curiosity and says almost nothing;
// needing it again, after having been told, is the signal — it means the explanation did not land or
// the term is load-bearing and unfamiliar. So the threshold is a SECOND lookup, and everything below
// it is deliberately silent rather than weakly positive.
//
// PURE. The rows come from the store; every decision here is a fold over them.

import { glossaryKey } from "./vocabulary-lookup";

/** One time the learner stopped and asked what something meant. */
export interface TermLookup {
  /** Normalised — `glossaryKey`. The join key the store also writes. */
  term: string;
  /** What Nemesis gave back, or null when the lookup produced no answer. */
  definition: string | null;
  occurredAt: string;
}

/**
 * A term needed more than once is a term in the way.
 *
 * 🔴 TWO, AND NOT A TUNED NUMBER. The first lookup is the learner meeting a word; the second is the
 * same word beating them again after they were told. Anything higher would wait for a learner to
 * struggle three times before doing anything about it, and anything lower would treat every
 * curiosity as a difficulty.
 */
const REPEATED = 2;

/**
 * What the learner has had to look up, and how often.
 *
 * 🔴 COUNTED FROM EVENTS RATHER THAN READ FROM A COUNTER, which is why `learner_lookups` is
 * append-only. A counter column can drift from the events it claims to summarise, and nothing in
 * the system would ever compare the two.
 */
export function lookupCounts(lookups: readonly TermLookup[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lookup of lookups) {
    const key = glossaryKey(lookup.term);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The definition this learner was last given for a term, if they were ever given one.
 *
 * 🔴 THE MOST RECENT ONE WINS, AND NULLS DO NOT COUNT AS AN ANSWER. A row with no definition records
 * that they asked and we did not answer — reusing that as "the definition" would show a learner a
 * blank where they had previously been told something perfectly good.
 */
export function knownDefinition(
  lookups: readonly TermLookup[],
  term: string,
): { definition: string; occurredAt: string } | null {
  const key = glossaryKey(term);
  if (!key) return null;
  let best: { definition: string; occurredAt: string } | null = null;
  for (const lookup of lookups) {
    if (glossaryKey(lookup.term) !== key || lookup.definition === null) continue;
    if (!best || lookup.occurredAt > best.occurredAt) {
      best = { definition: lookup.definition, occurredAt: lookup.occurredAt };
    }
  }
  return best;
}

/**
 * Which of these terms this learner keeps needing.
 *
 * 🔴 THE CALLER SUPPLIES THE TERMS, because what counts as "this objective's vocabulary" is a
 * question about the knowledge — `objective-prerequisites.ts` already answers it from the role
 * fields the extractor emitted, and answering it a second time here from prose would be the
 * scanning both files refuse.
 */
export function termsInTheWay(
  lookups: readonly TermLookup[],
  terms: readonly string[],
): string[] {
  const counts = lookupCounts(lookups);
  const seen = new Set<string>();
  const struggling: string[] = [];
  for (const term of terms) {
    const key = glossaryKey(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if ((counts.get(key) ?? 0) >= REPEATED) struggling.push(key);
  }
  return struggling;
}

/**
 * Is the learner's difficulty here about the WORDS rather than the idea?
 *
 * 🔴 THE ONE QUESTION THE SCAFFOLDING SLICE WILL ASK, AND THE ONE THE SELECTOR ASKS TOO — for
 * different purposes and with different answers, which is why this returns the terms rather than a
 * verdict. "Simplify the language" and "this is worth doing next" are not the same decision, and a
 * boolean shared between them would force one of them to be wrong.
 */
export function terminologyFriction(input: {
  lookups: readonly TermLookup[];
  terms: readonly string[];
}): { struggling: readonly string[]; present: boolean } {
  const struggling = termsInTheWay(input.lookups, input.terms);
  return { present: struggling.length > 0, struggling };
}
