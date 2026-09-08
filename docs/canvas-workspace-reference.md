# The canvas workspace: what was measured, and where each part came from

Owner, 2026-09-05 and 2026-09-06, over one long brainstorm that moved through three references:

1. NotebookLM (*"collapsing the library and projects into just a notebook"*): a notebook owns its
   sources, chat in the middle, a Studio of one-click deliverables on the right.
2. ChatGPT Work's rail (*"something similar to how chatgpt does 'work'"*): sources as a collapsible
   section with a `+`, and the actions to create under it.
3. Stitch's project view (*"essentially we go into full on canvas mode"*), and the call: *"Yes make
   new landing and workspace canvas based on stitch and wondering canvas, where users are invited to
   drop in material, can have chats in canvas like wondering, can see docs in canvas, can create
   flashcards, docs, presentations, and have a place to also see sources as list too, and panel with
   buttons to create artifacts with ability to choose which sources to make from like in notebook
   llm"* — then, interrupting the go-ahead: *"I need tests to be clickable button like in
   notebookllm you understand?"*

Every number below was read off the live product in the owner's signed-in Chrome with
`getBoundingClientRect` and `getComputedStyle`, or off a screenshot he sent with ImageMagick.
Wondering's board is written down separately in `wondering-canvas-reference.md`; the board's cards,
composer, edges and camera are still that document's.

## 1. Stitch's project view (1512x802, dark), the FRAME

