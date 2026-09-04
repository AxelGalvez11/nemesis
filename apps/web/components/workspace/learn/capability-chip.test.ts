// The staged capability, as the reference draws it.
//
// Owner, 2026-09-01, with both composers on screen: *"the modes dont keep their color … chatgpt
// doesnt use the 'x'. also user should be able to backspace to delete the mode."* Every number
// below was measured that day in his signed-in Chrome, on chatgpt.com's own composer:
//
//   pill wrapper   inline-flex, gap 4px, padding 0 4px, no background, no border, radius 0
//   icon           20px
//   label          16px / 26px, weight 400, `text-token-text-accent`, truncated at 16rem
//   removal        Backspace at the head of the line. There is no ✕ anywhere on it.
//
// The pill is a `contenteditable="false"` span sitting at the START of the paragraph being typed
// into, which is WHY Backspace removes it: it is a character in the line, not a control beside it.
// Ours is a real chip beside a real input, so the keystroke has to be spelled out — that is what
// `backspaceClearsCapability` is for, and why both composers call the one function.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { menuSide } from "./add-menu-row";
import { backspaceClearsCapability } from "./capability-chip";
import { CAPABILITY_COPY, COMPOSER_CAPABILITIES } from "@/lib/learn/composer-capability";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
/** Source with its own prose removed. Guards in this repo have twice tripped on the comment
 *  explaining the very thing they ban. */
const bare = (name: string) => read(name).replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CHIP = read("capability-chip.tsx");
const HOME = bare("canvas-home.tsx");
const COMPOSER = bare("canvas-composer.tsx");

test("🔴🔴 a staged capability keeps the colour it had in the menu", () => {
  // THE DEFECT, IN ONE LINE: both chips wrapped the icon and the label in `text-(--ui-action)`, so
  // Spreadsheet's green table turned accent-brown the instant it was chosen. The tint is the only
  // thing on the row that says what KIND of thing is coming back, and it was discarded at the exact
  // moment that started to matter.
  //
  // 🔴 IT MUST BE AN INLINE `color`, NOT A TAILWIND CLASS. `text-(--var)` needs the token name at
  // build time; one arriving through a record lookup is invisible to Tailwind, the class is never
  // generated, and the chip paints in the inherited colour with nothing to show for it.
  // 🔴 THE INLINE STYLE MOVED INTO `ComposerToken`, WHICH THE CHIP NOW COMPOSES. A project can sit
  // on this line too since 2026-09-03, and the two were about to be hand-written twice — the drift
  // this file's own header exists to prevent. What has to hold is unchanged: the capability's tint
  // reaches the line, and it does so as an inline `color`.
  assert.match(CHIP, /style=\{\{ color: `var\(\$\{tint\}\)` \}\}/, "the token no longer applies its tint inline");
  assert.match(CHIP, /tint=\{copy\.tint\}/, "the chip no longer hands the capability's own tint to the token");
  assert.ok(!/text-\(--ui-action\)/.test(CHIP), "the chip is back on the accent instead of the capability's tint");

  // 🔴 AND `--ui-action` AS A TEXT COLOUR IS A KNOWN TRAP HERE, not only a lost signal:
  // `course-map.test.ts` records it reading near-invisible in dark mode.
  for (const [name, source] of [["the front door", HOME], ["the session composer", COMPOSER]] as const) {
    assert.ok(!/CAPABILITY_COPY\[capability\]\.icon/.test(source), `${name} draws the chip's icon by hand again`);
  }

  // Every capability has a tint to keep. A capability added without one would render `var()` empty
  // and inherit — the same silent failure, one row further down the menu.
  for (const capability of COMPOSER_CAPABILITIES) {
    assert.match(CAPABILITY_COPY[capability].tint, /^--ui-/, `${capability} has no tint token for the chip to carry`);
  }
});

