import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ULTRA_DEFAULTS,
  ULTRA_EXPANDER_ANALYTICS_IDS,
  ULTRA_EXPANDER_ID_PREFIXES,
  ULTRA_EXPANDER_SELECTOR,
  revealWholeOutline,
  expansionAllowance,
  ultraFolderName,
  type UltraLimits,
} from "../src/lms/ultra.ts";

// ── The name ─────────────────────────────────────────────────────────────────

test("the folder name is what follows the type prefix", () => {
  // Verbatim from the owner's portal, 2026-08-02.
  assert.equal(ultraFolderName("Folder, Basics of Sterile Compounding"), "Basics of Sterile Compounding");
  assert.equal(ultraFolderName("Learning Module, Environmental Monitoring"), "Environmental Monitoring");
  assert.equal(ultraFolderName("Folder, USP 797"), "USP 797");
});

test("the prefix is stripped by POSITION, so a portal in any language works", () => {
  // Spanish Blackboard says "Carpeta". A rule that matched the English word
  // "Folder" would hand back the whole label and put every Spanish folder
  // under a name beginning "Carpeta,".
  assert.equal(ultraFolderName("Carpeta, Farmacología"), "Farmacología");
  assert.equal(ultraFolderName("Dossier, Chimie organique"), "Chimie organique");
});

test("a name containing a comma keeps the rest of itself", () => {
  assert.equal(ultraFolderName("Folder, Ethics, Law and Practice"), "Ethics, Law and Practice");
});

test("a label with no comma is kept whole rather than emptied", () => {
  // An empty folder name would merge two different folders into one path.
  assert.equal(ultraFolderName("Sterile Compounding"), "Sterile Compounding");
});

test("a label that is only a prefix does not become empty", () => {
  assert.equal(ultraFolderName("Folder,"), "Folder,");
});

// ── Which buttons ────────────────────────────────────────────────────────────

test("only the two content expanders are targeted", () => {
  assert.deepEqual(ULTRA_EXPANDER_ANALYTICS_IDS, [
    "content.item.folder.toggleFolder.button",
    "course.learning.module.base.item.toggleLm.button",
  ]);
});

test("🔴 selects on data-analytics-id, NEVER data-testid", () => {
  // Measured on the live portal: of twelve expanders on a real course page,
  // zero carry data-testid and twelve carry data-analytics-id. A selector on
  // data-testid matches nothing, on every Ultra course, and fails SILENTLY as
  // "this course has no documents".
  assert.ok(ULTRA_EXPANDER_SELECTOR.includes("data-analytics-id"));
  assert.ok(!ULTRA_EXPANDER_SELECTOR.includes("data-testid"));
});

test("the stable id prefix is a second way in, if the vendor renames a hook", () => {
  assert.deepEqual(ULTRA_EXPANDER_ID_PREFIXES, ["folder-title-", "learning-module-title-"]);
  for (const prefix of ULTRA_EXPANDER_ID_PREFIXES) {
    assert.ok(ULTRA_EXPANDER_SELECTOR.includes(`button[id^="${prefix}"]`));
  }
});

test("the selector takes only COLLAPSED expanders, and no other disclosure", () => {
  assert.ok(ULTRA_EXPANDER_SELECTOR.includes('aria-expanded="false"'));
  // Measured on the same page and deliberately excluded: clicking these opens
  // a staff list and a help flyout, neither of which holds a document.
  assert.ok(!ULTRA_EXPANDER_SELECTOR.includes("courseOverviewInstructorListComponent"));
  assert.ok(!ULTRA_EXPANDER_SELECTOR.includes("pagehelp"));
});

// ── The stopping rule ────────────────────────────────────────────────────────

test("the allowance never goes negative", () => {
  assert.equal(expansionAllowance(500, { ...ULTRA_DEFAULTS, maxExpansions: 10 }), 0);
});

// ── The loop ─────────────────────────────────────────────────────────────────

/** A fake course tree: opening a folder can reveal children. */
function fakeCourse(tree: Record<string, readonly string[]>, roots: readonly string[]) {
  const open = new Set<string>();
  const visible = () => {
    const out: string[] = [...roots];
    for (const name of out) {
      if (open.has(name)) out.push(...(tree[name] ?? []));
    }
    return out.filter((name) => !open.has(name));
  };
  return {
    open,
    collapsed: () => visible().map((label) => ({
      isOpen: () => open.has(label),
      label,
      open: () => open.add(label),
    })),
  };
}

