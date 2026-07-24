// Deno unit tests (repo convention) for the chat-thread pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/chat-thread.test.ts
import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeInstruction } from "./chat-routing.ts";
import {
  ATTACHMENT_CONTEXT_MAX_CHARS,
  buildAttachmentContext,
  buildWireMessages,
  CHAT_SYSTEM_PROMPT,
  chatErrorKind,
  chatErrorMessage,
  completionText,
  forcedResearchDecision,
  formatWebSearchContext,
  trimHistory,
  usableWebResults,
  withAttachmentNote,
  type ChatMsg,
  type ChatSource,
} from "./chat-thread.ts";

const msg = (role: "assistant" | "user", content: string): ChatMsg => ({
  at: "2026-07-17T06:00:00Z",
  content,
  role,
});

Deno.test("trimHistory: keeps the most recent messages within the char budget", () => {
  const history = [msg("user", "a".repeat(100)), msg("assistant", "b".repeat(100)), msg("user", "c".repeat(100))];
  const trimmed = trimHistory(history, 220, 30);
  assertEquals(trimmed.map((m) => m.content[0]), ["b", "c"]);
});

Deno.test("trimHistory: always keeps at least the latest message, even over budget", () => {
  const history = [msg("user", "x".repeat(5000))];
  assertEquals(trimHistory(history, 100, 30).length, 1);
});

Deno.test("trimHistory: caps message count", () => {
  const history = Array.from({ length: 50 }, (_, i) => msg("user", `m${i}`));
  const trimmed = trimHistory(history, 100_000, 30);
  assertEquals(trimmed.length, 30);
  assertEquals(trimmed[29].content, "m49");
});

Deno.test("buildWireMessages: system carries the route instruction, history in order, new user text last", () => {
  const wire = buildWireMessages([msg("user", "hi"), msg("assistant", "hello")], "what next?");
  // "what next?" classifies as plain conversation — assert against the router's
  // own instruction text rather than hardcoding it, so route-tuning can't silently
  // desync this test from chat-routing.ts.
  assertEquals(wire[0], { content: `${CHAT_SYSTEM_PROMPT}\n\n${routeInstruction("conversation")}`, role: "system" });
  assertEquals(wire[1], { content: "hi", role: "user" });
  assertEquals(wire[2], { content: "hello", role: "assistant" });
  assertEquals(wire[3], { content: "what next?", role: "user" });
});

Deno.test("buildWireMessages: an explicit decision overrides the auto-classified route", () => {
  const wire = buildWireMessages([], "hi", { route: "research", model: "deepseek-reasoner", searchWeb: true, reasoningEffort: "high" });
  assertEquals(wire[0], { content: `${CHAT_SYSTEM_PROMPT}\n\n${routeInstruction("research")}`, role: "system" });
});

Deno.test("chatErrorKind: classifies budget, auth, unreachable, and generic shapes", () => {
  assertEquals(chatErrorKind(429, null), "budget");
  assertEquals(chatErrorKind(200, { error: { code: "daily_token_budget_exhausted" } }), "budget");
  assertEquals(chatErrorKind(401, null), "auth");
  assertEquals(chatErrorKind(403, null), "auth");
  assertEquals(chatErrorKind(502, null), "unreachable");
  assertEquals(chatErrorKind(500, null), "unreachable");
  assertEquals(chatErrorKind(400, null), "generic");
});

Deno.test("chatErrorMessage: budget, auth, server, and fallback shapes", () => {
  const budget = chatErrorMessage(429, { error: { code: "daily_token_budget_exhausted", message: "Daily token budget reached for the free plan. Upgrade or try again tomorrow." } });
  assertEquals(budget.includes("Daily token budget"), true);
  assertEquals(chatErrorMessage(401, null).includes("re-connect"), true);
  assertEquals(chatErrorMessage(502, null).includes("unreachable"), true);
  assertEquals(chatErrorMessage(400, { error: { message: "invalid chat.completions body" } }), "invalid chat.completions body");
  assertEquals(chatErrorMessage(400, null), "Something went wrong sending that. Try again.");
});

Deno.test("formatWebSearchContext: formats up to 5 usable results, empty string when none", () => {
  const results: ChatSource[] = [
    { title: "Next.js 16", url: "https://nextjs.org/blog/16", description: "Release notes." },
    { title: "", url: "https://example.com/no-title", description: "Has a description, no title." },
    { title: "", url: "", description: "No url — dropped." },
  ];
  const formatted = formatWebSearchContext(results);
  assertMatch(formatted, /Live web search results/);
  // The model must be told to cite with a numbered [n] marker (NOT the raw URL):
  // MessageBody only turns [n] into inline source pills, so this wording is what
  // makes the pills appear at all.
  assertMatch(formatted, /square brackets, like \[1\]/);
  assertMatch(formatted, /never write the raw URL in the prose/);
  assertMatch(formatted, /1\. Next\.js 16\nURL: https:\/\/nextjs\.org\/blog\/16/);
  assertMatch(formatted, /2\. https:\/\/example\.com\/no-title/); // falls back to the URL as the title
  assertEquals(formatted.includes("dropped"), false); // no-url result is excluded
  assertEquals(formatWebSearchContext([]), "");
  assertEquals(formatWebSearchContext(Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, url: `https://x.test/${i}`, description: "" }))).match(/URL:/g)?.length, 5);
});

