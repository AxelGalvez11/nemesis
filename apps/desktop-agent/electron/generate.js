// The moat: turn raw lecture text into a study guide + PHARMACY-GRADE flashcards. The card discipline is
// the whole point — clinically-anchored, one concept per card, application-level (never "what is X").
// This module is pure logic (no Electron) so it can be unit-tested headless via test/core.mjs.

const { generateJson } = require("./llm.js");

const SYSTEM = [
  "You are a pharmacy educator creating exam-grade study material for a doctor-of-pharmacy (PharmD) student.",
  "You are given the raw text of a lecture (slides/notes/PDF). Produce a tight study guide and a set of",
  "clinically-anchored flashcards.",
  "",
  "CARD RULES (non-negotiable — this is what separates real pharmacy cards from generic ones):",
  "- ONE concept per card. Application-level, not definitional. NEVER write 'What is drug X?'.",
  "- Anchor to clinical reasoning: mechanism of action, indication, contraindications, black-box warnings,",
  "  monitoring parameters, key drug interactions, counseling points, renal/hepatic dose adjustments,",
  "  adverse effects, and NAPLEX-style application where relevant.",
  "- Prefer cause->effect and case-style prompts, e.g. 'A patient on lisinopril develops a dry cough — what",
  "  is the mechanism and what class may be substituted?' -> 'Bradykinin accumulation from ACE inhibition;",
  "  switch to an ARB if appropriate.'",
  "- Every card's answer must be supported by the lecture text you were given. Do NOT invent facts,",
  "  numbers, or drugs that are not in the source. If the lecture is thin, make fewer cards, not made-up ones.",
  "- Keep fronts and backs concise. No preamble in the answer.",
  "",
  "Return ONLY a JSON object with this exact shape:",
  '{',
  '  "deck_title": "<short title derived from the lecture topic>",',
  '  "study_guide_markdown": "<a focused markdown study guide: learning objectives, high-yield points, a',
  '     drug/comparison table if relevant, and exam traps — grounded ONLY in the lecture text>",',
  '  "cards": [ { "front": "<application-level prompt>", "back": "<concise grounded answer>",',
  '     "tags": ["<topic>", "<drug-or-class>"] } ],',
  '  "counseling_points": ["<patient-facing counseling point grounded in the text>"],',
  '  "high_yield": ["<one-line high-yield fact for exam review>"]',
  '}',
  "Do not include any text outside the JSON object.",
].join("\n");

/**
 * Generate study material from lecture text.
 * @param {{ apiKey: string, text: string, sourceName: string, baseUrl?: string, model?: string, maxCards?: number }} opts
 * @returns {Promise<{ deck_title: string, study_guide_markdown: string, cards: Array<{front:string,back:string,tags:string[]}>, counseling_points: string[], high_yield: string[] }>}
 */
async function generateStudyMaterial(opts) {
  const maxCards = opts.maxCards || 40;
  // Cap the source text sent to the model to keep the request bounded (long decks still fit comfortably).
  const source = String(opts.text || "").slice(0, 24000);
  if (source.trim().length < 40) {
    return {
      deck_title: opts.sourceName || "Lecture",
      study_guide_markdown: "_No readable text was found in this file, so no study guide was generated._",
      cards: [],
      counseling_points: [],
      high_yield: [],
    };
  }
  const user = [
    `Lecture file: ${opts.sourceName || "unknown"}`,
    `Make at most ${maxCards} cards. Fewer, higher-quality cards is better than padding.`,
    "",
    "LECTURE TEXT:",
    source,
  ].join("\n");

  const raw = await generateJson({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model,
    system: SYSTEM,
    user,
    maxTokens: 6000,
  });
  return normalize(raw, opts.sourceName);
}

/** Defensive normalization — the model can drift; keep only well-formed pieces. */
function normalize(raw, sourceName) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const cards = Array.isArray(obj.cards) ? obj.cards : [];
  const cleanCards = cards
    .map((c) => ({
      front: String((c && c.front) || "").trim(),
      back: String((c && c.back) || "").trim(),
      tags: Array.isArray(c && c.tags) ? c.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    }))
    .filter((c) => c.front.length > 0 && c.back.length > 0);
  return {
    deck_title: String(obj.deck_title || sourceName || "Lecture").trim() || "Lecture",
    study_guide_markdown: String(obj.study_guide_markdown || "").trim(),
    cards: cleanCards,
    counseling_points: Array.isArray(obj.counseling_points)
      ? obj.counseling_points.map((x) => String(x).trim()).filter(Boolean)
      : [],
    high_yield: Array.isArray(obj.high_yield)
      ? obj.high_yield.map((x) => String(x).trim()).filter(Boolean)
      : [],
  };
}

module.exports = { generateStudyMaterial, SYSTEM };
