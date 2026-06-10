// PRISMA-overclaim guard (honesty cornerstone, plan §2). PURE, deterministic — the same
// discipline as the safety-layer detectViolations: code, not intent, prevents the claim.
// Applied ONLY to rigorous-mode method/inclusion/methods-note copy (Phase 5), so it cannot
// mis-flag a body sentence that cites an external systematic review or meta-analysis.

export const FORBIDDEN_PHRASE_LABELS = {
  systematic_review: "claims to be a systematic review",
  scoping_review: "claims to be a scoping review",
  prisma: "claims PRISMA compliance / flow",
  records_identified: 'uses PRISMA "records identified" phrasing',
} as const;

interface ForbiddenRule {
  key: keyof typeof FORBIDDEN_PHRASE_LABELS;
  re: RegExp;
}

const RULES: ForbiddenRule[] = [
  { key: "systematic_review", re: /\bsystematic\s+review\b/i },
  { key: "scoping_review", re: /\bscoping\s+review\b/i },
  { key: "prisma", re: /\bprisma\b/i }, // covers "PRISMA-compliant", "PRISMA flow diagram", bare "PRISMA"
  { key: "records_identified", re: /\brecords?\s+identified\b/i },
];

/**
 * Returns the human labels of every banned phrase found. Empty array = clean.
 *
 * SCOPE CONTRACT: pass ONLY rigorous-mode method/inclusion/methods-note copy — never general
 * report body text. The body legitimately cites external systematic reviews / PRISMA-compliant
 * studies; scanning it here would falsely flag those. Body text is guarded separately by the
 * safety-layer detectViolations, not by this function.
 */
export function detectForbiddenPhrases(text: string): string[] {
  const out: string[] = [];
  for (const rule of RULES) {
    if (rule.re.test(text)) out.push(FORBIDDEN_PHRASE_LABELS[rule.key]);
  }
  return out;
}
