# The chat, measured against ChatGPT Work (2026-09-06)

Owner: *"the nemesis chat still doesnt match chatgpt work … make it perfect one to one okay? exclude
the 'share' and three dots icon button"*, then *"thinking preview style and behavior, panel,
everything pretty much"*, *"pay attention to how it asks user questions too"*, and, with a desktop
screenshot: *"i want the desktop app side panel like here because it has tabs"*, then *"it has an
'annotation feature', I don't want a view source type of row"*.

Measured in his signed-in Chrome at 1470x780 (2x) on a Work conversation with the Outputs/Sources
panel open, with `getBoundingClientRect` and `getComputedStyle`; the desktop pane's annotation
feature read out of `/Applications/ChatGPT.app/Contents/Resources/app.asar` (labels from the es-ES
and de-DE language files, since English is the code's default and not in a file).

His answers to the four questions (2026-09-06): Sources lists **files + Web search** only; the
composer's model-picker slot holds **nothing**; questions get **the same look, no countdown**; the
pane keeps its tab row and follows **the desktop app's annotation feature**, no "View source" row.

## 1. Frame

| part | measured |
|---|---|
| rail | 52 wide; buttons 36x36 at x 8, y 8 / 60 / 96 / 132 (New chat, Search, Pinned, Recents); avatar bottom-left |
| header | 52 tall, page colour rgb(252,252,252); title 16px/400/24 primary at x 83; " · Work" 16px tertiary rgb(143,143,143); right group Share 88x36 (EXCLUDED), More 36x36 (EXCLUDED), **"Files and sources" toggle 38x36 r8 `aria-pressed`, svg 20** at 8px from the right edge |
| thread column | 768 wide, centred in the space LEFT of the panel when the panel is open (x 211 at 1470 with the panel at 1139), centred in the full width when closed; the move is animated |
| composer | 768 wide, 52 tall at rest, radius 28, white, shadow `0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04), 0 4px 80px 8px rgba(0,0,0,.024)`; bottom edge 24 from the window; `+` 36x36 at 8 in; text 16/26; model picker 171x36 (slot left EMPTY in ours); mic 36; send 36 round (green in Work; ours keeps the accent), disabled at opacity .35; "Stop answering" square in the same slot while working |
| disclaimer | "ChatGPT can make mistakes. Check important info." 12px tertiary, centred, ~26 above the composer |
| scroll-to-bottom | 34x34 round at the column's centre, white at 65%, 1px rgba(0,0,0,.15), shadow-md, 20px arrow |
| date separator | "Yesterday 11:42 PM" / "Today 4:03 PM", centred, 14px tertiary, on its own line between turns |

## 2. Turns

| part | measured |
|---|---|
| user section | `section[data-turn=user]`: 12px above the bubble; bubble right-aligned, max-width 70%, radius 22, padding 10/16, 16px/24; Work's fill rgb(222,243,229) on rgb(20,54,26) ink (ours keeps `--ui-learner-bubble`, the accent); under it a 40px row, right-aligned, opacity 0 until hover: Copy message 32x32 r8 (20px glyph), Share prompt (EXCLUDED) |
| assistant section | prose 16px/26 primary; first p margin 0 0 4; following p 16/16; ul padding-left 26, margin 0; li padding-left 6, line 26; then the action row 50 tall (`p-1 -mt-1`), buttons 32x32 r8 with 20px glyphs at 0 gap, ink rgb(93,93,93): Copy, Rate, Share (EXCLUDED), Retry, More (EXCLUDED) |
| file line | a paragraph holding a 16px blue mark rgb(2,133,255) and an underlined link "Download …" |
| file card | 480x62, radius 16, 1px rgba(0,0,0,.1), white; 24px mark at 17 in; title 14px/500, kind 12px tertiary under it |

## 3. Thinking preview (Work)

While working: a row `border-b pb-2` (hairline rgba(0,0,0,.05)) holding **"Working for 1m 38s"**
(a live timer, 16px/20/400 tertiary); under the hairline the narration paragraphs the model writes
(16/26 PRIMARY ink, 16 apart) and the tool rows (a 20px tertiary icon, 8px, 16px/24 tertiary text:
"Searched the web", "Asked 1 question", "Listing Presentation Template Metadata"); the step still
running shimmers (`loading-shimmer 1.4s`, band rgba(255,255,255,.75), the recipe already in
`canvas-thinking-preview.tsx`). Finished: the row reads **"Worked for 2m 14s ›"** as a BUTTON
(chevron 16px at gap 4, `aria-expanded`), the log folded; pressing it opens the same narration and
tool rows in place, above the answer.

## 4. Asking a question

The composer itself grows into the question (the thread meanwhile shows two tool rows, "Asking
question" with a ? mark and "Waiting for your answer" with a list mark). Off his screenshot at
1.32 px per CSS px: the card keeps the composer's 768 width and 28 radius; a header row with the
question (16px/500) and an X (36x36 r8, 12 in); option rows 744x46 at 12 in, each a 32px round
number chip with a hairline ring, then the label 16px; the last row is the text field with the
next number and the placeholder "Or describe something else"; at its right a **Skip** pill (36 tall,
white, hairline, rounded-full). ChatGPT's Skip counts down (35s) and proceeds alone; **ours does
not count down** (owner's answer). Choosing a row or sending text answers; Skip lets Nemesis use
its own judgment.

## 5. Outputs / Sources panel (the Work rail)

| part | measured |
|---|---|
| card | 300 wide, top 52 (under the header), 31 from the right edge; radius 24; white; 1px rgba(0,0,0,.05); shadow 0 4px 16px rgba(0,0,0,.05); padding 4px 0; max-height `100svh − header − 2rem` |
| section header | a button 28 tall `px-4 py-1 rounded-sm`: label 14px/20 rgb(93,93,93) + 12px chevron at gap 6; at the row's right a `+` 28x28 r8 (20px glyph) 13 from the card's edge ("Create file or site" on Outputs, "Add source" on Sources) |
| row | 274x32 at 8 in, radius 12, padding 6/8, gap 8: a 16px mark (outputs) or 20px (sources), 14px/20 primary text, a 12px mark at the far right |
| divider | 1px rgba(0,0,0,.05), inset 20, between the sections |
| rows seen | Outputs: the .md and the .pptx it made; Sources: Web search, Gmail, Memory |
| toggle | the header's "Files and sources" button; open → the column shifts left and centres in the remaining space; closed → it centres in the full width; the card fades |

Ours: Outputs = what this chat made (no `+`: the 2026-08-24 ruling that outputs are asked for in
words stands here; `outputs-have-no-make-buttons.test.ts`); Sources = the files attached to the
chat and a Web search row that switches search on and off, with `+` = attach a file.

## 6. The desktop pane's annotation feature (from the bundle)

Modules: `annotation-mode-button` (the Annotating toggle, `aria-pressed`, widens into its label),
`artifact-annotation-batch-controls`, `presentation-annotation-cursor-coachmark`,
`annotation-scopes` (targets: a workbook range or floating element, a presentation element
selection or region, else the document's own target). Labels (English reconstructed from es/de):

- coachmark, by file: document *"Select text to request changes or ask questions"*; PDF *"Select
  text or objects …"*; presentation *"Select text, images or objects …"*; spreadsheet *"Select a
  cell or range …"*; onboarding tip title *"Add an annotation"*, body *"Select part of the file,
  then request changes or ask a question."*, with a dismiss
- the note on a selection: placeholder *"Describe a change or ask a question"*, Cancel; the act is
  *"Ask for change"*
- the batch bar: *"{n} annotation(s)"*, *"Annotation preview"*, Cancel, **Send**; the prompt it
  sends is *"Apply this annotation" / "Apply these {n} annotations"*; then *"Working"*, then *"See
  latest changes"* / *"Dismiss latest changes"*
- on the learner's turn: each annotation as a numbered attachment, *"Selected text:"* and *"User
  comment:"*, with edit and remove per number; markers in the reply read *"Response annotation
  {n}"*

Nemesis today (#1171, #917/#919): the Annotating toggle, ChatGPT's pin and bubble ("Add a
comment…"), one note at a time with keep + Send to Nemesis. What the desktop app adds and ours
adopts: the note asks for a change or a question; notes BATCH into a bar with a count and one Send;
the turn carries them numbered with the selected text and the comment.

## 7. What shipped on 2026-09-06 (branch `canvas-workspace`, uncommitted), and what is left

Shipped, each pinned by `chat-matches-chatgpt-work.test.ts`:

- the Outputs/Sources card (`work-panel.tsx`): §5's numbers, portalled and fixed at right 31 / top 52,
  standing until the header's "Files and sources" toggle is pressed, remembered per browser; the
  thread and composer re-centre beside it through `CanvasSurface`'s `workInset` while the header
  stays put; Sources = files + a Web search row that arms the `search` capability for the next send;
  the popover, its Inputs shelf and the reading-pane door are gone.
- thinking (§3): "Working for Ns" over a hairline (`use-turn-clock.ts`), the settled lines kept on
  screen in tertiary ink, the running step shimmering; finished, "Worked for Ns ›" as a button over
  a hairline that opens the log.
- questions (§4): asked inside the composer with numbered 46px rows and 32px chips, the field as the
  last row ("Or describe something else"), a Skip pill that answers "Use your judgment", no countdown;
  the thread shows "Asking question" and "Waiting for your answer".
- turns (§2): a 40px hover row with Copy under the learner's words, the action strip's `p-1 -mt-1`
  and secondary ink, no time stamp, date lines from `thread-dates.ts`, a 24px gap between turns.
- the disclaimer over the composer (not on the front door) and the 34px scroll-to-bottom button.

Not yet: the desktop pane's annotation BATCH (§6: notes collect into "{n} annotations · Send", the
turn carries them numbered) and the presentation viewer's slide rail, page count and speaker notes
(ChatGPT's dark viewer measured 2026-09-06: 139x71 thumbnails with a 12px number, the selected one
ringed rgb(99,168,248); "1/11" with 32px arrows; a "59%" zoom pill; "Speaker notes" 13px at 65%).
Also not measured live: the assistant's heading sizes and code blocks (no such turn was on his page).

## 8. The pane's one row, and its fading tabs (2026-09-06)

Owner, with the desktop app open: *"the desktop app has one top row with tabs and the tools, as tabs
grow, they fade out if they hit the tools"*, then a screenshot of their pane and *"this but with one
row up top"*. Their pane in that shot has TWO rows (row 1 tabs + `+` + expand + panel toggle; row 2
the file name + annotate, comment, zoom, download, Open). He wants the one row, which is what ours
already had since #1171; the missing half was the fade.

Their fade, read out of `app-initial-*.css` rather than approximated. It is scroll-driven, so the
left edge fades only once something has scrolled past it and the right edge stops fading at the last
tab:

```
@keyframes edge-fade-horizontal {
  0%           { --left-fade: 0;    --right-fade: var(--edge-fade-distance, 1rem) }
  0.1%, 99.9%  { --left-fade: var(--edge-fade-distance, 1rem); --right-fade: var(--edge-fade-distance, 1rem) }
  to           { --left-fade: var(--edge-fade-distance, 1rem); --right-fade: 0 }
}
.horizontal-scroll-fade-mask {
  mask: linear-gradient(to right in oklch, oklch(60% 0 0/0), oklch(85% 0 0) var(--left-fade) calc(100% - var(--right-fade)), oklch(60% 0 0/0));
  animation: edge-fade-horizontal linear both;
  animation-timeline: scroll(self x);
}
```

Ours (`app/globals.css`, worn by the strip in `dock-tabs.tsx`) is the same with three changes, each
forced: `--edge-fade-distance` is **16px, not 1rem** (this app's root is 112.5%, so their rem renders
18 here); the lengths are declared with `@property` or nothing interpolates; the gradient is plain
sRGB, since the oklch stops are a mask's alpha ramp and read identically. `@supports` is theirs and
stays: a browser without scroll-driven animations gets no mask rather than a fade stuck at one end.
The `+` moved OUT of the scroller to sit beside the tools, where theirs is.

### The tab itself, read out of their component (2026-09-06)

Owner, with his screenshot of the pane: *"i need the tabs to actually match the image i sent you one
for one"*. Their tab is in `app-initial-*.js`; `--spacing: .25rem`, `--radius-lg` 12.5px,
`--radius-md` 10px, `--border-width-hairline: .5px`, their small text step 12px.

| part | theirs | ours |
|---|---|---|
| shell | `group/tab relative flex h-8 shrink-0 items-center rounded-lg py-1 px-2 ps-2.5`, then `pe-1.75` when closable | 32 tall, radius 12.5, 10 in at the start, 7 at the end, 4 top and bottom |
| fill | a SEPARATE layer: `pointer-events-none absolute inset-x-px inset-y-0 z-0 rounded-md`, `border-hairline` always | the same, radius 10, a 0.5px edge |
| active | `border-default bg-surface-elevated-secondary shadow-tab-elevated` = `0 0 8px #0000000d` | `--ui-stroke-secondary` + `--ui-bg-elevated` + that shadow |
| idle | `border-transparent group-hover/tab:bg-primary-ghost-hover` — no fill and no edge at rest | transparent edge, `--ui-bg-tertiary` at 60% on hover |
| inner | their small step, `pe-5` on the front tab, `text-default` there and `text-secondary` elsewhere | 12px/430, 20px end padding, primary and secondary ink |
| name | `.text-fade-truncate`: `text-overflow: clip` and a mask taking the last 16px to transparent | `.dock-tab-fade` in globals.css, same rule |
| separator | `trailingDecoration`: `h-3 w-px shrink-0 end-0 absolute bg-border`, opacity 0/1, shown when `index < last && !active && next !== active` | the same rule, `--ui-stroke-secondary` |
| gap | none: the separators do that work | none |

🔴 A NAMED TAILWIND STEP WRITTEN OUT IN A COMMENT IS A REAL RULE. Tailwind scans .tsx prose, so
quoting their class in a note put a second type scale on the canvas and `canvas-shell.test.ts` failed
on the comment, not the code. Describe the step; never spell it.

Seen with six tabs at `/dev-preview/dock-tabs`, which exists because no other harness opens more
than two.

## 9. Their markdown system, read out of the bundle (2026-09-06)

Owner: *"if you can look at chatgpt budle and copy the chat ui/ux as well so we have a good base for
chat"*. From `app-initial-*.css`, the `_MarkdownRoot_` module. Everything in an answer derives from
one number:

```
--markdown-font-size: var(--text-base);            /* the thread's body size */
--markdown-space: calc(var(--markdown-font-size) / 4);   /* 4px at our 16px body */
```

| element | theirs, as multiples of the space |
|---|---|
| paragraph | `margin: 0 0 1x`; two in a row `margin-block: 4x`; any non-first `margin-top: 2x` |
| h1 | `margin: 0 0 2x`, size 1.5x, line 8x |
| h2 | `margin: 4x 0 1x`, size 1.25x, line 7x |
| h3 | `margin: 4x 0 1x`, size 1.125x, line 7x |
| h4 | `margin: 4x 0 0`, size 1x, line 6x |
| h5, h6 | size 1x, body line, no margin |
| list item | `padding-inline-start: 1.5x`; `li > p + p` gets `4x` |
| blockquote | `margin: 0 0 2x`, `border: 0`, `padding-block: 2x`, `padding-inline-start: 6x`, line 6x, **`font-style: normal`, `color: text-primary`**; the rule is an `::after` inset 2x top and bottom, `width: 1x`, `border-radius: 0.5x`, `background: border-medium` |
| rule | `margin: 7x 0`, `border-top: 1px solid border-medium` |
| table | cells `padding-inline-end: 6x`; header `padding-block: 2x`, semibold, bottom rule; body cell `padding-block: 2.5x`; last header cell `10x` at its end; last row `padding-bottom: 6x`; a numeric cell `min-width: calc(3ch + 6x)` and no wrapping |
| code block | `margin-block: 5x` |
| mermaid | `margin-block: 2x` |

Ours already matched the rhythm and the headings, measured one at a time earlier. What this pass
changed, in `app/styles/desktop-chrome.css`:

- `--markdown-space: 4px` is declared, and the new rules derive from it rather than restating numbers.
- **The quote.** Ours was a 2px hairline with grey italic text, the web's default idea of an aside.
  It is now upright, full strength, with the 4px rounded bar that stops 8px short at each end.
- **Tailwind's curly quotation marks are off.** Typography adds `open-quote` / `close-quote` to a
  blockquote's first and last paragraph; theirs has none, and a passage that already carries marks
  in the source was getting two sets.
- **The table's padding was in rem and had been winning silently.** `padding-block: 0.4rem` and
  `padding-inline: 0 1.25rem` render 7.2px and 22.5px under this app's 112.5% root, and they beat
  the component's own `py-[10px] pr-[24px]` because two selectors beat one class. Now 8, 10, 24, 40
  and 24, in pixels.
- **A fenced block** carries `margin-block: 20px` on its wrapper, not on the `pre`, which is pinned
  to `!my-0`.

🔴 None of this was visible in any harness, which is why it survived. `/dev-preview/answer-markdown`
now renders one of every element in an answer.
