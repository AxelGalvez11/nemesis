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
  // Initialised from `spokenArrival` since 2026-08-31: a conversation begun on the front door
  // arrives with the session already on, so the FIRST packet and reply are spoken-shaped.
  assert.match(CANVAS, /const \[voiceConversing, setVoiceConversing\] = useState\(spokenArrival\);/, "the canvas lost the session state");
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

test("🔴 the bar shows the words being heard, and the sent bubble wears the spoken treatment (2026-08-31)", () => {
  // Owner, testing the reference himself: *"do the transcribed words appear on the chat bar and
  // then get sent to the chat like in claude? ... the transcribed text is lighter and in
  // itallics."* The live bar shows the transcript (not the dictation waveform) while a
  // conversation listens; the utterance filed from it renders italic in a softened ink.
  const composer = read("./canvas-composer.tsx");
  assert.match(composer, /voiceLoop\.active \? \(\s*<div className="ml-\[12px\] flex max-h-\[78px\]/, "the conversation bar went back to the waveform");
  assert.match(composer, />Listening…</, "the empty bar no longer says it is listening");
  assert.match(composer, /text-\[length:var\(--canvas-text-body\)\] italic leading-\[26px\] \[color:color-mix\(in_srgb,var\(--ui-text-primary\)_72%,transparent\)\]/, "the live words lost the spoken treatment");
  const bubble = read("./learner-utterance.tsx");
  // 🔴 REPOINTED 2026-09-03: the ink follows the bubble's own fill now (`--ui-learner-bubble-glyph`),
  // which `accentGlyph` still picks by contrast — so a lighter ground gets whichever of white or
  // near-black clears AA. The spoken treatment is unchanged: the same colour at 85%, italic.
  assert.match(bubble, /via === "spoken"\s*\? "italic \[color:color-mix\(in_srgb,var\(--ui-learner-bubble-glyph\)_85%,transparent\)\]"/, "the spoken bubble lost its treatment");
});

test("🔴 spoken is remembered: filed with the turn, stored in the moment, seeded back on reopen", () => {
  assert.match(CANVAS, /const spokenNow = voiceConversingRef\.current \? \("spoken" as const\) : null;/, "the modality is no longer read before the await");
  assert.match(CANVAS, /saidVia: outgoing\.saidVia,/, "the thread files the utterance without how it arrived");
  assert.match(CANVAS, /\.\.\.\(spokenNow \? \{ spoken: true \} : \{\}\),/, "the moment no longer stores the spoken fact");
  assert.match(CANVAS, /saidVia: moment\.spoken \? "spoken" : null,/, "a reopened thread forgets which words were spoken");
  const moment = strip(read("../../../lib/learn/canvas-moment.ts"));
  assert.match(moment, /\.\.\.\(said && input\.spoken \? \{ spoken: true \} : \{\}\),/, "a typed moment's stored record is no longer byte-identical");
});

test("🔴 a sent turn is spent: the box keeps no copy, and the next answer's modality stays honest (2026-08-31)", () => {
  // Owner: *"once it sends things, the chat composer should be empty until they continue
  // speaking."* `dictation.stop()` keeps the transcript (✓'s review contract), and the sync
  // effect writes any surviving transcript back into the box, so without the reset the sent
  // words reappeared for the length of the reply — and the same stray effect run fired
  // `captured via "spoken"` AFTER `submitted`, mislabelling the next answer's modality for the
  // judge's leniency instruction and §23's response clock. The reset must ride the same batch
  // as the send's own clear.
  const composer = strip(COMPOSER);
  assert.match(composer, /setText\(""\);\s*if \(dictation\.transcript\) dictation\.reset\(\);/, "the send no longer spends the transcript — the sent words refill the box and re-mark the modality");
  // A conversation begins from an empty box; a cancelled dictation's `typedBefore` must not be
  // stitched into the first spoken turn.
  assert.match(composer, /typedBefore\.current = "";\s*voiceLoop\.begin\(\);/, "the voice door resurrects a cancelled dictation's words");
  // And the held verdict still keeps the words: a graded answer stays in the box for the
  // learner's own review — the reset lives in the send, which a held turn never reaches.
  assert.match(strip(HOOK), /else if \(verdict === "held"\) \{\s*stage\.current = "held";/, "the held verdict no longer holds the graded words");
});

test("🔴 the chosen glow: C tuned subtle — session-gated, borrowed meter, opacity-only (2026-08-31)", () => {
  // Owner picked from /dev-preview/voice-glow: *"C but make the reactivity be subtle?"* The lamp
  // exists only while the conversation runs (never for plain dictation or typing), borrows the
  // waveform's own level channel rather than opening anything, and its whole reactive range is
  // one opacity inside 0.35..0.70 — the shadow is written once and never re-rasterised.
  const composer = strip(COMPOSER);
  assert.match(composer, /\{voiceLoop\.active && <VoiceSessionGlow \/>\}/, "the glow lost its session gate");
  assert.match(composer, /subscribeMicLevel\(/, "the glow stopped borrowing the shared meter");
  assert.ok(!/getUserMedia/.test(composer), "the composer opened a microphone of its own for a decoration");
  assert.match(composer, /String\(0\.35 \+ shown \* 0\.35\)/, "the reactive range left the subtle band the owner chose");
});

test("🔴 the front door speaks too — the webapp landing chat carries the same conversation (2026-08-31)", () => {
  // Owner: *"by the landing page i meant the webapp landing chat."* The start screen's composer
  // holds the same loop with the same microphone: bars in the empty send slot, the live italic
  // transcript while listening, one Stop, the lamp — and the auto-send STARTS the canvas.
  const home = strip(read("./canvas-home.tsx"));
  assert.match(home, /useVoiceConversation\(\{/, "the front door lost the loop");
  assert.match(home, /replyAudio: IDLE_REPLY_AUDIO,/, "the front door grew a player — no reply ever plays there");
  assert.match(home, /busy: departing,/, "the quiet-turn grace can re-open the microphone mid-travel");
  assert.match(home, /start\(\{ spoken: true \}\);\s*if \(dictation\.transcript\) dictation\.reset\(\);/, "the sent words refill the travelling pill (the #979 rule)");
  assert.match(home, /\$\{options\?\.spoken \? "&voice=1" : ""\}/, "the spoken fact no longer rides the ask");
  assert.match(home, /voiceLoop\.active \? \(\s*<VoiceStopButton className="self-end \[grid-area:send\]"/, "the running conversation lost its stop in the send slot");
  assert.match(home, /typedBefore\.current = "";\s*voiceLoop\.begin\(\);/, "a cancelled dictation's words can be stitched into the first spoken turn");
  assert.match(home, />Listening…</, "the front door's empty bar no longer says it is listening");
  assert.match(home, /\{voiceLoop\.active && <VoiceSessionGlow \/>\}/, "the front door's session lost the lamp");
  // One lamp, one stop, one glyph set: imported from the session composer, never redrawn.
  assert.match(home, /import \{ IDLE_REPLY_AUDIO, VoiceBarsGlyph, VoiceSessionGlow, VoiceStopButton \} from "\.\/canvas-composer";/, "the front door redrew the session's controls");
});

test("🔴 the canvas ADOPTS a front-door conversation: reply first, microphone after (2026-08-31)", () => {
  // The session must survive the route swap. `?voice=1` rides only beside the ask
  // (learn-entry.ts), the canvas decides BEFORE its first render finishes (the opening ask's
  // packet reads the ref at send time), and the composer's loop enters at "waiting" — the reply
  // speaks before the microphone ever opens on the canvas side.
  const entry = strip(read("../../../lib/learn/learn-entry.ts"));
  assert.match(entry, /spoken: params\.get\("voice"\) === "1"/, "the entry parser dropped the spoken fact");
  const canvas = CANVAS;
  assert.match(canvas, /const spokenArrival = openingSpoken && openingAsk !== null && dictationEngine\(\) === "browser";/, "the arrival gate lost a clause — a deep link or a lame browser could claim a session it cannot hold");
  assert.match(canvas, /useState\(spokenArrival\)/, "the first reply of a spoken arrival is not forced spoken");
  assert.match(canvas, /useRef\(spokenArrival\)/, "the first packet of a spoken arrival reads a stale ref");
  assert.match(canvas, /voiceArrival=\{spokenArrival\}/, "the composer is never told to adopt");
  const hook = strip(HOOK);
  const adopt = /const adopt = \(\) => \{[\s\S]*?\};/.exec(hook);
  assert.ok(adopt, "the hook lost adopt()");
  assert.match(adopt[0], /stage\.current = "waiting"/, "adoption no longer waits on the reply");
  assert.ok(!/dictation\.start\(\)/.test(adopt[0]), "adoption opens the microphone while the reply is coming");
});

test("🔴 the silence rule submits the PRESENT text — the last word of a spoken turn is not dropped (2026-08-31)", () => {
  // Found by the front-door harness: the ask arrived one word short. The timeout's closure held
  // the submit from the render that armed it, where the composer's text lagged the transcript by
  // one sync-effect pass. The hook re-reads through a ref written every render.
  const hook = read("./use-voice-conversation.ts");
  assert.match(hook, /const submitRef = useRef\(submit\);\s*submitRef\.current = submit;/, "the submit ref is gone — the timeout submits a stale render's text");
  assert.match(hook, /const verdict = submitRef\.current\(\);/, "the silence rule stopped reading the present");
  assert.ok(!/const verdict = submit\(\);/.test(hook), "a direct stale call came back beside the ref");
});

test("🔴 the voice speaks while the model is still writing — the head start chain holds (2026-08-31)", () => {
  // Owner: "voice mode still has a 'thinking' and doesnt answer quickly." Measured with the
  // product's own packet: the first sentence exists on the stream at 1.6–2.2s; the full reply at
  // 2.7–4.7s; the shipped player waited for all of it, behind four SEQUENTIAL context reads.
  // The chain: canvas-chat streams spoken turns into spoken-opener.ts's watcher → learning-canvas
  // primes the player with the first sentence → start() CONTINUES the primed timeline when its
  // plan opens with that exact text. Break any link and voice is slow again while every test
  // beside this one stays green.
  const chat = strip(read("./canvas-chat.ts"));
  // 🔴 ONE GATHER IS THE INVARIANT; THE NUMBER OF READS IN IT IS NOT. This pinned exactly four
  // entries and tripped when retrieval added a fifth — which is the same fix as the original, not a
  // regression of it. What must stay true is that these reads share one wait instead of queueing.
  const gather = chat.slice(chat.indexOf("await Promise.all(["), chat.indexOf("const memory ="));
  for (const read of ["pinnedCommentsBlock(uid, canvas)", "loadMemory(uid)", "loadProjectInstructions(uid, canvas.id)", "loadToolCatalogue()"]) {
    assert.ok(gather.includes(read), `${read} left the single context gather — a quarter to a full second of queue time is back on every turn`);
  }
  assert.equal(gather.match(/await Promise\.all\(/g)?.length, 1, "the context reads were split across more than one wait");
  assert.match(chat, /surroundings\.spokenConversation && onSpokenOpener \? spokenOpenerWatch\(\) : null/, "the stream watcher lost its gate — either typed turns stream for nothing, or spoken turns never stream at all");
  assert.match(chat, /const opener = watch\.feed\(accumulated\);\s*if \(opener\) onSpokenOpener\?\.\(opener\);/, "the watcher's opener no longer reaches the caller");

  const audio = strip(read("./use-response-audio.ts"));
  assert.match(audio, /prime: \(text: string\) => void;/, "the player lost prime() — nothing can start the reply's audio early");
  assert.match(audio, /parts\[0\]\?\.text === head\.text/, "the continuation no longer proves the primed text is the plan's own opener — a mismatch would double-speak or truncate");
  assert.match(audio, /primed\.current = null;\s*teardown\(\);/, "stop() no longer kills a primed head start");

  const voice = strip(VOICE);
  const primeGate = /primeReply: \(opener: string\) => \{\s*if \(!alwaysSpeak\) return;/;
  assert.match(voice, primeGate, "the head start lost its session gate — audio could start uninvited outside a voice conversation");
  assert.match(voice, /if \(arrived && player\.primedOpener\(\) === null\) replyAudio\.stop\(\);/, "the autoplay effect stops the very audio the head start began — the opener is cut mid-word on every voice turn");

  const canvas = CANVAS;
  assert.match(canvas, /\(opener\) => voiceRef\.current\?\.primeReply\(opener\)/, "converse no longer hands the opener to the voice");
  assert.match(canvas, /concludePrime\(Boolean\(decision\?\.say\)\)/, "a primed turn that dies silent strands the conversation in 'speaking' for ever");

  const loop = strip(HOOK);
  assert.match(loop, /\(stage\.current === "waiting" \|\| stage\.current === "speaking"\) && !busy && replyAudio\.status === "idle"/, "the speaking-with-idle-player grace is gone — a failed head start stalls the loop with no way back to the microphone");
});

test("🔴 spoken turns ask for the minimal decision block, typed turns are untouched (2026-08-31)", () => {
  // ~344 bytes of JSON preamble streamed before the first word of a spoken answer; the lean
  // block measured at 29–77. The instruction lives INSIDE the spokenConversation packet block,
  // so a typed turn's packet stays byte-identical.
  const router = read("../../../lib/learn/turn-router.ts");
  const spoken = /context\.spokenConversation\s*\?[\s\S]*?role: "system" as const,\s*\}\]\s*:\s*\[\]\),/.exec(router);
  assert.ok(spoken, "the spoken-conversation packet block is gone");
  assert.match(spoken[0], /keep the decision block itself minimal/, "the lean-block ask left the packet — half a second of JSON preamble is back before every spoken answer");
  assert.match(spoken[0], /\{"then": "reply"\}/, "the worked example is gone, and the contract's own lesson is that the model sends what the shape shows");
});