/** A course with no lazy lists — for the tests that are only about folders. */
const noPaging = { loadMore: () => [], rowCount: () => 0 };

/**
 * A wait that answers immediately. Real waits are driven by MutationObserver;
 * in a test the predicate is already settled by the time it is asked.
 */
const answerNow = async (predicate: () => boolean) => predicate();

test("opens nested folders that only appear once their parent is open", async () => {
  const course = fakeCourse({ "Week 1": ["Lecture slides"] }, ["Week 1", "Syllabus"]);
  const result = await revealWholeOutline({ collapsed: course.collapsed, ...noPaging, waitUntil: answerNow });

  assert.ok(course.open.has("Week 1"));
  assert.ok(course.open.has("Lecture slides"), "the child only existed after the parent opened");
  assert.equal(result.truncated, false);
});

test("stops when everything is open, without spinning", async () => {
  const course = fakeCourse({}, ["A", "B"]);
  const result = await revealWholeOutline({ collapsed: course.collapsed, ...noPaging, waitUntil: answerNow });

  assert.equal(result.openedTotal, 2);
  assert.ok(result.rounds <= 2);
});

test("a cascade that never ends is stopped, and says it was cut short", async () => {
  // Every folder reveals another, forever.
  let n = 0;
  const deps = {
    collapsed: () => [{ isOpen: () => false, label: `Folder ${n}`, open: () => { n += 1; } }],
    ...noPaging,
    waitUntil: answerNow,
  };
  const result = await revealWholeOutline(deps, {
    ...ULTRA_DEFAULTS,
    maxClickAttempts: 1,
    maxExpansions: 5,
    maxRounds: 99,
  });

  assert.equal(result.truncated, true, "folders remained shut when the budget ran out");
});

test("a folder that throws on click does not abort the course", async () => {
  const opened: string[] = [];
  let done = false;
  const deps = {
    collapsed: () => (done ? [] : [
      { isOpen: () => false, label: "Broken", open: () => { throw new Error("detached"); } },
      { isOpen: () => done, label: "Good", open: () => { opened.push("Good"); done = true; } },
    ]),
    ...noPaging,
    waitUntil: answerNow,
  };
  await revealWholeOutline(deps, ULTRA_DEFAULTS);

  assert.deepEqual(opened, ["Good"]);
});

test("progress is reported per round", async () => {
  const course = fakeCourse({ "Week 1": ["Slides"] }, ["Week 1"]);
  const seen: number[] = [];
  await revealWholeOutline({
    collapsed: course.collapsed,
    ...noPaging,
    onRound: (total) => seen.push(total),
    waitUntil: answerNow,
  });

  assert.ok(seen.length >= 1);
  assert.equal(seen.at(-1), 2);
});

// ── 🔴 A CLICK THAT DOES NOT TAKE ────────────────────────────────────────────
//
// Measured on the owner's live course: two folders stayed shut after being
// clicked while their neighbours opened from the same loop. Ultra rebuilds the
// outline as folders open, so a click can land on a node that is no longer
// there. The old code counted the click and moved on, which lost the folder.

test("a folder whose first click is swallowed is clicked again", async () => {
  let clicks = 0;
  let isOpen = false;
  const deps = {
    // The first click does nothing at all, exactly as observed.
    collapsed: () => (isOpen ? [] : [{
      isOpen: () => isOpen,
      label: "Exam 7 (Lectures 34-39)",
      open: () => { clicks += 1; if (clicks >= 2) isOpen = true; },
    }]),
    ...noPaging,
    waitUntil: answerNow,
  };
  const result = await revealWholeOutline(deps, ULTRA_DEFAULTS);

  assert.equal(clicks, 2, "it noticed the folder had not opened and asked again");
  assert.equal(result.openedTotal, 1);
  assert.equal(result.refused, 0);
});

test("a folder that never opens is counted as refused, not as opened", async () => {
  const deps = {
    collapsed: () => [{ isOpen: () => false, label: "Stuck", open: () => {} }],
    ...noPaging,
    waitUntil: answerNow,
  };
  const result = await revealWholeOutline(deps, { ...ULTRA_DEFAULTS, maxRounds: 1 });

  assert.equal(result.openedTotal, 0, "a click is not evidence that a folder opened");
  assert.equal(result.refused, 1, "the student is owed an honest count of what was missed");
});

