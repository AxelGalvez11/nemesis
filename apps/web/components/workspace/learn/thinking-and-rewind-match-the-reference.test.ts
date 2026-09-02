import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Two surfaces the owner measured against ChatGPT on 2026-08-31, in one file because they are one
// complaint: *"the thinking preview, it's at the bottom next to the mascot, and it should be above,
// where it usually is with ChatGPT"*, and *"when you go back to your previous message with the
// rail, it just showed the chats that you sent on the right side. And then on the bottom left, it
// should show the message."*
//
// 🔴 THE NUMBERS BELOW WERE READ OUT OF HIS OWN SIGNED-IN CHATGPT, not estimated: the live
// thinking line renders 16px on a 24px line at weight 400, left-aligned on the assistant's own
// column, directly under the learner's bubble; the bubble is right-aligned in that same column.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PREVIEW = strip(read("./canvas-thinking-preview.tsx"));
const CANVAS = strip(read("./learning-canvas.tsx"));
const REWIND = strip(read("./canvas-history-view.tsx"));
const BODY = strip(read("./canvas-moment-body.tsx"));

test("🔴🔴🔴 the running step is a line in the conversation, not a caption on the character", () => {
  // The caption moved onto the dock on 2026-08-25, when the character stood in the CENTRE of an
  // empty screen. The canvas is a chat now and the character stands on the composer, so the same
  // caption reads as "the bottom left corner". Measured after the move: the line sits at y=131
  // directly under the learner's bubble at y=64, with the character far below at y=640.
  assert.match(PREVIEW, /data-canvas-thinking-line/, "the line lost the handle its placement is measured by");
  assert.ok(!/className="sr-only"/.test(PREVIEW.slice(PREVIEW.indexOf("export function CanvasThinkingPreview"), PREVIEW.indexOf("export function CanvasThinkingAnnouncement"))),
    "the visible line went back to being screen-reader only");
  // 🔴 THE APP RIDES ALONGSIDE THE LABEL (2026-08-31). Plain thinking still draws the bare
  // shimmering sentence this file measures; a step that reaches a connected app also carries that
  // app's own favicon, re-measured in the owner's account the same day. `app` is null for every
  // step Nemesis runs on its own, so the state this test describes is unchanged.
  // 🔴 AND A GLOBE RIDES ALONGSIDE BOTH, 2026-09-01 (owner: *"the thing in preview showing what
  // it's doing, it doesn't have an icon for it, like it does in ChatGPT"*). Same shape as the app
  // logo above and the same rule behind it: the mark names the KIND of source, so plain thinking
  // still draws the bare shimmering sentence this file measures. `web` is false for every step that
  // is not reading the open web, so the state this test describes is unchanged.
  assert.match(
    CANVAS,
    /<CanvasThinkingPreview app=\{session\.workApp\} label=\{preparingLabel\} web=\{session\.searchedDomains\.length > 0\} \/>/,
    "nothing draws the line in the thread",
  );
  // 🔴🔴 SCOPED TO CHAT VIEW, 2026-08-31 (owner, same day, second pass): *"it should only be like
  // that when it's in chat mode, not when it's in Canvas mode. Canvas mode should just have the
  // thinking below the mascot."* The morning's instruction this guard came from only ever spoke
  // about chat; pinning an unconditional null was reading it as a rule about both views.
  //
  // What it protects is unchanged: in CHAT the caption must not ride the character, because there
  // the character stands on the composer and "beside it" resolves to the bottom left corner,
  // underneath the conversation the words are about. In CANVAS there is no conversation on screen
  // and the character is at the CENTRE station, where the dock draws the caption under it.
  assert.match(
    CANVAS,
    /caption=\{threadOpen \? null : preparingLabel\}/,
    "the character is carrying the caption in chat view again",
  );
});

test("🔴🔴 the line is the reference's own type, in pixels, because of the rem trap", () => {
  // `html { font-size: 112.5% }` makes Tailwind's `leading-6` 27px here; the reference is 24px, and
  // the first build of this shipped at 16/27 for exactly that reason. Measured back to 16/24.
  assert.match(PREVIEW, /leading-\[24px\]/, "the line drifted off the reference's 24px line");
  assert.ok(!/leading-6\b/.test(PREVIEW), "`leading-6` is 27px in this app — name the pixels");
  assert.match(PREVIEW, /--canvas-text-body/, "the line stopped using the body size token");
});

test("🔴 the line and the answer cannot both claim the surface", () => {
  // It is drawn only while the turn is genuinely in flight and nothing has arrived to replace it;
  // a thinking line above a finished answer is a system reporting work it is not doing.
  assert.match(CANVAS, /\(turnInFlight \|\| presence === "preparing"\) && !replyText\.trim\(\)/, "the line can outlive the answer");
});

test("🔴🔴🔴 a rewound moment is the conversation's own layout: message right, answer left", () => {
  // Owner, 2026-08-31. Measured after the change on a seeded canvas: the bubble's right edge is the
  // column's right edge (1024) and the answer starts at the column's left edge (256).
  assert.match(REWIND, /<CanvasMomentBody learnerSide="end" moment=\{moment\} \/>/, "the rewind is back to a lone left-aligned bubble");
  assert.match(BODY, /learnerSide === "end" && "justify-end"/, "the layout prop stopped moving the bubble");
});

test("🔴 the rewind still writes nothing, and still has its ways out", () => {
  // The invariant the whole surface rests on: reading history cannot change it. And the exits the
  // banner's removal moved elsewhere - Escape, the marker you are on, sending anything.
  for (const ghost of ["update(", "session.", "policy."]) {
    assert.ok(!REWIND.includes(ghost), `the rewind reaches ${ghost} and can now write`);
  }
  assert.match(CANVAS, /if \(event\.key !== "Escape"\) return;/, "Escape no longer leaves a rewind");
});
