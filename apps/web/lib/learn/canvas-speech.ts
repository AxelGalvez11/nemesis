// What Nemesis says out loud, and — more importantly — what it refuses to.
//
// Voice mode reads the QUESTION and the CORRECTION. It does not read explanations.
//
// 🔴 THAT IS A TEACHING DECISION, NOT A COST ONE, THOUGH IT IS ALSO CHEAPER. The learner's eyes
// are the scarce resource on this surface: §11 makes figures first-class learning objects meant to
// be quizzed from, and a spoken paragraph running over a structure diagram competes with the exact
// thing the learner should be looking at. A question and a correction are short, and they are the
// two moments where hearing rather than reading frees the eyes completely — onto the figure, or
// onto nothing at all if the learner is walking to class.
//
// Explanations are genuinely better read. A reader can skim, re-read the one clause that did not
// land, and set their own pace; speech imposes one linear pace on the part of the interaction that
// most needs learner control. Speaking everything is the better demo and the worse product.
//
// 🔴 REFUSING IS A REAL OUTCOME AND IT IS NAMED. A synthesiser handed notation reads "\frac{1}{2}"
// as backslash-f-r-a-c, and a learner who hears that once turns voice off for ever. Saying nothing
// is recoverable; saying something wrong is not. Every refusal below returns a reason rather than
// null-as-silence, so "voice mode is broken" and "voice mode declined this one" can be told apart
// in the same way `canvas_causal_refused` keeps a refusal distinguishable from a failure.

/** A moment the canvas can offer to the voice. Deliberately not the whole `TeachingDecision`: this
 *  module decides what is SAYABLE, and should not be able to reach into render internals. */
export type SpokenMoment =
  /** A retrieval prompt. The question is the whole screen; it is also the whole utterance. */
  | { kind: "question"; text: string }
  /** A correction. The lead-in carries the verdict ("You had part of this.") and matters as much
   *  as the answer does — hearing only the answer loses whether they were right. */
  | { kind: "correction"; lead: string; answer: string }
  /**
   * An utterance in the language being learned — §43's inversion.
   *
   * 🔴 THIS ONE IS NOT A READING OF THE SCREEN, IT IS THE MATERIAL. Everywhere else in this file
   * speech is an alternative channel for text the learner could have read; here the sound *is* the
   * knowledge, and the written form is the alternative channel. Pronunciation, stress, rhythm and
   * intonation do not survive text at all, so a language lesson delivered silently has not taught
   * most of what it claimed to.
   *
   * 🔴 IT CARRIES NO LOCALE OF ITS OWN, DELIBERATELY. Which locale to speak it in is a routing
   * decision (`speech-route.ts`), and a moment that carried its own locale would let the screen and
   * the voice disagree about which variety is being taught — the learner reading Mexican Spanish
   * and hearing Castilian.
   */
  | { kind: "target_language"; text: string }
  /**
   * A conversational answer.
   *
   * 🔴 REPORTED 2026-08-20: *"why does it only read aloud during questions?"* Because every moment
   * above is produced from the POLICY runtime, and a reply is not a policy decision — so voice mode
   * had branches for a question and a correction and none at all for the thing the learner is most
   * often looking at. Turning voice on and hearing nothing while an answer sat on screen reads as a
   * broken feature, and it is the same shape as every other defect on this surface this month: the
   * capability was whole, and the conversational path could not reach it.
   *
   * 🔴 IT IS ITS OWN KIND RATHER THAN A `question`, BECAUSE THE ROUTER READS THE KIND. §43 speaks a
   * question slightly under natural pace, on the reasoning that a learner is being asked to think.
   * An answer is being explained TO them, and calling it a question would have quietly slowed every
   * explanation down.
   */
  | { kind: "answer"; text: string };

/** Why nothing will be spoken. Named so a silent canvas is diagnosable. */
export type SpeechRefusal =
  /** The action is one voice mode deliberately stays out of — teaching, simplifying, contrast. */
  | "not-a-spoken-moment"
  /** Nothing left after formatting was stripped. */
  | "empty-after-cleanup"
  /** Mostly notation. A synthesiser would read symbols aloud and be worse than silence. */
  | "notation-not-speakable"
  /** Longer than voice mode will read. See SPEECH_CHAR_LIMIT. */
  | "too-long-to-speak";

