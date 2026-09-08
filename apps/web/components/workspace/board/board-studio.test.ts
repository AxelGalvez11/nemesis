import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { STUDIO_TILES, boardHasMaterial, studioInstruction, tickedReadySources } from "@/lib/board/board-studio";
import type { BoardCard, BoardSource } from "@/lib/board/board-model";

// ── the canvas workspace: landing, panel, frame ─────────────────────────────────────────────
//
// Owner, 2026-09-06: *"Yes make new landing and workspace canvas based on stitch and wondering
// canvas, where users are invited to drop in material, can have chats in canvas like wondering,
// can see docs in canvas, can create flashcards, docs, presentations, and have a place to also
// see sources as list too, and panel with buttons to create artifacts with ability to choose
// which sources to make from like in notebook llm"* — and, interrupting the go-ahead: *"I need
// tests to be clickable button like in notebookllm you understand?"* Then, the same day, with the
// first build on screen: *"there should be like only one side panel ... just move like the sources
// and the create to be separate panels. Like on the right side"*, no select-or-drag rail, the
// composer never moved, and *"the minimalist zoom in buttons and fit view"* the live board had.
// And once more, with the two-card column on screen: *"the source and create panels are too big,
// could make them like the toolbar in stitch where users can toggle the panel on or off"*.
//
// These pin the shape as built. Every one of them is a rule that could drift back silently: a
// tile removed on the strength of the older no-test-button memory, a chip that clears the ticks,
// a dropdown that opens over the board, a front door that sends people to the chat again.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const STUDIO = read("./board-studio.tsx");
const LANDING = read("./board-landing.tsx");
const CHROME = read("./board-chrome.tsx");
const SURFACE = read("./board-surface.tsx");
const PAGE = read("./board-page.tsx");
const PROVIDER = read("./board-provider.tsx");
const COMPOSER = read("./board-composer.tsx");
const HOME = read("../../../app/page.tsx");
const BOARD_CSS = readFileSync(new URL("./board.css", import.meta.url), "utf8");

