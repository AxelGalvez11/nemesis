import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type CrawlLimits,
  type CrawlState,
  DEFAULT_LIMITS,
  enqueue,
  fileTypeOf,
  kindOf,
  newCrawl,
  normaliseUrl,
  roleOf,
  startCourse,
  takeNext,
  withinCourse,
} from "../src/lms/crawl.ts";

// The course ROOT. Folder listings hang off it at /cl/outline…, documents at
// /file/… — which is why a file URL must not be written under the folder route
// in these fixtures, or the folder test matches it and proves nothing.
const COURSE = "https://blackboard.uthsc.edu/ultra/courses/_1234_1";
const link = (href: string, text = "Week 1") => ({ href, text });
/** Blackboard-ish: anything under /cl/outline is a folder listing. */
const isFolder = (href: string) => href.includes("/cl/outline") || href.includes("/folder/");

// ── URLs ─────────────────────────────────────────────────────────────────────

test("the same place reached three ways is one place", () => {
  const a = normaliseUrl("https://x.edu/a/b?p=1&q=2");
  assert.equal(normaliseUrl("https://x.edu/a/b?q=2&p=1"), a, "query order does not make a new page");
  assert.equal(normaliseUrl("https://x.edu/a/b/?p=1&q=2"), a, "a trailing slash does not");
  assert.equal(normaliseUrl("https://x.edu/a/b?p=1&q=2#top"), a, "nor does a fragment");
});

test("anything that is not http(s) is not a place we go", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "mailto:a@b.c", "file:///etc/passwd", "nonsense"]) {
    assert.equal(normaliseUrl(href), null, href);
  }
});

test("relative links resolve against the page they were found on", () => {
  assert.equal(
    normaliseUrl("../file/_9_1", "https://x.edu/ultra/courses/_1_1/cl/outline"),
    "https://x.edu/ultra/courses/_1_1/file/_9_1",
  );
});

// ── Staying inside the course ────────────────────────────────────────────────

test("🔴 A CRAWL OF ONE COURSE NEVER WALKS INTO ANOTHER", () => {
  // Every Blackboard course page links to the student's other courses. Without
  // this, importing one course quietly imports all nine.
  assert.equal(withinCourse(COURSE, `${COURSE}/file/_9_1`), true);
  assert.equal(withinCourse(COURSE, "https://blackboard.uthsc.edu/ultra/courses/_9999_1/cl/outline"), false);
  assert.equal(withinCourse(COURSE, "https://blackboard.uthsc.edu/ultra/stream"), false);
});

test("a course id is not a prefix of a longer one", () => {
  const short = "https://x.edu/ultra/courses/_12_1";
  assert.equal(withinCourse(short, "https://x.edu/ultra/courses/_1234_1/x"), false);
  assert.equal(withinCourse(short, "https://x.edu/ultra/courses/_12_1/x"), true);
});

test("another origin is out, however similar it looks", () => {
  assert.equal(withinCourse(COURSE, "https://blackboard.uthsc.edu.evil.com/ultra/courses/_1234_1/x"), false);
  assert.equal(withinCourse(COURSE, "http://blackboard.uthsc.edu/ultra/courses/_1234_1/x"), false);
});

// ── What a link is ───────────────────────────────────────────────────────────

test("file types come from the path, never from a query parameter", () => {
  assert.equal(fileTypeOf("https://x.edu/a/lecture.PDF"), "pdf");
  assert.equal(fileTypeOf("https://x.edu/a/deck.pptx?download=1"), "pptx");
  assert.equal(fileTypeOf("https://x.edu/a/page?type=pdf"), undefined, "a query is about, not is");
  assert.equal(fileTypeOf("https://x.edu/a/folder"), undefined);
  assert.equal(fileTypeOf("https://x.edu/a/.hidden"), undefined, "a dotfile has no extension");
});

test("a readable extension is a file; everything else on the portal is a page", () => {
  assert.equal(kindOf("https://x.edu/a/notes.pdf"), "file");
  assert.equal(kindOf("https://x.edu/a/slides.pptx"), "file");
  assert.equal(kindOf("https://x.edu/ultra/courses/_1_1/outline/item/_5_1"), "page");
});

test("a link with no words on it is ignored — a student cannot pick a blank", () => {
  assert.equal(roleOf(link(`${COURSE}/file/_9_1`, "   "), COURSE, isFolder), "ignore");
});

test("folders and documents are told apart by route, not by wording", () => {
  assert.equal(roleOf(link(`${COURSE}/cl/outline/sub`), COURSE, isFolder), "folder");
  assert.equal(roleOf(link(`${COURSE}/file/_9_1`, "Enzyme kinetics"), COURSE, isFolder), "document");
  assert.equal(roleOf(link("https://elsewhere.com/x", "Anything"), COURSE, isFolder), "ignore");
});

