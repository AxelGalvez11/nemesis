import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendRelatedLink,
  applyLibrarianPlan,
  buildLibrarianMessages,
  librarianOutline,
  parseLibrarianPlan,
  type LibrarianPlan,
} from "./library-librarian";

// ── What the librarian is allowed to see ─────────────────────────────────────

test("librarianOutline lists folders then notes and hides Personal entirely", () => {
  const outline = librarianOutline(
    ["Contract Law/Offer.md", "Personal/Journal 3 Aug.md", "Thermo/Entropy.md"],
    ["Contract Law", "Personal", "personal/Diary"],
  );
  assert.ok(outline.includes("Contract Law/"));
  assert.ok(outline.includes("Thermo/Entropy.md"));
  assert.ok(!outline.toLowerCase().includes("personal"));
  assert.ok(!outline.includes("Journal"));
});

test("the prompt carries the file name, the outline, and the Personal rule", () => {
  const messages = buildLibrarianMessages({ fileName: "Week 4 slides.pdf", outline: "Contract Law/\nContract Law/Offer.md", text: "body" });
  const system = messages[0]?.content ?? "";
  const user = messages[1]?.content ?? "";
  assert.ok(system.includes("Never file under Personal"));
  assert.ok(system.includes("any subject or profession") || system.toLowerCase().includes("never assume one"));
  assert.ok(user.includes("Week 4 slides.pdf"));
  assert.ok(user.includes("Contract Law/Offer.md"));
});

test("document text is clamped from the START", () => {
  const messages = buildLibrarianMessages({ fileName: "big.pdf", outline: "", text: `HEAD${"x".repeat(70_000)}TAIL` });
  const user = messages[1]?.content ?? "";
  assert.ok(user.includes("HEAD"));
  assert.ok(!user.includes("TAIL"));
});

// ── Parsing and disarming the plan ───────────────────────────────────────────

const NOTES = ["Pharmacology/Heart failure.md", "Personal/Journal.md"];

test("a well-formed plan parses, resolving related paths case-insensitively", () => {
  const plan = parseLibrarianPlan(
    JSON.stringify({
      folder: "Pharmacology/Hypertension",
      pages: [
        { markdown: "Blocks ACE.", title: "ACE Inhibitors", location: { pages: [3, 9] } },
        { markdown: "Blocks receptors.", title: "ARBs" },
      ],
      related: [{ link: "ACE Inhibitors", path: "pharmacology/heart failure.md" }],
      summary: "Filed hypertension drugs.",
    }),
    NOTES,
  );
  assert.ok(plan);
  assert.equal(plan.folder, "Pharmacology/Hypertension");
  assert.equal(plan.pages.length, 2);
  assert.deepEqual(plan.pages[0]?.location, { pages: [3, 9] });
  assert.equal(plan.pages[1]?.location, null);
  assert.equal(plan.related[0]?.path, "Pharmacology/Heart failure.md");
});

test("junk around the JSON is tolerated; junk inside is not", () => {
  const wrapped = 'Here is the plan:\n```json\n{"folder":"A","summary":"s","pages":[{"title":"T","markdown":"m"}],"related":[]}\n```';
  assert.ok(parseLibrarianPlan(wrapped, []));
  assert.equal(parseLibrarianPlan("no json here", []), null);
  assert.equal(parseLibrarianPlan('{"folder":"A"}', []), null);
});

test("plans aimed at Personal are rejected outright", () => {
  const personal = JSON.stringify({ folder: "Personal/Journal", pages: [{ markdown: "m", title: "T" }], related: [], summary: "" });
  assert.equal(parseLibrarianPlan(personal, NOTES), null);
});

test("related links to Personal or unknown notes are dropped, and capped at 3", () => {
  const plan = parseLibrarianPlan(
    JSON.stringify({
      folder: "Thermo",
      pages: [{ markdown: "m", title: "Entropy" }],
      related: [
        { link: "Entropy", path: "Personal/Journal.md" },
        { link: "Entropy", path: "not/a/real/note.md" },
        { link: "Entropy", path: "Pharmacology/Heart failure.md" },
        { link: "Entropy", path: "Pharmacology/Heart failure.md" },
        { link: "Entropy", path: "Pharmacology/Heart failure.md" },
        { link: "Entropy", path: "Pharmacology/Heart failure.md" },
      ],
      summary: "",
    }),
    NOTES,
  );
  assert.ok(plan);
  assert.equal(plan.related.length, 3);
  assert.ok(plan.related.every((relation) => relation.path === "Pharmacology/Heart failure.md"));
});