test("folders are opened one at a time, each confirmed before the next", async () => {
  // The old code clicked every folder in a tight loop and waited once, which
  // both hid the dropped clicks and fired a dozen requests at the school's
  // server in the same millisecond.
  const order: string[] = [];
  const open = new Set<string>();
  const deps = {
    collapsed: () => ["A", "B", "C"].filter((n) => !open.has(n)).map((label) => ({
      isOpen: () => open.has(label),
      label,
      open: () => { order.push(`click ${label}`); open.add(label); },
    })),
    ...noPaging,
    waitUntil: async (predicate: () => boolean) => { order.push("wait"); return predicate(); },
  };
  await revealWholeOutline(deps, ULTRA_DEFAULTS);

  assert.deepEqual(order.slice(0, 4), ["click A", "wait", "click B", "wait"]);
});

// ── The document row, measured with a folder open ────────────────────────────

import {
  ULTRA_DOCUMENT_SELECTOR,
  ULTRA_INDENT_PX,
  ULTRA_OVERFLOW_MENU_ID_PREFIX,
  ultraDocumentTitle,
  ultraFileTypeFromTitle,
  ultraFolderPath,
} from "../src/lms/ultra.ts";

test("🔴 the expander sweep must never catch a row's overflow menu", () => {
  // Every document row has its own aria-expanded "More options" button. A
  // general disclosure sweep opens a context menu on each document forever and
  // finds no folders at all.
  assert.ok(!ULTRA_EXPANDER_SELECTOR.includes(ULTRA_OVERFLOW_MENU_ID_PREFIX));
  assert.ok(ULTRA_EXPANDER_SELECTOR.includes("data-analytics-id"));
});

test("the file type comes from the TITLE, because the URL has no extension", () => {
  // Measured href: …/outline/file/_2017715_1 — an opaque id. Reading the type
  // from the URL files a PDF as a web page.
  assert.equal(ultraFileTypeFromTitle("Basics of Sterile Compounding.pdf"), "pdf");
  assert.equal(ultraFileTypeFromTitle("Week 3 slides.pptx"), "pptx");
});

test("a trailing version number is not a file type", () => {
  assert.equal(ultraFileTypeFromTitle("Lecture 3.2"), undefined);
  assert.equal(ultraFileTypeFromTitle("Handout"), undefined);
});

test("the shown title drops the extension a student does not need", () => {
  assert.equal(ultraDocumentTitle("Basics of Sterile Compounding.pdf"), "Basics of Sterile Compounding");
  assert.equal(ultraDocumentTitle("Handout"), "Handout");
});

test("folder path is read from INDENT, because the list is flat", () => {
  // Exactly the shape measured: two top-level folders, and one document that
  // belongs to the second — a sibling in the DOM, a child on screen.
  const rows = [
    { folderName: "D4 II Syllabus", indentPx: 33 },
    { folderName: "Basics of Sterile Compounding", indentPx: 33 },
    { indentPx: 33 + ULTRA_INDENT_PX },
  ];
  assert.deepEqual(ultraFolderPath(rows, 2), ["Basics of Sterile Compounding"]);
});

test("a top-level document has no folder path", () => {
  assert.deepEqual(ultraFolderPath([{ indentPx: 33 }], 0), []);
});

test("a document nested two deep names both folders, outermost first", () => {
  const rows = [
    { folderName: "Week 1", indentPx: 33 },
    { folderName: "Lectures", indentPx: 63 },
    { indentPx: 93 },
  ];
  assert.deepEqual(ultraFolderPath(rows, 2), ["Week 1", "Lectures"]);
});

test("a later sibling folder does not steal the previous folder's children", () => {
  const rows = [
    { folderName: "Week 1", indentPx: 33 },
    { indentPx: 63 },
    { folderName: "Week 2", indentPx: 33 },
    { indentPx: 63 },
  ];
  assert.deepEqual(ultraFolderPath(rows, 1), ["Week 1"]);
  assert.deepEqual(ultraFolderPath(rows, 3), ["Week 2"]);
});

test("the document link is found by its own analytics id", () => {
  assert.ok(ULTRA_DOCUMENT_SELECTOR.includes("content.item.course.outline.courseContent.link"));
});

// ── Pagination ───────────────────────────────────────────────────────────────

import { ULTRA_LOAD_MORE_SELECTOR } from "../src/lms/ultra.ts";

