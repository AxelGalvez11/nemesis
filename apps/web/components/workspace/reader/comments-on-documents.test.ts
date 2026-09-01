import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// The ANNOTATE layer's contract — owner, 2026-08-28: *"This is supposed to be more of an annotate
// with a comment type of edit"*, with claude.ai/design as the named, measured reference
// (docs/claude-design-reference.md). What these guards hold is the SHAPE of that reference:
// a mode with its gestures said out loud, a note with two destinations, and nothing saved until
// a button is pressed.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const LAYER = read("./comment-layer.tsx");
const READER = read("./document-reader.tsx");
const SIDEBAR = read("./reader-sidebar.tsx");
const COMMENTS = readFileSync(new URL("../../../lib/workspace/document-comments.ts", import.meta.url), "utf8");
const PANEL = readFileSync(new URL("../learn/source-preview.tsx", import.meta.url), "utf8");
const CHAT = readFileSync(new URL("../learn/canvas-chat.ts", import.meta.url), "utf8");
const ROUTER = readFileSync(new URL("../../../lib/learn/turn-router.ts", import.meta.url), "utf8");
const MIGRATION = readFileSync(new URL("../../../../../supabase/migrations/20260828T10_document_comments.sql", import.meta.url), "utf8");

test("🔴🔴 the note box has two destinations, and both start from the same anchor", () => {
  // "Add comment" keeps it; "Send to Nemesis" keeps it AND hands it over. One is a comment
  // system, the other is a chat box wearing a pin; the reference's whole design is having both.
  assert.match(LAYER, /data-testid="reader-comment-keep"/, "the keep button is gone");
  assert.match(LAYER, /data-testid="reader-comment-send"/, "the send button is gone");
  assert.match(READER, /void keepComment\(draft\);/, "sending no longer keeps the comment on the document");
});

test("🔴🔴 nothing is saved until a button is pressed", () => {
  // Cancel and Escape leave the document exactly as it was; leaving the mode abandons the draft it
  // created. The draft lives in state and reaches the store ONLY through the two buttons' handlers.
  //
  // 🔴 REPOINTED 2026-09-01, WHEN A HIGHLIGHT LEARNED TO OPEN THE SAME BOX. This used to assert the
  // literal `if (!commenting) setDraft(null)`, which was right while the mode was the only way to
  // start a note. A selection draft is opened with the mode OFF, so that line would have closed the
  // box in the same tick it appeared. The claim is unchanged — an abandoned draft is never saved —
  // and it now has to survive being true for two different origins.
  assert.match(
    LAYER,
    /if \(!commenting\) setDraft\(\(current\) => \(current\?\.fromSelection \? current : null\)\);/,
    "leaving the mode keeps a half-written draft alive",
  );
  assert.match(LAYER, /else setDraft\(null\);/, "turning the mode ON no longer abandons a selection draft");
  assert.match(LAYER, /if \(event\.key === "Escape"\) onCancel\(\);/, "Escape no longer cancels the note");
  const noteBox = LAYER.slice(LAYER.indexOf("function CommentNote"));
  assert.match(noteBox, /disabled=\{!ready\}/, "an empty note can be submitted");
});

test("🔴🔴 a highlight opens the comment box, and it is the ONLY thing a highlight opens", () => {
  // Owner, 2026-09-01: *"I dont want 'what is this showing' or 'add to notes' — only comment like
  // 'send to nemesis' or 'add comment'"*. Highlighting used to open a five-button bar where every
  // button fired immediately, so a thought a learner was not ready to act on had nowhere to sit.
  //
  // 🔴 THE DELETED COMPONENT IS ASSERTED GONE, NOT MERELY UNUSED. An unmounted `SelectionActions`
  // sitting in the tree is the next person's obvious thing to re-mount; this repo has shipped a
  // dead control more than once. The whole-document versions of those actions stay in the top bar.
  assert.doesNotMatch(READER, /SelectionActions/, "the five-button selection bar is back");
  assert.ok(!existsSync(new URL("./selection-actions.tsx", import.meta.url)), "the five-button bar still exists as a file");
  assert.match(READER, /const commentOnSelection = useCallback/, "a highlight no longer offers a comment");
  assert.match(LAYER, /request\?: CommentDraftSpot \| null;/, "the layer cannot be handed a draft from outside the mode");

  // 🔴 ON RELEASE, NOT ON EVERY SELECTION CHANGE. `selectionchange` fires on every pixel of a drag,
  // so opening from it flashes a composer under the moving cursor and steals focus mid-gesture.
  assert.match(READER, /document\.addEventListener\("mouseup", onRelease\)/, "the box opens mid-drag");
});

