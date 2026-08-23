// A question NEMESIS asks the LEARNER, when one decision genuinely changes what it is about to build.
//
// 🔴🔴 THIS IS NOT A COGNITIVE TASK AND MUST NEVER BECOME ONE. Everything in `canvas-hosting.ts`'s
// task world exists to produce evidence: a `HostedTaskShape` is answered, judged, and written to
// `learner_evidence` against an objective. A learner choosing "Academic" over "Overview" has
// demonstrated nothing about what they know — they have stated a preference about what they want.
// Routing that through the task machinery would put a preference in the durable record of someone's
// knowledge, which is a lie that compounds: the retention model reads those rows.
//
// So this is a separate shape with its own sink, and the ONE thing it shares with a task is that it
// occupies the "an answer is owed" slot — because two things owing an answer at once is the defect
// `composer-intent.ts` was written to end, and a preference question is no exception to it.
//
// 🔴 THE MODEL DECIDES WHEN TO ASK, THE SOFTWARE DECIDES WHETHER THE ASK IS WELL FORMED. That split
// is the same one `turn-router.ts` already makes. Nothing here knows what a good question IS for any
// field; it knows that a question with one option is not a choice, that a blank label cannot be
// picked, and that a wall of options is an interrogation. Those are structural, so they hold for a
// law student and a mechanical engineering student alike.
//
// PURE. No React, no I/O, no model call.

/**
 * How many options may reach the screen.
 *
 * 🔴 A CEILING, NEVER A TARGET — the same rule `choice-set.ts` states for distractors, and for the
 * same reason. Three real alternatives is a complete result. Padding to four puts a seat on screen
 * that no learner would pick for a reason, and the whole point of asking is that every option is a
 * decision somebody could actually mean.
 */
export const MAX_CLARIFY_OPTIONS = 4;

/** Below this there is no choice to make, so there is no question. */
export const MIN_CLARIFY_OPTIONS = 2;

/** One thing the learner can pick. */
export interface ClarifyOption {
  /**
   * Stable handle for this option, used when the answer is fed back to the model.
   *
   * 🔴 IT IS SENT BACK INSTEAD OF THE LABEL SO THE ANSWER SURVIVES REPHRASING. The model wrote the
   * label; the model reads the answer. An id it chose is a word it already agreed with itself on.
   */
  id: string;
  label: string;
  /** Why someone would pick this. Absent when the label is self-explaining. */
  description: string | null;
}

/**
 * The whole ask: one prompt, a few options, and whether a written answer is invited.
 *
 * 🔴 ONE QUESTION, NOT A FORM. There is no array of questions here and that is deliberate. A form is
 * an onboarding flow wearing a model's clothes, and the moment two can be pending the surface has to
 * decide which one a typed answer belongs to — which is exactly the ambiguity `AnswerSink` exists to
 * make unrepresentable. If a second decision is genuinely needed, it is a second turn.
 *
 * 🔴 `multiple` IS DELIBERATELY ABSENT. Multi-select doubles the answer shape (one id, or many) all
 * the way through the sink, the composer, the fact fed back to the model and the stored answer, and
 * no clarification the product needs today is a multi-pick. It can be added when something needs it;
 * it cannot be un-added once every consumer branches on it.
 */
export interface UserQuestion {
  id: string;
  prompt: string;
  options: readonly ClarifyOption[];
  /**
   * Whether to draw a written-answer row beneath the options.
   *
   * 🔴🔴 IT CONTROLS THE ROW, NOT THE CAPABILITY, AND THE DIFFERENCE IS NOT COSMETIC. The primary
   * composer is on screen the entire time this card is up, and `composerIntent` routes what the
   * learner types there to this question. A written answer is therefore ALWAYS possible, and a
   * `false` here that pretended otherwise would be a promise the surface cannot keep. False means
   * "the options really are the whole space, do not invite prose"; it never means "prose is
   * refused".
   */
  invitesWritten: boolean;
}

/** What the learner did with a pending question. */
export type ClarifyAnswer =
  | { kind: "option"; optionId: string; label: string }
  /** They typed instead of picking, either through the Other row or the primary composer. */
  | { kind: "written"; text: string };

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A handle derived from text, for when the model supplied a label but no id.
 *
 * 🔴 STRUCTURAL, SO IT IS FIELD-AGNOSTIC. It lowercases, keeps letters and digits, and joins the
 * rest with a hyphen. It knows nothing about any subject, so "Cell & molecular" and "Droit pénal"
 * are handled by one rule.
 */
