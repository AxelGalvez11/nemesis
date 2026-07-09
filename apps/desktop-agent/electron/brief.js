// The daily brief — the "school on autopilot" morning view. Mostly COMPUTED from what the agent actually
// did (facts, never LLM-guessed), with an optional one-paragraph study suggestion from the model. Meta
// stats stay real; only the prose nudge is generated.

const { generateJson } = require("./llm.js");

function todayKey(nowIso) {
  return String(nowIso).slice(0, 10);
}

/** Computed facts for the brief (PURE). */
function computeBrief(activity, nowIso) {
  const today = todayKey(nowIso);
  const todays = (activity || []).filter((a) => todayKey(a.at) === today);
  const generated = todays.filter((a) => a.status === "generated");
  const detected = todays.filter((a) => a.status === "detected");
  const needs = todays.filter((a) => a.status === "needs_pdf");
  const errors = todays.filter((a) => a.status === "error");
  const cards = generated.reduce((n, a) => n + (a.cardCount || 0), 0);
  const courses = [...new Set(generated.map((a) => a.course || "Unsorted"))];
  return {
    date: today,
    newDecks: generated.length,
    newCards: cards,
    courses,
    detectedCount: detected.length,
    needsPdfCount: needs.length,
    errorCount: errors.length,
    decks: generated.map((a) => ({ deck: a.deck, cards: a.cardCount || 0, course: a.course || "Unsorted", deckDir: a.deckDir })),
  };
}

/**
 * Optional LLM study nudge grounded ONLY in the computed facts (won't invent topics).
 * Returns "" on any failure — the brief still renders from the computed facts.
 */
async function studyNudge(facts, opts) {
  if (!opts || !opts.apiKey || facts.newDecks === 0) return "";
  const system = "You are a supportive pharmacy-school study coach. In 2-3 short sentences, suggest how to " +
    "study today's new material. Use ONLY the facts given — do not invent topics, drugs, or numbers. " +
    'Return JSON: {"nudge":"<2-3 sentences>"}';
  const user = `Today the student generated ${facts.newDecks} deck(s) (${facts.newCards} cards) across: ${facts.courses.join(", ") || "n/a"}. Decks: ${facts.decks.map((d) => d.deck).join("; ")}.`;
  try {
    const r = await generateJson({ apiKey: opts.apiKey, baseUrl: opts.baseUrl, model: opts.model, system, user, maxTokens: 400 });
    return String((r && r.nudge) || "").trim();
  } catch (_) {
    return "";
  }
}

module.exports = { computeBrief, studyNudge };
