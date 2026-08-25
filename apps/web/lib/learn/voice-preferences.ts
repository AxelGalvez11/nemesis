// Whether Nemesis reads its answers aloud by itself.
//
// 🔴🔴 THIS FILE USED TO BE ABOUT THE MICROPHONE, AND THAT HALF IS DELETED (owner, 2026-08-25:
// *"remove … the 'open mic after each question' option"*). `AutoDictation` was a three-state
// preference — unasked / on / off — behind an auto-open-the-mic lane, and the menu row removed that
// day was the only thing that could set it. Everything downstream of it therefore became
// unreachable rather than merely unused, so the type, its storage key, `shouldAskAboutAutoDictation`
// and `shouldOpenDictation` all went with the row.
//
// The reasoning that justified the three states is worth keeping even though the states are gone,
// because the next preference in this file will be tempted by the same shape: two booleans
// (`hasBeenAsked` + `wants`) have four combinations and only three mean anything, and the first
// piece of code to read `wants` without checking `asked` treats "never asked" as "said no". One
// value with named states, or nothing.
//
// Dictation itself is untouched. The composer still has its microphone button, hold-space-to-talk
// still works, and `speechRecognitionSupported()` still gates both.

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

const VOICE_MODE_KEY = "nemesis.voice.mode";

/** 🔴 OFF. Voice mode is a mode the learner turns on, never something that starts talking at
 *  somebody who opened a canvas to read. */
export const DEFAULT_VOICE_MODE: VoiceMode = "off";

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

// 🔴🔴 THE READING SPEED USED TO LIVE HERE AND IT HAS MOVED TO `playback.ts` (§48). It was a
// SYNTHESIS rate — a number posted to the provider — so every press of the control threw away a paid
// MP3 and bought another one at a different pace: a round trip, a wait, and a restart from the
// beginning of the sentence. Speed is a property of LISTENING. It belongs to the audio element,
// where it is instant and free, and the steps now go below 1 because slowing a RECORDING down is a
// different act from asking a synthesiser to speak unnaturally slowly. The storage key travelled
// with it, so nobody's setting was reset.
