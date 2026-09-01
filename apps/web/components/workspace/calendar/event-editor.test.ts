import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The event editor's shape, after owner 2026-09-01: the colour controls "aren't
// consistent, like there's different buttons for the colors", the colours are
// "so bland", and the whole thing "looks clunky, and it doesn't look finished
// ... it just showed default functions for the calendar stuff".

const FORM = readFileSync(new URL("./event-dialogs.tsx", import.meta.url), "utf8");
const CARD = readFileSync(new URL("./quick-create-popover.tsx", import.meta.url), "utf8");

/**
 * The source with its comments taken out.
 *
 * 🔴 GUARDS MUST READ CODE, NOT PROSE. Every note in these files names the class
 * it replaced — that is the point of them — so a `doesNotMatch` against the raw
 * text fails on the explanation of the fix rather than on the fix coming undone.
 * Both of these guards did exactly that on their first run.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const FORM_CODE = code(FORM);
const CARD_CODE = code(CARD);

test("there is exactly one row of colour swatches", () => {
  // There were two, stacked and unlabelled, answering different questions: the
  // event's TYPE and its colour. Both survive — "it is an exam" is not a matter
  // of taste and the calendar filters on it — but they no longer look alike.
  assert.equal((FORM_CODE.match(/EVENT_COLORS\.map/g) ?? []).length, 1, "a second colour palette appeared");
  assert.match(FORM_CODE, /<Row icon=\{Palette\} label="Colour">/, "the colour row lost its label");
  assert.match(FORM_CODE, /<Row label="Type">/, "the type row lost its label");
});

test("no swatch is dimmed until it is chosen", () => {
  // 🔴 THIS IS WHAT "BLAND" WAS. The palette is Google's own — its Tomato is
  // #d50000 — but every unselected swatch carried `opacity-70`, and every
  // unselected type dot `opacity-45`, so the row only ever showed one colour at
  // full strength. Selection is a ring, which is visible without draining the
  // rest.
  for (const [name, source] of [["editor", FORM_CODE], ["quick-create card", CARD_CODE]] as const) {
    // `transition-opacity` was the tell: it existed only to animate the dimming.
    assert.doesNotMatch(source, /transition-opacity/, `${name}: the dimming transition is back`);
    assert.doesNotMatch(source, /opacity-45/, `${name}: the type dots are dimmed again`);
    assert.doesNotMatch(source, /"[^"]*\bopacity-70\b[^"]*rounded-full/, `${name}: a swatch is dimmed again`);
  }
  // The swatch itself grows on hover instead, which reads as a state without
  // draining every colour that is not chosen.
  assert.match(FORM_CODE, /rounded-full transition-transform hover:scale-110/);
});

test("the type picker says the names, in both places", () => {
  // Bare dots meant the picker could only be used by someone who had learned
  // the palette. Both surfaces now draw the same named chip.
  assert.match(FORM_CODE, /\{KIND_META\[option\]\.label\}/, "the editor's type chips lost their names");
  assert.match(CARD_CODE, /\{KIND_META\[option\]\.label\}/, "the quick-create card's type chips lost their names");
});

test("the selects wear the app's control chrome, not the platform's", () => {
  // A hand-rolled height and border that ALMOST matched the inputs beside them,
  // plus the platform's own dropdown arrow, is what "default functions" meant.
  assert.match(FORM_CODE, /const FIELD = cn\(controlVariants\(\)/, "the selects stopped sharing Input's chrome");
  assert.doesNotMatch(FORM_CODE, /const SELECT = "h-8/, "the hand-rolled select chrome is back");
  assert.match(FORM_CODE, /appearance-none/, "the platform's dropdown arrow is back");
});

test("the drawn chevron is positioned inline, never by a bg-[…] class", () => {
  // 🔴 `bg-[right_0.5rem_center]` and `bg-[length:0.75rem]` DO NOT COMPILE.
  // Tailwind reads a bare `bg-[…]` as a colour or an image, never a position or
  // a size, so the arrow kept its natural size and tiled — six chevrons
  // marching across the timezone field.
  assert.match(FORM_CODE, /backgroundPosition: "right 0\.5rem center"/);
  assert.match(FORM_CODE, /backgroundRepeat: "no-repeat"/);
  assert.doesNotMatch(FORM_CODE, /bg-\[right_/, "the position is back in a class that does not compile");
  assert.doesNotMatch(FORM_CODE, /bg-\[length:/, "the size is back in a class that does not compile");
});
