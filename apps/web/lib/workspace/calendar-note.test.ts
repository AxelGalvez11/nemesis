import assert from "node:assert/strict";
import { test } from "node:test";

import { noteToText } from "./calendar-note";

test("🔴🔴 a Google description stops printing its own tags", () => {
  // 🔴 THE FIXTURE IS THE OWNER'S OWN ROW, TYPED OUT EXACTLY. My first version
  // wrote it with `&times;` and `&ndash;` because I was hand-writing HTML, and
  // it failed — which was the FIXTURE being wrong, not the code. Google stores
  // the real characters and escapes only `& < >` and the quotes, so the small
  // entity table below is the right size. An invented fixture that is harder
  // than the real data makes you "fix" something that was already correct.
  const real = "<p>Bench 4×6–8; pull-ups 4 submaximal sets; incline DB press 2–3×8–12; row 3×8–12.</p>";
  const text = noteToText(real);
  assert.ok(!text.includes("<p>"), "the tags are still in the box");
  assert.equal(text, "Bench 4×6–8; pull-ups 4 submaximal sets; incline DB press 2–3×8–12; row 3×8–12.");
});

test("🔴 the entities Google DOES escape are decoded", () => {
  // It escapes exactly these, so this is the whole job — not a table of 2,000
  // named entities, which is the kind of list that never finishes.
  assert.equal(noteToText("<p>R&amp;D &lt; 4 people &quot;maybe&quot;</p>"), 'R&D < 4 people "maybe"');
  assert.equal(noteToText("<p>caf&#233; at 3&#x2019;s</p>"), "café at 3’s");
});

test("🔴🔴 plain text is returned BYTE FOR BYTE, ampersands and all", () => {
  // 🔴 THE CALIBRATION FOR THE WHOLE MODULE. Most descriptions are typed right
  // here, so running them through a decoder would rewrite what somebody wrote:
  // "R&D" is two letters and an ampersand, not a broken entity.
  for (const plain of ["R&D at 3 < 4 people", "Bench 4x6-8\nThen 20 min easy", "", "  spaced  "]) {
    assert.equal(noteToText(plain), plain, `"${plain}" was rewritten`);
  }
});

test("🔴 block boundaries become line breaks, and a list keeps its bullets", () => {
  assert.equal(noteToText("<p>One</p><p>Two</p>"), "One\nTwo");
  assert.equal(noteToText("A<br>B<br/>C"), "A\nB\nC");
  assert.equal(noteToText("<ul><li>First</li><li>Second</li></ul>"), "- First\n- Second");
});

test("🔴 a link keeps its words; a script keeps nothing", () => {
  assert.equal(noteToText('<p>Join <a href="https://meet.example/x">the call</a></p>'), "Join the call");
  // Not a security boundary — this is text, never innerHTML — but a description
  // holding a script tag should not paste its source into the box either.
  assert.equal(noteToText("<p>Ok</p><script>alert(1)</script>"), "Ok");
});

test("🔴 a run of empty paragraphs collapses to one blank line, not five", () => {
  assert.equal(noteToText("<p>A</p><p></p><p></p><p></p><p>B</p>"), "A\n\nB");
});

console.log("calendar-note.test.ts OK");
