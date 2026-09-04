# Gemini Canvas reference — MEASURED in the owner's signed-in account, 2026-09-04, viewport 1470×779

> 🔴 WHY THIS FILE IS IN THE REPO. The owner sent the link to one of his own Gemini conversations
> and said: *"It has like a Canvas feature, which is essentially what I want to do, except it has
> the rounded corners for the side panel. And essentially, this is kind of how I want to envision
> the chat to be, where you have like the chat on the left side and you have the right panel on the
> right side where you can view like documents and, you know, annotate."* Then, when the first
> pass measured the Library's reader instead: *"i dont want the top bar or the outline comments, i
> thought i told you i wanted something similar to gemini … and or chatgpt work"*, with two
> screenshots of ChatGPT's Work pane, and *"i want the multiple tabs too with the annotation/comment
> feature"*.
>
> 🔴 GEMINI'S CANVAS IS A VARIATION OF THE **CHAT**, NOT OF THE NEMESIS CANVAS PAGE. His words:
> *"make sure you understand that nemesis canvas page is different from gemini canvas. the gemini
> canvas is basically a variation of the nemesis chat mode."* Nothing here applies to the board.
>
> Every number below is a real `getBoundingClientRect` / `getComputedStyle` call, or a Web Animation
> read off `Element.prototype.animate` while the panel opened. Nothing was read off a screenshot.
> The tab was hidden while measured, so `requestAnimationFrame` never fired; the motion came from
> hooking the animations rather than filming them.

## The shape of the surface

Rail on the left (52px), the chat in the middle, the panel on the right. The panel is a ROUNDED
CARD floating inside the window, not a strip glued to its edge.

    rail 52 | 24 | chat 449 | 32 | panel 865 | 48        = 1470

The chat column and the panel column are a CSS grid, `grid-template-columns: 1fr 2fr`, over the
1346px between the rail's gutter and the right margin: the chat is exactly one third, the panel
column two thirds, and the panel column holds a 32px gap before the panel itself.

| what | measured |
| --- | --- |
| panel box | left 557, top 24, 865 × 707; right margin 48, bottom margin 48 |
| corner | `border-radius: 40px` |
| edge | `1px solid rgba(0, 0, 0, 0.08)` |
| shadow | none |
| fill | `rgb(255, 255, 255)` |
| overflow | hidden (the document's corners are the panel's) |
| chat column | 449 wide, its text 393 wide (28px inside each edge) |
| chat composer | 449 × 102 at the foot of the chat column; the panel's bottom aligns with it |
| transform-origin | the panel's own centre (432.7px, 353.5px) |

## The top row

One row, 60px tall, `padding: 0 32px`, and nothing else above the document.

    [title 17px/24px weight 370]  [save] [undo] [redo] [⋯]        [print] [Create ⌄] [share] [×]

| control | measured |
| --- | --- |
| icon buttons | 40 × 40, at x 899 / 939 / 979 / 1019 (a 40px pitch) |
| Create | a 98 × 32 pill |
| share | 24 × 24 |
| close | 56 × 56, the last thing on the right |
| title | h2, 17px on a 24px line, weight 370, Google Sans Flex |

There is no second row. The document starts directly under the toolbar (its scroll container is
`[558, 85, 863, 645]`, padding `0 48px 48px`), and a small floating pill of three quick actions
(40 × 136, `border-radius: 9999px`, white with a shadow) sits at the top right INSIDE the scroll
area, 4px under the toolbar.

## The document

The content column is 735px wide at x 606: the panel's 48px padding on the left, and another 32px
on the right that the floating quick-actions pill lives in. The h1 is 28px on 36px, weight 350.

## The motion

Read off the Web Animations the open created:

| element | animation |
| --- | --- |
| the panel | `transform: scale(.6) → scale(1)`, 500ms, `cubic-bezier(0.2, 0.0, 0, 1.0)`, fill both |
| the panel | `opacity: 0 → 1`, 200ms |
| the chat column | `transform: translateX(-20%) → 0` with `opacity: 0 → 1`, 500ms, the same curve |
| the chat column | `opacity: 0 → 1`, 200ms |

The panel grows from its own centre; the chat column slides in from the left by a fifth of its
width as the grid re-lays it out.

## What Nemesis copies, and what it does not

**Copied** (`apps/web/components/workspace/learn/dock-panel.tsx`, `reader-chrome.ts` `DOCK_*`):
the floating rounded panel (40px corner, hairline edge, no shadow), the 32px gap to the
conversation, the one-third / two-thirds split of the space the rail leaves, the 500ms scale-in on
their curve with the opacity landing first, and one row on top with the controls at its right end.

**Not copied, on purpose:**

- **24px on every side, not 48 on the right and the bottom.** Their 48 pairs with a 24px gutter
  the whole Gemini window carries; ours carries none, and a panel 48px from the edge beside a rail
  0px from it read as off-centre.
- **The chat column does not slide in.** Ours is pushed by a width transition on the shared 220ms
  clock (`--pane-slide`), which the sidebar's fold and the nav column already keep to
  (`panes-share-one-clock.test.ts`). Sliding the chat on Gemini's 500ms curve while the sidebar
  folded on 220 would have left the two edges of one column settling 280ms apart.
- **The top row's contents are ChatGPT Work's, not Gemini's.** The owner's screenshots: the open
  things as TABS on the left (Gemini shows one document and names it in the row), the controls at
  the right end, no name row, no outline rail. The tab is the name. See `dock-tabs.tsx`.
- **No "Create" pill, no print, no share.** Icons earn their place (owner, 2026-08-30); the row
  carries what the panel can do: comment, download, full screen, close.
- **Comments are pins on the document** (`comment-layer.tsx`): a 24px numbered speech bubble at
  the spot, an "Add a comment…" bubble beside it, and the thread opens from the pin. ChatGPT Work's
  arrangement, which the owner asked for by screenshot, over Gemini's, which has none.