export function clarifySlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "option";
}

function readOption(value: unknown, fallbackIndex: number): ClarifyOption | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = asText(raw.label);
  // 🔴 A BLANK LABEL IS DROPPED, NEVER FILLED IN. An option with no words on it is a seat nobody can
  // choose for a reason, and inventing text for it would put the software's guess in the model's
  // mouth on the one screen whose entire job is to find out what the learner actually meant.
  if (!label) return null;
  const description = asText(raw.description);
  return {
    description: description || null,
    id: asText(raw.id) || clarifySlug(label) || `option-${fallbackIndex + 1}`,
    label,
  };
}

/**
 * Read a question out of whatever the model returned, or null when there is not one in there.
 *
 * 🔴🔴 NULL IS THE SAFE ANSWER AND IT IS REACHED OFTEN, WHICH IS THE POINT. `turn-router.ts` already
 * argues that the expensive mistake is taking the screen over from someone who did not ask; a
 * malformed question is the same mistake in a smaller coat, because parking a turn behind a card the
 * learner cannot answer is strictly worse than just going ahead. So every doubt here resolves to
 * "there was no question", the caller runs the turn it was going to run, and the learner loses
 * nothing but a card that would not have helped them.
 */
export function readClarifyQuestion(value: unknown): UserQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const prompt = asText(raw.prompt);
  if (!prompt) return null;
  if (!Array.isArray(raw.options)) return null;

  const seen = new Set<string>();
  const options: ClarifyOption[] = [];
  for (const [index, entry] of raw.options.entries()) {
    const option = readOption(entry, index);
    if (!option) continue;
    // 🔴 DEDUPED BY ID, BECAUSE TWO SEATS THAT SEND THE SAME ANSWER BACK ARE ONE SEAT. Left in, the
    // learner picks between two identical-looking futures and the model is told the same thing
    // either way, so the card asked a question it could not learn anything from.
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
    if (options.length === MAX_CLARIFY_OPTIONS) break;
  }
  if (options.length < MIN_CLARIFY_OPTIONS) return null;

  return {
    id: asText(raw.id) || clarifySlug(prompt),
    // Absent means invited: the composer accepts prose regardless, so the honest default is the one
    // that tells the learner the truth about what will happen if they type.
    invitesWritten: raw.allowOther === false ? false : true,
    options,
    prompt,
  };
}

/**
 * Match what the learner typed against the options on screen.
 *
 * 🔴 EXACT-ISH, NEVER FUZZY. A learner who types "academic" under a card offering Academic meant
 * that option, and treating it as free text would tell the model something weaker than what it
 * asked for. Anything past a normalised label match is guesswork about meaning, which is the
 * model's job and not this file's — so it falls through to `written` and the model reads the prose.
 */
export function matchClarifyOption(
  question: UserQuestion,
  text: string,
): ClarifyOption | null {
  const wanted = clarifySlug(text);
  if (!wanted) return null;
  return question.options.find(
    (option) => option.id === wanted || clarifySlug(option.label) === wanted,
  ) ?? null;
}

/** What the learner's submission MEANS against a pending question. Never null: prose is an answer. */
export function readClarifyAnswer(question: UserQuestion, text: string): ClarifyAnswer | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const option = matchClarifyOption(question, trimmed);
  return option
    ? { kind: "option", label: option.label, optionId: option.id }
    : { kind: "written", text: trimmed };
}

/**
 * The sentence handed back to the model so it can resume the turn it parked.
 *
 * 🔴 STATED AS A FACT, IN THE SAME VOICE THE STATE BLOCK USES, and never as an instruction. The
 * model asked; this is the answer arriving. Phrasing it as a command ("now build the course") would
 * put the software in charge of what happens next, which is the exact inversion `turn-router.ts`
 * exists to prevent.
 */
export function clarifyAnswerFact(question: UserQuestion, answer: ClarifyAnswer): string {
  const value = answer.kind === "option" ? answer.optionId : answer.text;
  return `The learner answered your question "${question.prompt}"\n${question.id} = ${value}`;
}
