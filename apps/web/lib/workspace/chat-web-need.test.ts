import assert from "node:assert/strict";
import { test } from "node:test";

import { readWebNeedReply, shouldAskModelAboutWeb, WEB_NEED_PROMPT } from "./chat-web-need";
import { shouldSearchWeb } from "./chat-web-search";

const base = { ask: "what changed in the rules this year", hasAttachments: false, regexSaidYes: false, savesToWorkspace: false };

test("nothing is asked when the keyword fast path already said yes", () => {
  assert.equal(shouldAskModelAboutWeb({ ...base, regexSaidYes: true }), false);
});

test("a turn carrying files never buys a search on the file's behalf", () => {
  // A syllabus citing a recent year is not a student asking for today's news.
  assert.equal(shouldAskModelAboutWeb({ ...base, hasAttachments: true }), false);
});

test("a save request keeps the decision its route already made", () => {
  assert.equal(shouldAskModelAboutWeb({ ...base, savesToWorkspace: true }), false);
});

test("short acknowledgements cost nothing, in any language", () => {
  for (const ask of ["ok", "thanks", "gracias", "ありがとう", "  hi  "]) {
    assert.equal(shouldAskModelAboutWeb({ ...base, ask }), false, ask);
  }
});

test("a real question the keyword list missed does get asked about", () => {
  // The point of the whole module: none of these fire shouldSearchWeb, and all
  // of them can only be answered from something that changes.
  const missed = [
    "has the committee signed off on that rule yet",
    "¿cuál es el precio de la matrícula ahora?",
    "did the board approve those changes to the requirements",
  ];
  for (const ask of missed) {
    assert.equal(shouldSearchWeb(ask), false, `regex should miss: ${ask}`);
    assert.equal(shouldAskModelAboutWeb({ ...base, ask }), true, ask);
  }
});

test("only a reply that starts with yes buys a search", () => {
  assert.equal(readWebNeedReply("YES"), true);
  assert.equal(readWebNeedReply(" yes\n"), true);
  assert.equal(readWebNeedReply("**YES**"), true);
  assert.equal(readWebNeedReply("NO"), false);
  assert.equal(readWebNeedReply(""), false);
  assert.equal(readWebNeedReply(null), false);
  // A model that ignores the format must not accidentally spend a search.
  assert.equal(readWebNeedReply("I think the answer is yes"), false);
  assert.equal(readWebNeedReply("Yesterday's figures are settled knowledge"), false);
});

test("the pre-flight prompt names no subject and asks for one word", () => {
  assert.match(WEB_NEED_PROMPT, /exactly one word/i);
  // Field-agnostic by construction — it must not carry a discipline's
  // vocabulary, which would make it read differently for a law student and an
  // engineering student.
  assert.doesNotMatch(WEB_NEED_PROMPT, /\b(drug|medicine|clinical|pharmac|patient)\b/i);
});