export interface Utterance {
  /** Identity of the moment, so the same screen is not read twice across re-renders. */
  key: string;
  text: string;
}

export type SpeechChoice = { spoken: Utterance; refused?: never } | { spoken?: never; refused: SpeechRefusal };

/**
 * The cap on one utterance, in characters.
 *
 * A question that runs past this is not a question, and reading 600 characters aloud takes about
 * 40 seconds — long past the point a learner would rather have read it. It is also the cost
 * ceiling per turn: at $4.20/million characters this bounds one utterance at about 0.25 cents.
 */
export const SPEECH_CHAR_LIMIT = 600;

/**
 * Which teaching actions voice mode always reads. 🔴 THE PRODUCT RULE, IN ONE PLACE.
 *
 * `contrast` is absent and stays absent: it puts two things side by side, which is inherently
 * spatial and loses its whole shape flattened into a sentence.
 */
export const SPOKEN_ACTIONS: readonly string[] = ["retrieve", "show_correction"];

/**
 * Explanations are read only when they are SHORT enough to hold in one listen.
 *
 * 🔴 A SEPARATE, MUCH TIGHTER BOUND THAN `SPEECH_CHAR_LIMIT`, AND THE GAP IS THE POINT. A two-
 * sentence explanation is a remark, and hearing it costs nothing. A paragraph read aloud is the
 * failure this whole module argues against: the listener cannot skim it, cannot re-read the clause
 * that did not land, and cannot set the pace. Roughly fifteen seconds of speech.
 */
export const SPOKEN_EXPLANATION_LIMIT = 220;

/** Actions that carry an exposition — spoken only when short, or when the learner asked. */
const EXPLANATORY_ACTIONS: readonly string[] = ["teach", "simplify"];

export function isSpokenAction(actionType: string): boolean {
  return SPOKEN_ACTIONS.includes(actionType);
}

/**
 * Should voice read this action's text?
 *
 * Questions and corrections: always. Explanations: only when short enough to be a remark, or when
 * the learner explicitly asked to hear it — an explicit request outranks the length rule, because
 * somebody who asked to be read to has stated the preference this rule exists to guess at.
 */
export function shouldSpeakAction(input: {
  actionType: string;
  text: string;
  requested?: boolean;
}): boolean {
  if (isSpokenAction(input.actionType)) return true;
  if (!EXPLANATORY_ACTIONS.includes(input.actionType)) return false;
  if (input.requested) return true;
  return input.text.trim().length <= SPOKEN_EXPLANATION_LIMIT;
}

/** Inline formatting a reader sees as emphasis and a synthesiser would pronounce.
 *  Exported for `reply-speech.ts`, which cleans an answer's prose with the SAME rules this module
 *  cleans a question with — a second copy is a copy that drifts. */
