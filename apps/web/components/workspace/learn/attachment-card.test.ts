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

// ── a document being read says so ──────────────────────────────────────────────────────────────

test("🔴🔴 a file being read wears a turning ring, and it never claims to know how far", () => {
  // Owner, 2026-09-01: "when the chat composer is reading and parsing documents there should be an
  // animation or like a loading circular bar showing progress in processing."
  //
  // 🔴 INDETERMINATE BY NECESSITY, NOT BY LAZINESS. `extractFile` is one awaited call and the
  // parser is silent until it returns, so there is no fraction to draw; an arc creeping toward full
  // would be a number about somebody's document that nobody measured. The same ruling is already
  // recorded for audio transcription in globals.css. Calibration: bind the arc to a percentage and
  // this reddens.
  const card = read("./attachment-card.tsx");
  assert.match(card, /state === "reading" \? \(\s*<ReadingRing>/, "a file being read has nothing moving on it");
  assert.match(card, /strokeDasharray="26 68\.2"/, "the ring lost the fixed gap that makes it a spinner rather than a gauge");
  // 🔴 CODE ONLY, COMMENTS STRIPPED. A rule of the form "this word must not appear" fails against
  // the paragraph that explains the rule — this assertion caught its own note about not inventing a
  // percentage, which is the third time in one evening a guard has read prose as behaviour.
  const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/percent|progress=\{|\bvalue=\{/.test(code), "the ring is claiming to know how far the parse has got");
  // The kind of file must still be readable while it is being read.
  assert.match(card, /<ReadingRing>\s*<DocGlyph/, "the document glyph was swapped out for the spinner instead of wrapped");

  const css = read("../../../app/globals.css");
  assert.match(css, /@keyframes nemesis-reading-ring/, "the ring has no animation to run");
  assert.match(css, /\.reading-ring \{ animation: none; \}/, "the ring keeps turning when motion is refused");
});

test("🔴 the composer's own send button spins while a document is being read", () => {
  // The control already had a spinner state; the front door simply never set it, so a send held
  // open by a parse looked exactly like a send held open by an empty box.
  const home = read("./canvas-home.tsx");
  assert.match(home, /busy=\{reading\}/, "the send button is static while documents are being read");
  // 🔴 `reading`, NOT `blocked`: a file that FAILED also blocks the send, and a spinner there would
  // promise that waiting will fix it. That card carries Try again instead.
  assert.ok(!/busy=\{blocked\}/.test(home), "a failed read is being drawn as work still in progress");
});
