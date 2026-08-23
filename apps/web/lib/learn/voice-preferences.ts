// Whether Nemesis opens the microphone by itself after it finishes speaking.
//
// 🔴 THREE STATES, NOT TWO BOOLEANS, AND THAT IS THE WHOLE POINT OF THIS FILE. The obvious shape is
// `hasBeenAsked` plus `wantsAutoDictation`, and it is the bug this repo keeps writing: a session
// boolean set once and never cleared. Two booleans have four combinations and only three are
// meaningful — `asked: false, wants: true` is a state nobody can reach honestly, and the first
// piece of code to read `wants` without checking `asked` treats "never asked" as "said no".
//
// One value, three states, no combination that means nothing:
//
//     "unasked"  — the learner has not been offered this yet. ASK.
//     "on"       — they said yes. Open the microphone when Nemesis stops speaking.
//     "off"      — they said no. Never open it; the button still works.
//
// 🔴 IT MUST SURVIVE A RELOAD, AND THAT IS NOT A CONVENIENCE. Auto-open calls `getUserMedia`
// without a press. A preference that resets would re-prompt for the microphone on every visit,
// which is how a browser permission gets permanently denied by a learner clicking the fastest
// button to make it go away. localStorage rather than a table: it is one learner-local UI
// preference, a migration would be ceremony, and if it is ever lost the worst case is being asked
// once more.
//
// 🔴 AND IT IS ASKED, NEVER ASSUMED. Owner's instruction: *"nemesis should ask user if they would
// like nemesis open dictation automatically"*. Defaulting it on would put a live microphone in
// front of someone who never agreed to one.

/** Whether the microphone opens by itself once Nemesis has finished speaking. */
export type AutoDictation = "unasked" | "on" | "off";

/**
 * Whether Nemesis starts reading aloud BY ITSELF.
 *
 * 🔴 THE AUTOPLAY PREFERENCE, AND SINCE §48 THAT IS THE ONLY THING IT DECIDES. Owner, 2026-08-22:
 * *"When enabled: after Nemesis finishes generating a response, begin TTS automatically… When
 * disabled: responses remain silent by default, the user should still be able to manually play a
 * response."* So this gates the UNPROMPTED lane and nothing else: the play button under an answer,
 * "hear it again" on a foreign phrase and reading a highlighted passage all work with it off,
 * because pressing a button IS the prompt.
 *
 * 🔴 USER-LEVEL, WITH NO PER-CANVAS OVERRIDE, AND THAT IS A DELIBERATE CHOICE ABOUT CLUTTER. The
 * owner asked us to pick based on the architecture and to prefer the least cluttered UX. It has
 * always been one stored value shared by every canvas; a per-canvas override would mean a second
 * control, a second stored thing, and a learner having to remember which canvas they set it on —
 * for a preference nobody wants to hold two opinions about. One switch, in the canvas menu where it
 * is reachable mid-session, writing one preference that every canvas reads.
 */
export type VoiceMode = "on" | "off";

const AUTO_DICTATION_KEY = "nemesis.voice.autoDictation";
const VOICE_MODE_KEY = "nemesis.voice.mode";

/** 🔴 OFF. Voice mode is a mode the learner turns on, never something that starts talking at
 *  somebody who opened a canvas to read. */
export const DEFAULT_VOICE_MODE: VoiceMode = "off";

function isAutoDictation(value: unknown): value is AutoDictation {
  return value === "unasked" || value === "on" || value === "off";
}

/**
 * Read the stored preference.
 *
 * Anything unreadable — no storage, private browsing, a value written by an older build — comes
 * back `"unasked"`, which is the only safe direction: it asks again rather than silently deciding
 * on the learner's behalf that they refused.
 */
export function readAutoDictation(storage: Pick<Storage, "getItem"> | null): AutoDictation {
  if (!storage) return "unasked";
  try {
    const stored = storage.getItem(AUTO_DICTATION_KEY);
    return isAutoDictation(stored) ? stored : "unasked";
  } catch {
    return "unasked";
  }
}

/** Record the learner's answer. `"unasked"` is writable so the ask can be reoffered deliberately. */
export function writeAutoDictation(storage: Pick<Storage, "setItem"> | null, value: AutoDictation): void {
  if (!storage) return;
  try {
    storage.setItem(AUTO_DICTATION_KEY, value);
  } catch {
    // A full or blocked store loses a UI preference. It must not break the lesson.
  }
}

export function readVoiceMode(storage: Pick<Storage, "getItem"> | null): VoiceMode {
  if (!storage) return DEFAULT_VOICE_MODE;
  try {
    return storage.getItem(VOICE_MODE_KEY) === "on" ? "on" : DEFAULT_VOICE_MODE;
  } catch {
    return DEFAULT_VOICE_MODE;
  }
}

export function writeVoiceMode(storage: Pick<Storage, "setItem"> | null, value: VoiceMode): void {
  if (!storage) return;
  try {
    storage.setItem(VOICE_MODE_KEY, value);
  } catch {
    // As above.
  }
}

/**
 * Should the learner be asked about auto-dictation right now?
 *
 * 🔴 DERIVED FROM THE STATE IN FLIGHT, NEVER A SEPARATE "HAVE WE ASKED" FLAG. Asking is exactly
 * what `"unasked"` MEANS while voice mode is on; there is nothing else to remember, and so nothing
 * that can fall out of step with it.
 *
 * Gated on voice mode because the question is meaningless otherwise: with voice off Nemesis never
 * finishes speaking, so there is no moment for the microphone to open at.
 */
export function shouldAskAboutAutoDictation(input: {
  voiceMode: VoiceMode;
  autoDictation: AutoDictation;
  /** False in browsers with no Web Speech API. Offering to auto-open a microphone that cannot
   *  listen is a promise the product cannot keep. */
  dictationSupported: boolean;
}): boolean {
  return input.voiceMode === "on" && input.autoDictation === "unasked" && input.dictationSupported;
}

/**
 * Should the microphone open now that Nemesis has stopped speaking?
 *
 * Every condition is read at the moment of use rather than latched when speech began: voice mode
 * can be switched off mid-utterance, and a learner who did that is telling us not to open a
 * microphone a second later.
 */
export function shouldOpenDictation(input: {
  voiceMode: VoiceMode;
  autoDictation: AutoDictation;
  dictationSupported: boolean;
  /** Only ever after a question. Opening a microphone after a correction would be listening for
   *  an answer to something the learner was just told. */
  moment: "question" | "correction";
  /** Already listening, or already holding text the learner is working on. Reopening would
   *  interrupt them. */
  composerBusy: boolean;
}): boolean {
  if (input.voiceMode !== "on" || input.autoDictation !== "on") return false;
  if (!input.dictationSupported || input.composerBusy) return false;
  return input.moment === "question";
}

// 🔴🔴 THE READING SPEED USED TO LIVE HERE AND IT HAS MOVED TO `playback.ts` (§48). It was a
// SYNTHESIS rate — a number posted to the provider — so every press of the control threw away a paid
// MP3 and bought another one at a different pace: a round trip, a wait, and a restart from the
// beginning of the sentence. Speed is a property of LISTENING. It belongs to the audio element,
// where it is instant and free, and the steps now go below 1 because slowing a RECORDING down is a
// different act from asking a synthesiser to speak unnaturally slowly. The storage key travelled
// with it, so nobody's setting was reset.
