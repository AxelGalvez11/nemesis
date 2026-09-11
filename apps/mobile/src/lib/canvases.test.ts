// Deno unit tests (repo convention) for the phone's canvas projections.
// Run: deno test --no-check --unstable-sloppy-imports apps/mobile/src/lib/canvases.test.ts
//   (`--unstable-sloppy-imports` because the web modules this reaches import without extensions)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildProjects,
  canvasFromRow,
  canvasLabel,
  canvasToRow,
  DOCUMENT_KEYS,
  EVIDENCE_STAGES,
  newCanvas,
  sidebarSections,
  summaryFromRow,
  threadFromCanvas,
  type CanvasSummary,
  type Folder,
  visibleProjects,
  wireHistory,
  withExchange,
} from "./canvases.ts";

const NOW = "2026-09-01T20:00:00.000Z";

function summary(over: Partial<CanvasSummary> & { id: string }): CanvasSummary {
  return {
    title: "",
    state: "learn",
    updatedAt: NOW,
    pinnedAt: null,
    folderId: null,
    courseTitle: null,
    preview: null,
    ...over,
  };
}

function folder(over: Partial<Folder> & { id: string; name: string }): Folder {
  return { parentId: null, icon: null, color: null, instructions: null, pinnedAt: null, ...over };
}

// ─── the row mapping is the web's ─────────────────────────────────────────────

Deno.test("canvasToRow writes exactly the document keys the web's store writes", async () => {
  // Read the web's own source so this cannot be satisfied by editing the phone's list to match
  // the phone's memory of the web. A key added over there without a line here would otherwise be
  // deleted by the phone's next save.
  const url = new URL("../../../web/lib/learn/canvas-store.ts", import.meta.url);
  const source = await Deno.readTextFile(url);
  const block = source.slice(source.indexOf("export function canvasToRow"), source.indexOf("export function isMissingTableError"));
  const documentBlock = block.slice(block.indexOf("document: {"), block.indexOf("},", block.indexOf("document: {")));
  const webKeys = [...documentBlock.matchAll(/^\s+([a-zA-Z]+): canvas\.\1,?$/gm)].map((m) => m[1]);
  assertEquals(webKeys, [...DOCUMENT_KEYS]);

  const row = canvasToRow(newCanvas("c1", NOW), "u1");
  assertEquals(Object.keys(row.document as object), [...DOCUMENT_KEYS]);
  assert(!("updated_at" in row), "the trigger owns updated_at");
  assert(!("territory" in row), "the canvas never carries territory");
});

