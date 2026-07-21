// Deno unit tests (repo convention) for the notebooks pure helpers.
// Run: deno test --allow-read --no-check apps/mobile/src/lib/notebook-model.test.ts
import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeInstruction } from "./chat-routing.ts";
import {
  buildNotebookWireMessages,
  buildSourceContext,
  mapRows,
  NOTEBOOK_SYSTEM_PROMPT,
  titleFromPrompt,
  toNotebook,
  toNotebookChat,
  toNotebookChatMessage,
  toNotebookOutput,
  toNotebookSource,
  type NotebookChatEntry,
  type NotebookWireSource,
} from "./notebook-model.ts";

// ── row parsers ──────────────────────────────────────────────────────────────

Deno.test("toNotebook: valid row parses, missing fields degrade to null", () => {
  const row = { description: null, id: "n1", instructions: "Be terse", name: "Cardio", updated_at: "2026-07-01T00:00:00Z" };
  assertEquals(toNotebook(row), {
    description: null,
    id: "n1",
    instructions: "Be terse",
    name: "Cardio",
    updatedAt: "2026-07-01T00:00:00Z",
  });
});

Deno.test("toNotebook: no id or no name -> null", () => {
  assertEquals(toNotebook({ id: "n1" }), null);
  assertEquals(toNotebook({ name: "Cardio" }), null);
  assertEquals(toNotebook("not an object"), null);
  assertEquals(toNotebook(null), null);
});

Deno.test("toNotebookSource: valid row parses; unknown kind -> null", () => {
  const row = {
    bytes: 1200,
    content: "extracted text",
    created_at: "2026-07-01T00:00:00Z",
    id: "s1",
    kind: "pdf",
    library_path: null,
    name: "Guideline",
    notebook_id: "n1",
    source_url: null,
  };
  assertEquals(toNotebookSource(row)?.kind, "pdf");
  assertEquals(toNotebookSource({ ...row, kind: "spreadsheet" }), null);
  assertEquals(toNotebookSource({ ...row, id: undefined }), null);
  assertEquals(toNotebookSource({ ...row, notebook_id: undefined }), null);
});

Deno.test("toNotebookSource: missing name/bytes degrade gracefully", () => {
  const parsed = toNotebookSource({ id: "s1", kind: "text", notebook_id: "n1" });
  assertEquals(parsed?.name, "Untitled source");
  assertEquals(parsed?.bytes, null);
  assertEquals(parsed?.content, null);
});

Deno.test("toNotebookChat: valid row parses; missing notebook_id -> null", () => {
  assertEquals(toNotebookChat({ id: "c1", notebook_id: "n1", title: "Q&A", updated_at: "t" }), {
    id: "c1",
    notebookId: "n1",
    title: "Q&A",
    updatedAt: "t",
  });
  assertEquals(toNotebookChat({ id: "c1", title: "Q&A" }), null);
});

Deno.test("toNotebookChat: blank title falls back to 'New chat'", () => {
  assertEquals(toNotebookChat({ id: "c1", notebook_id: "n1" })?.title, "New chat");
});

Deno.test("toNotebookChatMessage: valid roles parse; unknown role or missing content -> null", () => {
  const base = { chat_id: "c1", created_at: "t", id: "m1" };
  assertEquals(toNotebookChatMessage({ ...base, content: "hi", role: "user" })?.role, "user");
  assertEquals(toNotebookChatMessage({ ...base, content: "hi", role: "assistant" })?.role, "assistant");
  assertEquals(toNotebookChatMessage({ ...base, content: "hi", role: "narrator" }), null);
  assertEquals(toNotebookChatMessage({ ...base, role: "user" }), null); // no content field at all
});

Deno.test("toNotebookChatMessage: empty-string content is valid (not the same as missing)", () => {
  assertEquals(toNotebookChatMessage({ chat_id: "c1", content: "", id: "m1", role: "assistant" })?.content, "");
});

Deno.test("toNotebookOutput: valid kind/status parse; unknown values -> null", () => {
  const base = { created_at: "t", id: "o1", notebook_id: "n1", title: "Deck" };
  assertEquals(toNotebookOutput({ ...base, content: "…", kind: "flashcards", status: "ready" })?.kind, "flashcards");
  assertEquals(toNotebookOutput({ ...base, content: "…", kind: "essay", status: "ready" }), null);
  assertEquals(toNotebookOutput({ ...base, content: "…", kind: "test", status: "archived" }), null);
});

Deno.test("mapRows: drops invalid rows, keeps parse order, non-array -> []", () => {
  const data = [{ id: "n1", name: "A" }, { id: "n2" }, { id: "n3", name: "C" }];
  assertEquals(mapRows(data, toNotebook).map((n) => n.id), ["n1", "n3"]);
  assertEquals(mapRows(null, toNotebook), []);
  assertEquals(mapRows("nope", toNotebook), []);
});