test("🔴🔴 the create panel offers Test as a button, beside flashcards, a study guide, a presentation and a document", () => {
  const kinds: readonly string[] = STUDIO_TILES.map((tile) => tile.kind);
  assert.ok(kinds.includes("check"), "the Test tile is gone — owner 2026-09-06 reversed §38 for this panel; see memory test-button-is-back");
  assert.equal(STUDIO_TILES.find((tile) => tile.kind === "check")?.label, "Test");
  for (const kind of ["flashcards", "note", "slides", "document"]) assert.ok(kinds.includes(kind), `${kind} has no tile`);
  // Every tile has a maker on the board; a tile that made nothing would read as broken.
  for (const tile of STUDIO_TILES) assert.match(read("../../../lib/board/board-deliverables.ts"), new RegExp(`\\b${tile.kind}:`), `${tile.kind} has no label in the makers' table`);
  // And the tiles are drawn from that one list.
  assert.match(STUDIO, /STUDIO_TILES\.map\(/, "the panel draws its own tile list instead of the shared one");
  assert.ok(!/StudyCreateDialog|Dialog|DropdownMenu|Popover/.test(STUDIO), "the panel opens something over the board — owner 2026-09-04: no popups in canvas");
});

test("🔴🔴 sources are a list with a checkbox on every row and a Select all, like NotebookLM", () => {
  assert.match(STUDIO, /type="checkbox"/, "no checkbox on a source row");
  assert.match(STUDIO, /Select all/, "no Select all row");
  assert.match(STUDIO, /setSourceSelection\(allTicked \? \[\] : ready\.map\(\(source\) => source\.id\)\)/, "Select all does not tick and untick every ready source");
  assert.match(STUDIO, /toggleSourceSelection\(source\.id\)/, "a row's tick does not toggle that source");
  assert.match(STUDIO, /aria-label="Add sources"/, "no way to add a source from the panel");
  // Sources and Create are two panels behind two toolbar buttons, one open at a time (pinned below).
  assert.match(STUDIO, /sources: \{ label: "Sources", icon: Files \}/);
  assert.match(STUDIO, /create: \{ label: "Create", icon: Sparkles \}/);
});

test("🔴🔴 the ticks are the board's scope: they persist across questions, a new source arrives ticked, and nothing ticked means everything", () => {
  const start = PROVIDER.slice(PROVIDER.indexOf("const startCard = useCallback("), PROVIDER.indexOf("const sendRootMessage = useCallback("));
  assert.ok(!/setSelectedSourceIds\(\[\]\)/.test(start), "sending a question clears the ticks again (Wondering's per-question chips)");
  assert.match(start, /sourceIds\.length === 1 \? sources\.find/, "a thread hangs off the first ticked document even when several are ticked");
  assert.match(PROVIDER, /setSelectedSourceIds\(\(all\) => \[\.\.\.all, draft\.id\]\)/, "a source that finished reading is not ticked on arrival");
  assert.match(PROVIDER, /setSourceSelection: \(sourceIds: readonly string\[\]\) => void;/, "the provider has no way to tick exactly a set");
  const make = PROVIDER.slice(PROVIDER.indexOf("const makeDeliverable = useCallback("), PROVIDER.indexOf("const openedOutput = useMemo("));
  assert.match(make, /sourceIds\?: readonly string\[\]/, "makeDeliverable cannot be told which sources to make from");
  assert.match(make, /ticked\.length > 0 \? groundedSources\(ticked\) : groundedSources\(sources\)/, "a tile with nothing ticked does not fall back to every source");
  // The composer no longer carries removable chips for the ticked sources; the panel is where ticks live.
  assert.ok(!/Remove \$\{source\.name\} from question/.test(COMPOSER), "the composer still shows the old per-question chips");
  assert.match(COMPOSER, /Ask across the ticked sources/, "the composer does not say it answers from the ticked sources");
});

test("🔴🔴 the front door invites material: the landing, and the app opens on the canvas", () => {
  assert.match(HOME, /redirect\("\/canvas"\)/, "the app still opens on the chat");
  assert.match(LANDING, /export const LANDING_PLACEHOLDER = "Drop your lecture, notes or slides here, or ask a question";/);
  assert.match(LANDING, /Add sources/, "no named way to add material on the landing");
  assert.match(LANDING, /data-board-composer=""/, "the landing's box is not the composer measureBoardArea reads");
  assert.match(LANDING, /onDrop=\{onDrop\}/, "the landing does not take a drop");
  assert.match(LANDING, /void addSourceFiles\(files\)/, "a dropped file does not become a source");
  // The page shows the landing on an empty board and the compact composer once anything is on it.
  assert.match(PAGE, /const empty = cards\.length === 0 && sources\.length === 0 && outputs\.length === 0;/);
  assert.match(PAGE, /if \(!empty\) return <BoardComposer \/>;/);
  assert.match(PAGE, /<BoardLanding \/>/);
  assert.ok(!/A visual way to understand things in parallel/.test(PAGE), "the old empty-state hint is still drawn");
});

test("🔴🔴 Stitch's toolbar on the right, one panel at a time beside it, and the live board's controls exactly where they were", () => {
  // Owner 2026-09-06, with the first build on screen: no select-or-drag rail ("the way it was with
  // Wondering, you didn't have to do that"), no composer that moves, no second panel on the left;
  // then, with the two-card column on screen: "too big ... like the toolbar in stitch where users
  // can toggle the panel on or off".
  assert.ok(!existsSync(new URL("./board-tools.tsx", import.meta.url)), "the tool rail is back");
  assert.match(SURFACE, /function ViewportControls/, "Wondering's zoom cluster is gone");
  assert.match(STUDIO, /function UndoRedoButtons/, "Wondering's undo and redo are gone");
  assert.match(SURFACE, /position="bottom-right"/, "the zoom cluster is not bottom-right");
  assert.match(STUDIO, /absolute right-\[16px\] top-\[16px\] z-40 flex items-center/, "undo and redo are not top-right");
  assert.match(SURFACE, /^\s*panOnDrag\s*$/m, "a drag on the pane no longer pans on its own; a tool decides");
  assert.ok(!/selectionOnDrag|SelectionMode|BoardTool/.test(SURFACE), "a select-versus-hand tool is back");
  assert.match(SURFACE, /\{!empty && <ViewportControls \/>\}/, "the controls are drawn over the landing");
  // The card's own shape decides how tall it opens (owner 2026-09-07: "fitted to card size").
  assert.match(read("../../../lib/board/board-layout.ts"), /export function defaultSourceHeight/, "every dropped file opens at one height again");
  assert.match(SURFACE, /<BoardInner \/>\s*<BoardStudio \/>/, "the toolbar is outside the React Flow provider and cannot move the camera to a made thing");
  // The toolbar: a pill on the right edge, centred, two pressed-state buttons.
  // z-40 since 2026-09-06: the toolbar and its panel float OVER an entered thread (board-thread.tsx).
  assert.match(STUDIO, /absolute right-\[16px\] top-\[16px\] z-40 flex items-center gap-\[4px\] rounded-full/, "the toolbar is not the top-right pill");
  assert.match(STUDIO, /role="toolbar"/);
  assert.match(STUDIO, /aria-pressed=\{active\}/, "a toolbar button does not say whether its panel is open");
  assert.match(STUDIO, /data-board-tool=\{id\}/);
  // One panel at a time, beside the toolbar, with an X; Escape closes; the choice is remembered.
  assert.match(STUDIO, /const \[stored, setStored\] = useState<PanelId \| null>\(null\);/, "the panels are not one-at-a-time, or one is open by default");
  assert.match(STUDIO, /\{panel === "sources" && \(/);
  assert.match(STUDIO, /\{panel === "create" && !asking && \(/);
  // 🔴 THE PANEL LEAVES RATHER THAN VANISHING (owner 2026-09-06: "the create and sources panel need
  // opening and closing animation"). The id is held while the out-animation runs, then dropped.
  assert.match(STUDIO, /const panel = shown \?\? closing;/, "the panel unmounts on the press, so it cannot animate out");
  assert.match(STUDIO, /leaving \? "board-panel-out" : "board-panel-in"/);
  assert.match(BOARD_CSS, /@keyframes board-panel-in/);
  assert.match(BOARD_CSS, /@keyframes board-panel-out/);
  // 🔴 CENTRED ON ITS BUTTON since 2026-09-06 (owner: "the create and source panels dont open
  // centered next to the buttons"). The toolbar is centred down the right edge; a panel pinned to
  // the top put the two halves of one control 300px apart.
  assert.match(STUDIO, /absolute right-\[16px\] top-\[72px\] z-40 flex max-h-\[calc\(100%-134px\)\]/, "the panel does not hang under the button that opened it");
  assert.match(STUDIO, /absolute right-\[16px\] top-\[16px\] z-40 flex items-center/, "the toolbar left the top-right corner");
  // 🔴 ONE PILL: back, forward, then the two panels (owner 2026-09-07).
  assert.match(STUDIO, /<UndoRedoButtons \/>/, "undo and redo are not in the toolbar");
  assert.ok(!/function UndoRedoControls/.test(SURFACE), "undo and redo are still drawn separately by the surface");
  assert.match(STUDIO, /aria-label=\{`Close \$\{label\.toLowerCase\(\)\}`\}/, "the panel has no X");
  assert.match(STUDIO, /event\.key !== "Escape"/, "Escape does not close the panel");
  assert.match(STUDIO, /localStorage\.setItem\(PANEL_KEY, next \?\? ""\)/, "the open panel is not remembered");
  assert.ok(!/PanelLeftOpen|PanelLeftClose|Show sources and create|Hide sources and create|aria-expanded/.test(STUDIO), "an older fold is still there");
  // A document opening on the same edge closes the panel; a button still opens one over the
  // narrowed board; that resets when the last tab closes.
  assert.match(STUDIO, /const docked = dock\.items\.length > 0;/);
  assert.match(STUDIO, /const shown = docked \? peek : stored;/);
  assert.match(STUDIO, /if \(!docked\) setPeek\(null\);/);
  // The composer never moves for it, and the provider no longer holds the panel's state.
  assert.match(COMPOSER, /pointer-events-none absolute inset-x-0 bottom-\[24px\] z-40 flex justify-center px-\[16px\]/, "the composer moves for the panel");
  assert.ok(!/studioOpen|STUDIO_WIDTH/.test(COMPOSER), "the composer still reads the panel's state");
  assert.ok(!/studioOpen|STUDIO_OPEN_KEY/.test(PROVIDER), "the provider still holds the panel's open state");
  // Fit view and a new card keep clear of an open panel: the free width ends where the panel starts.
  assert.match(STUDIO, /data-board-studio="open"/, "measureBoardArea cannot find the open panel");
  assert.match(CHROME, /rect\.right - studio\.getBoundingClientRect\(\)\.left \+ 16/, "the camera does not keep clear of the panel");
  assert.ok(!/left: number;/.test(CHROME.slice(CHROME.indexOf("export function measureBoardArea"))), "the free area still starts to the right of a left panel");
});

test("🔴🔴 a tile asks before it makes, NotebookLM's questions, inside the panel and never over the board", () => {
  // Owner, 2026-09-06, with his own notebook open: "notebookllm asks user questions before
  // generating flashcards or other artifacts". This REVERSES the older "one press and no dialog"
  // rule for this panel and keeps "no popups in canvas": the form replaces the tiles in the panel
  // that is already open.
  assert.match(STUDIO, /const \[asking, setAsking\] = useState<StudioTile \| null>\(null\);/, "a tile no longer opens its questions");
  assert.match(STUDIO, /onClick=\{\(\) => setAsking\(tile\)\}/, "a tile makes at once again, with nothing asked");
  assert.match(STUDIO, /\{panel === "create" && asking && \(/, "the form is not drawn in the panel");
  assert.match(STUDIO, /makeDeliverable\(asking\.kind, entered \? \{ cardId: entered\.id, topic: instruction \} : \{ cardId: null, sourceIds: selectedSourceIds, topic: instruction \}\)/, "the answers do not reach the maker, or the scope was lost");
  assert.match(STUDIO, /data-board-form-back=""/, "there is no way back to the tiles");
  assert.match(STUDIO, /What should it cover\?/, "the form does not ask what to cover");
  // The dials are words, because one sentence is all a maker takes.
  assert.equal(studioInstruction(STUDIO_TILES[0]!, { topic: "chapter 3", length: "fewer", level: "hard" }), "chapter 3 Keep it to about ten cards. Make it demanding.");
  assert.equal(studioInstruction(STUDIO_TILES[0]!, { length: "standard", level: "medium" }), "", "the defaults still say something to the maker");
  assert.equal(studioInstruction(STUDIO_TILES[2]!, { topic: "x", level: "hard" }), "x", "a study guide is asked how hard it should be");
  // 🔴 EVERY EXAMPLE IS FIELD-AGNOSTIC (CLAUDE.md). A placeholder is the most-read copy in a form.
  const FIELDS = /\b(?:patient|drug|dose|clinical|diagnos|nursing|pharmac|anatom|symptom)/i;
  for (const tile of STUDIO_TILES) assert.ok(!FIELDS.test(tile.example), `${tile.kind}'s example is scoped to one field: ${tile.example}`);
});

test("the panel's two questions of a board", () => {
  const source = (partial: Partial<BoardSource>): BoardSource => ({ id: "s", type: "pdf", name: "x.pdf", content: "", status: "ready", previewUrls: [], position: { x: 0, y: 0 }, width: 640, ...partial });
  const card = (content: string): BoardCard => ({
    id: "c",
    kind: "conversation",
    parentId: null,
    sourceIds: [],
    contextExcerpt: null,
    inheritedContext: [],
    title: "t",
    highlights: [],
    savedImages: [],
    notes: [],
    status: "idle",
    position: { x: 0, y: 0 },
    width: 720,
    messages: [{ id: "a", role: "assistant", content }],
  });
  const ready = source({ id: "a" });
  const reading = source({ id: "b", status: "processing" });
  assert.deepEqual(tickedReadySources([ready, reading], ["a", "b"]).map((s) => s.id), ["a"], "a source still reading counts as ticked material");
  assert.equal(boardHasMaterial([], [reading]), false);
  assert.equal(boardHasMaterial([], [ready]), true);
  assert.equal(boardHasMaterial([card("")], []), false, "an empty answer is material");
  assert.equal(boardHasMaterial([card("Glargine has no peak.")], []), true);
});

test("🔴🔴 every made thing opens in the panel, tests included, and none of them is a card on the canvas", () => {
  // Owner, 2026-09-07: *"why are tests supposed to be on Canvas? They're supposed to be in the
  // sidebar, like anything any deliverable is supposed to show up in the sidebar ... Canvas should
  // only have chats and notes by the user."* This reverses his own 2026-09-04 ruling that a test is
  // answered in its own card node, and it is the third and last step of the same move: deliverables
  // were cards, then were hidden behind their chat and fanned out on a press, and now they are not
  // board objects at all.
  assert.match(STUDIO, /if \(output\.kind === "check"\) \{\s*dock\.openCheck\(/, "a test opens somewhere other than the panel");
  assert.ok(!/fitView|setCenter/.test(STUDIO.slice(STUDIO.indexOf("const show = (output"), STUDIO.indexOf("return (\n    <>"))), "opening a made thing flies the camera at it again — there is no card on the board to fly to");
  // Nothing but a chat and the learner's own note is drawn.
  assert.ok(!/type: "deliverable"/.test(SURFACE), "made things are back on the canvas");
  assert.ok(!/outputEdges/.test(SURFACE), "a line is drawn to a node React Flow cannot find");
  // 🔴 ONE PANEL PER TEST, MOUNTED WHETHER OR NOT IT IS THE OPEN TAB. StudyPanel hides rather than
  // unmounts, and that is the only reason closing a test half-answered is safe: the answers so far
  // are component state. Gating the mount on `open` would throw them away, silently.
  assert.match(PAGE, /checks\.map\(\(output\) => \(\s*<BoardCheckPanel key=\{output\.id\} output=\{output\} \/>/, "the board no longer mounts a panel per test");
  assert.match(PAGE, /const key = `\$\{CHECK_KEY\}:\$\{output\.id\}`;/, "two tests on one board would share a tab");
  // 🔴🔴 FLASHCARDS OPEN THEIR DECK, AND THE PANEL WAS EMPTY UNTIL THEY DID. Owner, 2026-09-07:
  // *"the flashcards came back empty"*. The output carries a `deckId` and no body at all — the cards
  // are rows in `study_cards` — so the reading panel drew a reader over nothing. The learn lane has
  // always routed this to the deck; `openOutput` here is the fallback for kinds that carry material.
  assert.match(STUDIO, /dock\.openDeck\(deckId,/, "flashcards open the document reader again, which has nothing to read");
  assert.match(PAGE, /dock\.active\?\.kind !== "deck"/, "the board mounts no deck panel, so opening one shows nothing");
  assert.ok(!/simple=|flipAnimation/.test(PAGE), "the board overrides the deck's own review style — the Anki card is DeckReview's default");
  // And the stack under a chat opens the panel rather than putting cards back on the board.
  const CARD = read("./conversation-card.tsx");
  assert.match(CARD, /openMade\(data\.cardId\)/, "the stack stopped opening the panel");
  assert.ok(!/toggleFan|fannedCardId/.test(CARD), "the fan is back, and there is nothing on the board to fan");
});

test("🔴🔴 the two dot lattices have their own pattern id, or one of them paints the whole board", () => {
  // Owner, 2026-09-07, twice: *"the dots are too bright in dark mode"*, then *"dots still too
  // bright"*. The cause was not a colour. React Flow derives its `<pattern>` id from the flow, so
  // two `<Background>`s came out as `pattern-1` and `pattern-1`, and `url(#pattern-1)` resolves to
  // whichever is first in the document — the CURSOR lattice. Every dot on the board, in both
  // themes, was painted at `--board-dot-lit`; `--board-dot` had never once been drawn.
  //
  // Proved rather than reasoned: with the resting colour set to red and the cursor colour to blue,
  // the empty board away from the pointer came back BLUE. After naming them, red.
  assert.match(SURFACE, /id="board-rest"/, "the resting lattice has no id of its own");
  assert.match(SURFACE, /id="board-lit"/, "the cursor lattice has no id of its own");
  // 🔴 AND THE SAME SIZE. The cursor lattice was `size={3}` against the board's `size={2}`, so a dot
  // under the pointer grew by half as well as brightening. Owner: *"light up a little bit more"*.
  const sizes = [...SURFACE.matchAll(/<Background[^>]*?size=\{(\d)\}/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(sizes)], ["3"], `the two lattices draw different sized dots: ${sizes.join(", ")}`);
  // 🔴 THE CURSOR VALUE IS AN INCREMENT PAINTED OVER THE FIELD, so it is LOWER than the field in
  // both themes. Someone will read that as a bug and "fix" it back into a spotlight.
  const alphas = [...BOARD_CSS.matchAll(/--board-dot(-lit)?: color-mix\(in srgb, var\(--ui-base\) (\d+)%/g)]
    .map((m) => ({ lit: Boolean(m[1]), value: Number(m[2]) }));
  const field = alphas.filter((a) => !a.lit).map((a) => a.value);
  const cursor = alphas.filter((a) => a.lit).map((a) => a.value);
  assert.deepEqual(field, [34, 28, 28], "the resting dot changed; re-measure both themes before trusting it");
  assert.deepEqual(cursor, [22, 16, 16], "the cursor increment changed; re-measure, and remember it composites OVER the field");
  for (const [i, value] of field.entries()) assert.ok((cursor[i] ?? 99) < value, "the cursor value went above the field value, which is the spotlight again");
});
