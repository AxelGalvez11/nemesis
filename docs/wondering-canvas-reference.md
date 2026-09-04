# Wondering Canvas reference — READ OFF THEIR SHIPPED CODE, 2026-09-03

> 🔴 WHY THIS FILE IS IN THE REPO. Owner, 2026-09-03: *"replicate the wondering /canvas one for one
> so that we have a good baseline to work from."* Nemesis's spatial Canvas (`/canvas`) is built to
> these numbers. None of them was estimated by eye: their whole app ships as ONE readable JavaScript
> file (`https://wondering.app/assets/index-<hash>.js`, 8.2 MB, function names intact) and every
> class string, constant and event below was copied out of it, then checked against the live board
> in the owner's signed-in Chrome. Re-derive the hash from `performance.getEntriesByType('resource')`.
>
> Their stack: React + `@xyflow/react` (React Flow), Tailwind, framer-motion, Radix, lucide icons,
> Supabase edge functions (`canvases`, `canvas-chat`). Ours: the same React Flow, the same Tailwind
> grammar, our own model door (`postChatCompletion`) and our own table.
>
> 🔴 THREE THINGS ARE DELIBERATELY NOT COPIED, same rulings as `chatgpt-reference.md`:
> the font (theirs is Public Sans; ours stays the app font), the brand colour (their `--color-brand`
> is a fixed blue; ours is the learner's accent `--ui-action`, and the ONLY accent homes are the
> mascot, the send button and the learner's bubble), and their generated pictures (an image model
> that contradicted its own table — see the teardown memory). Everything geometric is copied.

## 1. The document — one JSON per board

```
{ version: 1, cards: Card[], sources: Source[], selectedSourceIds: string[],
  useWebSearch: boolean, viewport?: { x, y, zoom } }
```

`Card`:
```
id, kind: "conversation" | "lesson", parentId: string | null, sourceIds: string[],
contextExcerpt: string | null, contextOccurrence?: number, inheritedContext: Message[],
title (<=60 chars, derived from the first question, "New thread" when empty),
summary?, collapsed?: true, highlights: Highlight[], savedImages: SavedImage[], notes: Note[],
status: "idle" | "streaming", position: {x,y}, width: number, height?: number,
messages: Message[]
```
`Message`: `{ id, role: "user" | "assistant", content, contextExcerpt?, contextOccurrence?,
citations?: {url,title}[], suggestedQuestions?: { followUps[], branches[], newThreads[] },
isError?, pending?, isStreaming?, wasTruncated?, updatesComposerSuggestions? }`.

Saved with `expectedVersion` (optimistic concurrency), **8 MB cap**, **400 ms debounce**, **5 s retry,
stop after 3 failures**, `keepalive` on `visibilitychange: hidden`. **Undo history (50 entries) is saved
server-side beside the document** and survives a reload. Title = first card title that is not
"New thread", else first source name, else "Untitled canvas" (120 chars max).

## 2. Layout constants (world units, zoom 1)

