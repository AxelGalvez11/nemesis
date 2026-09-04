// The comments a learner pins on a document are LISTABLE from the pane beside the conversation.
//
// Owner, 2026-09-03/04, describing the workflow: view documents in the side panel with tabs and
// *"drop annotation notes on it"*. The annotate layer had shipped (#917, #1015, #1115) and a note
// kept with "Add comment" was a pin on a page — and nothing else. The Comments tab lived inside the
// contents rail, `dense` closed that rail and hid its toggle (deliberately: the outline was cut from
// the pane, owner 2026-09-01), so from the pane there was no way to see what you had pinned except
// scrolling the document for the pins. This pins the door that opens the list.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const READER = readFileSync(path.join(HERE, "document-reader.tsx"), "utf8");
const BAR = readFileSync(path.join(HERE, "reader-top-bar.tsx"), "utf8");
const SIDEBAR = readFileSync(path.join(HERE, "reader-sidebar.tsx"), "utf8");

test("🔴🔴 the pane's reader opens its rail on the comments, and only when there are some", () => {
  // Gated on DATA: nothing pinned, no control. The pane keeps shedding furniture (#1033, #1115),
  // and a button for an empty list is furniture.
  assert.match(READER, /const commentsListable = dense && canComment && comments\.length > 0;/);
  assert.match(READER, /onToggleCommentList=\{commentsListable \? \(\) => setRailOpen\(\(open\) => !open\) : undefined\}/);
  // The rail mounts in the pane on the comments alone, never on the outline.
  assert.match(READER, /\{railOpen && \(dense \? commentsListable : hasContents\) && \(/, "the pane's rail still needs an outline to exist");
  assert.match(READER, /commentsOnly=\{dense\}/, "the pane's rail is not comments-only");
  assert.match(READER, /tab=\{dense \? "comments" : /, "the pane's rail can land on the outline tab");
  // With the last comment gone the rail would be an empty column; it closes.
  assert.match(READER, /if \(dense && left\.length === 0\) setRailOpen\(false\);/);
});

test("🔴 the count the control wears is OPEN comments, the same number the rail's tab carries", () => {
  // 🔴 RE-PINNED 2026-09-04: the count is over ROOTS now. `comments` grew Nemesis's own replies
  // when answers moved into the document, and the plain filter counted each of those as a mark —
  // one question followed up twice would have worn a "3".
  assert.match(READER, /const openCommentCount = rootsOf\(comments\)\.filter\(\(comment\) => comment\.resolvedAt === null\)\.length;/);
  assert.match(READER, /commentCount=\{openCommentCount\}/);
  assert.match(BAR, /\{onToggleCommentList && \(/);
  assert.match(BAR, /aria-pressed=\{commentListOpen\}/, "the control does not say whether the list is open");
  assert.match(BAR, /data-testid="reader-comment-list-toggle"/);
  assert.match(BAR, /<Codicon className="shrink-0" name="comment-discussion" size="0\.85rem" \/>\n\s+\{commentCount\}/, "the count is not on the control");
});

test("🔴 comments-only means no Outline and no Pages tab, which the owner cut from the pane", () => {
  assert.match(SIDEBAR, /commentsOnly\?: boolean;/);
  assert.match(SIDEBAR, /const showing: SidebarTab = commentsOnly \? "comments" : tab;/);
  assert.match(SIDEBAR, /\{commentsOnly \? \(/, "the tab strip is drawn in comments-only mode");
  assert.match(SIDEBAR, /data-testid="reader-comments-heading"/, "the rail no longer says what it is");
  assert.ok(!/tab === "comments" && comments \?/.test(SIDEBAR), "the body reads the host's tab instead of what is showing");
});

test("🔴 the standalone reader is untouched: its rail toggle, tabs and default stay as they were", () => {
  assert.match(BAR, /\{onToggleRail && !dense && \(/, "the contents rail toggle changed");
  assert.match(READER, /const \[railOpen, setRailOpen\] = useState\(!isDialog && !dense\);/, "the rail's default changed");
  assert.match(READER, /onToggleRail=\{hasContents \? \(\) => setRailOpen\(\(open\) => !open\) : undefined\}/);
});