test("🔴 a highlight carries its WORDS, not just where the cursor was", () => {
  // "I pointed at a spot on page 14" tells the model where a finger was and nothing about what is
  // under it — the model cannot see the page. Without the quote, a comment on a highlighted
  // sentence produces an answer about the whole document.
  assert.match(READER, /anchor: \{\s*quote: text,/, "the highlighted text is dropped on the way to the anchor");

  // 🔴 AND IT IS READ FROM THE LIVE SELECTION, NOT FROM STATE. The browser fires `selectionchange`
  // then `mouseup` back to back at the end of a drag, and React need not have committed in
  // between — a handler closing over `selection` state ran with the previous render's closure, saw
  // null, and silently did nothing. Caught on production; it would have been intermittent in use.
  assert.match(READER, /const active = typeof window === "undefined" \? null : window\.getSelection\(\);/,
    "the comment box is built from React state again, which races the release");
  assert.match(COMMENTS, /quote\?: string;/, "the anchor cannot carry a quote");
  assert.match(COMMENTS, /I highlighted "\$\{quoted/, "the prompt does not quote what was highlighted");
});

test("🔴 the gestures are said out loud, because neither is discoverable", () => {
  assert.match(READER, /data-testid="reader-comment-hint"/, "the hint pill is gone");
  assert.match(READER, /Click to comment, drag to draw a box/, "the pill stopped naming both gestures");
  // And on a flowing document — where boxes are not drawable because the page reflows — the pill
  // must not advertise a drag that does nothing.
  assert.match(READER, /Click a paragraph to comment/, "the flowing-document pill promises a box it cannot draw");
});

test("🔴 resolving is a state, not a deletion, everywhere it appears", () => {
  assert.match(SIDEBAR, /resolved \? "Reopen" : "Resolve"/, "a resolved comment cannot be reopened from the list");
  assert.match(MIGRATION, /resolved_at timestamptz/, "the schema lost the resolved state");
  assert.ok(!/on delete cascade[\s\S]*doc_id/.test(MIGRATION.split("doc_origin")[1]?.slice(0, 400) ?? ""), "doc_id grew a cascade — comments must survive bookkeeping changes");
});

test("🔴🔴 the table is owner-only under RLS", () => {
  assert.match(MIGRATION, /enable row level security/, "RLS is off");
  assert.match(MIGRATION, /user_id = auth\.uid\(\)/, "the policy no longer scopes to the owner");
  assert.match(MIGRATION, /with check \(user_id = auth\.uid\(\)\)/, "writes are not checked against the owner");
});

test("🔴🔴 comments anchor to the DURABLE id, never the canvas-local one", () => {
  // "s1" means nothing outside its canvas — two canvases on the same lecture both call it s1
  // (canvas-model.ts says so in as many words). A comment keyed to it would vanish when the
  // panel opens the same file from anywhere else.
  assert.match(PANEL, /active\.librarySourceId\s*\?\s*\{ preview/, "the panel keys comments to something");
  assert.ok(!/ref: \{ id: active\.id/.test(PANEL), "comments are keyed to the canvas-local id again");
});

test("🔴🔴 open comments ride the turn packet, in the learner's own words", () => {
  // "Comment on four slides, then ask 'sort these out'" only works if the model can see what was
  // said WHERE. The block is built per turn, and a resolved comment never appears in it.
  assert.match(CHAT, /pinnedCommentsBlock\(uid, canvas\)/, "the packet no longer carries the comments");
  assert.match(ROUTER, /pinnedComments: string;/, "the context lost its comments field");
  assert.match(ROUTER, /context\.pinnedComments\.trim\(\)/, "the packet line no longer renders");
  // Durable sources only — the packet must never invent comments for material that was never filed.
  assert.match(CHAT, /filter\(\(source\) => source\.librarySourceId\)/, "unfiled material is being asked for comments");
});
