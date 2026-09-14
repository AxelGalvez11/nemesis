// A SPEAKING DRILL: a short, scripted, finite spoken exercise with an end written into it.
//
// 🔴🔴 THIS IS A BOUND, AND THE BOUND IS THE FEATURE. `use-voice-conversation.ts` is an open loop:
// speak, be answered, the microphone re-opens, for ever, until the learner presses stop. That is
// the right shape for TALKING TO NEMESIS and the owner ordered it himself on 2026-08-30. It is the
// wrong shape for PRACTISING, for two reasons that point the same way.
//
//   Cost. Every turn of an open loop is a transcription, a model call and a synthesis, and nothing
//   in the product knows how many turns are coming. A drill's whole cost is knowable before the
//   first word: `drillSeconds` and `drillSpokenCharacters` are computable from the script, and the
//   script is fixed at birth.
//
//   Learning. Owner, 2026-09-01, after reading the Pingo teardown: *"so that practice with speaking
//   only allows for short scripted practice like in pingo?"* Pingo sells "unlimited conversations"
//   and can afford to because a conversation there is a bounded scenario, one timed at twenty-five
//   seconds by a reviewer. The bound is not a tax on the product; it IS the product. An exercise
//   with a beginning, four prompts and an end is something a learner can finish. An open microphone
//   is something they abandon.
//
// 🔴 THE MODEL WRITES THE SCRIPT ONCE AND THEN HAS NO SAY. Every prompt, every listening window and
// the number of turns are decided in one call, before the drill starts, and `readSpeakingDrill`
// refuses anything outside the bounds below rather than repairing it. During the run there is NO
// model in the loop at all: the runner plays turn N's ask, listens for turn N's seconds, records
// what it heard, and moves to N+1. This is the entire reason a drill's cost is predictable, and it
// is the difference between this file and the conversation hook.
//
// 🔴 THE BOUNDS ARE ENFORCED IN CODE, NOT ASKED FOR IN A PROMPT. A prompt that says "keep it short"
// is a request; `MAX_TURNS` is a fact. The same rule `chat-check.ts` states for questions applies
// here and for the same reason: the model wrote this, so every limit is a refusal.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). Nothing here reads a word of any field. A drill
// is a list of things to say and how long to listen, which is as true for a law student reciting a
// test for negligence as for an engineering student stating a law of thermodynamics or a learner
// repeating a sentence in German. The optional `say` carries a locale because the pronunciation
// lane needs one (§43, §47); it is one turn kind among several, not what a drill is for.
//
// PURE. No React, no I/O, no clock, no randomness.

/** The fewest turns worth calling an exercise. Two is a question and a follow-up. */
export const MIN_TURNS = 3;

/**
 * The most turns a drill may have.
 *
 * 🔴 SIX, AND THE CEILING IS THE POINT. With `MAX_TURN_SECONDS` this caps one drill at 270 seconds
 * of listening and roughly 1,300 characters of speech, whatever the model asked for. A drill cannot
 * grow into a conversation by being written greedily.
 */
export const MAX_TURNS = 6;

/** The shortest listening window that can hold an answer. Below this the learner is cut off. */
export const MIN_TURN_SECONDS = 10;

/** The longest. A minute of talking is a monologue, and this is practice at saying one thing. */
export const MAX_TURN_SECONDS = 45;

/** When the model gives no usable window, this is what the turn gets. */
export const DEFAULT_TURN_SECONDS = 25;

/**
 * The longest prompt, in characters.
 *
 * 🔴 SHORT BECAUSE IT IS SPOKEN. `canvas-speech.ts` already refuses to read explanations aloud, on
 * the argument that a paragraph read out cannot be skimmed, re-read or paced. An ask is a question,
 * not a lesson; anything longer than this is the model teaching through a channel that cannot be
 * re-read.
 */
export const MAX_ASK = 220;

/** The longest line the learner may be asked to repeat back. */
export const MAX_SAY = 120;

/** The longest drill title. It is a label on a card, not a sentence. */
export const MAX_TITLE = 80;

/** A line in a target language, with the variety it must be said in. */
export interface DrillLine {
  /** BCP-47. `speech-route.ts` refuses a target-language utterance without one, so nor do we. */
  readonly locale: string;
  readonly text: string;
}