test("page limits hold: more than 8 pages clamps, an empty page rejects the plan", () => {
  const many = JSON.stringify({
    folder: "A",
    pages: Array.from({ length: 12 }, (_, index) => ({ markdown: "m", title: `Page ${index + 1}` })),
    related: [],
    summary: "",
  });
  assert.equal(parseLibrarianPlan(many, [])?.pages.length, 8);
  const empty = JSON.stringify({ folder: "A", pages: [{ markdown: "   ", title: "T" }], related: [], summary: "" });
  assert.equal(parseLibrarianPlan(empty, []), null);
});

// ── Related-link maintenance never rewrites prose ────────────────────────────

test("appendRelatedLink starts a Related section, extends one, and never duplicates", () => {
  const fresh = appendRelatedLink("Some prose.\n", "ACE Inhibitors");
  assert.ok(fresh.endsWith("## Related\n\n- [[ACE Inhibitors]]\n"));
  assert.ok(fresh.startsWith("Some prose."));

  const extended = appendRelatedLink(fresh, "ARBs");
  assert.ok(extended.includes("- [[ACE Inhibitors]]\n- [[ARBs]]\n"));
  assert.equal(extended.match(/## Related/g)?.length, 1);

  assert.equal(appendRelatedLink(extended, "ARBs"), extended);
  const aliased = "Uses [[ARBs|the blockers]] already.";
  assert.equal(appendRelatedLink(aliased, "ARBs"), aliased);
});

// ── Applying a plan ──────────────────────────────────────────────────────────

test("applyLibrarianPlan creates pages, stamps sources, appends related links", async () => {
  const created: { folder: string; title: string; content: string }[] = [];
  const saved: { id: string; content: string }[] = [];
  const stamped: { noteId: string; location: unknown }[] = [];
  const plan: LibrarianPlan = {
    folder: "Pharmacology/Hypertension",
    pages: [
      { location: { pages: [3, 9] }, markdown: "ACE body", title: "ACE Inhibitors" },
      { location: null, markdown: "ARB body", title: "ARBs" },
    ],
    related: [{ link: "ACE Inhibitors", path: "Pharmacology/Heart failure.md" }],
    summary: "done",
  };

  const first = await applyLibrarianPlan(plan, {
    createNote: async (input) => {
      created.push(input);
      return { id: `id-${created.length}`, path: `${input.folder}/${input.title}.md` };
    },
    findNote: (path) =>
      path === "Pharmacology/Heart failure.md" ? { content: "HF prose.", id: "hf-1", title: "Heart failure" } : null,
    recordSource: async (noteId, location) => {
      stamped.push({ location, noteId });
    },
    saveNote: async (input) => {
      saved.push({ content: input.content, id: input.id });
    },
  });

  assert.equal(first, "Pharmacology/Hypertension/ACE Inhibitors.md");
  assert.equal(created.length, 2);
  assert.deepEqual(stamped.map((stamp) => stamp.noteId), ["id-1", "id-2"]);
  assert.equal(saved.length, 1);
  assert.ok(saved[0]?.content.includes("- [[ACE Inhibitors]]"));
  assert.ok(saved[0]?.content.startsWith("HF prose."));
});

test("a failing provenance stamp or missing related note never sinks the pages", async () => {
  const plan: LibrarianPlan = {
    folder: "A",
    pages: [{ location: null, markdown: "m", title: "T" }],
    related: [{ link: "T", path: "gone.md" }],
    summary: "",
  };
  const first = await applyLibrarianPlan(plan, {
    createNote: async (input) => ({ id: "id-1", path: `${input.folder}/${input.title}.md` }),
    findNote: () => null,
    recordSource: async () => {
      throw new Error("permission denied");
    },
    saveNote: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(first, "A/T.md");
});
