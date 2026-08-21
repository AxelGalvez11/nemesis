import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── The row of controls under an answer ──────────────────────────────────────────────────────
//
// Owner, 2026-08-20: *"add the chatgpt style icons at the end of responses for copying and also for
// voice, there should also be a control for controlling the voice speaking speed."*

const ACTIONS = readFileSync(new URL("./reply-actions.tsx", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");

test("🔴 copy, read aloud and speed are all reachable under an answer", () => {
  for (const label of ["Copy", "Read aloud", "Reading speed"]) {
    assert.ok(ACTIONS.includes(label), `${label} is not offered`);
  }
  assert.match(CANVAS, /<ReplyActions/, "the row is not mounted on the canvas");
});

test("🔴🔴 one button for play AND stop, never two", () => {
  // A separate stop control is dead on every answer that is not currently playing, and a control
  // that does nothing is this codebase's most-repeated defect — it has its own acceptance test.
  // Calibration: split it into two buttons and this reddens.
  assert.match(ACTIONS, /speaking \? onStop\(\) : onSpeak\(text\)/);
  assert.match(ACTIONS, /name=\{speaking \? "debug-stop" : "unmute"\}/);
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
  // `writeText` rejects when the document is not focused or permission is denied. Neither is
  // something the learner did, and neither is worth a red line across an answer they were reading.
  assert.match(ACTIONS, /catch \{/);
  assert.ok(!/setError|throw/.test(ACTIONS), "a clipboard refusal is being escalated");
});

test("🔴 the speed control shows its VALUE, so it needs no menu", () => {
  // A gauge glyph says "speed exists"; "1.5×" says what it is set to now, which is the only thing
  // worth knowing at a glance.
  assert.match(ACTIONS, /\{speed\}×/);
});

// ── Choosing a voice, and how fast it reads ──────────────────────────────────────────────────

const VOICE_HOOK = readFileSync(new URL("./use-canvas-voice.ts", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");

test("🔴🔴 picking a voice plays a sample of THAT voice", () => {
  // Owner, 2026-08-20: *"selecting voices should give a small preview."* Six ids — eve, ara, rex,
  // gork, sal, leo — are six words that say nothing about how a voice sounds, and xAI publishes no
  // catalogue to describe them from. Choosing blind and finding out on the next question is not
  // choosing. Calibration: drop the speak call from onSetVoice and this reddens.
  const set = VOICE_HOOK.slice(VOICE_HOOK.indexOf("const onSetVoice"), VOICE_HOOK.indexOf("const onSetVoice") + 1600);
  assert.match(set, /speech\.speak\(`preview:\$\{chosen\}`/, "choosing a voice says nothing");
  // 🔴 AS THE VOICE BEING CHOSEN, AT THE SPEED IN USE — otherwise the preview demonstrates a
  // neighbouring setting rather than the thing being picked.
  assert.match(set, /voiceId: chosen/, "the preview plays in the OLD voice");
  assert.match(set, /speed,/, "the preview ignores the chosen speed");
  // ...and keyed on the id, so pressing the same option twice replays rather than deduplicating.
  assert.match(VOICE_HOOK, /const VOICE_PREVIEW_LINE = /);
});

test("🔴 the speed is offered in BOTH places, from one value", () => {
  // Owner asked for both. They are two moments asking the same question: the picker is "how should
  // Nemesis read from now on", the row under an answer is "read THIS faster". One value behind
  // both is what makes showing it twice honest rather than confusing.
  assert.match(CONTROLS, /onClick=\{voice\.onCycleSpeed\}/, "the picker has no speed control");
  assert.match(CONTROLS, /\{voice\.speed\}×/, "the picker does not show the current speed");
  assert.match(CANVAS, /speed=\{voice\.header\.speed\}/, "the row under an answer reads a different value");
});
