import assert from "node:assert/strict";
import { test } from "node:test";

import { buildWireMessages, CHAT_SYSTEM_PROMPT, chatSystemPrompt, collapseOutputs } from "@/lib/workspace/chat-api";
import { toolsAllowed } from "@/lib/workspace/chat-effort";
import { classifyChatRequest } from "@/lib/workspace/chat-routing";
import type { SessionMessage } from "@/lib/workspace/sessions-store";

const message = (role: SessionMessage["role"], content: string): SessionMessage =>
  ({ content, id: `${role}-${content.slice(0, 8)}`, role } as SessionMessage);

const systemText = (text: string) =>
  buildWireMessages([], text).filter((wire) => wire.role === "system").map((wire) => wire.content).join("\n");

test("the base prompt always carries the self-check rule", () => {
  assert.match(CHAT_SYSTEM_PROMPT, /Check your own work before you answer/);
  assert.match(systemText("hey"), /Check your own work before you answer/);
});

test("a matched skill reaches the wire as its own system message", () => {
  const wire = buildWireMessages([], "make me flashcards on ACE inhibitors");
  const skill = wire.find((entry) => entry.role === "system" && entry.content.startsWith("SKILL — "));
  assert.ok(skill, "expected a skill system message");
  assert.match(skill.content, /Every card tests ONE fact/);
});

test("skills sit after the base prompt and before the conversation", () => {
  const wire = buildWireMessages([message("user", "earlier"), message("assistant", "ok")], "cite your sources");
  const skillIndex = wire.findIndex((entry) => entry.content.startsWith("SKILL — "));
  const firstNonSystem = wire.findIndex((entry) => entry.role !== "system");
  assert.ok(skillIndex > 0, "skill must follow the base prompt");
  assert.ok(skillIndex < firstNonSystem, "skill must precede the conversation");
});

test("an ordinary turn adds no skill message at all", () => {
  const wire = buildWireMessages([], "thanks!");
  assert.equal(wire.filter((entry) => entry.content.startsWith("SKILL — ")).length, 0);
  assert.equal(wire.filter((entry) => entry.role === "system").length, 1);
});

// The prompt used to promise the workspace tools on EVERY turn, including the
// reasoner routes that go out without any. Told it could add cards and told to
// "state plainly what you created", the model wrote "[Calling tool:
// add_flashcards ...]" as prose and reported 14 cards saved to a deck the
// student does not have. The claim and the tools now come from one boolean.
test("a tool-less turn is told it has no tools, and never told to report a write", () => {
  const noTools = chatSystemPrompt(false);
  assert.doesNotMatch(noTools, /through your tools/);
  assert.doesNotMatch(noTools, /After any write, state plainly/);
  assert.match(noTools, /This turn carries no tools/);
  assert.match(noTools, /Calling tool/);
  // And the rigor rules survive the swap.
  assert.match(noTools, /Check your own work before you answer/);
  assert.match(CHAT_SYSTEM_PROMPT, /through your tools/);
});

// Owner 2026-07-27: a created deck, test, or note belongs in chat as a card that
// opens it, not as a wall of prose. The rule lives in the BASE tools paragraph
// rather than only in the craft skills, because at most MAX_ACTIVE_SKILLS ride
// any turn — a reply like "all three" matches no skill at all.
test("a turn with tools is told to show the card, not reprint what it saved", () => {
  assert.match(CHAT_SYSTEM_PROMPT, /do not reprint what you saved/i);
  assert.match(CHAT_SYSTEM_PROMPT, /shows the student a card that opens it/i);
  // And the exception survives, so a failed save never loses the student's work.
  assert.match(CHAT_SYSTEM_PROMPT, /when the save failed/i);
  // "all three" carries no skill, so the base prompt is the only thing carrying it.
  assert.match(systemText("all three"), /do not reprint what you saved/i);
});

test("buildWireMessages derives the tools claim from the route, not from hope", () => {
  // "explain osmosis" routes to the reasoner, which carries no tools.
  const learning = classifyChatRequest("explain osmosis");
  assert.equal(toolsAllowed(learning), false);
  assert.match(systemText("explain osmosis"), /This turn carries no tools/);
  // A save keeps deepseek-chat, so the tools paragraph is true and stays.
  assert.equal(toolsAllowed(classifyChatRequest("make me flashcards on ACE inhibitors")), true);
  assert.match(systemText("make me flashcards on ACE inhibitors"), /through your tools/);
});

// Importing a real syllabus calls add_calendar_event once per date. Measured
// live on the owner's PCT syllabus: 51 events, so 51 cards in a row — a worse
// wall than the prose the artifact rule was meant to replace.
test("a syllabus import shows one calendar card, not one per date", () => {
  const events = Array.from({ length: 51 }, (_, index) => ({
    id: `e${index}`,
    kind: "event" as const,
    title: `PCT item ${index}`,
    url: `/calendar?date=2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
  }));
  const shown = collapseOutputs(events);
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.title, "51 calendar events");
  // Keeps the FIRST item's link, which for a syllabus is the start of term.
  assert.equal(shown[0]?.url, events[0]?.url);
});

test("a handful of writes still get a card each, and kinds do not merge", () => {
  const outputs = [
    { id: "a", kind: "flashcards" as const, title: "Deck A", url: "/study?section=cards" },
    { id: "b", kind: "flashcards" as const, title: "Deck B", url: "/study?section=cards" },
    { id: "c", kind: "note" as const, title: "A note", url: "/library?note=x" },
  ];
  assert.deepEqual(collapseOutputs(outputs), outputs);
  // Collapsing one kind leaves the others alone.
  const many = [...Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, kind: "event" as const, title: `E${i}`, url: "/calendar" })), outputs[2]!];
  const shown = collapseOutputs(many);
  assert.equal(shown.length, 2);
  assert.equal(shown[0]?.title, "4 calendar events");
  assert.equal(shown[1]?.title, "A note");
});

// Only kinds whose items share ONE destination may collapse. Every calendar
// event opens the calendar, so nothing is lost. Four decks have four different
// destinations, and folding them would leave three unreachable from the chat.
test("decks and notes are never collapsed, however many there are", () => {
  const decks = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, kind: "flashcards" as const, title: `Deck ${i}`, url: `/study?section=cards&deck=${i}` }));
  assert.deepEqual(collapseOutputs(decks), decks);
  const notes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, kind: "note" as const, title: `Note ${i}`, url: `/library?note=n${i}` }));
  assert.deepEqual(collapseOutputs(notes), notes);
});

test("the user's message is still the last thing sent", () => {
  const wire = buildWireMessages([], "calculate the dose");
  const last = wire.at(-1);
  assert.equal(last?.role, "user");
  assert.equal(last?.content, "calculate the dose");
});
