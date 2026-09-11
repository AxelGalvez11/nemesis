import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { importIds, nameId, noteToPage, placeLibraryImport, planLibraryImport, type LibraryImportPlan, type SpaceBlock } from "./library-import";

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const NOTE = [
  "# Contract law",
  "",
  "An **offer** needs *acceptance*, ~~not~~ a `counter-offer`, see [the case](https://example.com/case).",
  "",
  "- Consideration",
  "  - must be sufficient",
  "1. First step",
  "- [x] Read chapter 3",
  "- [ ] Draft the essay",
  "",
  "> A quoted line",
  ">",
  "> and a second",
  "",
  "```python",
  "print(1)",
  "```",
  "",
  "---",
  "",
  "$$",
  "E = mc^2",
  "$$",
  "",
  "| Term | Meaning |",
  "| --- | --- |",
  "| Offer | A promise |",
  "",
  "![Diagram](https://example.com/d.png)",
  "",
  "![Local sketch](sketch.png)",
].join("\n");

test("🔴 a note keeps its structure as the workspace's own blocks", () => {
  const { page, blocks } = noteToPage({ id: "note-1", title: "Week 3", content: NOTE }, "parent-1", counter(), 1000);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const top = page.content.map((id) => byId.get(id)!);
  assert.deepEqual(
    top.map((b) => b.type),
    ["header", "text", "bulleted_list", "numbered_list", "to_do", "to_do", "quote", "code", "divider", "equation", "table", "image", "text"],
  );
  assert.equal(page.title, "Week 3");
  assert.equal(page.importedFrom, "note-1");
  assert.equal(page.parent, "parent-1");

  const para = top[1]!;
  assert.deepEqual(para.title, [
    ["An "],
    ["offer", [["b"]]],
    [" needs "],
    ["acceptance", [["i"]]],
    [", "],
    ["not", [["s"]]],
    [" a "],
    ["counter-offer", [["c"]]],
    [", see "],
    ["the case", [["a", "https://example.com/case"]]],
    ["."],
  ]);

  const bullet = top[2]!;
  assert.deepEqual(bullet.title, [["Consideration"]]);
  assert.equal(bullet.children.length, 1, "the nested item sits inside its parent");
  assert.equal(byId.get(bullet.children[0]!)!.parent, bullet.id);
  assert.deepEqual([top[4]!.checked, top[5]!.checked], [true, false]);
  assert.deepEqual(top[6]!.title, [["A quoted line"], ["\n"], ["and a second"]]);
  assert.deepEqual([top[7]!.language, top[7]!.title], ["python", [["print(1)"]]]);
  assert.deepEqual(top[9]!.title, [["E = mc^2"]]);
  assert.deepEqual([top[10]!.rows, top[10]!.headerRow, top[10]!.widths], [[["Term", "Meaning"], ["Offer", "A promise"]], true, [240, 240]]);
  assert.deepEqual([top[11]!.src, top[11]!.name], ["https://example.com/d.png", "Diagram"]);
  assert.deepEqual(top[12]!.title, [["Image: Local sketch"]], "an image the browser cannot fetch becomes a line, not a broken picture");
  for (const b of blocks) assert.ok(b.parent === page.id || byId.has(b.parent), `${b.id} points at a real parent`);
});

test("🔴 an import brings each note once, inside one page, in the Library's order", () => {
  const notes = [
    { id: "a", title: "Torts", content: "Duty of care" },
    { id: "b", title: "", content: "Untitled body" },
    { id: "c", title: "Evidence", content: "Hearsay" },
  ];
  const plan = planLibraryImport(notes, new Set(["b"]), counter(), 5)!;
  assert.equal(plan.count, 2);
  assert.equal(plan.parent.title, "From your old Library");
  assert.equal(plan.parent.parent, null);
  assert.deepEqual(plan.pages.map((p) => p.title), ["Torts", "Evidence"]);
  const links = plan.parent.content.map((id) => plan.blocks.find((b) => b.id === id)!).filter((b): b is SpaceBlock => b.type === "page");
  assert.deepEqual(links.map((b) => b.pageId), plan.pages.map((p) => p.id));
  assert.ok(plan.pages.every((p) => p.parent === plan.parent.id));
  assert.equal(planLibraryImport(notes, new Set(["a", "b", "c"]), counter(), 5), null, "nothing new means nothing to do");
  assert.equal(noteToPage({ id: "x", title: "  ", content: "" }, null, counter(), 1).page.title, "Untitled note");
});