test("FIELD-AGNOSTIC: no subject word changes any decision", () => {
  const asLaw = roleOf(link(`${COURSE}/file/_9_1`, "Contract Law reading"), COURSE, isFolder);
  const asEng = roleOf(link(`${COURSE}/file/_9_1`, "Statics problem set"), COURSE, isFolder);
  assert.equal(asLaw, asEng);
});

// ── The frontier ─────────────────────────────────────────────────────────────

test("a course starts with itself queued once", () => {
  const state = startCourse(newCrawl(), COURSE);
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0]?.depth, 0);
  assert.deepEqual(state.queue[0]?.folder, []);
});

test("🔴 A LINK CYCLE COSTS ONE VISIT, NOT INFINITE ONES", () => {
  // A links to B, B links back to A. Without the seen-set this never ends.
  let state = startCourse(newCrawl(), COURSE);
  const root = state.queue[0]!;
  state = enqueue(state, root, link(`${COURSE}/cl/outline/b`, "B"), COURSE);
  assert.equal(state.queue.length, 2);
  const b = state.queue[1]!;
  state = enqueue(state, b, link(COURSE, "back to A"), COURSE);
  state = enqueue(state, b, link(`${COURSE}/cl/outline/b`, "B again"), COURSE);
  assert.equal(state.queue.length, 2, "neither the root nor B is queued a second time");
});

test("the folder path grows as the walk goes deeper", () => {
  let state = startCourse(newCrawl(), COURSE);
  state = enqueue(state, state.queue[0]!, link(`${COURSE}/cl/outline/w3`, "Week 3"), COURSE);
  const week3 = state.queue[1]!;
  state = enqueue(state, week3, link(`${COURSE}/cl/outline/w3/lec`, "Lectures"), COURSE);
  assert.deepEqual(state.queue[2]?.folder, ["Week 3", "Lectures"]);
  assert.equal(state.queue[2]?.depth, 2);
});

test("depth is capped, so a self-nesting portal terminates", () => {
  const limits: CrawlLimits = { ...DEFAULT_LIMITS, maxDepth: 2 };
  let state = startCourse(newCrawl(), COURSE);
  let from = state.queue[0]!;
  for (let i = 0; i < 6; i += 1) {
    state = enqueue(state, from, link(`${COURSE}/cl/outline/l${i}`, `L${i}`), COURSE, limits);
    const queued = state.queue[state.queue.length - 1]!;
    if (queued.depth > limits.maxDepth) assert.fail("queued past the depth cap");
    from = queued;
  }
  assert.equal(state.queue.every((t) => t.depth <= limits.maxDepth), true);
});

test("a wide page cannot queue more than the budget can pay for", () => {
  const limits: CrawlLimits = { ...DEFAULT_LIMITS, maxPagesPerCourse: 5 };
  let state = startCourse(newCrawl(), COURSE);
  const root = state.queue[0]!;
  for (let i = 0; i < 200; i += 1) {
    state = enqueue(state, root, link(`${COURSE}/cl/outline/f${i}`, `F${i}`), COURSE, limits);
  }
  assert.ok(state.queue.length <= limits.maxPagesPerCourse, `queued ${state.queue.length}`);
});

test("takeNext is breadth-first, so recognisable folders come before deep ones", () => {
  let state = startCourse(newCrawl(), COURSE);
  const root = state.queue[0]!;
  state = enqueue(state, root, link(`${COURSE}/cl/outline/a`, "A"), COURSE);
  state = enqueue(state, root, link(`${COURSE}/cl/outline/b`, "B"), COURSE);
  const first = takeNext(state)!;
  assert.equal(first.target.url, normaliseUrl(COURSE));
  const second = takeNext(first.next)!;
  assert.deepEqual(second.target.folder, ["A"]);
});

test("takeNext stops at the per-course cap and at the total cap", () => {
  const perCourse: CrawlState = { ...newCrawl(), pagesThisCourse: 40, queue: [{ depth: 0, folder: [], url: COURSE }] };
  assert.equal(takeNext(perCourse), null);
  const total: CrawlState = { ...newCrawl(), pagesTotal: 240, queue: [{ depth: 0, folder: [], url: COURSE }] };
  assert.equal(takeNext(total), null);
});

test("the total budget survives moving to the next course, the per-course one resets", () => {
  const after: CrawlState = { ...newCrawl(), pagesThisCourse: 12, pagesTotal: 30 };
  const next = startCourse(after, "https://blackboard.uthsc.edu/ultra/courses/_2_1/cl/outline");
  assert.equal(next.pagesThisCourse, 0);
  assert.equal(next.pagesTotal, 30);
});

test("an unusable course url yields nothing to do rather than throwing", () => {
  const state = startCourse(newCrawl(), "javascript:alert(1)");
  assert.equal(state.queue.length, 0);
  assert.equal(takeNext(state), null);
});
