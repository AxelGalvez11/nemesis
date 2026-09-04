"use client";

// The files a turn was sent with, drawn as cards on one scrolling row.
//
// 🔴🔴 THIS IS THE THIRD SHAPE IN ONE DAY AND THE OWNER IS NOT CONTRADICTING HIMSELF. Read in
// order:
//
//   1. `#1098` drew the file names as a plain `<ul>` of grey lines above every turn, to fix a real
//      defect: turns were being filed with no attachments at all.
//   2. Hours later: *"it shows the names of the PowerPoints or the documents that were dropped in.
//      I don't need that there … it's always showing that."* Seven bare filenames stacked above
//      every question is most of a screen, and it looks like debug output.
//   3. Then, having gone back through the same chat: *"I'm supposed to have the chat attached
//      multiple documents and I don't see the cards there. They should show up similarly to how
//      they do in ChatGPT … but ideally this should be horizontally, and you should be able to
//      scroll to see all the attachments."*
//
// What he rejected was a LIST OF NAMES. What he asked for is a ROW OF CARDS. They carry the same
// data and are not the same object: a card has the file's own kind mark and says what it is, and a
// row of them costs one card's height however many there are — where the list cost one line each.
//
// 🔴 HORIZONTAL, WHICH IS OURS AND NOT THE REFERENCE'S. ChatGPT stacks its cards vertically, so
// seven files is seven cards tall and the question you asked is pushed off the screen. The owner
// asked for the other axis by name, and on his canvases (seven files on one turn, thirty on
// another) it is the difference between a turn you can read and a turn you scroll past.
//
// 🔴 THE CARD ITSELF IS THE ONE THE COMPOSER ALREADY USES, measured off chatgpt.com in #872 and
// unchanged here. Its own header notes that the `×` is *"omitted for a file already sent"*, which
// is exactly this case: `onRemove` is not passed, so a filed turn's cards are not controls.

import { AttachmentCard } from "./attachment-card";

export function AttachedRow({ titles }: { titles: readonly string[] }) {
  if (titles.length === 0) return null;

  return (
    // 🔴 `justify-end` SO THE ROW SITS UNDER THE LEARNER'S OWN WORDS, which are right-aligned on
    // this surface. It reads as part of what they said rather than as part of the answer.
    //
    // 🔴🔴 `overflow-x-auto` WITH `min-w-0` ON A FLEX CHILD, WHICH IS THE PART THAT IS EASY TO GET
    // WRONG. A flex item's default `min-width: auto` refuses to shrink below its content, so a row
    // of seven cards inside a flex column would widen the whole conversation and produce a
    // horizontal scrollbar on the PAGE instead of on the row. The scroll has to be trapped here.
    //
    // 🔴 `overscroll-x-contain` so flicking to the end of the row does not hand the gesture to the
    // browser and trigger a back-navigation on a trackpad.
    <div className="mb-2 flex justify-end">
      <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1" data-attached-row>
        {titles.map((title) => (
          // 🔴 `shrink-0`, OR THE CARDS SQUASH INSTEAD OF SCROLLING. Without it flexbox solves the
          // overflow by compressing every card to nothing, which is the failure this row exists to
          // avoid — and it happens silently at exactly the file counts that matter.
          <AttachmentCard className="shrink-0" key={title} name={title} />
        ))}
      </div>
    </div>
  );
}