/**
 * A course where EACH FOLDER paginates its own children.
 *
 * This is the shape measured on the owner's live course, and the shape the old
 * two-pass code got wrong: on a cold page there are no load-more controls at
 * all, because they live inside folders and do not exist until a folder opens.
 */
function foldersWithOwnPaging(sizes: Record<string, number>, pageSize = 10) {
  const open = new Set<string>();
  const shown: Record<string, number> = {};
  const names = Object.keys(sizes);
  return {
    shown,
    deps: {
      collapsed: () => names.filter((n) => !open.has(n)).map((label) => ({
        isOpen: () => open.has(label),
        label,
        // Opening a folder reveals its FIRST PAGE only.
        open: () => { open.add(label); shown[label] = Math.min(pageSize, sizes[label] ?? 0); },
      })),
      // A control exists only for an OPEN folder that still has more.
      loadMore: () => names.filter((n) => open.has(n) && (shown[n] ?? 0) < (sizes[n] ?? 0)).map((n) => ({
        click: () => { shown[n] = Math.min((shown[n] ?? 0) + pageSize, sizes[n] ?? 0); },
      })),
      rowCount: () => names.reduce((total, n) => total + (shown[n] ?? 0), 0),
      waitUntil: answerNow,
    },
  };
}

test("🔴 a folder holding more than one page gives up ALL of it", async () => {
  // The exact undercount measured from a cold load: three of the owner's eight
  // lecture folders stopped dead at ten items, because paging ran before the
  // folders were open and so found nothing to click.
  const course = foldersWithOwnPaging({ "Exam 2": 15, "Exam 5": 21, "Exam 8": 16 });
  const result = await revealWholeOutline(course.deps);

  assert.deepEqual(course.shown, { "Exam 2": 15, "Exam 5": 21, "Exam 8": 16 });
  assert.equal(result.rows, 52, "not 30, which is what stopping at one page each gives");
  assert.equal(result.truncated, false);
});

test("a folder revealed by paging is itself opened and paged", async () => {
  // Paging can surface more folders, which is why the two must interleave
  // rather than run once each.
  const open = new Set<string>();
  let secondPageLoaded = false;
  const deps = {
    collapsed: () => (open.has("Week 1") ? [] : [{
      isOpen: () => open.has("Week 1"),
      label: "Week 1",
      open: () => open.add("Week 1"),
    }]).concat(
      secondPageLoaded && !open.has("Week 2") ? [{
        isOpen: () => open.has("Week 2"),
        label: "Week 2",
        open: () => open.add("Week 2"),
      }] : [],
    ),
    loadMore: () => (open.has("Week 1") && !secondPageLoaded
      ? [{ click: () => { secondPageLoaded = true; } }]
      : []),
    rowCount: () => (open.has("Week 1") ? 10 : 0) + (secondPageLoaded ? 10 : 0) + (open.has("Week 2") ? 5 : 0),
    waitUntil: answerNow,
  };
  const result = await revealWholeOutline(deps);

  assert.ok(open.has("Week 2"), "the folder that only appeared on page two was opened too");
  assert.equal(result.truncated, false);
});

test("a course with nothing to page waits for nothing", async () => {
  let waits = 0;
  const course = fakeCourse({}, ["A"]);
  const result = await revealWholeOutline({
    collapsed: course.collapsed,
    loadMore: () => [],
    rowCount: () => 1,
    waitUntil: async (predicate: () => boolean) => { waits += 1; return predicate(); },
  });

  assert.equal(result.truncated, false);
  // One wait to confirm A opened. Never a wait on an empty list.
  assert.equal(waits, 1);
});

test("an outline that never stops growing is bounded, and says so", async () => {
  let rows = 10;
  const result = await revealWholeOutline(
    {
      collapsed: () => [],
      loadMore: () => [{ click: () => { rows += 10; } }],
      rowCount: () => rows,
      waitUntil: answerNow,
    },
    { ...ULTRA_DEFAULTS, maxRounds: 3 },
  );

  assert.equal(result.rounds, 3);
  assert.equal(result.truncated, true);
});

test("the growth test needs no button text, so it works in any language", () => {
  // The two states ("No more content items to load" / "Load 10 more content
  // items") share one analytics id and differ only in English words.
  assert.ok(ULTRA_LOAD_MORE_SELECTOR.includes("loadMoreButton"));
  assert.ok(!/No more|Load \d/.test(ULTRA_LOAD_MORE_SELECTOR));
});
