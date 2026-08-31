/**
 * The thinking preview is the reference's, measured — not remembered (owner 2026-08-30: *"i need
 * the thinking preview in chat mode match how chatgpt does it"*).
 *
 * Read live off chatgpt.com the same day, signed in, dark theme, from the real
 * `.loading-shimmer-tertiary` span and its stylesheet rules:
 *
 *   - a BARE shimmering sentence — no glyph, no spinner beside it, in every working state
 *     ("Thinking", "Working", the search states), and NOTHING once the answer lands: no
 *     "Thought for Xs", nothing expandable. Their build never shows the trace at all.
 *   - 16px on a 24px line, weight 400, in the TERTIARY text colour.
 *   - the sweep: a half-width `no-repeat` band, `background-position` -100% → 250%, `1400ms ease
 *     infinite` (their `--cot-shimmer-duration: 1400ms`), and the band FADES the words toward
 *     the background (dark: rgba(0,0,0,.6) over #afafaf; light: rgba(255,255,255,.75) over
 *     grey) — which `color-mix(… 35%, transparent)` reproduces in one theme-proof rule.
 *   - the composer keeps its resting placeholder while the model works; the row in the thread
 *     is the one place that says "Thinking".
 *
 * The marks that used to sit beside our caption arrived 2026-08-24 ("like it does in ChatGPT")
 * and died 2026-08-30, the day the reference measurably had none. This file was their fence;
 * now it fences their absence and the recipe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴🔴 the mark machinery is dead end to end, not parked", () => {
  assert.throws(() => read("../../components/character/thinking-mark.tsx"), "the mark renderer is back");
  const phases = strip(read("./thinking-phases.ts"));
  for (const name of ["export type ThinkingMark", "THINKING_MARK", "markForBusy", "export function thinkingMark"]) {
    assert.ok(!phases.includes(name), `${name} came back to thinking-phases.ts`);
  }
  for (const rel of [
    "../../components/character/character-dock.tsx",
    "../../components/workspace/learn/learning-canvas.tsx",
    "../../components/workspace/learn/canvas-chat.ts",
    "../../components/workspace/learn/use-canvas-session.ts",
    "./canvas-tools.ts",
  ]) {
    const source = strip(read(rel));
    assert.ok(!source.includes("ThinkingMark"), `${rel} still reaches for a mark`);
    assert.ok(!source.includes("workMark"), `${rel} still carries a mark beside the label`);
  }
});

test("🔴 the caption is the bare shimmering words, and the shimmer wraps only them", () => {
  const dock = read("../../components/character/character-dock.tsx");
  assert.match(dock, /<span className="canvas-thinking-word">\{caption\}<\/span>/, "the shimmer left the words");
  // On the caption box itself the shimmer would paint the domain chips transparent — the two
  // sessions that found that independently are why this stays split.
  assert.ok(!/character-caption canvas-thinking-word/.test(dock), "the shimmer crawled back onto the caption box");
});

test("🔴 the recipe is the reference's own, number for number", () => {
  const css = read("../../app/globals.css");
  const rule = css.slice(css.indexOf(".canvas-thinking-word {"), css.indexOf("@keyframes canvas-rewriting"));
  assert.ok(rule.length > 0, "the caption's rule is gone");
  assert.match(rule, /background-color: var\(--ui-text-tertiary\);/, "the resting colour left background-color — with a no-repeat half-width band the words are invisible between sweeps");
  assert.match(rule, /var\(--ui-text-tertiary\) 0%/, "the band's edges stopped being the resting colour");
  assert.match(rule, /color-mix\(in srgb, var\(--ui-text-tertiary\) 35%, transparent\) 40%/, "the fade band moved off the measured 40–60% window");
  assert.match(rule, /background-size: 50% 200%;/, "the band stopped being the reference's half-width");
  assert.match(rule, /background-repeat: no-repeat;/, "the sweep lost its rest between passes");
  assert.match(rule, /animation: canvas-thinking-word 1400ms ease infinite;/, "the tempo left the reference's 1400ms ease");
});

test("🔴 the composer keeps its resting placeholder while the model works", () => {
  const composer = strip(read("../../components/workspace/learn/canvas-composer.tsx"));
  assert.ok(!composer.includes("busyLabel"), "the busy label is back in the composer");
  assert.ok(!/placeholder=\{\s*busy\b/.test(composer), "the placeholder announces the wait again");
});
