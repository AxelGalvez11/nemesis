import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LIMITS, newCrawl, type CrawlLink } from "../src/lms/crawl.ts";
import { folderRule, walkCourse } from "../src/lms/walk.ts";

const COURSE = "https://school.instructure.com/courses/42";
const canvasFolders = folderRule("canvas");

/** A fake portal: a map of page URL to the links on that page. */
function portal(pages: Record<string, readonly CrawlLink[]>) {
  const reads: string[] = [];
  return {
    reads,
    linksOn: async (url: string) => {
      reads.push(url);
      // The fake is keyed on the URL as the walk normalises it (no trailing
      // slash), which is also how a real portal would answer either form.
      return pages[url] ?? pages[`${url}/`] ?? null;
    },
  };
}

const link = (text: string, href: string): CrawlLink => ({ href, text });

test("walks into a folder and returns what is inside it", async () => {
  const fake = portal({
    [COURSE]: [link("Modules", `${COURSE}/modules`)],
    [`${COURSE}/modules`]: [link("Lecture 1", `${COURSE}/files/9/lecture1.pdf`)],
  });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0]?.title, "Lecture 1");
  assert.equal(result.documents[0]?.kind, "file");
  assert.equal(result.documents[0]?.fileType, "pdf");
});

test("the folder path is carried down, outermost first", async () => {
  const fake = portal({
    [COURSE]: [link("Modules", `${COURSE}/modules`)],
    [`${COURSE}/modules`]: [link("Week 3", `${COURSE}/pages/week-3`)],
    [`${COURSE}/pages/week-3`]: [link("Reading", `${COURSE}/files/1/reading.pdf`)],
  });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.deepEqual(result.documents[0]?.folder, ["Modules", "Week 3"]);
});

test("the same document linked from two folders is kept once", async () => {
  const shared = `${COURSE}/files/7/syllabus.pdf`;
  const fake = portal({
    [COURSE]: [link("Modules", `${COURSE}/modules`), link("Pages", `${COURSE}/pages`)],
    [`${COURSE}/modules`]: [link("Syllabus", shared)],
    [`${COURSE}/pages`]: [link("Syllabus again", shared)],
  });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.equal(result.documents.length, 1);
});

test("a page that will not load is skipped, and the walk carries on", async () => {
  const fake = portal({
    [COURSE]: [link("Locked", `${COURSE}/modules`), link("Open", `${COURSE}/pages`)],
    // `${COURSE}/modules` is absent from the map — linksOn answers null.
    [`${COURSE}/pages`]: [link("Notes", `${COURSE}/files/2/notes.pdf`)],
  });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.equal(result.documents.length, 1, "the readable folder still produced its document");
  assert.equal(result.documents[0]?.title, "Notes");
});

test("links outside the course are ignored", async () => {
  const fake = portal({
    [COURSE]: [
      link("Another course", "https://school.instructure.com/courses/99/files/1/x.pdf"),
      link("The library", "https://library.example.edu/handbook.pdf"),
      link("Ours", `${COURSE}/files/3/ours.pdf`),
    ],
  });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.deepEqual(result.documents.map((doc) => doc.title), ["Ours"]);
});

test("running out of budget reports truncated rather than pretending to be complete", async () => {
  // Every page offers one more folder, so the frontier never empties.
  const endless: WalkFake = {
    linksOn: async (url: string) => [link("Deeper", `${url.replace(/\/$/, "")}/modules`)],
  };
  const limits = { ...DEFAULT_LIMITS, maxPagesPerCourse: 3 };
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: endless.linksOn }, newCrawl(), limits);

  assert.equal(result.truncated, true);
});

test("a finished walk is not marked truncated", async () => {
  const fake = portal({ [COURSE]: [link("Notes", `${COURSE}/files/4/n.pdf`)] });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.equal(result.truncated, false);
});

test("progress is reported as it goes, not only at the end", async () => {
  const fake = portal({
    [COURSE]: [link("Modules", `${COURSE}/modules`)],
    [`${COURSE}/modules`]: [link("Slides", `${COURSE}/files/5/s.pptx`)],
  });
  const seen: number[] = [];
  await walkCourse(COURSE, {
    isFolderHref: canvasFolders,
    linksOn: fake.linksOn,
    onProgress: (documents) => seen.push(documents),
  });

  assert.ok(seen.length >= 2, "called once per page read");
  assert.equal(seen.at(-1), 1);
});

test("a link with no words on it is not a document a student could choose", async () => {
  const fake = portal({ [COURSE]: [link("   ", `${COURSE}/files/6/mystery.pdf`)] });
  const result = await walkCourse(COURSE, { isFolderHref: canvasFolders, linksOn: fake.linksOn });

  assert.equal(result.documents.length, 0);
});

// ── folderRule ───────────────────────────────────────────────────────────────

test("a Canvas modules route is a folder", () => {
  assert.equal(canvasFolders(`${COURSE}/modules`), true);
});

test("a file sitting on a folder-shaped route is a DOCUMENT, not a folder", () => {
  // The trap: /files/ matches the Canvas folder route, but this is a PDF.
  assert.equal(canvasFolders(`${COURSE}/files/9/lecture1.pdf`), false);
});

test("an unknown portal treats nothing as a folder", () => {
  const unknown = folderRule("unknown");
  assert.equal(unknown(`${COURSE}/modules`), false);
});

test("Blackboard Ultra has no folder URLs to walk, by design", () => {
  const blackboard = folderRule("blackboard");
  // Classic Blackboard's content tree IS walkable.
  assert.equal(blackboard("https://bb.example.edu/webapps/blackboard/content/listContent.jsp?course_id=_1_1"), true);
  // Ultra's folders are aria-expanded buttons with no href — nothing here can
  // reach them, and this rule must not pretend otherwise.
  assert.equal(blackboard("https://bb.example.edu/ultra/courses/_38534_1/cl/outline"), false);
});

interface WalkFake {
  linksOn: (url: string) => Promise<readonly CrawlLink[] | null>;
}