/** One prompt, and how long the learner has to answer it. */
export interface DrillTurn {
  /** What Nemesis says. Spoken aloud and shown on screen, so it reads as well as it sounds. */
  readonly ask: string;
  /**
   * The hard listening window, in seconds.
   *
   * 🔴 A CEILING, NOT A TARGET. The runner closes the microphone when this expires whether or not
   * the learner has finished, which is why `MAX_TURN_SECONDS` is generous. It is deliberately NOT
   * the conversation hook's silence rule: that timer re-arms on every new word, so a learner who
   * keeps talking keeps the microphone open indefinitely. This one cannot be re-armed by talking.
   */
  readonly seconds: number;
  /**
   * A line to repeat in a target language, or null.
   *
   * 🔴 PRESENT ONLY WHERE A VARIETY IS NAMED. This is the turn kind that reaches Azure's scorer
   * (§47) through the same path `SpokenExample` uses, and that path needs the sentence AND the
   * locale. A `say` without a locale is dropped rather than guessed at, because a learner taught
   * the wrong accent cannot hear that it is wrong.
   */
  readonly say: DrillLine | null;
}

/** A finished script. Its length never changes after this object exists. */
export interface SpeakingDrill {
  readonly title: string;
  readonly turns: readonly DrillTurn[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/**
 * The listening window this turn actually gets.
 *
 * 🔴 CLAMPED, NEVER REFUSED. A missing or silly `seconds` is the one field worth repairing rather
 * than dropping the turn over: the prompt is the substance and the window is a dial. Everything
 * else in this file drops what it cannot trust, because everything else changes what the learner
 * is asked to do.
 */
function windowSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TURN_SECONDS;
  return Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, Math.round(value)));
}

/**
 * A target-language line, or null.
 *
 * 🔴 BOTH HALVES OR NEITHER. A locale with no text says nothing; text with no locale is the exact
 * failure §43 exists to prevent. Either way the turn survives as an ordinary spoken prompt.
 */
function readLine(value: unknown): DrillLine | null {
  if (!record(value)) return null;
  const locale = text(value.locale, 32);
  const line = text(value.text, MAX_SAY);
  if (!locale || !line) return null;
  return { locale, text: line };
}

function readTurn(value: unknown): DrillTurn | null {
  if (!record(value)) return null;
  const ask = text(value.ask, MAX_ASK);
  if (!ask) return null;
  return { ask, say: readLine(value.say), seconds: windowSeconds(value.seconds) };
}

/**
 * The drill the model wrote, or null when it wrote nothing usable.
 *
 * 🔴 TOO FEW TURNS IS A REFUSAL, NOT A SHORT DRILL. Two prompts is a pair of questions; the card,
 * the progress and the summary all promise an exercise. Better to fall back to an ordinary reply
 * than to open a speaking surface over something that is not one.
 *
 * 🔴 TOO MANY IS A TRUNCATION, NOT A REFUSAL, and the asymmetry is deliberate. A model that wrote
 * nine good prompts has not failed at the task, it has overshot a limit it was told about; the
 * first six are a real drill. A model that wrote two has misunderstood what was asked for.
 */
export function readSpeakingDrill(value: unknown): SpeakingDrill | null {
  if (!record(value)) return null;
  const raw = Array.isArray(value.turns) ? value.turns : null;
  if (!raw) return null;

  const turns: DrillTurn[] = [];
  for (const entry of raw) {
    if (turns.length >= MAX_TURNS) break;
    const turn = readTurn(entry);
    if (turn) turns.push(turn);
  }
  if (turns.length < MIN_TURNS) return null;

  // A missing title is not worth losing a good script over; the card can head itself.
  return { title: text(value.title, MAX_TITLE) || "Speaking practice", turns };
}

/**
 * The most seconds of microphone this drill can ever open, summed over its turns.
 *
 * 🔴 THE WORST CASE, AND IT IS A REAL CEILING RATHER THAN AN ESTIMATE, because no path in the
 * runner can open a window this script did not describe. This is the number that makes a drill
 * chargeable before it starts, which is the whole reason the shape exists.
 */
export function drillSeconds(drill: SpeakingDrill): number {
  return drill.turns.reduce((total, turn) => total + turn.seconds, 0);
}

/**
 * Every character this drill will synthesise, so the voice meter can charge it up front.
 *
 * 🔴 MIRRORS WHAT THE RUNNER ACTUALLY SPEAKS: the ask, plus the target-language line where there is
 * one. A charge computed from a different set than the one that reaches the provider is a meter
 * that reports someone else's usage. `lib/speech/meter.ts` turns characters into seconds.
 */
export function drillSpokenCharacters(drill: SpeakingDrill): number {
  return drill.turns.reduce((total, turn) => total + turn.ask.length + (turn.say?.text.length ?? 0), 0);
}

