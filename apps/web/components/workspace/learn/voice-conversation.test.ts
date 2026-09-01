/**
 * The voice conversation: a SESSION of quick STT and TTS around the ordinary send path.
 *
 * Owner, 2026-08-30: *"voice mode should be accessed via the chat composer, the send button
 * should function like in chatgpt becoming the voice button until text is manually [typed], it
 * should work like claude where its not real time voice but just quick tts and stt."* Measured
 * on claude.ai the same evening: bars in the send slot while the box is empty, "Listening" on
 * press, one Stop control, the reply read aloud, the microphone open again after it.
 *
 * 🔴 AND IT IS NOT THE LANE THE OWNER KILLED ON 2026-08-25. That was "open mic after each
 * question" — a standing preference. This exists only between an explicit press and an explicit
 * stop. The anti-auto-mic guards in reply-actions.test.ts stay green because nothing here is a
 * preference, a menu row, or a signal the composer waits on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { playbackFinished, SILENCE_SEND_MS } from "./use-voice-conversation";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const HOOK = read("./use-voice-conversation.ts");
const COMPOSER = read("./canvas-composer.tsx");
const VOICE = read("./use-canvas-voice.ts");
const CANVAS = strip(read("./learning-canvas.tsx"));

// ── the pure edge: when has the spoken reply actually finished ──────────────────────────────

test("playbackFinished: finished means complete, stopped, and at the end", () => {
  assert.equal(playbackFinished({ complete: true, currentTime: 11.8, playing: false, reach: 12 }), true);
  assert.equal(playbackFinished({ complete: true, currentTime: 12, playing: false, reach: 12 }), true);
});

test("playbackFinished: a pause in the middle is not the end", () => {
  assert.equal(playbackFinished({ complete: true, currentTime: 4, playing: false, reach: 12 }), false);
});

test("playbackFinished: still playing is not the end, however close", () => {
  assert.equal(playbackFinished({ complete: true, currentTime: 11.9, playing: true, reach: 12 }), false);
});

test("playbackFinished: audio that never started cannot have finished", () => {
  assert.equal(playbackFinished({ complete: false, currentTime: 0, playing: false, reach: 0 }), false);
  assert.equal(playbackFinished({ complete: true, currentTime: 0, playing: false, reach: 0 }), false);
});

// ── the loop's construction ─────────────────────────────────────────────────────────────────

test("🔴 the silence rule is a timer on the transcript, with words on the page", () => {
  assert.ok(SILENCE_SEND_MS >= 1000 && SILENCE_SEND_MS <= 3000, "the silence window left the conversational range");
  assert.match(HOOK, /if \(!transcript\.trim\(\)\) return;/, "an empty transcript can now trigger a send");
});

test("🔴 browser lane only — a conversation must be able to hear itself pausing", () => {
  assert.match(HOOK, /dictationEngine\(\) === "browser"/, "the xAI record-then-transcribe lane got a silence rule it cannot implement");
});

test("🔴 one microphone, one pipeline: the loop borrows the composer's own dictation and submit", () => {
  assert.ok(!/useCanvasDictation\(/.test(strip(HOOK)), "the loop opened its own microphone");
  const composer = strip(COMPOSER);
  assert.match(composer, /const voiceLoop = useVoiceConversation\(\{/, "the composer no longer mounts the loop");
  assert.ok((composer.match(/useCanvasDictation\(\)/g) ?? []).length === 1, "a second dictation instance appeared");
});

test("🔴 a graded answer is never auto-sent — the evidence rule holds under voice", () => {
  assert.match(strip(COMPOSER), /if \(intent\.kind === "answer"\) return "held";/, "the loop can write a misheard answer into the evidence");
  assert.match(strip(HOOK), /verdict === "held"/, "the hook no longer honours the held verdict");
});

test("🔴 the send slot is the voice door when empty, the stop while conversing, the arrow otherwise", () => {
  const composer = strip(COMPOSER);
  assert.match(composer, /voiceLoop\.active \? \(\s*<VoiceStopButton className="ml-\[8px\]" onClick=\{voiceLoop\.end\} \/>/, "the running conversation lost its stop in the send slot");
  assert.match(composer, /!showSend && !busy && voiceLoop\.offered \? \(/, "the voice door stopped being the empty-box state of the send slot");
  assert.match(composer, /<ComposerSend/, "the send button itself left the composer");
  // The two swaps share the send button's own geometry, so the pill never changes shape.
  const doors = composer.match(/size-\[var\(--composer-control\)\] shrink-0 items-center justify-center rounded-full bg-\(--ui-action\)/g) ?? [];
  assert.ok(doors.length >= 2, "the voice door or stop lost the send button's geometry");
});

test("🔴 the session forces the reply spoken — as an argument, not a second mode", () => {
  // The stored autoplay preference died with #937 the same day; the session's play is gated on
  // `alwaysSpeak` alone and is the ONE self-press left (reply-actions.test.ts counts it).
  assert.match(VOICE, /alwaysSpeak = false/, "the session argument left the voice hook");
  assert.match(VOICE, /if \(!arrived \|\| !replyKey \|\| !reply \|\| !alwaysSpeak\) return;/, "the session no longer presses play");
  assert.match(CANVAS, /const \[voiceConversing, setVoiceConversing\] = useState\(false\);/, "the canvas lost the session state");
  assert.match(CANVAS, /useCanvasVoice\(turnInFlight \? null : spokenReply, voiceConversing\)/, "the session state no longer reaches the voice hook");
  // The handler writes a ref BESIDE the state since 2026-08-31: surroundings() reads the fact at
  // SEND time, so a spoken turn's packet carries it without a stale closure.
  assert.match(CANVAS, /voiceConversingRef\.current = active;/, "the send-time fact lost its ref");
  assert.match(CANVAS, /spokenConversation: voiceConversingRef\.current,/, "the surroundings no longer carry the spoken fact");
});

test("🔴 no preference, no menu row, no listen signal — the 2026-08-25 rulings stand", () => {
  for (const source of [HOOK, COMPOSER, VOICE]) {
    const code = strip(source);
    assert.ok(!/AutoDictation|shouldOpenDictation|listenSignal/.test(code), "the auto-mic preference machinery is back");
  }
  assert.ok(!/Open the mic after each question/.test(COMPOSER), "the removed menu row's lane is back");
});

test("🔴 a quiet turn re-arms the microphone — the loop can never wait for ever", () => {
  assert.match(HOOK, /replyAudio\.failure !== null/, "a failed synthesis strands the conversation");
  assert.match(HOOK, /replyAudio\.status === "idle" && !replyAudio\.playing/, "a turn with nothing to say strands the conversation");
});