| Part | Measured | Ours |
|---|---|---|
| Ground | dot grid, board at 15% | Wondering's dots (gap 28, size 2), unchanged |
| Top bar | hamburger + project name at left (y 35); Play, Export, Share, avatar at right | the board's name is the first row of the left panel; nothing at the top right |
| Left panel | floating card x 16–300 (280 wide), y 84–690, rounded, over the grid; a `…` pill, a dropdown of the learner's own prompts, the reply beneath; "Agent log" pill under it | NOT COPIED (round four, §5). The sources-and-create column is on the RIGHT edge instead: `board-studio.tsx`, 320 wide, two cards (radius 16) that each fold on their header |
| Cards | screens with a 13px icon + title label ABOVE each; source documents as cards too; double-click → ring, size badge, Edit Text / Edit With AI / Delete | Wondering's cards, unchanged (`other-cards.tsx`, `conversation-card.tsx`) |
| Composer | floating, bottom centre, 585 wide: `+` and `/` left; add screen, palette, "Balanced", mic, send right; two NUMBERED suggestion chips above | Wondering's compact composer (576), centred in the full width, unchanged; its chips unchanged |
| Tool rail | vertical pill at the right edge, x 1450, y 235–545, centred: select, marquee, pen, hand, image, a hairline, palette, star | the PILL is copied (§6), the tools are not: ours holds Sources and Create, and pressing one opens its panel beside the pill the way Stitch's palette opens DESIGN.md. Wondering's zoom cluster (bottom-right) stands |
| Corner | undo/redo pill, "15%" pill, "?" pill, bottom right | NOT COPIED (round four, §5): built, cut the same day. Wondering's undo/redo (top-right) stands |
| Home | left rail of projects (My Projects / Shared, search, Recent / This Year / Examples); "Welcome to Stitch..", "Start with your design" / "Blank project"; a 998x216 box, "What native mobile app shall we design?", its bottom row `+` \| App \| Web … Balanced, mic, send; three example chips; "Need inspiration?" gallery | `board-landing.tsx`: one title, one 896-wide box, one hint line; the sidebar is the project rail; no chips, no gallery (the front door's two standing rules) |

## 2. NotebookLM (1470x836, dark), the CONTENTS of the panel

| Part | Measured | Ours |
|---|---|---|
| Three panels | Sources 359 \| Chat 689 \| Studio 359, all rgb(34,38,43) radius 16 on rgb(26,29,34), 16px gaps, top 64 | two panels behind two toolbar buttons on the RIGHT edge, one open at a time beside the toolbar (§6); the chat is the board |
| Sources | "Add sources" outlined button; a web-search box; "Select all" with a checkbox; one row per file, 327x52 at 16px, icon + name + checkbox + `⋮` | "Sources" heading with `+` and "Select all"; rows 40 tall at 14px: tick, kind glyph, name; reading and failed states in the row |
| Studio tiles | nine, 161x56, radius 12, two columns, 8px gap, 12px label bottom-left, icon top-left, chevron right, each faintly tinted | six (`lib/board/board-studio.ts`): Flashcards, Test, Study guide, Presentation, Document, Data table; 56 tall, radius 12, two columns, 8px gap, icon in the kind's own tint, chevron, 12px label; one press, no dialog |
| Made things | rows 331x64 under the tiles: icon, title, "Study Guide · 10 sources · 1h ago", `⋮` | "Made here": rows 40 tall, icon, title, kind; pressing one moves the camera to its card |
| Composer | "Ask a question or create something", "10 sources" | the board's composer says "Ask across the ticked sources…" |
| Collections | a flat named group of notebooks; nothing else on it | a project (a folder of boards); unchanged |

What NotebookLM has that we do not offer: Audio Overview, Video Overview, Infographic (no maker;
interactive visuals are out by owner ruling 2026-09-04). Mind Map exists in the chat but has no
board maker yet, so it is not a tile until it does.

## 3. ChatGPT Work's rail (1470 wide, dark), for the record

A floating card 300 wide, radius 24, rgb(33,33,33) with a 1px rgba(255,255,255,.05) edge, top 52,
31 from the window's right; section heading 14px/400 rgb(205,205,205) on a 28px row with a 28x28 `+`
at the right; a 1px divider inset 16; Outputs shows "Create file or site"; Sources rows are icon +
name; the header's "Files and sources" toggle (38x36) swaps it for a compact 276-wide card and the
chat re-centres. The owner moved on from this shape to Stitch's the same evening; the folding
sections survive as the panel's headings.

## 4. The rules that carried over

- The ticks are the board's scope (`board-provider.tsx` `setSourceSelection`): every source arrives
  ticked, a tick persists across questions, nothing ticked means everything. A board saved before
  2026-09-06 with an empty list loads with every ready source ticked (`ticksOf`).
- A thread hangs off a document only when exactly one document is ticked.
- No popups on the canvas (owner 2026-09-04): the panel is a standing card that folds to a button;
  no dropdown, dialog or menu opens over the board.
- Cards are output-only (owner 2026-08-25): the tiles make; nothing here edits a card.
- Test is a button (owner 2026-09-06, reversing §38 of the August contract for this panel).
- The front door is `/canvas` (`app/page.tsx`); Chat is one switch away on both doors.

## 5. Round four, the same day: the owner with the first build on screen

*"I don't think that should be a thing because like the way it was with Wondering, the canvas, you
didn't have to do that"* (the select/hand rail); *"I don't like that it moves away the chat
composer"*; *"having double side panels isn't too good ... there should be like only one side
panel"* (the column sat beside the app's own sidebar); *"I just like the way it looks on ... the
wondering one that one that's live now that has the minimalist zoom in buttons and fit view"*;
*"just move like the sources and the create to be separate panels. Like on the right side."*
Suggestions stay. The landing stays.

So the frame is the LIVE board's again, untouched: undo/redo top-right at 16, the zoom cluster
bottom-right at 15, the composer centred in the full width, a drag on the pane pans. The only new
thing on a non-empty board is one column down the right edge, 16 in, from y 62 (under the undo
pill) to 104 above the bottom (over the zoom cluster): Sources on top, Create beneath, 8 apart,
each a card of radius 16 with a 44px header that folds it, remembered per browser. While a document
is open in the reading pane (which docks on the same edge) both fold to their headers; a header
still opens its panel over the narrowed board until the last tab closes. Fit view and a new card
keep clear of an open panel (`measureBoardArea` subtracts the column from the free width).

## 6. Round five, the same day: *"too big"*

With the two-card column on screen: *"the source and create panels are too big, could make them
like the toolbar in stitch where users can toggle the panel on or off"*, with a picture of Stitch's
right toolbar and the DESIGN.md panel its palette button opens beside it. Off that picture (a 2x
crop): the pill is 46 wide, its buttons 32px circles on a ~44px pitch, the pressed one a filled
dark circle; the panel opens to the pill's left, ~277 wide, radius 24, a big soft shadow, and a
header of icon + title + X, its actions as rows ("+ Start with your design", "+ Create new") above a
scrolling list.

Ours (`board-studio.tsx`): a pill at right 16, vertically centred (between the undo pill and the
zoom cluster), `p-[7px]`, two 32px round buttons, Sources (Files) and Create (Sparkles), the open
one filled, a dot on a closed one that has contents. The panel: right 70, top 62 (under the undo
pill), 320 wide, radius 24, `shadow-lg`, a 56px header of icon + 16px title + X, then the same
contents as before (Sources: "Add sources" and "Select all" as rows, a hairline, the ticked rows;
Create: the six tiles and Made here). One panel at a time; the same button, the X, or Escape closes
it; nothing is open until the learner opens one, and the choice is remembered per browser
(`nemesis.board.panel`). While a document is open in the reading pane the panel closes and only the
toolbar stays; a button opens one over the narrowed board until the last tab closes.

## 7. Entering a thread: the canvas is the outer layer (2026-09-06)

Owner: *"i feel like the canvas is nice to visualize and organize but having a chat is nice to focus
on … could there be a way to allow users to enter individual chats in the canvas so chat and canvas
converge into one? like having canvas be the top layer, and chat be inner layer with sidebar
functionality?"*, then *"yes lets do it this way, lets trial it in local preview"*.

**A layer, never a route.** `enteredCardId` on the board's provider decides which of the two is in
front; the board stays mounted with its camera, its cards and any running turn untouched. Verified
in the preview: the camera transform is character-for-character the same before entering and after
leaving, and all nine nodes are still mounted while the thread is up.

**It is the same thread.** `board-thread.tsx` renders `card.messages` and sends through
`sendCardMessage`, so there is no second store and nothing to keep in step. What changes is the
reading: the chat's 768 column at 100% instead of a 640 card on a surface zoomed to 55%.

**One way out, in one place.** A "Canvas" control with a back arrow at the top left, plus Escape,
which stands down while the learner has words in the composer. A card deleted underneath you returns
you to the board rather than leaving the layer over nothing.

**The board's own composer stands down** inside a thread; that box opens a NEW thread and the one in
front already has its own.

**The panel floats over the layer** (thread z-30, toolbar and panel z-40). Drawn the other way round
it is still in the DOM, still answering, and invisible, which is how it first shipped here.

### Artifacts: both places, and the scope is the difference

The owner's question: *"should artifacts like flashcards, quizzess only exist in canvas or also in
chat sidebar?"* Answer, built: the same six buttons in both, and what changes is what they read.

| standing | Create makes from |
|---|---|
| on the board | the ticked sources (`{ sourceIds }`), which is what a tick is for and NotebookLM's model |
| inside a thread | that conversation (`{ cardId }`), the call `makeDeliverable` has always had |

The panel says which, in one line under the heading: "From this chat: …", "From 3 ticked sources",
or "From everything on the canvas". A made thing is one object either way, so it lands on the board
beside its card and in "Made here" at the same time.

## 8. Round six (2026-09-06 evening): the sidebar, groups, and asking before making

Nine notes in one message. What each turned into, and what was measured for it.

**"remove left sidebar panel when entering canvas."** The chat has collapsed the sidebar to the
52px rail since 2026-08-31 (the §38.1 reversal); the board never did, because the claim registry
had exactly one caller, `CanvasSurface`. `BoardPage` now claims it too, and only while there is
something on the board — an empty board is the front door and keeps its navigation. Measured on
`/dev-preview/board` with the sidebar preference set to open: board starts at x=52 with cards on
it, x=260 when empty.

**"copy the obsidian way to make groups in canvas and color them"** and **"there should be a way to
collapse groups too."** `lib/board/board-groups.ts`, and the one design decision that follows
Obsidian rather than React Flow: **a group stores no members**. Their `createGroupNode` builds the
frame from the selection's bounding box padded by 20 and answers membership live from
`getContainingNodes`; their saved node is `{type, label?, background?}` and nothing else. Ours is
the same, so a card dragged in joins and a card deleted cannot leave a dead id behind. React Flow's
`parentId` would have been shorter and would have brought a broken-membership state with it.

The colours are theirs too, read out of `obsidian.asar`'s stylesheet rather than drawn by eye:
`--canvas-color-1…6` → red `#e93147`/`#fb464c`, orange `#ec7500`/`#e9973f`, yellow
`#e0ac00`/`#e0de71`, green `#08b94e`/`#44cf6e`, cyan `#00bfbc`/`#53dfdd`, purple
`#7852ee`/`#a882ff` (light/dark).

Three things only showed up on screen: the frame's z-index has to be **-1001**, not -1, because
React Flow adds 1000 to a selected node's z and a frame at -1 paints its wash over the cards the
moment you click it; an always-live name input carries `nodrag` and so made the whole label bar
undraggable (the name is text until double-clicked now, which is Obsidian's own two states); and a
control hidden with `opacity-0` still takes clicks, so a press on what looked like empty bar deleted
the frame.

**"when dropping in documents there should be a shimmering effect as they load."** The card draws a
page of shimmering lines while the file is read, in place of a 16px spinner and the words "Reading
source…". A spinner held for the tens of seconds a lecture takes reads as a hang.

**"the create and sources panel need opening and closing animation."** 200ms in from the toolbar
edge, 140ms out; the panel id is held while the out-animation runs, since unmounting on the press is
what made it disappear rather than close.

**"canvas should support pptx, pdf, docx, md."** All four already did — the card mounts the
product's one `DocumentReader` — but the harness proved only three, so a `.pptx` fixture was added.
Measured with all five cards on screen: the PDF draws 4 page canvases, the .docx 9 `docx-preview`
blocks, the .pptx its slides, the .md its headings, and the still-reading card one `.board-shimmer`.

**"notebookllm asks user questions before generating flashcards or other artifacts"**, with his own
notebook linked. Measured in it the same evening: pressing a Studio tile opens an **880 x 518**
dialog, radius 16, content padding `0 32px`, a three-column control grid with 24px between, a
segmented control 40 tall per option, a label at 16px/500, a textarea whose placeholder is a real
example sentence, three suggested-topic chips, and a 91x40 pill "Generate" in a 73-tall footer.

Ours asks the same questions **inside the Create panel**, in place of the tiles — so this reverses
"a tile is one press and no dialog" and keeps "no popups in canvas", which are two different rules.
The answers are composed into ONE sentence (`studioInstruction`), because one free sentence is all
`makeBoardDeliverable` and `makeBoardCheck` take, and it is the same sentence a learner could have
typed into the composer. Not copied: their AI-suggested topic chips, which would need a model call
on every panel open.

**"copy the design.md popup for the sources and create popup panels"** — Stitch's palette panel,
which this panel was already modelled on (§6). What changed is the shadow: a wide soft fall
(`0 16px 40px rgba(0,0,0,.22)`) instead of Tailwind's tight `shadow-lg`, so the card reads as
sitting ON the canvas.

**"copy the glow that follows the mouse in canvas"** and **"darkmode makes it hard to see the
background dots."** Both are one measurement. The dot was `color(srgb 1 1 1 / 0.12)` on a `#000`
ground — rgb(31,31,31) — and at the board's own zoom each dot is barely one device pixel wide, so
anti-aliasing spent most of that alpha; dark mode is 28% now and light is unchanged. The glow is a
460px radial on `[data-board]::before`, above the page ground and below both the lattice and every
card, positioned from two custom properties written by one rAF loop (measured contribution at its
centre: rgb(0,0,0) → rgb(26,26,26)). No React state: a pointer emits over a hundred moves a second
and re-rendering a board of cards that often would drop frames on every drag.

## §9 NotebookLM's Sources and Studio panels, measured 2026-09-07

Owner: *"copy the sources panel from notebookllm into the nemesis app"* and *"notice how the right
studio panel has the buttons for creating and has the list under it, copy that into the app"*, with
his own notebook linked. Driven in his Chrome at **1470 x 779, light**. This supersedes the
2026-09-05 reading in memory: their Sources panel now groups sources under collapsible topics, which
it did not then.

**Frame.** Page ground `rgb(237,239,250)`. Three white panels, radius 16, top 64, height 693:
Sources 359 at x16, Chat 689 at x391, Studio 359 at x1095. Gaps 16 throughout.

🔴 WE DO NOT COPY THE FRAME, AND THAT IS AN OWNER RULING, NOT A SHORTCUT. *"having double side
panels isn't too good … only one side panel"* (2026-09-06), and the two panels that stood open were
read as too big twice. What is copied is the CONTENTS of their two panels into our one.

**Panel header.** 52 tall, label 16px/52 weight 400 `rgb(27,27,28)`, padding-left 16, a collapse
icon at the right.

### Sources, top to bottom

| Part | Measurement |
| --- | --- |
| "Add sources" | pill 327 x 32 at x32, radius 96, 1px `rgb(221,225,235)`, transparent fill, `+` 18px then label 14px/20 w500, centred |
| Web search | box 309 x 71 at x41: an input ("Search the web for new sources") over two dropdown pills (globe + "Web" + chevron, and "Fast Research") and a round search button |
| Control row | 32 tall: refresh and sort icons left; "Select all" 14px/24 + a 32 x 32 checkbox right |
| Topic group | 32 tall: chevron 24px + name 14px/24 w400 `rgb(31,31,31)`, ⋮ on hover, checkbox right |
| Source row | 311 x 52 at x48 (indented under its group), radius 8, padding 0 8: 24px coloured file glyph (PDF `rgb(219,55,45)`), name 14px/24 `rgb(27,27,28)`, ⋮ 18px, checkbox right |

🔴 THE CHECKBOX IS ON THE RIGHT, ours was on the left. The glyph carries the left edge, so the
name starts at the same x on every row whether or not its file type is known.

### Studio

Nine tiles, two columns: **161 x 56, radius 12, gap 8** (x 1111 and 1281, y step 64), padding
`8px 8px 8px 12px`. Icon top-left, label bottom-left 12px/16 w500, chevron right. Each tile is
tinted with its kind's own colour, and the label is a darker tone of the same:

| Kind | Fill | Label |
| --- | --- | --- |
| Audio Overview, Data Table | `rgb(237,239,250)` | `rgb(34,68,132)` |
| Slide Deck, Reports | `rgb(242,242,232)` | `rgb(121,103,49)` |
| Video Overview | `rgb(225,241,229)` | `rgb(15,82,35)` |
| Mind Map, Infographic | `rgb(240,233,239)` | `rgb(128,34,114)` |
| Flashcards | `rgb(247,237,235)` | `rgb(140,46,42)` |
| Quiz | `rgb(222,241,247)` | `rgb(5,106,149)` |

Under the grid: a divider at y457 spanning the panel, then the list of made things. Rows
**331 x 64 at x1111, radius 16, padding 8**: a 24px glyph in the kind's colour, title 14px/16 w500
`rgb(48,48,48)`, meta 12px/16 w400 `rgb(94,94,94)` reading `Study Guide · 10 sources · 1d ago`,
⋮ at the right.

🔴 THE META LINE IS THREE FACTS, NOT ONE. Ours printed only the kind. Theirs says what it is, how
much it was made from and when — which is the difference between a list and a receipt.

**Composer**, for the record: placeholder "Ask a question or create something", with a "13 sources"
count inside the box at the right.

## §10 Wondering's mechanism diagrams, measured 2026-09-07

Owner: *"go into wondering because our mermaid diagrams and visuals arent as good as theres one for
one"*. Driven in his own Wondering account, lesson "Blood Pressure".

🔴🔴 **THEY ARE NOT MERMAID, AND THEY ARE NOT A TYPED SPEC.** The 2026-09-04 teardown found their
comparison and timeline visuals to be React components rendering a small spec, and that is still
true of those. A MECHANISM diagram is a third thing: raw SVG, written into the lesson, on one fixed
canvas with a house style. Pulled out of their page:

```
viewBox="0 0 800 600"                                     one canvas, always
<rect width="800" height="600" fill="#FFFCF0"/>           a ground filling it
<rect rx="8" stroke="#3C2A28" stroke-width="3"/>          heavy ink outline on every box
<line stroke="#3C2A28" stroke-width="3" marker-end=…/>    flow
<line stroke="#879A39" stroke-width="4" marker-end=…/>    a "blocks" relation, its own marker
<text text-anchor="middle" font-size="32|28|26"/>         title / lead box / everything else
```

Fills: `#7BCAFF` blue, `#5ABDAC` teal, `#DFB431` amber, `#879A39` olive. Text `#261312` on light
fills, `#FFFCF0` on the olive. Font Public Sans. Two markers only, both 12 x 10. Multi-line labels
are separate `<text>` elements, never tspans. Every coordinate is absolute.

**Why this is the gap.** Nemesis already draws three ways: typed figures for a comparison, a
sequence or a set; real charts and typeset equations; and mermaid for graphs. The RAAS diagram is
none of those. It is a bespoke ARRANGEMENT, two branches converging on an outcome with two blockers
arrowing back up into it from below, and its meaning is carried by where things sit. A graph engine
lays those nodes out its own way and the arrangement is lost. No theme closes that, because the
difference is not colour.

**Diagrams are occasional.** Blood Pressure has one; Beta Blockers has none.

**Their palette is Flexoki**, a published open colour system: `#FFFCF0` is its paper, `#5ABDAC` its
cyan-400, `#879A39` green-400, `#DFB431` yellow-400.

### What we copied, and the two places we did not

`lib/workspace/svg-figure.ts` holds the sanitiser and the house style; `components/workspace/
svg-figure.tsx` draws it; a ```figure fence renders it. `/dev-preview/svg-figure` shows the RAAS
diagram in our style beside the same drawing with six attacks buried in it.

🔴 **The ink is `currentColor`, not their brown, and there is no background rect.** Copying their
cream paper literally would put a bright rectangle in the middle of a dark chat. Outlines, arrows
and labels follow the theme; the four fills stay fixed because on a mechanism the colour carries
meaning (what starts it, what it does, the outcome, what blocks it) and re-tinting by position would
say the wrong thing. Verified on screen in both themes: ink resolves to near-black on paper and to
white on a dark ground, with the four fills unchanged.

🔴 **The sanitiser is an allow-list, and it is the point of the feature.** "Render markup a language
model wrote" is a script-injection surface with a friendly name. SVG can carry `<script>`,
`<foreignObject>` holding arbitrary HTML, `on*` handlers, `href` to `javascript:`, `<use>` and
`<image>` reaching another document, and `<animate>` writing attributes after load. Elements and
attributes are both allow-listed, an unknown element takes its contents with it, ids are rewritten
per drawing so two figures in one answer cannot collide, and a figure with no viewBox is refused
rather than repaired. Thirteen tests, calibrated by widening the allow-list and confirming exactly
the security guards redden.

## §11 Wondering's IN-CHAT comparison figure, measured 2026-09-07

Owner: *"go into wondering ... if they have an opportunity to utilize any visualization, they'll do
it in a chat ... our visualizations look pretty much bland, black and white"*. Driven in his own
Wondering canvas ("Compare insulin aspart, glargine and degludec"), which draws a
**Pharmacokinetic Comparison of Insulins** figure inline in the conversation.

| Part | Measurement |
| --- | --- |
| Card | 490 wide, radius 16, fill `#FFFCF0`, 1px `rgb(212,205,196)` |
| Title | 16px/24 weight **700**, centred, `rgb(38,20,18)` |
| Header chip | 145 x 27, radius 8, **2px solid `rgb(38,20,18)`**, saturated fill (`#7BCAFF` blue, `#879A39` olive, red), 14px weight 700 |
| Cell | same 145 x 27, radius 8, **the same 2px ink**, fill = paper `#FFFCF0`, 16px weight 400 |
| Footer | a FILLED amber band, not an outlined box |

🔴🔴 **THE SIGNATURE IS THE INK, NOT THE COLOUR.** Every chip and every cell carries the same heavy
2px border in the text colour; only the header is filled. That is what makes it read as designed.
Ours had an 18% wash with a hairline in the tint's own colour, and "bland" was a fair description.

🔴 **WE DO NOT COPY THEIR PALETTE, AND THE REASON IS CONTRAST.** Their fills are pale brand colours
carrying dark text on cream, and their figure only ever sits on cream. Our `--ui-kind-*` are
mid-tone in the light theme, so a full-strength fill would put foreground text on a colour it cannot
be read against. The fill is mixed to **45%** toward the panel and the ink is `--ui-text-primary`,
so the same bold reading survives both themes. Verified in Playwright at both schemes:
`/dev-preview/visual-figure`.

🔴 **AND THE MODEL HAS TO REACH FOR IT.** A comparison drawn as a mermaid flowchart is grey boxes
however well this component is styled. The mermaid paragraph was claiming the case; §10's handover
and the lane order in `diagram-instruction.ts` are the other half of this fix.

## §12 NotebookLM's mind map, measured 2026-09-07

Owner: *"make it similar to Notebook LM. I think they also use mermaid flowcharts. Like, I don't
know, because it looks similar to that, honestly."* Opened his own **COPD Mindmap** in his notebook.

🔴🔴 **IT IS NOT A MERMAID FLOWCHART, AND CHECKING WAS THE POINT.** The root sits on the LEFT as a
pill; children fan RIGHT on curved connectors; and **every child carries a `>` chevron**, because
you unfold one branch at a time. A mermaid render is a finished picture. Theirs unfolds, which is
the giveaway.

- Opens in the **Studio side panel**, not full screen, with the title, a "View 1 source" chip, and
  a Good content / Bad content pair at the foot.
- Pan and zoom controls down the left: recentre, `+`, `−`, and a **download**.
- Opens at one level: five branches under the root, each closed.

**Node styling could not be read**: the map is drawn on a canvas or in a frame, so `getComputedStyle`
returns the wrapper. The shape above is from the screenshot and is what was copied.

### What we already had, and what was actually missing

`mindmap-view.tsx` has been an unfoldable tree since 2026-09-03 (owner: *"one that I can click on
and then reveals more nodes"*) with a `panel` mode that fills the side panel. The picture was never
the gap.

The gap was that a mind map **arrived inside a chat answer and was gone when you scrolled past**.
It is a made thing now: `lib/board/board-mindmap.ts` writes one, it is stored on the card as a tree
(its own field, like a check's `run`, because it is a shape and not a file), and it opens in the
reading panel.

🔴 **THE INLINE ONE WENT.** Owner, asked directly: *"only a [tile] makes them"*. The mermaid
`mindmap` fence was the one diagram exempt from the eight-node cap; that exemption and the fence
are both out of `diagram-instruction.ts`. Asking in words still works, routed by `readBoardMakeAsk`.

🔴 **MERMAID IS STILL THE WIRE FORMAT AND THAT IS NOT A CONTRADICTION.** The model writes a
`mindmap` block because it writes those well and `parseMermaidMindmap` already reads them. The
result is stored as a tree and drawn by our own component. Nobody sees mermaid.

## §13 Stitch's cursor light, and what ours was doing wrong

Owner, 2026-09-07: *"fix the glow because essentially Stitch does it a different way. They don't
actually have like a glow. They just make the individual buttons or dots glow. Or light up a little
bit more around the mouse."*

Ours was a 920px radial **wash** laid over the lattice: the light was on the board and the dots were
merely underneath it. Theirs is the lattice itself brightening.

**What is drawn now**: a second copy of React Flow's own dot pattern at a brighter colour, shown
through a circular window that follows the pointer.

🔴🔴 **THE WINDOW MOVES AND THE DOTS DO NOT, WHICH IS THE WHOLE TRICK.** `.board-halo` is a fixed
920px circle translated to the cursor; `.board-halo-inner` is translated by exactly the opposite
amount, so the bright lattice stays pinned to the board while the hole slides over it. Two
transforms, both composited: no repaint, no gradient origin to recompute. A `mask-image` positioned
at the cursor is the obvious way and is the bug this board already paid for once, because moving a
mask repaints the whole element every frame.

Dots rest at 12% (light) / 28% (dark) and light to 34% / 70%.