test("🔴🔴 there is no ✕ on the chip, on either composer", () => {
  // The reference has no dismiss control at all. The note this replaces argued the ✕ had to stay
  // because "a hover-only dismiss does not exist on touch" — which defends a hover-only ✕ against
  // an always-visible one, and never asked whether the control should exist.
  assert.ok(!/aria-label=\{`Remove \$\{CAPABILITY_COPY/.test(HOME), "the front door's chip grew its ✕ back");
  assert.ok(!/aria-label=\{`Remove \$\{CAPABILITY_COPY/.test(COMPOSER), "the session composer's chip grew its ✕ back");
  assert.ok(!/<button/.test(CHIP), "the chip is not a control — removing it belongs to the field beside it");
});

test("🪦 the composer's line carries the capability alone again", () => {
  // 🔴 THIS REPLACES A TEST OF `backspaceClearsToken`, which answered "with a project AND a
  // capability staged, which does Backspace take off". The project left that line the day after it
  // arrived — owner, 2026-09-03: *"the project shows up in the chat bar as if it's a mode. But I
  // need it to be down there where it says choose project instead."*
  //
  // What must not come back is a SECOND token on that line; the gesture itself is unchanged and is
  // tested below, on the one thing that can still be there.
  const chip = readFileSync(new URL("./capability-chip.tsx", import.meta.url), "utf8");
  const code = chip.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  assert.ok(!/export function ProjectToken/.test(code), "the inline project token is back on the composer's line");
  assert.ok(!/backspaceClearsToken/.test(code), "the two-token Backspace is back with nothing to disambiguate");
  const home = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
  assert.ok(!/<ProjectToken/.test(home), "the front door is drawing a project token on the composer's line again");
});
test("🔴 Backspace at the head of the line takes the capability off it", () => {
  const at = (start: number, end: number) => backspaceClearsCapability({ key: "Backspace", currentTarget: { selectionStart: start, selectionEnd: end } });
  assert.ok(at(0, 0), "Backspace with the caret at the start does not clear the capability");
  // 🔴 NOT ONLY WHEN THE BOX IS EMPTY. The reference's pill lives at the head of the paragraph, so a
  // learner who typed a sentence and walked the caret back to the front is standing on the chip.
  assert.ok(!at(4, 4), "Backspace mid-sentence would eat the capability instead of a character");
  // 🔴 AND NEVER OVER A SELECTION: that keypress already deletes the selection.
  assert.ok(!at(0, 6), "Backspace over a selection deletes twice");
  assert.ok(!backspaceClearsCapability({ key: "a", currentTarget: { selectionStart: 0, selectionEnd: 0 } }), "any key at the start clears the capability");

  // Both composers ask the same question, through the same function.
  for (const [name, source] of [["the front door", HOME], ["the session composer", COMPOSER]] as const) {
    // 🔴 TWO SHAPES, ONE RULE, AND THE DIFFERENCE IS WHAT ELSE CAN SIT ON THE LINE. The front door
    // can hold a project as well as a capability since 2026-09-03, so it asks which of the two a
    // Backspace takes off; the session composer holds only a capability and asks the plain
    // question. Both go through this file — neither hand-writes the caret rule.
    assert.match(
      source,
      /backspaceClears(Capability|Token)\(event/,
      `${name} cannot clear what is staged with Backspace`,
    );
    // 🔴 AND THE SAME KEYPRESS MUST NOT ALSO EAT A CHARACTER. Asserted as "preventDefault is the
    // first thing the clearing branch does", rather than by pinning one exact spelling of the
    // condition: the front door's is now a three-way answer and the session composer's is a
    // boolean, and a guard that matched only one of them would have said nothing about the other.
    // Anchored on the CALL, not the import — `source.indexOf("backspaceClears")` finds the import
    // line first and every assertion after it then reads the wrong 400 characters.
    const call = /backspaceClears(?:Capability|Token)\(event/.exec(source);
    assert.ok(call, `${name} never calls the caret rule`);
    const branch = source.slice(call!.index);
    assert.match(
      branch.slice(0, 400),
      /\{\s*\n?\s*event\.preventDefault\(\);/,
      `${name} lets the same keypress also delete a character`,
    );
  }
});

test("🔴 one chip, both composers — the two hand-written copies had already drifted", () => {
  // Before this file there were two: the front door's had no `leading`, the session's did, and they
  // disagreed about the gap. That is the setup `AddMenuRow` exists to prevent one file over, with
  // the styling in the place of the list.
  assert.match(HOME, /<CapabilityChip capability=\{capability\} \/>/, "the front door draws its own chip again");
  // 🔴 `mr-[8px]` JOINED IT ON 2026-09-03. Measured on /dev-preview/course: the chip's right edge
  // and the textarea's left edge both sat at x=497.83 — a gap of exactly zero, so the mode and the
  // placeholder ran together. Spacing is the caller's business (see the prop's own note); what
  // this guards is that the composer does not restyle the chip itself.
  assert.match(COMPOSER, /<CapabilityChip capability=\{capability\} className="ml-\[8px\] mr-\[8px\]" \/>/, "the session composer draws its own chip again");
  // The measured geometry, in the one place it can live.
  assert.match(CHIP, /gap-\[4px\]/, "the icon/label gap drifted from the reference's 4px");
  assert.match(CHIP, /px-\[4px\]/, "the chip lost the reference's 4px of side padding");
  assert.match(CHIP, /size="20px"/, "the chip's icon drifted from the reference's 20px");
  assert.match(CHIP, /text-\[16px\] leading-\[26px\]/, "the label drifted from the reference's 16/26");
  // 🔴 WEIGHT 400, MEASURED. Both chips shipped `font-medium`; the reference's is regular, and at
  // 16px on a coloured label the bolder weight reads as a heading rather than as part of the line.
  assert.ok(!/font-medium|font-semibold|font-bold/.test(CHIP), "the chip is heavier than the reference's regular weight");
});

test("🔴 every tint stays legible as TEXT, in both themes, on the composer's own fill", () => {
  // 🔴🔴 THE HUES CAME BACK ON 2026-09-03 AND THIS GUARD CAME BACK WITH THEM. It had been rewritten
  // hours earlier to assert the OPPOSITE — that every tint resolves to one neutral — after the owner
  // asked to "remove any color accents throughout the app". He then asked for the `+` menu's colours
  // back in the same conversation, which is not a contradiction: an ACCENT follows the character and
  // means "act here", while these six are fixed identity colours for kinds of file (a PDF is red in
  // every account, forever). `accent.test.ts` still holds the accent's boundary; this holds theirs.
  //
  // 🔴 SO THE GATE IS BACK TO CONTRAST, WHICH IS WHAT IT WAS BUILT FOR: "to stop a NEW capability
  // arriving with a tint nobody looked at". A neutral-only assertion could not have caught an
  // unreadable hue, only a hue.
  //
  // 🔴 3:1, NOT 4.5:1, AND THE REASON IS WRITTEN DOWN. Five of the six clear or nearly clear AA on
  // white (blue 4.88, red 5.04, cyan 4.64, purple 4.32, green 4.30) and every one clears it in
  // dark; amber is the floor at 3.16. The reference's own tool label — rgb(58,131,247) on white —
  // measures 3.64, so this chip is more legible than the thing it copies in five cases out of six.
  // The word is also never the only signal: the row that set it named it, and the placeholder
  // beside it asks that capability's own question.
  const css = readFileSync(new URL("../../../app/styles/desktop-ui.css", import.meta.url), "utf8");
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (high + 0.05) / (low + 0.05);
  };
  // The file declares each tint twice: the light block first, the dark override second. A third
  // block would need this to say which is which.
  const fills = { dark: "#212121", light: "#ffffff" } as const;
  for (const capability of COMPOSER_CAPABILITIES) {
    const token = CAPABILITY_COPY[capability].tint;
    const values = [...css.matchAll(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "g"))].map((hit) => hit[1]!);
    assert.equal(values.length, 2, `${token} is not declared once for light and once for dark`);
    for (const [theme, hex] of [["light", values[0]!], ["dark", values[1]!]] as const) {
      const ratio = contrast(hex, fills[theme]);
      assert.ok(ratio >= 3, `${capability}'s ${theme} tint ${hex} reads at ${ratio.toFixed(2)}:1 on the composer — a word in it would be hard to read`);
    }
  }
});

test("🔴🔴 the + menu scrolls before it flips, so it never lands back on the character", () => {
  // 🔴 I SHIPPED THIS BUG BEFORE MEASURING FOR IT. Moving the front door's menu below the composer
  // was right on the owner's tall window and wrong at 1280x760, where eight rows ran **61px past
  // the bottom of a page that does not scroll** — the last row and a half unreachable, with nothing
  // on screen to say so. A menu is not placed correctly until it is placed correctly on a laptop.
  //
  // 🔴🔴 AND THE OBVIOUS REPAIR WAS ALSO WRONG. "Flip whenever the preferred side cannot show the
  // whole menu" was written first and watched at 760px: the menu duly flipped up and landed back
  // over the character, which is the complaint this whole change exists to answer, returning on
  // anyone's laptop. A capped, scrolling menu on the right side of the composer is an ordinary
  // control; a full-height menu on the wrong side of it is the defect.
  const roomy = { above: 400, below: 400 };
  assert.equal(menuSide(roomy, 326, "below"), "below", "a menu that fits below still moves");
  assert.equal(menuSide(roomy, 326, "above"), "above", "a menu that fits above still moves");

  // 760px window, front door: 260px below, 348 above. It stays BELOW and scrolls — flipping here
  // is what put it back over the mascot.
  assert.equal(menuSide({ above: 348, below: 260 }, 326, "below"), "below", "a short window sends the menu somewhere it does not fit");
  // The same window with the front door's real preference: 326px of menu into 348px of room. It
  // stays up, which is the point of the 2026-09-01 change.
  assert.equal(menuSide({ above: 348, below: 260 }, 326, "above"), "above", "the front door's menu stopped fitting above on a laptop");

  // Only when the preferred side is too cramped to read as a menu at all, and the other side is
  // genuinely roomier, does it move.
  assert.equal(menuSide({ above: 400, below: 90 }, 326, "below"), "above", "a menu with four rows' room left does not move");
  // ...and never into somewhere even smaller.
  assert.equal(menuSide({ above: 40, below: 90 }, 326, "below"), "below", "the menu moved to the tighter side");

  const MENU = read("add-menu-row.tsx");
  assert.match(MENU, /useLayoutEffect/, "the flip runs after paint, so the menu is drawn in the wrong place for a frame");
  assert.match(MENU, /overflow-y-auto/, "the menu clips instead of scrolling when it is capped");
  // 🔴 THE FRONT DOOR PREFERS **ABOVE** SINCE 2026-09-01 — owner's pick from four drawn options,
  // and the second time he asked for the menu to be in front of the character. "Leaving the
  // character alone" was never the goal he stated; it was this file's reading of a report about
  // the mascot DISAPPEARING. The card now rises while the menu is open, so the menu is in front
  // and the character is still drawn. See project-picker.test.ts for the full circle.
  //
  // 🔴 EVERY SCROLL AND FLIP RULE ABOVE IS UNTOUCHED, and that is the half of this test that was
  // always about the laptop: the menu is still capped, still scrolls before it flips, and still
  // refuses to move to a tighter side.
  assert.match(HOME, /useMenuSide\(addOpen, "above"\)/, "the front door stopped opening upward over the character");
  assert.match(COMPOSER, /useMenuSide\(addOpen, "above"\)/, "the session composer stopped preferring the side with the room");
  for (const [name, source] of [["the front door", HOME], ["the session composer", COMPOSER]] as const) {
    assert.match(source, /style=\{\{ maxHeight: addSide\.maxHeight \}\}/, `${name}'s menu can run off the window again`);
  }
});
