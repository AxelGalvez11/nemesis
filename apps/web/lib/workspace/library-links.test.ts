import assert from "node:assert/strict";

import {
  backlinksFor,
  extractLibraryLinks,
  findLibraryNote,
  normalizeLibraryFolder,
  notePathFor,
  obsidianTagsToMarkdown,
  wikiLinksToMarkdown,
} from "./library-links";
import type { CloudLibraryNote } from "./library-tree";

const notes: CloudLibraryNote[] = [
  { id: "a", path: "Cardiology/ACE inhibitors.md", title: "ACE inhibitors", content: "See [[ARBs]].", updatedAt: "" },
  { id: "b", path: "Cardiology/ARBs.md", title: "ARBs", content: "Back to [[ACE inhibitors|ACEIs]].", updatedAt: "" },
];

assert.deepEqual(extractLibraryLinks("[[ARBs]] and [[ACE inhibitors|ACEIs]] and [[ARBs]]"), [
  { target: "ARBs", label: "ARBs" },
  { target: "ACE inhibitors", label: "ACEIs" },
]);
assert.equal(findLibraryNote(notes, "Cardiology/ARBs")?.id, "b");
assert.equal(findLibraryNote(notes, "arbs.md")?.id, "b");
assert.deepEqual(backlinksFor(notes, notes[0]!).map((note) => note.id), ["b"]);
assert.equal(notePathFor("ACE: overview", "Pharm / Week 1"), "Pharm/Week 1/ACE- overview.md");
assert.equal(normalizeLibraryFolder(" / Pharm \\ Week 1 / "), "Pharm/Week 1");
assert.equal(wikiLinksToMarkdown("Read [[ACE inhibitors|ACEIs]]."), "Read [ACEIs](#nemesis-note=ACE%20inhibitors).");

assert.equal(
  obsidianTagsToMarkdown("Research #cardiology and #heart-failure"),
  "Research [#cardiology](#nemesis-tag=cardiology) and [#heart-failure](#nemesis-tag=heart-failure)",
);
assert.equal(obsidianTagsToMarkdown("# Heading"), "# Heading");
assert.equal(obsidianTagsToMarkdown("```\n#code\n```"), "```\n#code\n```");
assert.equal(
  obsidianTagsToMarkdown("tags: [pharmacy, spaced tag]"),
  "[#pharmacy](#nemesis-tag=pharmacy) [#spaced-tag](#nemesis-tag=spaced-tag)",
);

console.log("library-links.test.ts OK");