/** Where a run has got to. There is no stage that leads back out of `done`. */
export type DrillStage = "asking" | "listening" | "done";

export interface DrillState {
  /** Which turn is live. Always a valid index while `stage` is not `done`. */
  readonly index: number;
  readonly stage: DrillStage;
  /** What the learner said, one entry per COMPLETED turn, in order. */
  readonly heard: readonly string[];
}

/**
 * What can happen to a run.
 *
 * 🔴 THERE IS NO "listen again" EVENT AND THAT IS THE BOUND. The conversation hook re-opens the
 * microphone on playback finishing, on a quiet turn, and on a failure, which is correct there: the
 * learner pressed a button that promises a loop. Here every route out of `listening` advances the
 * index or ends the run. A drill cannot be made to stay on one turn by any sequence of events,
 * which is the invariant `speaking-drill.test.ts` proves by exhaustion.
 */
export type DrillEvent =
  /** The ask finished playing. */
  | { readonly type: "spoke" }
  /** The listening window closed. `said` may be empty: silence is an answer, and it counts. */
  | { readonly type: "heard"; readonly said: string }
  /** The learner stopped the drill by hand. */
  | { readonly type: "stopped" };

export function drillStart(): DrillState {
  return { heard: [], index: 0, stage: "asking" };
}

/**
 * Move a run on. PURE, total, and monotonic: `index` never decreases and `done` never reopens.
 *
 * 🔴 AN EVENT ARRIVING IN THE WRONG STAGE IS IGNORED, NOT AN ERROR. A `heard` while still asking is
 * a late timer from the previous turn, and the honest response to a stale timer is to do nothing.
 * Throwing would take a speaking surface down over a race that costs nothing.
 */
export function drillAdvance(drill: SpeakingDrill, state: DrillState, event: DrillEvent): DrillState {
  if (state.stage === "done") return state;
  // 🔴 STOPPING KEEPS THE INDEX, AND THE FIRST DRAFT OF THIS FILE DID NOT. It reset to zero, which
  // read as "done at turn one" and made `drillProgress` report a stopped drill as COMPLETE: a card
  // telling a learner they finished an exercise they walked out of. Caught by the exhaustion test
  // below rather than by review, because it is invisible unless you check that the index never goes
  // backwards. Where the learner stopped is the only honest thing to remember about a stopped run.
  if (event.type === "stopped") return { heard: state.heard, index: state.index, stage: "done" };

  if (event.type === "spoke") {
    return state.stage === "asking" ? { ...state, stage: "listening" } : state;
  }

  if (state.stage !== "listening") return state;
  const heard = [...state.heard, event.said.trim()];
  const next = state.index + 1;
  // 🔴 THE LAST TURN ENDS THE DRILL HERE, IN PURE CODE, rather than in a hook that could be asked
  // to do otherwise. There is no branch in which `index` reaches `turns.length` while a microphone
  // could still be opened.
  if (next >= drill.turns.length) return { heard, index: state.index, stage: "done" };
  return { heard, index: next, stage: "asking" };
}

/** The turn now live, or null once the drill is over. */
export function drillTurn(drill: SpeakingDrill, state: DrillState): DrillTurn | null {
  if (state.stage === "done") return null;
  return drill.turns[state.index] ?? null;
}

/**
 * How far along, for a "2 of 4" on the card.
 *
 * 🔴 A FINISHED RUN COUNTS ANSWERS, NOT TURNS, so a drill stopped after one answer reads "1 of 4"
 * and only a run that reached the end reads "4 of 4". Reporting the whole script the moment the
 * stage is `done` would congratulate a learner for an exercise they abandoned. Mid-run the live
 * turn is the honest place, because it is the one being asked.
 */
export function drillProgress(drill: SpeakingDrill, state: DrillState): { readonly at: number; readonly of: number } {
  const of = drill.turns.length;
  if (state.stage === "done") return { at: Math.min(state.heard.length, of), of };
  return { at: Math.min(state.index + 1, of), of };
}

/**
 * Did the learner actually take part?
 *
 * 🔴 USED TO DECIDE WHETHER A SUMMARY IS WORTH ASKING FOR, and that decision is worth money: the
 * one model call at the end of a drill is wasted on a run where every window closed on silence.
 * "Some words in at least one turn" is a deliberately low bar; the point is to catch the abandoned
 * run, not to grade the answers, which is the summary's job.
 */
export function drillAnswered(state: DrillState): boolean {
  return state.heard.some((said) => said.length > 0);
}
