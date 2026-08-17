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
  | { kind: "correction"; lead: string; answer: string };

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
 * Which teaching actions voice mode reads. 🔴 THE PRODUCT RULE, IN ONE PLACE.
 *
 * `teach` and `simplify` carry expositions — the explanations this deliberately leaves on screen.
 * `contrast` puts two things side by side, which is inherently spatial and loses its whole shape
 * when flattened into a sentence.
 */
export const SPOKEN_ACTIONS: readonly string[] = ["retrieve", "show_correction"];

export function isSpokenAction(actionType: string): boolean {
  return SPOKEN_ACTIONS.includes(actionType);
}

/** Inline formatting a reader sees as emphasis and a synthesiser would pronounce. */
function stripFormatting(raw: string): string {
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
  // Explicit LaTeX commands or delimiters are decisive on their own — a reader never sees them.
  if (/\\[a-zA-Z]{2,}|\$\$?[^$]+\$\$?/.test(text)) return true;
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
    moment.kind === "question"
      ? moment.text
      // The verdict first, then the answer, with a full stop between so the synthesiser pauses.
      : `${moment.lead.trim().replace(/[.!?]?$/, ".")} ${moment.answer}`;

  const text = stripFormatting(raw);
  if (!text) return { refused: "empty-after-cleanup" };
  if (isMostlyNotation(text)) return { refused: "notation-not-speakable" };
  if (text.length > SPEECH_CHAR_LIMIT) return { refused: "too-long-to-speak" };
  return { spoken: { key, text } };
}
