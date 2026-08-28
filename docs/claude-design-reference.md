# Claude Design reference — MEASURED in the live signed-in app, 2026-08-28, viewport 1456px

> 🔴 WHY THIS FILE IS IN THE REPO. The owner asked for annotation on a document and named the
> reference himself: *"if you could do, like, a deep research on Claude AI design so that you can
> see how they do it… what matters most is being able to add a comment on a page."* Then, when the
> first pass looked at the wrong surface: *"didn't you go into claude.ai/design in chrome?"*
>
> Every number below is a real `getBoundingClientRect` / `getComputedStyle` call on
> `claude.ai/design`, signed in, on the owner's own project. Nothing was read off a screenshot.
>
> Nothing was saved into that project: the drawing was Cancelled and the point comment was closed
> with its ×, and the Comments panel still read "No comments yet" afterwards.

## The shape of the surface

Chat on the LEFT (~315px), the document on the RIGHT. The same arrangement Nemesis already has for
its canvas and its docked reader, mirrored.

The toolbar sits above the document and carries five things, in this order:

    [zoom %]  [pointer]  [Comment]  [Edit]  [Present ⌄]        [Share]  [avatar]

🔴🔴 **`Comment` AND `Edit` ARE SEPARATE, NAMED MODES, SIDE BY SIDE.** That single fact is the whole
reason this reference exists. Annotating a document and changing what it says are different jobs,
and the reference draws the line in its own toolbar rather than blurring the two into "editing".

## Comment mode

Entering it **replaces the chat panel** with a Comments panel — it does not open a third column.

| thing | measured |
| --- | --- |
| Comments panel | 301 × 777 at x=8, y=50 |
| empty state | "No comments yet. Leave feedback for your teammates below." |
| panel composer | pinned to the panel's bottom: "Add a comment…", an attach button, `Send` |
| floating hint | a pill centred above the document: **"Click to comment, drag to draw"** |

Two gestures, said out loud in that pill, because neither is discoverable.

### Click — a comment on a thing

The click **snaps to the element under the pointer** and outlines it (blue). A small round avatar
pin drops at the point, and a popover opens:

| thing | measured |
| --- | --- |
| popover / textarea | 334 wide, textarea 334 × 75 |
| placeholder | "Describe the issue or suggestion..." |
| type | 13px on a 19.5px line |
| corner | 6px, outlined `rgb(217, 119, 87)` while focused (the product accent) |
| buttons | 30px tall, 8px corner |
| secondary | **"Add comment"** — 106 wide, white |
| primary | **"Send to Claude"** — 114 wide, filled `rgb(217, 119, 87)` |

🔴🔴 **THE TWO BUTTONS ARE THE DESIGN.** One note, one anchor, two destinations: leave it for a
person, or hand it to the model to act on. A surface with only the first is a comment system; a
surface with only the second is a chat box wearing a pin.

### Drag — a comment on a drawing

The drag paints **red freehand ink** along the path, on the page itself. A bar appears over the
document:

| thing | measured |
| --- | --- |
| bar | 600 × 49, centred over the document |
| field | "Add a note to your drawing", 373 × 31 |
| controls | undo, clear, then `Cancel` and `Send` |

🔴 **NOTHING IS SAVED UNTIL `Send`.** The ink is drawn live and the Comments panel still says "No
comments yet" the whole time it is being drawn. Cancel removes it entirely.

## Edit mode, for contrast

The left panel becomes an editor with `Discard` / `Save`, tabs (Simple · Pro · Code · Tweaks), a
layer tree, and a row of eleven tools: pointer, hand, text, frame, rectangle, ellipse, arrow, line,
pen, undo, redo. Its own empty state: *"Click any element on the canvas to edit it. Repeated
elements are edited together. Shift-click to select more."*

This is a design application. It is what the owner meant by *"that's what PowerPoint is for"*, and
it is the half Nemesis is deliberately not building.

## What this means for Nemesis

We already hold the two halves this needs:

- **drag to draw** is `use-region-drag.ts` plus `region-crop.ts`, built for "mark an area and ask".
  The gesture and the fractions-of-the-page contract are the same; what changes is that the mark
  persists instead of vanishing with the question.
- **click to comment** needs an anchor per format, and each already exists: a PDF page, a slide
  index, a paragraph index, a sheet and cell.

What does NOT carry over is the byte-offset addressing built for typing-in-place. A note about a
line does not need to know where that line sits inside the zip. That work was removed with the
feature it served.