| name | value |
|---|---|
| CANVAS_CARD_WIDTH | **720** |
| CANVAS_CARD_MIN_WIDTH / MAX_WIDTH | 300 / 840 |
| CANVAS_CARD_MIN_HEIGHT | **320** (also EMPTY_CARD_HEIGHT) |
| CANVAS_CARD_AUTO_MAX_HEIGHT | 900 (a streaming card grows to the composer's top, never past this) |
| CANVAS_CARD_MAX_HEIGHT | 3000 |
| CONTRACTED_CARD_MIN_HEIGHT | 180 (collapsed card) |
| CANVAS_NOTE_WIDTH | 260 |
| CANVAS_SOURCE_WIDTH / MIN_HEIGHT | 640 / 220 (image source 340) |
| ROOT_GAP_X | 140 (new root card sits right of the right-most root) |
| CHILD_GAP_X | 160 (branch card sits this far from its parent, on the chosen side) |
| PLACEMENT_GAP | 64 (overlap test margin; collision pushes down for left/right, right for top/bottom) |
| NOTE_GAP_X / NOTE_GAP_Y | 72 / 192 |
| INITIAL_CANVAS_CARD_ZOOM | 0.9 (first card is centred at this zoom) |
| minZoom / maxZoom | 0.15 / 1.5 (phone 0.05) |
| MAX_CANVAS_CARDS | 250 |
| message limit | 8,000 chars; excerpt limit 4,000 chars |

`nextRootPosition`: x = max(right edge of every card) + 140, y = the y of the right-most root.
`findFreeChildPosition(parent, occupied, side)`: start at parent's side + 160; while it overlaps
anything (with 64 px margin) move past the lowest overlapping bottom + 64 (or right-most right for
top/bottom sides). `centeredViewportForNode`: horizontal padding 28, top padding 24, maxZoom 1
(0.9 for the first card), viewport = the board minus the composer's height minus 24 px.

## 3. The board (`CanvasBoardInner`)

React Flow props: `nodeDragThreshold: 4`, `selectNodesOnDrag: false`, `deleteKeyCode: null`
(Backspace/Delete handled by hand, skipped while typing), `zoomOnDoubleClick: false`,
**`panOnScroll: true`, `panOnScrollSpeed: 1`, `zoomOnScroll: false`, `zoomOnPinch: true`**,
`panOnDrag`, `nodesDraggable`, `nodesConnectable: false`, `edgesFocusable: false`,
`proOptions.hideAttribution`. Wheel inside a card scrolls the card first; only when the card cannot
scroll further does the wheel reach the board (`CanvasNodeWheelBoundary`, selected cards only).

Background: **dots, gap 28, size 2, colour `border`**. Board ground: `--color-surface` =
`hsl(48 100% 97%)` (warm cream) in their theme; ours is the page ground.

Edges: bezier, `stroke: border-strong`, `strokeWidth 1.5`, `ArrowClosed` marker 18×18, `animated`
while the child streams. Endpoints: the pair of sides (`connectionSides`) whose midpoints are
closest — right→left or bottom→top by centre offset, whichever is shorter. Note edges are dashed
`4 4` until the note has text, no arrowhead.

Controls (bottom-right, `m-[15px]`, React Flow `Controls` shell): zoom in / zoom out / fit, each
`react-flow__controls-button` (26×26, 4 px padding) with `!border-border !bg-surface-card
!text-text-secondary hover:!bg-surface-hover hover:!text-text-primary`, icons `size-4` (Plus, Minus,
Maximize). Fit = `getViewportForBounds(nodesBounds, w, availableHeight, min, max, 0.1)` over 250 ms.

Undo/redo (top-right, `right-4 top-4`): `flex gap-0.5 rounded-lg border border-border
bg-surface-card/95 p-1 shadow-sm`, buttons `rounded-md p-1.5 text-text-secondary
hover:bg-surface-hover disabled:opacity-40`, icons Undo2/Redo2 `size-4`, tooltips "Undo (⌘Z)" /
"Redo (⇧⌘Z)". Keys: ⌘Z / ⇧⌘Z / Ctrl+Y, ignored inside editable targets.

Empty state (centre of the board, pointer-events none): `h1` "Canvas" in a serif at `text-2xl`,
`p` "A visual way to understand things in parallel" `text-base text-text-secondary`.

Selection: `ring-2 ring-text-primary` on the card; pane click clears. Picked-up (drag) style:
`-translate-y-1 scale-[1.02] cursor-grabbing shadow-xl`, z-index 1000.

## 4. The card (`ConversationCardNode`, presentation "canvas")

Shell: `group/card relative flex w-full flex-col rounded-2xl border border-border/[0.45] shadow-sm
cursor-grab bg-surface-card/95 transition-[transform,box-shadow] duration-150 ease-out
hover:shadow-md active:cursor-grabbing` + `h-full` once a height is known, else
`minHeight: 320` + `maxHeight: <composerTop − cardTop>/zoom` clamped to [320, 900] while streaming.

Resize: React Flow `NodeResizeControl` on all four edges (`!w-2` / `!h-2`, transparent) and four
corners (`!size-6 !border-0 !bg-transparent`), limits min 300×320, max 840×3000.

**Title bar sits ABOVE the card**: `absolute bottom-full left-1 right-1 mb-1.5 flex items-center
gap-2`: title `text-sm font-semibold text-text-primary truncate` (BookOpen `size-4 text-brand` first
when kind = lesson); Collapse/Expand (`Minimize2`/`Maximize2` `size-4`, `rounded-md p-1
text-text-tertiary hover:bg-surface-hover`); Delete (`Trash2` `size-4`, `rounded-md p-1 text-error
hover:bg-error-bg`); Add note (`StickyNote` `size-4` + count `text-xs font-medium`).

**Branch buttons** on the four sides (`BRANCH_BUTTONS`): wrappers at `bottom-full left-1/2 mb-1`,
`left-full top-1/2 ml-1`, `left-1/2 top-full mt-1`, `right-full top-1/2 mr-1`; hidden until the card
is hovered / focused / selected (`opacity-0 → group-hover/card:opacity-100`); the only card on the
board shows its RIGHT button always at `size-8` with a `size-4` plus. Each is a `size-10` hit
target holding a `size-5` disc `rounded-full border border-brand/60 bg-brand/40 text-brand-text
shadow-sm` that grows to `size-9 bg-brand` on hover with a `size-3 → size-4` Plus. Disabled until
the card has a real answer. Tooltip "Create a card from the {side} side".

Body: `[data-canvas-card-content] min-h-0 space-y-3 px-4 py-3 overflow-y-auto overscroll-contain
flex-1` with a 12 px vertical fade mask top and bottom
(`linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)`).
`select-none` until the card is selected, then `nodrag nopan cursor-auto select-text`.

User message: right-aligned, `max-w-[85%] rounded-2xl bg-text-primary px-3.5 py-2.5`, text `text-sm
leading-relaxed text-text-inverse whitespace-pre-wrap`. A quoted excerpt (branch context) shows as
`border-l-2 pl-2 text-xs italic opacity-70` above it, toggled by a `TextQuote` button.

Assistant message: `text-sm text-text-primary` markdown. Key terms arrive as
`[term](#concept "one-line explanation")` links and render as `ConceptKeyword` pills:
`inline-flex gap-1 rounded-md border border-border bg-surface-secondary px-1.5 text-[0.92em]
font-medium leading-snug hover:border-brand/60 hover:bg-brand-bg` with a `Sparkles size-3`; the
pill turns `border-branch-highlight bg-branch-highlight` once branched from. Click → Radix popover
(`w-72 rounded-xl border border-border/70 bg-surface p-3 shadow-xl`, `side: top`, offset 8):
term `text-sm font-semibold`, explanation `mt-1 text-sm leading-relaxed text-text-secondary`,
button **"Dive deeper"** (`mt-2.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold`) which
opens a child card whose first (hidden) user turn is *"Dive deeper into the highlighted excerpt:
explain it more thoroughly and surface what matters most about it."*

Citations: `mt-3` list, "Sources:" `text-xs font-medium text-text-secondary`, then `[n] title`
links `text-xs text-brand hover:underline`. Streaming placeholder: three `size-1.5` pulsing dots
(200 ms stagger). Error: `text-xs text-error-text` + an **"Edit and retry"** chip
(`rounded-md border px-2.5 py-1.5 text-xs font-medium`, PencilLine `size-3.5`) that puts the failed
question back in the card's textarea.

**Suggested questions** (max 4 = followUps ∪ branches, after the last good answer): `flex flex-col
gap-2`, each a `min-h-10 w-full rounded-lg border border-border bg-surface-card px-4 py-2 text-start
text-base hover:border-border-hover hover:bg-surface-secondary` button. Clicking one MORPHS in place
(spring 0.24 s, bounce 0.08) into a `grid-cols-[2rem_1fr_1fr] gap-1.5` row: ✕ Cancel, **"Ask here"**
(MessageCircle), **"Ask in a new branch"** (GitBranch).

Card composer (bottom, `mt-auto flex items-center gap-2 rounded-b-2xl px-3 py-2.5`): auto-resizing
textarea `min-h-12 rounded-2xl border border-border bg-surface-card px-4 py-3 text-base`, max
height 128, placeholder **"Ask a follow-up…"**, Enter sends, Shift+Enter newline; send button
`size-12 rounded-lg bg-brand` with `ArrowUp size-4`, `disabled:opacity-40`. Over-limit notice
`mt-1 px-1 text-xs text-error-text`.

Collapsed card (`collapsed: true`, min height 180): centred `h3 text-2xl font-semibold line-clamp-2`
title, `p text-lg leading-relaxed text-text-secondary line-clamp-2` summary (or "Expand to start the
conversation"), first image at `max-h-56 rounded-xl border`, pill button **"See the full conversation"**
(`rounded-full border px-4 py-2 text-sm font-medium shadow-sm`).

Saved items section (only when images were saved, or highlights on a browser without the CSS
Highlight API): `border-t px-4 py-3`, heading Bookmark `size-3.5 text-brand` + "Saved items".

## 5. Selecting text inside a card

`useTextSelection` on the content element publishes `{selectedText, position}`;
`SelectionActionMenu` portals to `body` at `z-[80]`, `MENU_WIDTH 184`, `PROMPT_MENU_WIDTH 420`,
`ACTION_HEIGHT 44`, gap 10 above the selection (below if no room), viewport margin 8.
Shell: `rounded-xl border border-border/70 bg-surface shadow-xl backdrop-blur-xl
animate-menu-pop-in` (0.22 s `cubic-bezier(.34,1.56,.64,1)` from scale .92). With a prompt it is
one `h-11 p-1` row: an input `h-9 px-2.5 text-base` placeholder **"Ask about this…"**, then a 1 px
divider, then **Create note** (StickyNote) and **Highlight** (Highlighter) `h-9 rounded-lg px-2.5
text-sm font-medium`. Once the input has text the actions slide out (6 px, spring 0.28 s) and are
replaced by **"Reply here"** (MessageCircle, tertiary) and **"New thread ↑"** (GitBranch, `bg-brand`).
Enter = new thread. New thread → child card on the RIGHT whose first user turn carries the excerpt
as `contextExcerpt`, and the parent gets a `branch` highlight painted through
`::highlight(inline-branch-highlight)` (`bg branch-highlight`). Saved highlights paint
`::highlight(inline-text-highlight)` (`text-highlight / .55`), note anchors `brand / .35`. Clicking a
painted highlight opens a one-action menu **"Remove highlight"**.

## 6. Notes

`addCardNote` places a 260-wide note at `parent.x + width + 72, parent.y + n·192`, linked by a
dashed edge. Note node: `rounded-xl border border-brand-border bg-brand-bg/90 shadow-sm`, header
`px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-brand-text` "Note on
{title}" with StickyNote `size-3.5` and a hover-revealed ✕; optional quoted excerpt
`border-l-2 border-brand px-2 text-xs italic` (click scrolls the parent to that text);
textarea `min-h-20 px-3 pb-3 pt-1 text-sm leading-relaxed` placeholder "Write a note…";
an empty note deletes itself on blur.

## 7. The board composer (`CanvasChatInput`)

Wrapper `absolute inset-x-0 bottom-6 z-40 flex justify-center px-4`, shell `w-full max-w-2xl`
(**672 px**) while the board is empty, `max-w-[576px]` once it has cards.

Empty ("full"): form `rounded-2xl border border-border bg-surface-card/[0.72] backdrop-blur-xl`,
textarea `min-h-14 px-4 pb-2 pt-3 text-base` placeholder **"What do you want to understand?"**;
controls row `px-3 pb-3`: web-search toggle `h-7 rounded-md px-2 text-xs font-medium` (Earth
`size-3.5` + "Web search on/off"; OFF state is the tinted one `bg-brand-bg`), model dropdown
`h-7 px-2 text-xs font-medium` ("Fast" ▾, items "Fast — Quick answers" / "Think harder"), send
`size-10 rounded-xl bg-brand` ArrowUp `size-5`.

With cards ("compact"): surface `min-h-12 rounded-xl border border-border bg-surface-card/[0.78]
shadow-sm backdrop-blur-xl`, one row `flex items-center gap-1 p-1.5`: textarea `min-h-9 px-2.5 py-2
text-base` placeholder **"Start another thread…"**, Earth icon button `size-9 rounded-lg`, model
pill `h-9 px-2`, send `size-9 rounded-lg`.

**New-thread suggestions** above the composer: `mb-2 flex flex-wrap justify-center gap-1.5`, each
`rounded-full border border-border bg-surface-card/[0.85] px-3 py-1.5 text-xs text-text-secondary
shadow-sm backdrop-blur-xl hover:bg-surface-secondary`. They come from the LAST root turn's
`suggestions.newThreads` and are replaced by every later root send.

Selected sources appear as chips inside the form (`rounded-md bg-brand-bg px-2 py-1 text-xs
font-medium text-brand`, ✕) and switch the placeholder to "Ask about the selected source…".
🔴 Their board composer has NO attach button; sources reach the board only by drag-drop of a PDF or
image (`addSourceFiles`), and at most 4 sources ride one question, pasted and truncated
(240k / 480k chars). Ours attaches through the chat's own machinery instead — that is the
competitive point, not a thing to copy.

## 8. The turn (`canvas-chat` edge function, SSE)

Request: `{ message, history (last 16 messages of the card, plus the parent's when branching),
contextExcerpt, sources[], responseMode: "answer" | "lesson", useWebSearch, cardTitle, cardSummary,
model, persistence: { canvasId, cardId, messageId } }`.

Events, one JSON per `data:` line: `content` (delta) · `citations` · `status` (generating visuals)
· `summary` (`{title, summary}`) · `suggestions` (`{followUps, branches, newThreads}`) ·
`embed_progress` · `final` (`{content, truncated}`) · `error` · `[DONE]`.
In-band protocol the client strips from the text: `[[LAYOUT …]]` lines, `[[SUGGEST … ]]` blocks,
`[[EMBED … ]]` blocks (masked as *"Creating a visual…"* while streaming).

Recovery: the reply is persisted server-side under `messageId`; if the stream dies the client asks
`canvases/replies` for it every 4 s for up to 180 s, and on reload any `pending` message is polled
the same way. The card's `status` goes `streaming → idle`; a streaming card cannot be deleted
("Wait for the reply to finish").

Card title: first 60 chars of the first question (`deriveCardTitle`) until the model's `summary`
event replaces it. Card summary: the `summary` event, else the last answer flattened to 200 chars.

## 9. The sidebar section (desktop)

`mt-6`; header row `flex items-center justify-between pl-2.5 pr-1`: a disclosure button
`flex flex-1 items-center gap-1 py-1 text-sm text-text-secondary hover:text-text-primary`
("Canvas" + ChevronDown `size-3.5`, rotates −90° when closed, state in
`localStorage.canvasListExpanded`) and a **+** button `size-7 rounded-md` (Plus `size-4`,
"New canvas") that expands the list and navigates to `/canvas`.

Rows: `ul.space-y-0.5`, `li group flex min-w-0 items-center rounded-lg` (`bg-surface-hover/40` when
current, hover the same), title button `min-w-0 flex-1 truncate text-left text-sm text-text-primary
py-1.5 pl-2.5`, a `size-5` status slot (spinner `size-3.5 text-brand` while any card streams, a
`size-2 rounded-full bg-brand` dot when a reply landed while you were away), and a `⋯` button
`size-7 rounded-md text-text-tertiary` opening **Rename** (inline input `h-7 rounded-md border px-1.5
text-sm`, ✓ and ✕ `size-7`, Escape cancels, empty → "Untitled canvas") and **Delete** (modal
"Delete canvas?" / "“{title}” and all of its conversations will be permanently deleted." / Cancel /
Delete). While on `/canvas` with nothing saved yet, a first row reads "Untitled canvas". Empty list:
"No canvases yet". Error: "Couldn’t load canvases." + Retry.

The board is only offered at ≥768 px; phones get "This feature works best on desktop." with a
Copy-link button.

## 10. Colour tokens (their `theme-v2`, light)

| token | hsl |
|---|---|
| surface (board ground) | 48 100% 97% |
| surface-card | 0 0% 100% |
| surface-secondary | 44 41% 93% |
| surface-hover | 40 21% 88% |
| border | 33 15% 80% |
| border-hover | 26 9% 63% |
| border-strong (edges) | 23 8% 54% |
| text-primary | 4 35% 11% |
| text-secondary | 13 13% 37% |
| text-tertiary | 23 8% 54% |
| brand-primary | 202 100% 74% (their blue — ours is `--ui-action`) |
| brand-bg / brand-border / brand-text | 202 100% 95% / 202 100% 89% / 202 51% 59% |
| branch-highlight | 262 83% 76% (purple wash under a branched sentence) |
| text-highlight | 54 97% 63% (yellow, drawn at 55%) |
| error / error-bg / error-text | 7 100% 69% / 13 100% 88% / 7 100% 30% |

Tailwind defaults they lean on: `rounded-2xl` 16 px, `rounded-xl` 12 px, `shadow-sm`
`0 1px 2px rgb(0 0 0/.05)`, `shadow-md`, `shadow-xl`, `text-sm` 14/20, `text-base` 16/24,
`text-xs` 12/16, `leading-relaxed` 1.625.

🔴 THE REM TRAP APPLIES HERE TOO: this app sets `html { font-size: 112.5% }`, so every rem-based
Tailwind class renders 12.5% larger than its name. Anywhere this file states a pixel, write the
pixel (`rounded-[16px]`, `text-[14px]`, `size-[36px]`), never the utility that would be right at 16 px.
