import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── The row of controls under an answer, and where voice lives now (§48) ─────────────────────
//
// Owner, 2026-08-20: *"add the chatgpt style icons at the end of responses for copying and also for
// voice, there should also be a control for controlling the voice speaking speed."*
// Owner, 2026-08-22: *"Canvas should not make the user repeatedly choose a voice… I do not want a
// large traditional audio-player card appearing under every Nemesis response."*

const ACTIONS = readFileSync(new URL("./reply-actions.tsx", import.meta.url), "utf8");
const PLAYER = readFileSync(new URL("./response-audio-controls.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const VOICE_HOOK = readFileSync(new URL("./use-canvas-voice.ts", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
const AUDIO_HOOK = readFileSync(new URL("./use-response-audio.ts", import.meta.url), "utf8");

test("🔴 copy and read-aloud are reachable under an answer", () => {
  assert.ok(ACTIONS.includes("Copy"), "Copy is not offered");
  assert.ok(PLAYER.includes("Read aloud"), "Read aloud is not offered");
  assert.match(CANVAS, /<ReplyActions/, "the row is not mounted on the canvas");
});

test("🔴🔴 every control the owner asked for is present, and each one is wired", () => {
  // Owner: play/pause, playback speed, rewind, fast-forward, current progress, seek, and a clear
  // indication that audio is playing. Calibration: delete any handler below and this reddens.
  const wired: Array<[string, RegExp]> = [
    ["play / pause", /onClick=\{audio\.toggle\}/],
    ["rewind", /audio\.seekBy\(-SEEK_STEP_SECONDS\)/],
    ["fast-forward", /audio\.seekBy\(SEEK_STEP_SECONDS\)/],
    ["seek", /audio\.scrub\(/],
    ["playback speed", /onClick=\{audio\.cycleRate\}/],
    ["progress", /progressFraction\(audio\.currentTime, audio\.reach\)/],
    ["elapsed time", /formatClock\(audio\.currentTime\)/],
    ["playing indication", /audio\.playing \? "debug-pause" : "play"/],
  ];
  for (const [what, pattern] of wired) assert.match(PLAYER, pattern, `${what} is not wired`);
});

test("🔴🔴 no player CARD — no border, no background, no toolbar under the answer", () => {
  // Owner: *"quiet, compact, only prominent while relevant… no unnecessary borders/cards/toolbars.
  // The main content should remain the focus."* Calibration: wrap the controls in a bordered panel
  // and this reddens.
  assert.ok(!/\bborder-\(/.test(PLAYER), "the playback controls have drawn themselves a border");
  assert.ok(!/\brounded-2xl|\bshadow-|\bbg-\(--ui-bg-(secondary|elevated)\)/.test(PLAYER), "the controls have become a card");
  // And they are inside the SAME row as Copy rather than a second surface below it.
  assert.match(ACTIONS, /<ResponseAudioControls audio=\{audio\} text=\{text\} \/>/);
});

test("🔴 the controls exist only while there is audio, and the transition is on the whole group", () => {
  // Five dead buttons under every paragraph is this codebase's most-repeated defect made into a
  // design. Idle is one speaker glyph.
  assert.match(PLAYER, /const open = audio\.status !== "idle"/);
  assert.match(PLAYER, /open \? "grid-cols-\[1fr\] opacity-100" : "grid-cols-\[0fr\] opacity-0"/);
  assert.match(PLAYER, /transition-\[grid-template-columns,opacity\]/);
});

test("🔴🔴 the row does NOT appear while the turn is still arriving", () => {
  // Copying half an answer copies half an answer, and a play button on a sentence about to be
  // replaced reads as broken.
  assert.match(CANVAS, /\{!turnInFlight && replyText\.trim\(\) && \(/, "the actions render mid-turn");
});

test("🔴🔴 it copies the PROSE, not the wire format", () => {
  // `replySegments` splits drawings out of the text. Pasting "[figure 1]" into someone's notes is
  // pasting our own wire format at them, and a synthesiser reading it aloud is worse.
  const mount = CANVAS.slice(CANVAS.indexOf("<ReplyActions"), CANVAS.indexOf("<ReplyActions") + 900);
  assert.match(mount, /replySegments\(replyText, replyVisualList\)/, "the copy text is not derived from the split");
  assert.match(mount, /segment\.kind === "prose"/, "drawings are being copied as their markers");
});

test("🔴 a refused clipboard is silent rather than an error strip", () => {
  assert.match(ACTIONS, /catch \{/);
  assert.ok(!/setError|throw/.test(ACTIONS), "a clipboard refusal is being escalated");
});

test("🔴 the speed control shows its VALUE, so it needs no menu", () => {
  assert.match(PLAYER, /\{audio\.rate\}×/);
});

// ── Where the voice is chosen ────────────────────────────────────────────────────────────────

test("🔴🔴 the Canvas no longer asks which voice, and no longer asks how fast", () => {
  // Owner: *"Canvas should not make the user repeatedly choose a voice."* Calibration: put the voice
  // list back in the options menu and this reddens.
  assert.ok(!/CANVAS_VOICES/.test(CONTROLS), "the voice picker is still in the Canvas menu");
  assert.ok(!/onSetVoice|onCycleSpeed/.test(CONTROLS), "a voice or speed control is still in the Canvas menu");
  assert.ok(!/onSetVoice|onCycleSpeed/.test(VOICE_HOOK), "the Canvas hook still owns choosing a voice");
});

test("🔴🔴 the ONE voice decision left on the Canvas is autoplay", () => {
  // Owner: *"Canvas should have a simple option for: Automatically read responses aloud."*
  assert.match(CONTROLS, /label="Read responses aloud"/, "autoplay is not offered on the canvas");
  assert.match(VOICE_HOOK, /if \(mode !== "on"\) return;\n    replyAudio\.start\(reply\.text\)/, "autoplay does not start the audio");
});

test("🔴🔴 autoplay and manual play are the SAME path, so one cannot work while the other does not", () => {
  // Owner: *"When disabled… the user should still be able to manually play a response."* Autoplay
  // decides whether to press play; everything after that is identical.
  assert.match(VOICE_HOOK, /replyAudio\.start\(reply\.text\)/);
  assert.match(PLAYER, /audio\.start\(text\)/);
});

test("🔴🔴 the Canvas reads the voice from Settings and follows it without a reload", () => {
  // Owner: *"The selected voice should persist for that user and be used everywhere Nemesis reads
  // content aloud."* `storage` fires only in OTHER tabs, so Settings dispatches its own event too;
  // without that, changing the voice and returning to an open canvas keeps the old one until a
  // refresh, which reads exactly like the setting not having worked.
  assert.match(VOICE_HOOK, /readReadingVoice\(storage\)/);
  assert.match(VOICE_HOOK, /addEventListener\("storage", reread\)/);
  assert.match(VOICE_HOOK, /addEventListener\(READING_VOICE_KEY, reread\)/);
  const SETTINGS = readFileSync(new URL("../shell/voice-settings.tsx", import.meta.url), "utf8");
  assert.match(SETTINGS, /dispatchEvent\(new Event\(READING_VOICE_KEY\)\)/, "Settings does not tell open canvases");
});

test("🔴🔴 the voice can be HEARD before it is chosen, and picking is a separate press", () => {
  // Owner: *"optionally preview the voice before selecting it."* One button that both auditions and
  // commits makes hearing all six mean choosing all six.
  const SETTINGS = readFileSync(new URL("../shell/voice-settings.tsx", import.meta.url), "utf8");
  assert.match(SETTINGS, /const PREVIEW_LINE = /, "there is nothing for a preview to say");
  assert.match(SETTINGS, /onPick=\{\(\) => choose\(voice\)\}/);
  assert.match(SETTINGS, /onPreview=\{\(\) => void preview\(voice\)\}/);
  // 🔴 The preview goes down the SAME request builder the canvas uses, or it is a demonstration of
  // a second code path rather than of the voice you are about to live with.
  assert.match(SETTINGS, /ttsRequest\(\{/);
});

// ── Latency, and the two things that must never wait on each other ───────────────────────────

test("🔴🔴 changing the playback speed touches the ELEMENT, never the provider", () => {
  // Owner: *"Changing playback speed should not regenerate the audio."* Calibration: make
  // `cycleRate` re-run `start` and this reddens.
  const cycle = AUDIO_HOOK.slice(AUDIO_HOOK.indexOf("const cycleRate"), AUDIO_HOOK.indexOf("const cycleRate") + 700);
  assert.match(cycle, /element\.current\.playbackRate = next/, "the rate is not applied to the element");
  assert.ok(!/fetch\(|start\(/.test(cycle), "changing speed re-fetches the audio");
});

test("🔴🔴 audio starts on the FIRST bytes, not on the last", () => {
  // The routes both stream and the client used to throw that away with `await res.blob()`, which
  // waits for the last byte before the first can be played. Calibration: replace `pumpInto` with a
  // blob read and this reddens.
  assert.match(AUDIO_HOOK, /pumpInto\(bag, response\.body, beginPlayback, stale\)/);
  const STREAM = readFileSync(new URL("../../../lib/learn/audio-stream.ts", import.meta.url), "utf8");
  assert.match(STREAM, /onFirstBytes\?\.\(\)/, "nothing reports the moment playback can start");
  assert.match(STREAM, /mp3StreamingSupported/, "there is no streaming path at all");
  assert.match(STREAM, /function bufferedSink/, "a browser without MediaSource is left silent");
});

test("🔴🔴 the ANSWER is never waiting on the audio", () => {
  // Owner: *"Text rendering should never be delayed by TTS."* Nothing on the render path awaits a
  // synthesis: the controller is started from an effect, after the answer is already on screen.
  assert.ok(!/await .*replyAudio|await voice\./.test(CANVAS), "the canvas awaits speech while rendering");
  assert.match(VOICE_HOOK, /useEffect\(\(\) => \{\n    \/\/ A new answer replaces the old one/, "autoplay is not deferred to an effect");
});

test("🔴🔴 autoplay fires ONCE, at the end of the turn, not on every streamed chunk", () => {
  // `spokenReply`'s key is derived from the text, and the text GROWS while an answer streams — so an
  // ungated autoplay would buy a fresh synthesis per chunk and replay the opening over and over.
  assert.match(CANVAS, /useCanvasVoice\(policy, policy\.judging, turnInFlight \? null : spokenReply\)/);
});
