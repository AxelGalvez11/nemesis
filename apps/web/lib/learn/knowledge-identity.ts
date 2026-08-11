// When two pieces of knowledge, met in two different documents, are the same piece of knowledge.
//
// 🔴 THIS IS WHERE CROSS-SESSION LEARNING SILENTLY DIES, WHICH IS WHY IT IS ITS OWN FILE WITH ITS
// OWN CALIBRATION. The whole point of a global learner state is that a canvas built on Tuesday's
// lecture and a canvas built on Friday's revision sheet can tell they are teaching the same thing.
// If the key is derived from anything belonging to the DOCUMENT — the source id, the block id, the
// excerpt id, the position on the page — then the same fact met twice mints two keys, the second
// canvas finds no prior evidence, and it teaches from scratch. Nothing errors. The failure looks
// exactly like "the teaching policy isn't adapting", and it would be debugged in the wrong file
// for a week.
//
// So an identity key is computed from the CONTENT and from nothing else.
//
// 🔴 CONSERVATIVE ON PURPOSE: A MISSED MERGE IS RECOVERABLE, A FALSE MERGE IS NOT. Two documents
// that define stomata in different words will mint two keys and the learner will be asked about
// both. That is a missed convergence — mildly wasteful, fixable later by real entity resolution,
// and it never tells the learner anything untrue. Merging them by keying on the cue alone would
// also merge "losartan → Cozaar" with "losartan → an angiotensin receptor blocker", which are
// genuinely different knowledge, and the learner would be credited with knowing something they
// have never been asked. The architecture stays capable of convergence (see the KnowledgeObject /
// occurrence split); it does not guess at it now.

import type { KnowledgeObject, KnowledgeType } from "./knowledge-types";

/**
 * Put text into the form the key is computed from.
 *
 * 🔴 CASE AND SURROUNDING PUNCTUATION ARE FORMATTING; ACCENTS ARE NOT. Lowercasing and collapsing
 * whitespace is safe in every field — a heading in title case and the same words in a sentence are
 * the same words. Stripping diacritics is NOT: "resumé" and "resume" are two different words, and
 * for anyone learning a language the accent frequently IS the thing being learned. A normaliser
 * that folded them would quietly report mastery of a distinction the learner never made.
 */
/** What a source that never named its columns contributes to a key. */
export const UNSTATED_RELATION = "unstated";

/**
 * The relationship a two-column grid declares about itself, taken from its own header cells.
 *
 * 🔴 DERIVED, NEVER UNDERSTOOD, AND THE DISTINCTION IS THE FIELD-AGNOSTIC RULE. This returns
 * whatever the document wrote — `generic|brand`, `term|definition`, `case|holding`, `part|part no.`
 * — normalised and sorted so it does not depend on column order. Nothing here knows what any of
 * those words MEAN, and it must not: a mapping from "brand" to a notion of trade names is exactly
 * the subject-matter knowledge that never generalises past one field.
 *
 * Null when the grid stated no header row, which is a real and common case — a PDF table
 * reconstructed from ruled lines only reports `headerRows: 1` when the first row was complete.
 */
export function relationKindFromHeader(header: readonly string[] | undefined): string | null {
  if (!header || header.length < 2) return null;
  const cells = header.slice(0, 2).map((cell) => normalizeForIdentity(cell)).filter(Boolean);
  if (cells.length < 2) return null;
  return cells.sort().join("|");
}

export function normalizeForIdentity(text: string): string {
  return text
    // Unicode normalisation only — the composed and decomposed spellings of the same accented
    // letter must not be two different pieces of knowledge.
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    // Leading and trailing punctuation is formatting the document happened to use. Punctuation
    // INSIDE the text is left alone: "she said, run" and "she said run" may differ, and in a
    // formula or a citation the punctuation is load-bearing.
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .trim();
}

/**
 * A 64-bit FNV-1a, as 16 hex characters.
 *
 * Synchronous and dependency-free because this runs in the browser and on the server, and
 * `crypto.subtle` is async in one of them — an async identity function would force every caller
 * that merely wants to compare two objects to become async too.
 *
 * A hash rather than the text itself because a definition can be a paragraph, and a key that long
 * is a poor database index and an unreadable log line. It is not a security boundary: nothing is
 * being hidden, and nothing is trusted because of it.
 */
function fnv1a64(text: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * The canonical string a key is computed from. Exported so a disagreement about why two objects
 * did or did not merge can be answered by looking, rather than by guessing at a hash.
 */
export function identityBasis(
  object: Pick<KnowledgeObject, "type" | "statement" | "pair" | "relationKind">,
): string {
  if (object.type === "association" && object.pair) {
    const left = normalizeForIdentity(object.pair.left);
    const right = normalizeForIdentity(object.pair.right);
    // 🔴 SORTED, SO THE KEY DOES NOT DEPEND ON WHICH SIDE THE DOCUMENT LED WITH. A glossary lists
    // term then definition; a quiz sheet lists the answer then the term. Same knowledge. If order
    // mattered, the same fact from two documents would mint two keys and cross-session adaptation
    // would fail on the most ordinary case there is.
    //
    // Which side is the CUE is a property of the objective, not of the knowledge — "produce the
    // brand from the generic" and "produce the generic from the brand" are two capabilities over
    // one fact, and `AssociationDirection` is where that distinction lives.
    const [a, b] = [left, right].sort();
    // 🔴 THE RELATIONSHIP IS PART OF THE IDENTITY. Identical strings can stand in different
    // relationships, and without this a glossary's `X — its definition` and a parts list's
    // `X — its supplier` would be one object, crediting a learner with knowledge never tested.
    //
    // `UNSTATED` when the source did not say. It is deliberately NOT treated as a wildcard that
    // matches everything: a headerless table converging with a headed one would be a guess about
    // what its columns meant, and a false merge is the failure this whole file exists to avoid.
    // The cost — two such tables not converging — is a missed merge, which is recoverable.
    return `association|${object.relationKind ?? UNSTATED_RELATION}|${a}|${b}`;
  }
  // Every other type keys on its statement until it has a payload of its own. Deliberately not a
  // ten-way guess written before the interactions that use those payloads exist.
  return `${object.type}|${normalizeForIdentity(object.statement)}`;
}

/**
 * The stable identity of one piece of knowledge, independent of which document it was met in.
 *
 * 🔴 NOT SCOPED TO A COURSE OR A USER, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. Scoping
 * would make "Article 3" in two different modules two different objects, which is sometimes right
 * — but it would also stop a learner's Tuesday lecture and Friday revision sheet from converging,
 * which is the entire behaviour being built. Global first; if real collisions turn up, the fix is
 * to add a scope to the key, and the tests that pin these two cases will say what broke.
 */
export function knowledgeIdentityKey(
  object: Pick<KnowledgeObject, "type" | "statement" | "pair" | "relationKind">,
): string {
  return `${object.type}:${fnv1a64(identityBasis(object))}`;
}

/** Whether two objects are the same knowledge met twice. */
export function isSameKnowledge(
  a: Pick<KnowledgeObject, "type" | "statement" | "pair" | "relationKind">,
  b: Pick<KnowledgeObject, "type" | "statement" | "pair" | "relationKind">,
): boolean {
  return knowledgeIdentityKey(a) === knowledgeIdentityKey(b);
}

/** The types whose identity is genuinely computed from a payload rather than from a sentence.
 *
 *  A statement-keyed object still gets a stable key, but two authors who word the same rule
 *  differently will not converge — so a caller building on convergence should know which kind it
 *  is holding rather than discovering it from behaviour. */
export function identityIsStructural(type: KnowledgeType): boolean {
  return type === "association";
}
