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
// The transport, which lives in the canvas's top row since 2026-08-25 — see the split below.
const BAR = readFileSync(new URL("./canvas-audio-bar.tsx", import.meta.url), "utf8");
const HEADER = readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const VOICE_HOOK = readFileSync(new URL("./use-canvas-voice.ts", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
const AUDIO_HOOK = readFileSync(new URL("./use-response-audio.ts", import.meta.url), "utf8");

test("🔴 copy and read-aloud are reachable under an answer", () => {
  assert.ok(ACTIONS.includes("Copy"), "Copy is not offered");
  assert.ok(PLAYER.includes("Read aloud"), "Read aloud is not offered");
  assert.match(CANVAS, /<ReplyActions/, "the row is not mounted on the canvas");
});

test("🔴🔴 exactly the five controls the owner asked for, each wired — and the two they cut stay cut", () => {
  // Owner re-spec, 2026-08-25, moving the transport into the canvas's top row: *"dont add the
  // 'audio time' just 'x' forward and back, the speed, and the pause"*. Calibration: delete any
  // handler below and this reddens.
  const wired: Array<[string, RegExp]> = [
    ["play / pause", /onClick=\{audio\.toggle\}/],
    ["speed", /onClick=\{audio\.cycleRate\}/],
    ["rewind", /audio\.seekBy\(-SEEK_STEP_SECONDS\)/],
    ["fast-forward", /audio\.seekBy\(SEEK_STEP_SECONDS\)/],
    ["stop / dismiss", /audio\.stop\(\)/],
    ["playing indication", /audio\.playing \? "debug-pause" : "play"/],
  ];
  for (const [what, pattern] of wired) assert.match(BAR, pattern, `${what} is not wired`);
  // 🔴 THE SPEED CONTROL SHOWS ITS VALUE. A dial glyph says "speed exists"; `1.25×` says what it is
  // set to, which is the only question anyone has about a speed control they did not just press.
  assert.match(BAR, /rateLabel\(audio\.rate\)/, "the speed control does not show the current rate");
  const cut: Array<[string, RegExp]> = [
    ["the scrubber", /audio\.scrub\(|type="range"/],
    ["the clock", /formatClock\(|audio\.currentTime/],
  ];
  for (const [what, pattern] of cut) {
    assert.ok(!pattern.test(BAR), `${what} is back in the bar — the owner cut it, twice`);
  }
});

test("🔴🔴 the transport is in the CANVAS HEADER, and the answer keeps only the start button", () => {
  // Owner, 2026-08-25: *"when user has voice to speak responses outloud could the popup be in the
  // upper left either next to the upper left icons in canvas?"* — and, shown both edges of that
  // row, they chose the right, beside the existing icons.
  //
  // The split is: start belongs to an ANSWER ("read me THIS"), transport belongs to what is
  // PLAYING — which outlives the scroll position. Calibration: put pause back under the answer, or
  // drop the bar from the header, and this reddens.
  assert.match(HEADER, /<CanvasAudioBar audio=\{replyAudio\} \/>/, "the bar is not mounted in the canvas header");
  const beforeIcons = HEADER.indexOf("<CanvasAudioBar") < HEADER.indexOf("<SourcesControl");
  assert.ok(beforeIcons, "the bar is not beside the icons the owner pointed at");
  for (const gone of [/audio\.toggle/, /audio\.seekBy/, /audio\.cycleRate/]) {
    assert.ok(!gone.test(PLAYER), "a transport control is back under the answer");
  }
  // 🔴 ONE CONTROLLER, TWO PLACES. Two `useResponseAudio` calls would give one answer two playheads
  // and a pause button in the header that pauses nothing.
  assert.match(CANVAS, /replyAudio=\{voice\.replyAudio\}/, "the header is not reading the one shared controller");
});

test("🔴🔴 no player CARD — no border, no background, no toolbar under the answer", () => {
  // Owner: *"quiet, compact, only prominent while relevant… no unnecessary borders/cards/toolbars.
  // The main content should remain the focus."* Calibration: wrap the controls in a bordered panel
  // and this reddens.
  for (const [where, file] of [["under the answer", PLAYER], ["in the header", BAR]] as const) {
    assert.ok(!/\bborder-\(/.test(file), `the playback controls have drawn themselves a border ${where}`);
    assert.ok(!/\brounded-2xl|\bshadow-|\bbg-\(--ui-bg-(secondary|elevated)\)/.test(file), `the controls have become a card ${where}`);
  }
  // And they are inside the SAME row as Copy rather than a second surface below it.
  // 🔴 `text={spoken}`, NOT `text={text}`: the player is handed the RAW reply so `replySpeechPlan`
  // can read the `[say: …]` marks and route each sentence to the voice that must say it. The
  // clipboard keeps the flattened prose. Calibration: hand the player `text` and this reddens.
  assert.match(ACTIONS, /<ResponseAudioControls audio=\{audio\} text=\{spoken\} \/>/);
});

test("🔴 the controls exist only while there is audio, and the transition is on the whole group", () => {
  // Five dead buttons sitting in the canvas chrome is this codebase's most-repeated defect made
  // into a design. Idle is no bar at all, and `0fr` means it takes no width from the title either.
  assert.match(BAR, /const open = audio\.status !== "idle"/);
  assert.match(BAR, /open \? "grid-cols-\[1fr\] opacity-100" : "grid-cols-\[0fr\] opacity-0"/);
  assert.match(BAR, /transition-\[grid-template-columns,opacity\]/);
  // And the one control that IS per-answer says which of its two things it is doing.
  assert.match(PLAYER, /open \? "Stop reading" : "Read aloud"/);
});

test("🔴🔴 ONE player for the whole response, never one per block", () => {
  // Owner, 2026-08-22: *"It's supposed to be one player for the whole response."* An answer renders
  // as SEGMENTS — prose runs, drawings, spoken examples, each its own element — and the obvious
  // mistake is to hang the controls inside that map, which would put a transport row under every
  // paragraph and give one answer several independent playheads.
  //
  // Calibration: move `<ReplyActions` inside `replySegments(...).map(` and this reddens.
  assert.equal((CANVAS.match(/<ReplyActions/g) ?? []).length, 1, "the answer mounts more than one player");
  const map = CANVAS.indexOf("replySegments(replyText, replyVisualList).map(");
  const mapEnd = CANVAS.indexOf("\n              )}", map);
  assert.ok(map > 0 && mapEnd > map, "the segment map moved; re-point this check");
  assert.ok(CANVAS.indexOf("<ReplyActions") > mapEnd, "the player is rendered inside the per-segment map");
  // And ONE controller behind it, so the whole answer has a single playhead, a single progress bar
  // and a single speed — `useResponseAudio` is called once, by the voice hook, never per segment.
  assert.equal((VOICE_HOOK.match(/useResponseAudio\(/g) ?? []).length, 1);
  assert.match(CANVAS, /audio=\{voice\.replyAudio\}/, "the row is not reading the one shared controller");
});

test("🔴 turning autoplay ON does not retro-read the answer already on screen", () => {
  // A preference about what happens NEXT must not narrate the paragraph you are in the middle of
  // reading. Calibration: put `mode` back in the effect's dependencies and this reddens.
  assert.match(VOICE_HOOK, /const arrived = autoplayed\.current !== replyKey/);
  assert.match(VOICE_HOOK, /if \(!arrived \|\| !replyKey \|\| !reply\) return;/);
});

test("🔴🔴 the row does NOT appear while the turn is still arriving", () => {
  // Copying half an answer copies half an answer, and a play button on a sentence about to be
  // replaced reads as broken.
  assert.match(CANVAS, /\{!turnInFlight && replyText\.trim\(\) && \(/, "the actions render mid-turn");
});

test("🔴🔴 it copies the PROSE, not the wire format", () => {
  // `replySegments` splits drawings out of the text. Pasting "[figure 1]" into someone's notes is
  // pasting our own wire format at them, and a synthesiser reading it aloud is worse.
  // 1600, not 900: the mount now carries `spoken={replyText}` and its comment ahead of the copy
  // expression, and a window that ends before the expression it asserts on reddens on honesty.
  const mount = CANVAS.slice(CANVAS.indexOf("<ReplyActions"), CANVAS.indexOf("<ReplyActions") + 1600);
  assert.match(mount, /replySegments\(replyText, replyVisualList\)/, "the copy text is not derived from the split");
  assert.match(mount, /segment\.kind === "prose"/, "drawings are being copied as their markers");
});

test("🔴🔴 two lanes, one sound — no start leaves the other lane playing", () => {
  // Owner, 2026-08-23: pressing read-aloud must not stack voices. Within one lane stacking was
  // already impossible (the player's run ticket, the speaker's single element); ACROSS the two —
  // the answer's player and the narration speaker — four starts each silenced only their own.
  // Calibration: remove `hushNarration()` from the player wrapper, or either `player.stop()`, or
  // the replay wrapper's stop, and the matching line reddens.
  assert.match(VOICE_HOOK, /start: \(text: string\) => \{\n\s*hushNarration\(\);\n\s*player\.start\(text\);/, "starting the answer's audio no longer silences the narration lane");
  // The IMPLEMENTATION (`=> {`), not the interface line that shares its prefix.
  const aloud = VOICE_HOOK.slice(VOICE_HOOK.indexOf("speakAloud: (text: string) => {"));
  assert.ok(aloud.slice(0, 400).includes("player.stop()"), "a spoken passage no longer silences the answer's player");
  const example = VOICE_HOOK.slice(VOICE_HOOK.indexOf("speakExample: (key: string, locale: string, text: string) => {"));
  assert.ok(example.slice(0, 500).includes("player.stop()"), "an example row no longer silences the answer's player");
  assert.match(VOICE_HOOK, /replay: \(text, voice\) => \{\n\s*player\.stop\(\);/, "a replay press no longer silences the answer's player");
  // 🔴 The narration hush bumps the press counter, or a chunked passage resumes on a timer over
  // whatever started meanwhile.
  const hush = VOICE_HOOK.slice(VOICE_HOOK.indexOf("const hushNarration"));
  assert.ok(hush.slice(0, 400).includes("aloudPress.current += 1"), "the hush no longer cancels a chunked passage's loop");
});

test("🔴 a refused clipboard is silent rather than an error strip", () => {
  assert.match(ACTIONS, /catch \{/);
  assert.ok(!/setError|throw/.test(ACTIONS), "a clipboard refusal is being escalated");
});

// 🔴 The "speed shows its value" guard left with the speed control itself (owner cut, 2026-08-23
// — see the four-controls test above). The RULE survives where the control does: the hook still
// owns `cycleRate`, and the element-not-provider guard below still pins how any future speed
// control must behave.

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
  // 🔴 THE ROW BECAME THE BUTTON (2026-08-25). Owner circled the `⋮` and asked for it gone; what
  // the click revealed was this single toggle, so the toggle moved out and the menu went. The
  // invariant is unchanged — autoplay is offered on the canvas — only its shape moved, so this
  // matches the control rather than the menu row it used to be.
  assert.match(CONTROLS, /aria-pressed=\{voiceOn\}/, "autoplay is not offered on the canvas");
  assert.match(CONTROLS, /"Read responses aloud"/, "the control no longer says what it does");
  // 🔴 SCOPED TO THE COMPONENT, because the canvas has a SECOND `⋮` — Session options, by the
  // title — which the owner did not ask about and which is still a real menu. A file-wide search
  // for the glyph reddens on that one, which my first version of this line did.
  const control = CONTROLS.slice(CONTROLS.indexOf("export function OptionsControl"));
  const body = control.slice(0, control.indexOf("\n}"));
  assert.ok(!/kebab-vertical/.test(body), "the `⋮` is back on the read-aloud control");
  assert.ok(!/useState/.test(body), "the read-aloud control grew a menu again");
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
  assert.match(CANVAS, /useCanvasVoice\(policy, turnInFlight \? null : spokenReply\)/);
});

test("🔴🔴 the canvas menu asks ONE voice question, with no explanation under it", () => {
  // Owner, 2026-08-25, with the menu open: *"also remove this description and the 'open mic after
  // each question' option"*. The hint explained a toggle whose own label already said what it did.
  assert.ok(!/Nemesis starts reading each answer/.test(CONTROLS), "the description is back under the toggle");
  assert.ok(!/Open the mic after each question/.test(CONTROLS), "the mic option is back in the menu");
  // 🔴 AND IT WENT END TO END, NOT JUST OUT OF SIGHT. That row was the only switch `autoDictation`
  // had, so leaving the preference behind would leave a lane that can never run — this codebase's
  // most-repeated defect wearing the other face.
  const PREFS = readFileSync(new URL("../../../lib/learn/voice-preferences.ts", import.meta.url), "utf8");
  const COMPOSER = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
  assert.ok(!/export (type AutoDictation|function (read|write)AutoDictation|function should(Ask|Open)Dictation)/.test(PREFS), "the auto-dictation preference outlived its only switch");
  assert.ok(!/listenSignal\?:|\[listenSignal\]/.test(COMPOSER), "the composer still listens for a signal nothing can send");
  // 🔴 DICTATION ITSELF IS UNTOUCHED — the button, and hold-space-to-talk.
  assert.match(COMPOSER, /startDictation/, "the microphone button went with the preference");
});
