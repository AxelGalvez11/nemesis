// The attachment card, against the reference it was measured from.
//
// 🔴 THE NUMBERS HERE ARE READINGS, NOT PREFERENCES. Every one was taken with getComputedStyle /
// getBoundingClientRect off a real file card on chatgpt.com while signed in, and then measured
// back on our own card in headless Chrome once it was built. Owner, 2026-08-26: *"Don't just
// measure with vision. Make sure that you actually grab the numbers too."*

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const CARD = read("./attachment-card.tsx");
const HOME = read("./canvas-home.tsx");
const COMPOSER = read("./canvas-composer.tsx");

test("🔴🔴 the card is the reference's geometry, to the pixel", () => {
  // card 480x62, radius 16, 1px border, padding 12/16, gap 12, icon 24, no shadow.
  assert.match(CARD, /rounded-\[16px\]/, "the card stopped being a 16px card");
  assert.match(CARD, /gap-\[12px\]/);
  assert.match(CARD, /py-\[12px\] pl-\[16px\]/);
  assert.match(CARD, /height=\{24\}/, "the file glyph is no longer 24px");
  // 🔴 THE 62 IS A CONSEQUENCE, NOT A CONSTANT: 12 + 20 + 16 + 12 plus two hairlines. So the type
  // sizes are what this pins, and a hard-coded height would let them drift apart silently.
  // 🔴 THE SCALE TOKENS, WHICH ARE THE REFERENCE'S NUMBERS. `--canvas-text-small` is 14px and
  // `--canvas-text-meta` is 12px, so matching the reference and obeying §46.3's five-step scale are
  // the same act here. A bare `text-[14px]` would be a sixth step and `canvas-shell.test.ts`
  // rightly reddens on it — which it did, on the first version of this file.
  assert.match(CARD, /text-\[length:var\(--canvas-text-small\)\] font-medium leading-\[20px\]/, "the filename left 14/500/20");
  assert.match(CARD, /text-\[length:var\(--canvas-text-meta\)\] leading-\[16px\]/, "the type line left 12/400/16");
  assert.equal(/h-\[62px\]/.test(CARD), false, "the height is hard-coded again instead of derived");
});

test("🔴 explicit pixels, because a rem class here renders 12.5% larger than its name", () => {
  // `globals.css` sets the root font to 112.5%, so `rounded-2xl` is 18px and `p-3` is 13.5px.
  // That is exactly what put the Library's pills at `0 18px` while the source said `px-4`.
  const code = CARD.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  for (const banned of [/\brounded-2xl\b/, /\bgap-3\b/, /\btext-sm\b/, /\btext-xs\b/]) {
    assert.equal(banned.test(code), false, `${banned} is rem-based and does not render its own name here`);
  }
});

test("🔴🔴 attachments are INSIDE the composer, not floating above it", () => {
  // Owner 2026-08-20: "i dont want the attachments to be above the chat composer at all", and
  // 2026-08-26: "attaching docs to the chat doesnt match chatgpt either". They had drifted back
  // out to a detached row of pills over the box, which is both objections at once.
  for (const [file, where] of [[HOME, "the front door"], [COMPOSER, "the canvas"]] as const) {
    assert.match(file, /<AttachmentRow>/, `${where} stopped drawing the attachment row`);
    assert.match(file, /<AttachmentCard/, `${where} stopped drawing attachment cards`);
    // The pill is gone: no fully-rounded chip carrying a filename.
    assert.equal(
      /rounded-full[^"]*"\s*\n?\s*key=\{`\$\{file\.name\}/.test(file),
      false,
      `${where} went back to a pill`,
    );
  }
  // The row sits inside the box, so it must appear BEFORE the input row in the same container.
  const row = COMPOSER.indexOf("<AttachmentRow>");
  const input = COMPOSER.indexOf("The input row, on the same tokens");
  assert.ok(row > 0 && input > row, "the attachments left the inside of the canvas composer");
});

test("the type line says what the file is, from the name alone", () => {
  // A MIME type is true and unreadable; a friendly-name table goes stale on the first format
  // nobody listed. The extension, uppercased, is what the reference prints.
  assert.match(CARD, /export function fileKind/);
  assert.match(CARD, /return name\.slice\(dot \+ 1\)\.toUpperCase\(\);/);
  assert.match(CARD, /return "File";/, "a file with no extension lost its fallback");
});

test("🔴 the glyph is coloured by type, which is half of what makes it read as a file", () => {
  // The reference's PDF glyph measured rgb(255, 59, 48) — not its text colour, not its accent.
  assert.match(CARD, /PDF: "#ff3b30"/);
  assert.match(CARD, /DOCX: "#2b7cd3"/);
  // An unlisted type still draws, in the neutral ink.
  assert.match(CARD, /INK\[kind\] \?\? "var\(--ui-text-tertiary\)"/);
});