Deno.test("a row round-trips through canvasFromRow and canvasToRow", () => {
  const canvas = withExchange(newCanvas("c1", NOW), { userText: "what is a diode", assistantText: "A diode…" }, NOW, "m0");
  const row = canvasToRow(canvas, "u1");
  const back = canvasFromRow({
    id: "c1",
    title: row.title as string,
    state: row.state as string,
    level: null,
    document: row.document,
    active_ms: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  assertEquals(back.moments, canvas.moments);
  assertEquals(back.title, "what is a diode");
});

Deno.test("a corrupt document reads as an empty canvas, not a crash", () => {
  const back = canvasFromRow({ id: "c1", title: null, state: "nonsense", level: "wrong", document: 42, active_ms: null, created_at: NOW, updated_at: NOW });
  assertEquals(back.moments, []);
  assertEquals(back.state, "learn");
  assertEquals(back.level, null);
  assertEquals(back.title, "");
});


Deno.test("the retired evidence stages match the web's list, and read as learn", async () => {
  const url = new URL("../../../web/lib/learn/canvas-hosting.ts", import.meta.url);
  const source = await Deno.readTextFile(url);
  const m = source.match(/const EVIDENCE_STAGES: readonly CanvasState\[\] = \[([^\]]*)\]/);
  assert(m, "the web's EVIDENCE_STAGES constant moved — update the phone's copy and this test");
  const webStages = [...m![1]!.matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assertEquals(webStages, [...EVIDENCE_STAGES]);
  for (const stage of EVIDENCE_STAGES) {
    const back = canvasFromRow({ id: "c1", title: "T", state: stage, level: null, document: {}, active_ms: 0, created_at: NOW, updated_at: NOW });
    assertEquals(back.state, "learn");
  }
});

// ─── sidebar ─────────────────────────────────────────────────────────────────

Deno.test("summaryFromRow keeps the web's computed columns", () => {
  const s = summaryFromRow({ id: "c1", title: "T", state: "learn", updated_at: NOW, pinned_at: null, folder_id: "f1", course_title: "Calc", preview: "Last thing." });
  assertEquals(s.courseTitle, "Calc");
  assertEquals(s.preview, "Last thing.");
  assertEquals(s.folderId, "f1");
});

Deno.test("canvasLabel: title, else course, else the tail, else a plain label", () => {
  assertEquals(canvasLabel(summary({ id: "a", title: "Diodes" })), "Diodes");
  assertEquals(canvasLabel(summary({ id: "a", courseTitle: "Calculus I" })), "Calculus I");
  assertEquals(canvasLabel(summary({ id: "a", preview: "A diode conducts one way." })), "A diode conducts one way");
  assertEquals(canvasLabel(summary({ id: "a" })), "New canvas");
});

Deno.test("sidebarSections: pinned first, filed canvases stay inside their project, a pinned project leaves Projects", () => {
  const folders = [folder({ id: "f1", name: "Bio" }), folder({ id: "f2", name: "Law", pinnedAt: NOW })];
  const canvases = [
    summary({ id: "c1", title: "Loose", updatedAt: "2026-09-01T10:00:00Z" }),
    summary({ id: "c2", title: "Pinned one", pinnedAt: NOW }),
    summary({ id: "c3", title: "In Bio", folderId: "f1" }),
    summary({ id: "c4", title: "In Law", folderId: "f2" }),
  ];
  const s = sidebarSections(canvases, folders);
  assertEquals(s.pinnedCanvases.map((c) => c.id), ["c2"]);
  assertEquals(s.pinnedProjects.map((p) => p.id), ["f2"]);
  assertEquals(s.projects.map((p) => p.id), ["f1"]);
  assertEquals(s.projects[0]!.canvases.map((c) => c.id), ["c3"]);
  assertEquals(s.recents.map((c) => c.id), ["c1"]);
});

Deno.test("sidebarSections search matches canvases by label and projects by name", () => {
  const folders = [folder({ id: "f1", name: "Biology" })];
  const canvases = [summary({ id: "c1", title: "Diodes" }), summary({ id: "c2", preview: "Osmosis is…" })];
  const s = sidebarSections(canvases, folders, "osmo");
  assertEquals(s.recents.map((c) => c.id), ["c2"]);
  assertEquals(s.projects, []);
  assertEquals(sidebarSections(canvases, folders, "bio").projects.map((p) => p.id), ["f1"]);
});

Deno.test("buildProjects: recency rollup, a ring terminates, an orphan still shows", () => {
  const folders = [
    folder({ id: "a", name: "A", parentId: "b" }),
    folder({ id: "b", name: "B", parentId: "a" }),
    folder({ id: "o", name: "Orphan", parentId: "missing" }),
  ];
  const nodes = buildProjects(folders, [summary({ id: "c1", folderId: "o", updatedAt: "2026-09-02T00:00:00Z" })]);
  assertEquals(nodes.map((n) => n.id).sort(), ["a", "o"].sort());
  assertEquals(nodes[0]!.id, "o", "most recently worked first");
  assertEquals(visibleProjects(nodes, "pinned", "").length, 0);
});

// ─── thread ──────────────────────────────────────────────────────────────────

Deno.test("threadFromCanvas rebuilds every exchange, oldest first, as the web does on reopen", () => {
  let canvas = newCanvas("c1", NOW);
  canvas = withExchange(canvas, { userText: "first", assistantText: "one" }, "2026-09-01T20:00:00Z", "m0");
  canvas = withExchange(canvas, { userText: "second", assistantText: "two", spoken: true }, "2026-09-01T20:01:00Z", "m1");
  const thread = threadFromCanvas(canvas);
  assertEquals(thread.map((t) => [t.said, t.reply, t.saidVia, t.restored]), [
    ["first", "one", null, true],
    ["second", "two", "spoken", true],
  ]);
  assertEquals(wireHistory(canvas), [
    { role: "user", content: "first" },
    { role: "assistant", content: "one" },
    { role: "user", content: "second" },
    { role: "assistant", content: "two" },
  ]);
});

Deno.test("withExchange: a provisional title from the first words, the same exchange never twice, state untouched", () => {
  const first = withExchange(newCanvas("c1", NOW), { userText: "  Explain promissory estoppel  ", assistantText: "Sure." }, NOW, "m0");
  assertEquals(first.title, "Explain promissory estoppel");
  assertEquals(first.state, "empty");
  const again = withExchange(first, { userText: "Explain promissory estoppel", assistantText: "Sure." }, NOW, "m1");
  assertEquals(again.moments.length, 1);
  const renamed = withExchange({ ...first, title: "Estoppel" }, { userText: "more", assistantText: "ok" }, NOW, "m1");
  assertEquals(renamed.title, "Estoppel");
  assertEquals(renamed.moments.length, 2);
});
