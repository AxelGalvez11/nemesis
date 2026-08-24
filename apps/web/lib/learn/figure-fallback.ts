// When the model asks for a picture in the prose and forgets to ask for it in the JSON.
//
// 🔴🔴🔴 EVERY PART OF THE FIGURE LANE WORKS EXCEPT THE MODEL'S HALF, AND THAT IS MEASURED RATHER
// THAN ASSUMED. Driven against production on 2026-08-24, feeding the real decision shape through
// the real `prepareAnswer` and the real `/api/learn/reference-image`:
//
//     resolve pass changed the text: true
//     visuals surviving validation:  1
//     asset: KidneyAndNephron-v4_Antares42.svg — "The kidney in section beside a single nephron"
//
// The plumbing is sound end to end. What does not happen is the model writing the visual. Asked
// "show me a labelled diagram of a nephron" it replied *"Here's a labelled diagram of a nephron
// [figure 1]."* and sent no `visuals` at all; asked for meiosis, the same. Both after the packet
// gained the figure shape, the marker-needs-a-payload rule and the short-subject rule — three
// instructions, no change in behaviour. This is the `code` renderer's failure over again: a
// capability the model is told about, understands, points at, and declines to use.
//
// 🔴 SO TRUSTED CODE FINISHES THE REQUEST, WHICH IS THIS PRODUCT'S OWN HOUSE RULE. The model emits
// a semantic request and code owns the drawing. A `[figure n]` marker with nothing behind it IS a
// semantic request — the model has said, in the only place it can, that a picture belongs here.
//
// 🔴🔴 AND THE SUBJECT IS TAKEN FROM `topic`, NEVER GUESSED OUT OF THE PROSE. `topic` is a short
// noun the model already wrote for its own reasons ("nephron", "meiosis") — which is exactly the
// "shortest name, the way an index would list it" that the packet asks for, and exactly what the
// live repository matches best. Reading a subject out of the sentence instead would reintroduce
// the failure the packet warns about: measured, "the stages of meiosis" returns the life stages of
// Naegleria fowleri, and "diagram of meiosis showing both divisions" returns the layers of human
// skin. A wrong picture is worse than none, so nothing here parses prose.
//
// 🔴 CONSERVATIVE BY CONSTRUCTION. It acts on exactly one shape: a turn with NO visuals at all and
// EXACTLY ONE marker. Two markers, or any visual already present, means the model was engaging
// with the array and its indices, and second-guessing that would risk stamping a picture onto the
// wrong marker — the same positional hazard `figure-lookup.ts` refuses a short result array for.
//
// PURE. No I/O, no clock. Runs before `prepareAnswer`, so what it adds is resolved, validated and
// licence-checked by exactly the same passes as anything the model wrote itself — it cannot smuggle
// an asset past them, because it supplies only a name.

/** The same block both `turn-router.ts` and `answer-prepare.ts` read. */
const DECISION_BLOCK = /```json\s*\n?([\s\S]*?)```/;

/**
 * `[figure 1]`, the marker `reply-visuals.ts` resolves against the turn's own list.
 *
 * 🔴🔴 THE OPTIONAL BACKSLASHES MATTER AND ARE NOT PADDING. Measured on production 2026-08-24, the
 * model wrote `\[figure 1\]` — LaTeX's display-math delimiters, which it reaches for because the
 * packet tells it to write real LaTeX outside the JSON. A pattern demanding a bare `]` misses that
 * entirely, and the raw text then reaches the maths renderer, which typesets `figure1` as an
 * equation. This must stay in step with `reply-visuals.ts`'s `FIGURE_RE`: one of them matching a
 * spelling the other does not means a figure is either fetched and never placed, or placed and
 * never fetched. The test file holds the two together.
 */
const FIGURE_MARKER = /\\?\[figure\s+(\d{1,2})\\?\]/gi;

/**
 * The longest a `topic` may be and still be a subject rather than a sentence.
 *
 * 🔴 A CEILING ON WORDS, NOT CHARACTERS. "meiosis" and "the ornithine cycle" are subjects; a topic
 * the model wrote as a phrase ("how a four-stroke engine converts fuel into motion") is a
 * description, and descriptions are what fetch the wrong picture.
 */
const MAX_SUBJECT_WORDS = 5;

/**
 * Give an orphaned `[figure n]` marker something to resolve against.
 *
 * Returns the text unchanged in every case it is not sure about: no block, unparseable JSON, no
 * marker, more than one marker, any visual already present, or a `topic` that is missing, empty or
 * too long to be a name.
 */
export function fillMissingFigures(text: string): string {
  const block = DECISION_BLOCK.exec(text);
  if (!block) return text;

  const prose = text.slice(0, block.index) + text.slice(block.index + block[0].length);
  const markers = [...prose.matchAll(FIGURE_MARKER)];
  if (markers.length !== 1) return text;

  let decision: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(block[1] ?? "");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return text;
    decision = parsed as Record<string, unknown>;
  } catch {
    return text;
  }

  // 🔴 ONLY WHEN THE ARRAY IS GENUINELY UNTOUCHED. `visuals: []` counts as untouched — that is the
  // shape the filled-in template was written to stop — but a single entry means the model was
  // working with indices and this must not interfere.
  const visuals = decision.visuals;
  if (visuals !== undefined && (!Array.isArray(visuals) || visuals.length > 0)) return text;

  // …and the marker has to be the first one, since that is the index we are filling.
  if (Number(markers[0]?.[1]) !== 1) return text;

  const topic = typeof decision.topic === "string" ? decision.topic.trim() : "";
  if (!topic || topic.split(/\s+/).length > MAX_SUBJECT_WORDS) return text;

  const learningGoal = typeof decision.topic === "string" ? `see ${topic}` : "see this";
  const filled = { ...decision, visuals: [{ kind: "figure", learningGoal, subject: topic }] };
  return (
    text.slice(0, block.index) +
    "```json\n" + JSON.stringify(filled) + "\n```" +
    text.slice(block.index + block[0].length)
  );
}
