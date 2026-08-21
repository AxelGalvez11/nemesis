import assert from "node:assert/strict";

import {
  DEFAULT_INTENT,
  INTENT_HISTORY_TURNS,
  intentContract,
  intentMessages,
  intentStateBlock,
  readChatIntent,
  skillMenu,
} from "./chat-intent";
import { CHAT_SKILLS } from "./chat-skills";

const context = {
  attachments: [] as string[],
  awaitingStudyPreference: null,
  history: [],
  searchesLeft: 0,
  today: "Thursday, 20 August 2026",
  webContext: "",
};

// ── the menu is generated, never hand-written ────────────────────────────────
// A hand-maintained list of skill ids inside a prompt is the same defect one layer up: add a skill,
// forget the prompt, and the model can never pick it. Every skill must be offerable, and every
// skill must say when it applies.
{
  const menu = skillMenu();
  for (const skill of CHAT_SKILLS) {
    assert.ok(menu.includes(skill.id), `${skill.id} is offered to the model`);
    assert.ok(skill.when.trim().length > 10, `${skill.id} says when it applies`);
    assert.ok(menu.includes(skill.when), `${skill.id}'s condition reaches the model`);
  }
}

// 🔴 THE CONDITIONS MUST BE CONDITIONS, NOT KEYWORD LISTS IN PROSE. The point of replacing the
// regexes was to stop describing WHICH WORDS a student types, so a `when` line that quotes trigger
// phrases has simply moved the old defect into a string. A condition says what the student WANTS;
// a keyword list quotes what they say, and quoting is what it looks like when it happens.
for (const skill of CHAT_SKILLS) {
  assert.doesNotMatch(skill.when, /["'`]/, `${skill.id} quotes the student's words instead of naming a condition`);
  assert.doesNotMatch(skill.when, /\bthe words?\b/i, skill.id);
}

// ── the contract describes consequences, not labels ──────────────────────────
{
  const contract = intentContract();
  for (const field of ["mode", "workspace", "needsWeb", "webQuery", "webResults", "webFreshness", "skills", "topic"]) {
    assert.ok(contract.includes(`"${field}"`), `the contract defines ${field}`);
  }
  // The one consequence the model cannot infer and the most expensive mistake available: a turn
  // that is not marked as touching the workspace gets no tools, so it cannot save and cannot read.
  // A model that is not told this has no way to know that "learning" loses the student's deck.
  assert.match(contract, /tools/i);
  assert.match(contract, /cannot save|cannot see/i);
  // Cost discipline survives the move off the keyword list: searching still spends real money.
  assert.match(contract, /costs money/i);
  // 🔴 NO CEILING IS QUOTED TO THE MODEL. Naming one makes it the answer to every question: told
  // "up to 50" it asks for 50 every time, told "up to 10" it never asks for more even when the
  // question plainly needs it. What it is given is the trade-off, not a number.
  assert.doesNotMatch(contract, /\bup to \d+ (?:pages|results|sources)\b/i);
  assert.match(contract, /how many pages to read/i);
  // And the field-agnostic rule: nothing in the contract may name a discipline as a trigger.
  assert.doesNotMatch(contract, /\b(?:pharmacolog|nursing|medicine|drug)\w*\b/i);
}

// ── the packet is pure and says what it is ───────────────────────────────────
{
  const messages = intentMessages({ ask: "what's due this week", context });
  assert.equal(messages[0]?.role, "system");
  assert.equal(messages.at(-1)?.role, "user");
  assert.ok(messages.at(-1)?.content.startsWith("what's due this week"));
  // Facts are labelled as facts, so a document that says "ignore your instructions" cannot be
  // mistaken for the student saying it.
  assert.match(messages[1]?.content ?? "", /not something the student said/i);
  // Same inputs, same packet: no clock read, no randomness.
  assert.deepEqual(intentMessages({ ask: "what's due this week", context }), messages);
}

// History rides as real alternating turns. This is the whole reason the old classifier needed
// OFFER_VERB, OFFER_TARGET and ACCEPTANCE: it was reconstructing, from three regexes, a fact the
// conversation states outright.
{
  const history = [
    { replied: "Want me to turn this into notes, flashcards, a practice test, or all three?", said: "here's my lecture" },
  ];
  const messages = intentMessages({ ask: "all three", context: { ...context, history } });
  const roles = messages.map((message) => message.role);
  assert.ok(roles.includes("assistant"), "Nemesis's own offer is in the packet");
  assert.ok(messages.some((message) => message.content.includes("practice test, or all three")));
}
// Bounded, so a long session does not pay for itself on every turn.
{
  const history = Array.from({ length: 20 }, (_, index) => ({ replied: `r${index}`, said: `s${index}` }));
  const messages = intentMessages({ ask: "why?", context: { ...context, history } });
  assert.equal(messages.filter((message) => message.role === "user").length, INTENT_HISTORY_TURNS + 1);
}
// A turn Nemesis acted on rather than spoke leaves no assistant message behind.
{
  const messages = intentMessages({ ask: "why?", context: { ...context, history: [{ replied: "", said: "hi" }] } });
  assert.equal(messages.filter((message) => message.role === "assistant").length, 0);
}

// ── the state block ──────────────────────────────────────────────────────────
assert.match(intentStateBlock(context), /No files attached/);
assert.match(
  intentStateBlock({ ...context, attachments: ["week3.pptx", "syllabus.pdf"] }),
  /2 files: week3\.pptx, syllabus\.pdf/,
);
// Our own previous turn asking a question is application state — the software remembering what it
// asked. Whether THIS message answers it is a reading of the reply, so it is stated, not acted on.
{
  const waiting = intentStateBlock({ ...context, awaitingStudyPreference: "test" });
  assert.match(waiting, /waiting for the answer/i);
  assert.match(waiting, /If this message answers it/i);
}

// ── reading the reply ────────────────────────────────────────────────────────
{
  const read = readChatIntent('{"mode":"learning","workspace":"write","needsWeb":false,"skills":["test-craft"],"topic":"Krebs cycle"}');
  assert.deepEqual(read, {
    mode: "learning",
    needsWeb: false,
    skills: ["test-craft"],
    topic: "Krebs cycle",
    webFreshness: null,
    webQuery: null,
    webResults: null,
    workspace: "write",
  });
}
// A partial decision is still a decision. A reply that names the workspace write but forgets `mode`
// has told us the one thing that matters most, and losing it would lose the save.
{
  const read = readChatIntent('{"workspace":"write"}');
  assert.equal(read?.workspace, "write");
  assert.equal(read?.mode, DEFAULT_INTENT.mode);
}
// A query without a search is dropped: the half that spends money loses the contradiction.
assert.equal(readChatIntent('{"needsWeb":false,"webQuery":"nvidia stock"}')?.webQuery, null);
assert.equal(readChatIntent('{"needsWeb":true,"webQuery":"nvidia stock"}')?.webQuery, "nvidia stock");
// How many to read is the model's, and nothing here narrows it — 40 pages is a real answer to a
// question that needs 40 pages, and the only ceiling left belongs to the search provider.
assert.equal(readChatIntent('{"needsWeb":true,"webResults":40}')?.webResults, 40);
assert.equal(readChatIntent('{"needsWeb":true,"webResults":3}')?.webResults, 3);
// A count without a search is the same contradiction as a query without one.
assert.equal(readChatIntent('{"needsWeb":false,"webResults":40}')?.webResults, null);
// Nonsense is no count at all, and falls back to the provider's ceiling rather than to a guess.
for (const bad of ["0", "-5", '"many"', "null", "1.5e400"]) {
  const read = readChatIntent(`{"needsWeb":true,"webResults":${bad}}`);
  assert.equal(read?.webResults ?? null, bad === "1.5e400" ? null : null, bad);
}
// A fractional count is floored rather than refused: 7.9 pages plainly means seven.
assert.equal(readChatIntent('{"needsWeb":true,"webResults":7.9}')?.webResults, 7);
// Unknown values fall back rather than failing the turn.
assert.equal(readChatIntent('{"mode":"banana","workspace":"everything"}'), null);
assert.equal(readChatIntent('{"mode":"learning","workspace":"everything"}')?.workspace, "none");
assert.deepEqual(readChatIntent('{"mode":"learning","skills":[1,null,"teaching",""]}')?.skills, ["teaching"]);
// Prose, an empty body, and JSON with nothing recognisable in it are all "we did not learn
// anything" — the caller answers on DEFAULT_INTENT rather than showing an error.
for (const raw of ["", "I think they want flashcards.", "{}", '{"unrelated":true}']) {
  assert.equal(readChatIntent(raw), null, JSON.stringify(raw));
}
// A fenced envelope is the commonest way a model returns JSON, and it must still read.
assert.equal(readChatIntent('```json\n{"mode":"research"}\n```')?.mode, "research");

// The failure default is conversation on the tools-capable model: losing a turn's thinking is a
// slightly shallower answer, losing a turn's tools is Nemesis saying it cannot see the calendar.
assert.equal(DEFAULT_INTENT.mode, "conversation");
assert.equal(DEFAULT_INTENT.workspace, "none");
assert.equal(DEFAULT_INTENT.needsWeb, false);
assert.equal(DEFAULT_INTENT.webResults, null);
assert.equal(DEFAULT_INTENT.webFreshness, null);

// ── how recent the pages have to be ──────────────────────────────────────────
// Owner, 2026-08-21: *"let the model pick freshness."* Brave has had this filter the whole time
// and nothing in this product had ever set it, so a question about this week was answered from
// pages of any age. Which windows exist is the provider's fact and is validated there; what is
// asserted here is the half that is ours.
{
  const contract = intentContract();
  for (const code of ["pd", "pw", "pm", "py"]) {
    assert.ok(contract.includes(`"${code}"`), `${code} is not offered to the model`);
  }
  // 🔴 THE NEGATIVE INSTRUCTION IS THE ONE THAT MATTERS. A model given a filter and no reason to
  // withhold it filters everything, and a narrow window on a settled question hides the source
  // that actually explains it.
  assert.match(contract, /would be WRONG rather than merely less interesting/);
  assert.match(contract, /When in doubt, null/);
}
// A window without a search is the same contradiction as a query or a count without one.
assert.equal(readChatIntent('{"needsWeb":true,"webFreshness":"pw"}')?.webFreshness, "pw");
assert.equal(readChatIntent('{"needsWeb":false,"webFreshness":"pw"}')?.webFreshness, null);
// 🔴 AND NOTHING HERE CHECKS IT AGAINST A LIST. A second copy of Brave's vocabulary in this file
// is a second thing to update the day Brave adds a value. `readFreshness` in the search function
// drops what Brave will not take, so an invented window becomes no filter rather than a live
// parameter that quietly does nothing.
assert.equal(readChatIntent('{"needsWeb":true,"webFreshness":"last_week"}')?.webFreshness, "last_week");

// ── searching more than once ─────────────────────────────────────────────────
// Owner, 2026-08-21: *"the phone should also follow the same as webapp canvas."* The Canvas has
// searched until the model says it has enough since `MAX_SEARCH_ROUNDS`; this packet could only
// ever be asked once, because it was identical every round. These are the two halves that make
// asking again mean something: the results reach the model, and it is told what it may still do.
{
  const withResults = { ...context, searchesLeft: 2, webContext: "1. Some page\nURL: https://example.edu" };
  const block = intentStateBlock(withResults);
  assert.match(block, /You may run 2 more searches/);
  // A first pass has searched nothing, so it must say nothing about searches at all — otherwise
  // every ordinary turn carries a sentence about a search that never happened.
  assert.doesNotMatch(intentStateBlock(context), /search/i);
  // One left is not "searches".
  assert.match(intentStateBlock({ ...withResults, searchesLeft: 1 }), /1 more search\b/);
  // 🔴 AND THE LAST ROUND SAYS SO RATHER THAN GOING QUIET. A model that is silently cut off
  // answers as though it had looked everywhere.
  const spent = intentStateBlock({ ...withResults, searchesLeft: 0 });
  assert.match(spent, /no further search is available/);
  assert.match(spent, /say plainly what it did not settle/);
}
// The pages themselves ride as their own fenced system message, labelled as source context — the
// same treatment the Canvas gives them, because a page nobody chose to open is the most exposed
// text in the packet.
{
  const messages = intentMessages({
    ask: "what happened today",
    context: { ...context, searchesLeft: 3, webContext: "1. Some page" },
  });
  const evidence = messages.find((message) => message.content.includes("PROVISIONAL EXTERNAL EVIDENCE"));
  assert.ok(evidence, "what the search found never reaches the model");
  assert.equal(evidence.role, "system");
  assert.match(evidence.content, /not something the student said/i);
  // A turn that searched nothing carries no such message at all.
  assert.ok(!intentMessages({ ask: "hi", context }).some((m) => m.content.includes("PROVISIONAL")));
}
// And the contract tells the model it MAY say true again, which is what ends the loop honestly.
{
  const contract = intentContract();
  assert.match(contract, /you have searched once/i);
  assert.match(contract, /Say true AGAIN, with a different webQuery/);
  assert.match(contract, /Stop as soon as you can answer properly/);
}

console.log("chat-intent.test.ts OK");
