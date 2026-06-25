// Typo "assume & answer" — the SAFE escape from the fabrication guard's clinical dead-end.
//
// The fabrication guard (fabrication.ts) refuses any drug the user LITERALLY named that is absent from
// the retrieved evidence — which, by design, treats a TYPO of a real drug ("tesamorlin") exactly like a
// FAKE ("florizagliflozin"), and dumps the patronizing safety_fallback. Owner direction (2026-06-22):
// behave like ChatGPT/Claude — assume the real drug, STATE the assumption, and answer — WITHOUT
// re-opening the made-up-drug hole.
//
// WHY THIS IS SAFE (the linchpin experiment, scripts/diag/espell-typo-vs-fake-probe.ts, proved a naive
// spell-corrector is BOTH unreliable AND dangerous — it laundered the fake "tirzepamide" into the real
// "tirzepatide"). So we do NOT free-text spell-correct. A correction is accepted ONLY when ALL three hold:
//   (1) AUTHORITATIVE — the corrected name is the entity-table canonical (search_entities), i.e. a real
//       drug in our corpus vocabulary, NOT an arbitrary edit;
//   (2) GENUINE SLIP — OSA edit distance ≤ 1 from the typed token (one insert/delete/substitute, or one
//       adjacent transposition: "metfromin"→"metformin"). A class-plausible fake is ≥2 edits from any real
//       canonical ("maglutide"→"semaglutide" = 2, "gliflozin"→"dapagliflozin" = far) → refused;
//   (3) GROUNDED — the corrected name actually appears in the retrieved evidence, so the answer stays cited.
//   AND every absent mention must satisfy this — a real fake co-mentioned with a typo still refuses the whole
//   query (mirrors the guard's "every named drug must be supported").
//
// Residual (owner-accepted, transparent): a fake that is ONE edit from a real drug AND whose real neighbor
// is in the evidence (e.g. "BPC-158"→"BPC-157") is treated as a typo and answered AS the real drug, with the
// assumption stated. This is the deliberate ChatGPT-style tradeoff — the assumption is always shown, never
// silent — and is bounded to edit-distance 1, never the class-plausible fakes the guard's probe targets.
//
// PURE (only RetrievedChunk + DetectedEntity types) so the unit suite can adversarially test it offline.

import type { RetrievedChunk } from "./citation.ts";
import type { DetectedEntity } from "../../../packages/shared/src/answer.ts";

const MAX_EDITS = 1;
const MIN_TOKEN_LEN = 3; // mirror the fabrication guard: ignore ultra-short tokens.

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Word-boundary presence — identical semantics to fabrication.ts namedIn (a fake substring of a real
 *  sibling does NOT count: "maglutide" ⊄ "semaglutide"). */
function namedIn(haystack: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`).test(haystack);
}

/**
 * Optimal String Alignment distance ≤ max? OSA = Levenshtein + adjacent transposition as a single edit
 * (so "metfromin"→"metformin" is distance 1). Bounded — only needs a yes/no within `max`.
 */
export function osaWithin(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  const n = a.length, m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return false; // whole row already exceeds the bound → prune
  }
  return d[n][m] <= max;
}

export interface TypoCorrection {
  /** The token the user typed (verbatim). */
  mention: string;
  /** The authoritative real-drug name we will assume + state ("Assuming you mean …"). */
  corrected: string;
}

/**
 * Decide whether a fired fabrication guard is actually a recoverable set of TYPOS. Returns the corrections
 * to "assume & answer" — but ONLY if EVERY mention the guard found absent is confidently correctable. If any
 * absent mention is a genuine fake (no authoritative ≤1-edit canonical present in the evidence), returns
 * null → the caller keeps the conservative refusal. Never invents a drug; never trusts a >1-edit "match".
 */
export function findTypoCorrections(
  mentions: string[],
  entities: DetectedEntity[],
  pool: RetrievedChunk[],
): TypoCorrection[] | null {
  const tokens = [...new Set(mentions.map(norm))].filter((t) => t.length >= MIN_TOKEN_LEN);
  if (tokens.length === 0 || pool.length === 0) return null;

  const haystacks = pool.map((c) => norm(`${c.title ?? ""} ${c.chunk_text ?? ""}`));
  const canonicalOf = new Map<string, string>();
  for (const e of entities) {
    if (e.canonical_name) canonicalOf.set(norm(e.mention), e.canonical_name);
  }

  const corrections: TypoCorrection[] = [];
  for (const t of tokens) {
    if (haystacks.some((h) => namedIn(h, t))) continue; // literal present → not an absent mention
    const canonical = canonicalOf.get(t); // authoritative entity-table resolution (real drug) or undefined
    if (!canonical) return null; // absent + unresolved → genuine fake / unknown → refuse the whole query
    const c = norm(canonical);
    if (c === t) return null; // resolved to itself yet absent from evidence → no real correction
    if (!osaWithin(t, c, MAX_EDITS)) return null; // >1 edit → class-plausible fake / wrong → refuse
    if (!haystacks.some((h) => namedIn(h, c))) return null; // corrected drug not in evidence → can't ground
    corrections.push({ mention: t, corrected: canonical });
  }
  return corrections.length > 0 ? corrections : null;
}

/** "Assuming you mean tesamorelin" / "Assuming you mean tesamorelin and metformin" — the stated assumption. */
export function assumptionNote(corrections: TypoCorrection[]): string {
  const names = [...new Set(corrections.map((c) => c.corrected))];
  if (names.length === 0) return "";
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Assuming you mean ${list}`;
}
