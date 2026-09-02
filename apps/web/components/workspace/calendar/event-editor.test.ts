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
const CHROME = readFileSync(new URL("./field-chrome.ts", import.meta.url), "utf8");
const CHROME_CODE = code(CHROME);
const REPEAT_CODE = code(readFileSync(new URL("./repeat-editor.tsx", import.meta.url), "utf8"));

test("there is exactly one row of colour swatches, and no type row at all", () => {
  // There were two stacked rows of unlabelled dots answering different
  // questions: the event's TYPE and its colour. The type row was labelled on
  // 2026-09-01 in the morning and DELETED the same afternoon — owner: "I don't
  // want anything like type, you know, like assignment exam rotation. That's too
  // specific to school. This should be generalist as possible."
  assert.equal((FORM_CODE.match(/EVENT_COLORS\.map/g) ?? []).length, 1, "a second colour palette appeared");
  assert.match(FORM_CODE, /<Row icon=\{Palette\} label="Colour">/, "the colour row lost its label");
  assert.doesNotMatch(FORM_CODE, /label="Type"/, "the type picker came back");
  assert.doesNotMatch(FORM_CODE, /KIND_ORDER/, "the editor can set a kind again");
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

test("neither surface asks anyone to pick a type", () => {
  // The field is still WRITTEN — imports and the agent tools set it, and the
  // editor carries it through on save so opening an event cannot erase it. It is
  // simply never asked for, and nothing on the calendar shows it.
  for (const [name, source] of [["editor", FORM_CODE], ["quick-create card", CARD_CODE]] as const) {
    assert.doesNotMatch(source, /KIND_ORDER/, `${name}: a type picker came back`);
    assert.doesNotMatch(source, /setKind/, `${name}: the type is settable again`);
  }
  assert.match(FORM_CODE, /kind: event\?\.kind \?\? "other"/, "the editor stopped carrying the existing kind");
  assert.match(CARD_CODE, /kind: "other"/, "the quick-create card invents a type again");
});

test("🔴 the fields that lost their controls did not lose their data", () => {
  // `built` starts empty, so anything this form stops editing is erased the
  // first time an event is opened and saved. Guests, location, reminders,
  // course, status, free/busy, visibility and the timezone all lost their
  // controls on 2026-09-01; every one of them is carried from the event.
  for (const field of ["location", "attendees", "reminders", "course", "status", "transparency", "visibility", "timeZone"]) {
    assert.match(FORM_CODE, new RegExp(`event\\?\\.${field}`), `${field} is dropped on save`);
  }
});

test("the selects wear the app's control chrome, not the platform's", () => {
  // A hand-rolled height and border that ALMOST matched the inputs beside them,
  // plus the platform's own dropdown arrow, is what "default functions" meant.
  assert.match(CHROME_CODE, /export const FIELD = cn\(controlVariants\(\)/, "the selects stopped sharing Input's chrome");
  assert.match(CHROME_CODE, /appearance-none/, "the platform's dropdown arrow is back");
});

test("🔴 there is ONE definition of the field chrome, and both editors use it", () => {
  // The event editor and the repeat editor each had their own
  // `const FIELD = "h-8 rounded-lg border …"`, and they had already drifted:
  // once the editor's controls were sized to Google's 40px the repeat dropdown
  // was still 36 and sat visibly short beside the date field above it.
  for (const [name, source] of [["editor", FORM_CODE], ["repeat editor", REPEAT_CODE]] as const) {
    assert.match(source, /from "\.\/field-chrome"/, `${name}: stopped importing the shared chrome`);
    assert.doesNotMatch(source, /const FIELD = "h-\d/, `${name}: rolled its own field chrome again`);
  }
});

test("control height and row rhythm are Google's, converted", () => {
  // Google's editor draws 40px controls and steps its rows 48px at a 16px root.
  // This app's root is 18px, so the like-for-like figures are 45px (2.5rem) and
  // 54px. Owner 2026-09-01: "it's too bunched in together" — it was 36px
  // controls 4.5px apart.
  assert.match(CHROME_CODE, /CONTROL_HEIGHT = "h-\[2\.5rem\]"/, "the controls left Google's height");
  assert.doesNotMatch(CHROME_CODE, /"h-8/, "a control is back at the old, shorter height");
});

test("the drawn chevron is positioned inline, never by a bg-[…] class", () => {
  // 🔴 `bg-[right_0.5rem_center]` and `bg-[length:0.75rem]` DO NOT COMPILE.
  // Tailwind reads a bare `bg-[…]` as a colour or an image, never a position or
  // a size, so the arrow kept its natural size and tiled — six chevrons
  // marching across the timezone field.
  assert.match(CHROME_CODE, /backgroundPosition: "right 0\.5rem center"/);
  assert.match(CHROME_CODE, /backgroundRepeat: "no-repeat"/);
  assert.doesNotMatch(CHROME_CODE, /bg-\[right_/, "the position is back in a class that does not compile");
  assert.doesNotMatch(CHROME_CODE, /bg-\[length:/, "the size is back in a class that does not compile");
});