test("🔴 ids come from the note: every run names the same records, and no one else's", () => {
  // Python's uuid.uuid5(uuid.NAMESPACE_DNS, "python.org").
  assert.equal(nameId("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "python.org"), "886313e1-3b8a-5372-9b90-0c9aee199e5d");
  const reference = (namespace: string, name: string) => {
    const hash = createHash("sha1").update(Buffer.from(namespace.replace(/-/g, ""), "hex")).update(name, "utf8").digest();
    hash[6] = (hash[6]! & 0x0f) | 0x50;
    hash[8] = (hash[8]! & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const ns = "011b5d4c-f6f9-464c-89ab-19e2868b5cdf";
  // Either side of SHA-1's one- and two-block edges (the namespace adds 16 bytes), and text that is not ASCII.
  for (const name of ["", "a", "x".repeat(39), "x".repeat(40), "x".repeat(48), "x".repeat(103), "x".repeat(104), "é ü 中文 🙂".repeat(9)]) {
    assert.equal(nameId(ns, name), reference(ns, name), `a name of ${name.length} characters`);
  }

  const notes = [
    { id: "a", title: "Torts", content: "Duty of care\n\n- Breach\n  - Foreseeable harm" },
    { id: "c", title: "Evidence", content: "Hearsay" },
  ];
  const ids = (plan: LibraryImportPlan) => [plan.parent.id, ...plan.pages.map((p) => p.id), ...plan.blocks.map((b) => b.id)];
  const mine = importIds("space-1", "user-1");
  const first = ids(planLibraryImport(notes, new Set(), mine, 1)!);
  assert.deepEqual(ids(planLibraryImport(notes, new Set(), mine, 2)!), first, "a second run names the same records");
  assert.equal(new Set(first).size, first.length, "no two records share an id");
  const later = ids(planLibraryImport([notes[0]!, { id: "b", title: "Added later", content: "New" }, notes[1]!], new Set(), mine, 3)!);
  assert.ok(first.every((id) => later.includes(id)), "a note added to the Library later changes no other note's ids");
  const theirs = ids(planLibraryImport(notes, new Set(), importIds("space-2", "user-2"), 1)!);
  assert.equal(theirs.filter((id) => first.includes(id)).length, 0, "another person's import names other records");
});

test("🔴 a run that stopped halfway is finished by adding only what is missing", () => {
  const notes = [
    { id: "a", title: "Torts", content: "# Duty of care\n\n- Breach\n  - Foreseeable harm\n- Causation" },
    { id: "b", title: "Evidence", content: "Hearsay\n\nRelevance" },
    { id: "c", title: "Contracts", content: "Offer" },
  ];
  const plan = planLibraryImport(notes, new Set(), importIds("space-1", "user-1"), 1)!;
  type Rec = { title?: unknown; content?: string[]; children?: string[] };
  const whole: { pages: Record<string, Rec>; blocks: Record<string, Rec> } = { pages: {}, blocks: {} };
  assert.deepEqual(placeLibraryImport(whole, plan), { holder: true, pages: plan.pages.map((p) => p.id), records: 1 + plan.pages.length + plan.blocks.length });

  // What a closed tab left: Contracts never arrived and Torts lost its nested item. Since then the person renamed Torts
  // and deleted Evidence's second paragraph.
  const [torts, evidence, contracts] = plan.pages;
  const S = structuredClone(whole);
  delete S.pages[contracts!.id];
  const contractsRecords = plan.blocks.filter((b) => b.parent === contracts!.id || b.pageId === contracts!.id);
  for (const b of contractsRecords) delete S.blocks[b.id];
  const breach = plan.blocks.find((b) => b.parent === torts!.id && b.children.length)!;
  delete S.blocks[breach.children[0]!];
  S.pages[torts!.id]!.title = "Torts, revised";
  const relevance = S.pages[evidence!.id]!.content!.pop()!;
  delete S.blocks[relevance];

  const done = placeLibraryImport(S, plan);
  assert.deepEqual([done.holder, done.pages], [false, [contracts!.id]]);
  assert.equal(done.records, 1 + 1 + contractsRecords.length, "the nested item, the Contracts page and its records, nothing else");
  assert.ok(S.blocks[breach.children[0]!], "the nested item that never arrived is back");
  assert.ok(S.pages[contracts!.id]!.content!.every((id) => S.blocks[id]));
  assert.equal(S.pages[torts!.id]!.title, "Torts, revised", "what was saved stays as it is");
  assert.equal(S.blocks[relevance], undefined, "a block deleted since stays deleted");
  assert.deepEqual(placeLibraryImport(S, plan), { holder: false, pages: [], records: 0 }, "a third run adds nothing");

  const withNote = planLibraryImport([...notes, { id: "d", title: "Added later", content: "New" }], new Set(), importIds("space-1", "user-1"), 2)!;
  const late = withNote.pages[3]!;
  assert.deepEqual(placeLibraryImport(S, withNote).pages, [late.id]);
  const listed = S.pages[plan.parent.id]!.content!;
  assert.equal(listed[listed.length - 1], withNote.blocks.find((b) => b.pageId === late.id)!.id, "the holder lists the new page last");
});
