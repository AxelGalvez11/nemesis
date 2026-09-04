// 🔴🔴 THE ANSWER STAYS IN THE DOCUMENT. Owner, 2026-09-04: *"it would be useful to have annotations
// with chat responses within the document so users dont bloat the main chat"*.
//
// Before this, a pinned note had exactly one destination: "Send to Nemesis" put it in the canvas
// conversation. A morning of small questions about one lecture arrived as a morning of turns, each
// out of context because the spot it was about was in another panel. A comment is a THREAD now.
//
// These are source-level guards. What they defend is not the wiring but the RULES the wiring is
// there to keep: a reply is never a second pin, the learner's follow-up is written down before the
// model is asked, and the model is never handed its own answers back as if the learner had said them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  commentsContextBlock,
  repliesTo,
  rootsOf,
  type DocumentComment,
} from "@/lib/workspace/document-comments";
import { THINKING_STANCE } from "@nemesis/shared";

import { commentAnswerMessages, COMMENT_ANSWER_SYSTEM } from "@/lib/reader/comment-answer";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const READER = read("./document-reader.tsx");
const LAYER = read("./comment-layer.tsx");
const SIDEBAR = read("./reader-sidebar.tsx");
const ANSWER = readFileSync(new URL("../../../lib/reader/comment-answer.ts", import.meta.url), "utf8");
const COMMENTS = readFileSync(new URL("../../../lib/workspace/document-comments.ts", import.meta.url), "utf8");
const MIGRATION = readFileSync(
  new URL("../../../../../supabase/migrations/20260904T10_comment_replies.sql", import.meta.url),
  "utf8",
);

const note = (over: Partial<DocumentComment>): DocumentComment => ({
  anchor: {},
  author: "learner",
  body: "why",
  createdAt: "now",
  docId: "d",
  docKind: "source",
  id: "root",
  parentId: null,
  resolvedAt: null,
  unit: 4,
  ...over,
});

test("🔴 a reply is part of a thread, never a second mark on the page", () => {
  const rows = [
    note({ id: "a" }),
    note({ author: "nemesis", body: "because x", id: "a1", parentId: "a" }),
    note({ body: "and this?", id: "a2", parentId: "a" }),
    note({ id: "b" }),
  ];
  assert.deepEqual(rootsOf(rows).map((row) => row.id), ["a", "b"], "an answer was counted as a pin");
  assert.deepEqual(repliesTo(rows, "a").map((row) => row.id), ["a1", "a2"], "the thread lost a turn");

  // And the three surfaces that draw marks all go through the filter.
  assert.match(READER, /rootsOf\(comments\)\.filter\(\(comment\) => comment\.resolvedAt === null\)/, "the pane's count includes replies");
  assert.match(SIDEBAR, /const notes = rootsOf\(comments \?\? \[\]\);/, "the list would draw a row per reply");
  assert.match(LAYER, /const roots = rootsOf\(comments\);/, "the margin would pin a mark per reply");
  assert.match(COMMENTS, /\.is\("parent_id", null\)/, "the open-comments query counts replies");
});

test("🔴 the model is never handed its own answers back as the learner's words", () => {
  const block = commentsContextBlock([
    {
      comments: [note({ id: "a" }), note({ author: "nemesis", body: "because x", id: "a1", parentId: "a" })],
      title: "Week 4",
      unitLabel: "page",
    },
  ]);
  assert.match(block, /On "Week 4" \(page 4\): "why"/);
  assert.ok(!block.includes("because x"), "Nemesis's own reply reached the packet as a learner question");
});

test("🔴 the answer is grounded in the spot's own text, and says so when it has none", () => {
  const withText = commentAnswerMessages({
    anchor: { quote: "persistent airflow obstruction" },
    body: "what does this mean?",
    fileName: "Lecture 3.pdf",
    spotText: "The definition given here is a heterogeneous condition.",
    unit: 4,
    unitLabel: "page",
  });
  const asked = withText.map((message) => message.content).join("\n");
  assert.match(asked, /They highlighted "persistent airflow obstruction" on page 4\./);
  assert.match(asked, /The text of that page reads:/);
  assert.match(asked, /heterogeneous condition/);

  const blind = commentAnswerMessages({
    anchor: { box: { height: 0.1, width: 0.2, x: 0, y: 0 } },
    body: "what is this?",
    fileName: "Lecture 3.pdf",
    spotText: null,
    unit: 9,
    unitLabel: "slide",
  });
  const blindAsked = blind.map((message) => message.content).join("\n");
  assert.match(blindAsked, /No text could be read for that slide/, "the model is not told it is blind");
  assert.match(COMMENT_ANSWER_SYSTEM, /Never invent what the page says/);
});