Deno.test("usableWebResults is the SINGLE list behind both the prompt numbering and the stored sources", () => {
  // The pills resolve [n] positionally (SourcePill reads sources[n-1]), so the
  // list stored on the message must equal the list the prompt numbers. A result
  // with a url but no title AND no description is the trap: if it survived into
  // the stored list but not the numbered one, every later pill would shift by one.
  const raw: ChatSource[] = [
    { title: "Real one", url: "https://a.test/1", description: "has text" },
    { title: "", url: "https://b.test/2", description: "" }, // url only, no text — dropped
    { title: "", url: "https://c.test/3", description: "also real" },
    { title: "No url", url: "", description: "dropped, no url" },
  ];
  const usable = usableWebResults(raw);
  // The text-less and url-less entries are gone; order of the survivors is kept.
  assertEquals(usable.map((s) => s.url), ["https://a.test/1", "https://c.test/3"]);

  // The prompt numbers exactly those survivors, in the same order — so [2] in the
  // answer resolves to usable[1] (c.test/3), the source the model actually saw.
  const formatted = formatWebSearchContext(raw);
  assertMatch(formatted, /1\. Real one\nURL: https:\/\/a\.test\/1/);
  assertMatch(formatted, /2\. https:\/\/c\.test\/3\nURL: https:\/\/c\.test\/3/);
  assertEquals(formatted.includes("b.test"), false);

  // Caps at five, so [n] never exceeds the stored list length.
  assertEquals(usableWebResults(Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, url: `https://x.test/${i}`, description: "d" }))).length, 5);
});

Deno.test("completionText: extracts assistant text, rejects empty/malformed", () => {
  assertEquals(completionText({ choices: [{ message: { content: "Answer." } }] }), "Answer.");
  assertEquals(completionText({ choices: [{ message: { content: "   " } }] }), null);
  assertEquals(completionText({ choices: [] }), null);
  assertEquals(completionText("nope"), null);
});

import { budgetResetKind, nextDailyReset } from "./chat-thread.ts";

Deno.test("budgetResetKind: daily vs monthly vs neither", () => {
  assertEquals(budgetResetKind({ error: { code: "daily_token_budget_exhausted" } }), "daily");
  assertEquals(budgetResetKind({ error: { code: "monthly_token_budget_exhausted" } }), "monthly");
  assertEquals(budgetResetKind({ error: { code: "something_else" } }), null);
  assertEquals(budgetResetKind(null), null);
  assertEquals(budgetResetKind("nope"), null);
});

Deno.test("buildAttachmentContext: mirrors web's '### Attachment: NAME' block shape, clamped, empty on blank content", () => {
  const block = buildAttachmentContext({ content: "Beta blockers reduce heart rate.", title: "Pharm Ch. 4" });
  assertEquals(block, "### Attachment: Pharm Ch. 4\nType: Library note\n\nBeta blockers reduce heart rate.");
  assertMatch(block, /^### Attachment: /);
  assertEquals(buildAttachmentContext({ content: "   ", title: "Empty note" }), "");
});

Deno.test("buildAttachmentContext: clamps to ~8000 chars by default, or a caller-supplied limit", () => {
  const long = "x".repeat(ATTACHMENT_CONTEXT_MAX_CHARS + 500);
  const block = buildAttachmentContext({ content: long, title: "Long note" });
  assertEquals(block.length, "### Attachment: Long note\nType: Library note\n\n".length + ATTACHMENT_CONTEXT_MAX_CHARS);
  const capped = buildAttachmentContext({ content: long, title: "Long note" }, 10);
  assertEquals(capped, "### Attachment: Long note\nType: Library note\n\nxxxxxxxxxx");
});

Deno.test("withAttachmentNote: appends 'Attached: NAME' when a title is given, else returns text unchanged", () => {
  assertEquals(withAttachmentNote("What's the mechanism?", "Pharm Ch. 4"), "What's the mechanism?\n\nAttached: Pharm Ch. 4");
  assertEquals(withAttachmentNote("What's the mechanism?", null), "What's the mechanism?");
});

Deno.test("forcedResearchDecision: identical to chat-routing's own RESEARCH_PATTERN branch", () => {
  assertEquals(forcedResearchDecision(), { model: "deepseek-reasoner", reasoningEffort: "high", route: "research", searchWeb: true });
});

Deno.test("nextDailyReset: next UTC midnight, never in the past", () => {
  const morning = new Date("2026-07-20T03:15:00Z");
  assertEquals(nextDailyReset(morning).toISOString(), "2026-07-21T00:00:00.000Z");
  const lastMinute = new Date("2026-07-20T23:59:59Z");
  assertEquals(nextDailyReset(lastMinute).toISOString(), "2026-07-21T00:00:00.000Z");
  const exactMidnight = new Date("2026-07-20T00:00:00Z");
  assertEquals(nextDailyReset(exactMidnight).toISOString(), "2026-07-21T00:00:00.000Z");
  const monthEnd = new Date("2026-07-31T12:00:00Z");
  assertEquals(nextDailyReset(monthEnd).toISOString(), "2026-08-01T00:00:00.000Z");
});