// ── buildSourceContext ───────────────────────────────────────────────────────

Deno.test("buildSourceContext: empty when no sources have text", () => {
  assertEquals(buildSourceContext([]), "");
  assertEquals(buildSourceContext([{ content: null, name: "A" }, { content: "  ", name: "B" }]), "");
});

Deno.test("buildSourceContext: includes each source's name + text", () => {
  const sources: NotebookWireSource[] = [{ content: "ACE inhibitors block ACE.", name: "ACE note" }];
  const out = buildSourceContext(sources);
  assertMatch(out, /Sources the student added to this notebook:/);
  assertMatch(out, /### Source: ACE note/);
  assertMatch(out, /ACE inhibitors block ACE\./);
});

Deno.test("buildSourceContext: truncates a source that only partly fits, and fully omits one that doesn't fit at all", () => {
  // Budget 60: "First" (20 chars) fits whole: used=20. "Second" (50 chars) only has
  // 40 chars of budget left, so it's included but clipped with a "…[truncated]" note.
  // By then `used` is already >= budget, so "Third" is dropped entirely (never even
  // partially included) and only counted in the "N more sources" footer.
  const sources: NotebookWireSource[] = [
    { content: "a".repeat(20), name: "First" },
    { content: "b".repeat(50), name: "Second" },
    { content: "c".repeat(50), name: "Third" },
  ];
  const out = buildSourceContext(sources, 60);
  assertMatch(out, /### Source: First/);
  assertMatch(out, /### Source: Second/);
  assertMatch(out, /truncated/);
  assertEquals(out.includes("### Source: Third"), false);
  assertMatch(out, /1 more source not shown/);
});

// ── buildNotebookWireMessages ────────────────────────────────────────────────

const entry = (role: "user" | "assistant", content: string): NotebookChatEntry => ({
  at: "2026-07-17T06:00:00Z",
  content,
  role,
});

Deno.test("buildNotebookWireMessages: system carries the grounded prompt + route instruction, no instructions/sources", () => {
  const wire = buildNotebookWireMessages({ history: [], instructions: null, sources: [], userText: "hi there" });
  assertEquals(wire[0].role, "system");
  assertEquals(wire[0].content.startsWith(NOTEBOOK_SYSTEM_PROMPT), true);
  assertEquals(wire[0].content.includes(routeInstruction("conversation")), true);
  assertEquals(wire[0].content.includes("This notebook's instructions"), false);
  assertEquals(wire[0].content.includes("Sources the student added"), false);
  assertEquals(wire[wire.length - 1], { content: "hi there", role: "user" });
});

Deno.test("buildNotebookWireMessages: folds in instructions and source context when present", () => {
  const wire = buildNotebookWireMessages({
    history: [],
    instructions: "Quiz me, don't just explain.",
    sources: [{ content: "Loop diuretics act on the thick ascending limb.", name: "Diuretics" }],
    userText: "What do loop diuretics do?",
  });
  assertEquals(wire[0].content.includes("Quiz me, don't just explain."), true);
  assertEquals(wire[0].content.includes("### Source: Diuretics"), true);
});

Deno.test("buildNotebookWireMessages: history is trimmed and ordered before the new user message", () => {
  const wire = buildNotebookWireMessages({
    history: [entry("user", "first"), entry("assistant", "second")],
    instructions: null,
    sources: [],
    userText: "third",
  });
  assertEquals(wire.slice(1), [
    { content: "first", role: "user" },
    { content: "second", role: "assistant" },
    { content: "third", role: "user" },
  ]);
});

Deno.test("buildNotebookWireMessages: an explicit decision overrides auto-classification", () => {
  const wire = buildNotebookWireMessages({
    decision: { model: "deepseek-reasoner", route: "research", searchWeb: true },
    history: [],
    instructions: null,
    sources: [],
    userText: "hey",
  });
  assertEquals(wire[0].content.includes(routeInstruction("research")), true);
});

// ── titleFromPrompt ──────────────────────────────────────────────────────────

Deno.test("titleFromPrompt: short text passes through with collapsed whitespace", () => {
  assertEquals(titleFromPrompt("  what   do beta blockers do?  "), "what do beta blockers do?");
});

Deno.test("titleFromPrompt: long text is capped at 48 chars with an ellipsis", () => {
  const long = "a".repeat(80);
  const title = titleFromPrompt(long);
  assertEquals(title.length, 49); // 48 chars + the ellipsis glyph
  assertEquals(title.endsWith("…"), true);
});