test("🔴 an earlier thread rides along, in the right voices", () => {
  const messages = commentAnswerMessages({
    anchor: {},
    body: "why?",
    fileName: "f.pdf",
    thread: [
      { author: "nemesis", body: "because x" },
      { author: "learner", body: "and y?" },
    ],
    unit: 1,
    unitLabel: "page",
  });
  assert.equal(messages[0]?.role, "system");
  assert.equal(messages[messages.length - 2]?.role, "assistant", "Nemesis's own turn came back as the learner's");
  assert.equal(messages[messages.length - 1]?.role, "user");
});

test("🔴 the follow-up is written down before the model is asked", () => {
  // The learner's own words must survive an answer that never arrives, or the thread reads as
  // though they never asked.
  const handler = READER.split("const askAboutComment")[1]?.slice(0, 1800) ?? "";
  assert.ok(handler.length > 0, "the in-document ask handler is gone");
  const mineAt = handler.indexOf('author: "learner"');
  const answerAt = handler.indexOf("await answerComment(");
  assert.ok(mineAt > -1 && answerAt > -1, "the handler no longer writes the follow-up or no longer asks");
  assert.ok(mineAt < answerAt, "the model is asked before the learner's follow-up is saved");
  assert.match(handler, /author: "nemesis"/, "the answer is not stored as Nemesis's own");
  assert.match(handler, /spotText: unitTexts\.find/, "the answer stopped being grounded in the page");
});

test("🔴 the answer is short, field-agnostic and free of em dashes", () => {
  assert.match(COMMENT_ANSWER_SYSTEM, /under 120 words/, "the margin answer lost its length rule");
  assert.ok(!COMMENT_ANSWER_SYSTEM.includes("—"), "an em dash reached a prompt (owner, 2026-08-25)");
  assert.ok(!/\bem dash\b[^.]*\bmay\b/i.test(COMMENT_ANSWER_SYSTEM), "the em dash ban was softened");

  // 🔴 THE FIELD CHECK RUNS ON THIS LANE'S OWN RULES, NOT ON THE SHARED STANCE. `THINKING_STANCE`
  // is embedded here and says "Be warm, patient and plain-spoken" — the adjective, not the noun.
  // Scanning the whole string flagged it, which is a false positive that would have taught the
  // next person to weaken the check rather than trust it. The stance has its own tests in
  // packages/shared; what this owns is the part written for the margin.
  const ours = COMMENT_ANSWER_SYSTEM.replace(THINKING_STANCE, "");
  assert.ok(ours.length > 200 && !ours.includes("HOW TO HOLD A POSITION"), "the stance is no longer separable from this lane's rules");
  for (const word of ["drug", "patient", "clinical", "medicine", "law", "engineering", "nursing"]) {
    assert.ok(!new RegExp(`\\b${word}`, "i").test(ours), `the prompt scoped itself to ${word}`);
  }
});

test("🔴 the margin carries the same stance as every other surface that speaks", () => {
  // A learner can push back in the thread's own field, so an answer that folds here beside a
  // canvas that holds its ground is the drift `every-surface-has-a-stance.test.ts` exists to stop.
  assert.ok(COMMENT_ANSWER_SYSTEM.includes(THINKING_STANCE), "the in-document answer lost the stance");
});

test("🔴 no tools, no retrieval, no offers of more work", () => {
  assert.ok(!/tools:/.test(ANSWER), "the margin lane grew tools of its own");
  assert.match(COMMENT_ANSWER_SYSTEM, /Do not offer to make flashcards/, "the margin answer may tout the canvas again");
  assert.match(ANSWER, /route: "conversation"/);
});

test("🔴🔴 deleting a note takes its answers with it, and nothing else cascades", () => {
  assert.match(MIGRATION, /parent_id uuid references public\.document_comments\(id\) on delete cascade/);
  assert.match(MIGRATION, /author in \('learner', 'nemesis'\)/);
  // The open index must not count replies, or the pane's "N" climbs on every follow-up.
  assert.match(MIGRATION, /where resolved_at is null and parent_id is null/);
});

test("🔴 a row written before the column existed reads as the learner's", () => {
  assert.match(COMMENTS, /author: row\.author === "nemesis" \? "nemesis" : "learner"/, "a null author could speak as Nemesis");
});