export function stripFormatting(raw: string): string {
  return raw
    // Citation markers — "[3]" read aloud is "bracket three".
    .replace(/\[\d{1,2}\]/g, " ")
    // Bold/italic/code fences and inline code.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, "$1$2")
    // Markdown links: keep the label, drop the URL. A read-aloud URL is unusable.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Headings and list bullets at line starts.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Explicit mathematical markup — LaTeX commands, or text fenced in dollar delimiters.
 *
 * 🔴 SPLIT OUT OF `isMostlyNotation` BECAUSE THE TWO TESTS ANSWER DIFFERENT QUESTIONS, AND ONE OF
 * THEM IS WRONG FOR §43. This half is decisive on its own in any language: a reader never sees
 * `\frac`, so anything containing it is a rendering artefact rather than something to say. The
 * LETTER-RATIO half is a heuristic tuned for teaching prose, where punctuation is sparse — and it
 * misfires on exactly the utterances a language lesson is made of. "¿Sí?" is two letters in four
 * characters and would be refused as notation; so would a Japanese line framed in 「」. The
 * shortest, most useful pronunciation drills are the ones the ratio rejects, so the
 * target-language lane uses this test alone. See `speech-route.ts`.
 */
export function hasNotationMarkup(text: string): boolean {
  return /\\[a-zA-Z]{2,}|\$\$?[^$]+\$\$?/.test(text);
}

/**
 * Whether what is left is notation rather than language.
 *
 * 🔴 A RATIO, NOT A KEYWORD LIST — the field-agnostic rule. "Contains \frac" only catches LaTeX a
 * chemistry deck would not use anyway; what actually predicts an unspeakable string is that most
 * of it is not letters or spaces. A mechanical-engineering formula and an organic-chemistry
 * structure fail the same test for the same reason, and an ordinary sentence containing one
 * number passes.
 */
export function isMostlyNotation(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  if (stripped.length === 0) return false;
  if (hasNotationMarkup(text)) return true;
  let wordish = 0;
  for (const character of stripped) if (/[\p{L}]/u.test(character)) wordish += 1;
  // Below roughly two-thirds letters, a synthesiser is reading symbols rather than words.
  return wordish / stripped.length < 0.66;
}

/**
 * The utterance for one moment, or a named reason there is none.
 *
 * `key` is supplied rather than derived: the caller already computes a decision identity for
 * rendering, and deriving a second one here is how two identities drift apart and a question gets
 * read twice.
 */
export function speechFor(moment: SpokenMoment, key: string): SpeechChoice {
  const raw =
    moment.kind === "correction"
      // The verdict first, then the answer, with a full stop between so the synthesiser pauses.
      ? `${moment.lead.trim().replace(/[.!?]?$/, ".")} ${moment.answer}`
      : moment.text;

  const text = stripFormatting(raw);
  if (!text) return { refused: "empty-after-cleanup" };
  // 🔴 THE NOTATION TEST IS CHOSEN BY MOMENT, NOT APPLIED UNIFORMLY. See `hasNotationMarkup` for
  // why the letter ratio is the wrong instrument for a target-language utterance: it refuses
  // "¿Sí?" as notation, and that is a drill rather than a formula.
  const unspeakable = moment.kind === "target_language" ? hasNotationMarkup(text) : isMostlyNotation(text);
  if (unspeakable) return { refused: "notation-not-speakable" };
  if (text.length > SPEECH_CHAR_LIMIT) return { refused: "too-long-to-speak" };
  return { spoken: { key, text } };
}

/**
 * A passage broken into pieces a synthesiser will actually accept.
 *
 * 🔴🔴 REPORTED 2026-08-21: *"it wouldn't play the whole passage."* Both providers refuse above
 * `SPEECH_CHAR_LIMIT` — `nemesis-speak` answers 413 and `/api/speech/tts` answers 413 — and the
 * "Read aloud" control under an answer sent the WHOLE answer as one request. Every answer longer
 * than 600 characters, which is most answers worth reading aloud, therefore did nothing at all: no
 * sound, no message, a control that looked fine and was dead.
 *
 * 🔴 THE BOUND IS A REQUEST BOUND, NOT A PRODUCT BOUND, WHICH IS WHY THIS SPLITS RATHER THAN
 * REFUSES. 600 exists so one call cannot spend unboundedly; it was never a claim that a learner
 * may not hear a long answer. `speechFor`'s refusal is the other thing and stays exactly as it is:
 * that one governs the AUTOMATIC lane, where an unasked-for paragraph read at somebody is a
 * nuisance. Asked for explicitly, a long passage is simply several requests.
 *
 * Splits on sentence ends first so a pause lands where a reader would pause, then on words, and
 * only ever mid-word for a single "word" longer than the whole limit — a URL or a hash, where
 * there is no better seam and the alternative is dropping it.
 */
export function speechChunks(text: string, limit: number = SPEECH_CHAR_LIMIT): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  const add = (piece: string) => {
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= limit) current = `${current} ${piece}`;
    else {
      flush();
      current = piece;
    }
  };

  // A sentence end followed by space, or a line break: the seams a reader already hears.
  for (const sentence of clean.split(/(?<=[.!?…])\s+|\n+/)) {
    const unit = sentence.trim();
    if (!unit) continue;
    if (unit.length <= limit) {
      add(unit);
      continue;
    }
    for (const word of unit.split(/\s+/)) {
      if (word.length <= limit) {
        add(word);
        continue;
      }
      // No seam inside it. Break it up rather than lose it.
      flush();
      for (let at = 0; at < word.length; at += limit) chunks.push(word.slice(at, at + limit));
    }
  }
  flush();
  return chunks;
}
