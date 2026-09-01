import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the sidebar's three named groups, and the one that may never hide ────────────────────────
//
// Owner 2026-08-24: *"use the ChatGPT sidebar, how it organizes the chats and projects and
// folders so that we can do the same in the sidebar for nemesis."* Read off the reference the
// same day: three quiet grey labels — `Pinned`, `Projects`, `Chats` — each over its own rows.
//
// 🔴 THE ROWS WERE ALREADY IN THIS ORDER. What was missing was that anything SAID so. Pinned
// canvases, folders and loose canvases all shared one "Canvases" header, so the ordering was a
// rule that existed only in the code: nothing on screen told a learner the top rows were the
// pinned ones, and a folder sat in the same undifferentiated column as a canvas. These guards
// pin the grouping, and — more importantly — which groups are allowed to disappear.
//
// 🔴🔴 THE MIDDLE HEADER READ "Folders" UNTIL 2026-08-26, WHEN THE OWNER RENAMED IT: *"the
// projects in Sidebar are still called folders, and not projects."* These guards moved with it.
// The thing they protect never changed — an unconditional middle group carrying the only create
// button, in second place — so they are repointed at the new label rather than rewritten, and the
// old one is named here so a `git log -S` on either word finds this file.
//
// 🔴 THE CODE STILL SAYS `folder` EVERYWHERE AND THAT IS DELIBERATE. `Folder`, `folderId` and
// `createFolder` are the data layer's names and a rename there would be a migration. What the
// learner READS is what moved, which is why these assertions read labels and the ones about
// `rootFolders` and `newFolderButton` do not.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SIDEBAR = strip(readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8"));
const PRIMITIVES = strip(readFileSync(new URL("./sidebar-primitives.tsx", import.meta.url), "utf8"));

/** Index of `needle`, asserting it exists rather than quietly returning -1 and comparing numbers. */
const at = (haystack: string, needle: string): number => {
  const index = haystack.indexOf(needle);
  assert.notEqual(index, -1, `\`${needle}\` is gone from the sidebar — this guard is pointed at nothing`);
  return index;
};

test("🔴 the list is three named groups, not one run of rows", () => {
  for (const label of ['label="Pinned"', 'label="Projects"', 'label="Canvases"']) {
    assert.ok(SIDEBAR.includes(label), `${label} is gone — the groups collapsed back into one list`);
  }
});

test("🔴🔴🔴 the Projects header is UNCONDITIONAL, because it carries the only way to make one", () => {
  // The failure this prevents is a dead end, not a cosmetic one. The "New project" button lives in
  // this header and nowhere else. Hide the header until a project exists and a learner with no
  // projects can never create the first one — and a learner who has filed every canvas away loses
  // the button too, because `unfiled` is empty and the Canvases group is gone as well.
  //
  // Calibration: wrap the header in `{rootFolders.length > 0 ? (` and this reddens, because the
  // conditional then opens BEFORE the label instead of after it.
  const header = at(SIDEBAR, 'label="Projects"');
  // The body's conditional grew a collapse gate 2026-08-30 and became a `<Reveal>` that ANIMATES
  // 2026-09-01; the invariant is unchanged through both — the HEADER stands before and outside
  // whatever decides whether rows render under it.
  const list = at(SIDEBAR, '<Reveal open={!closedSections.has("projects")}>');
  assert.ok(header < list, "the Projects header moved inside its own conditional — the New project button can now be unreachable");

  const buttons = SIDEBAR.match(/action=\{newFolderButton\}/g) ?? [];
  assert.equal(buttons.length, 1, "the New project action is no longer on exactly one header");
  const folderHeaderStart = SIDEBAR.lastIndexOf("<SidebarSectionHeader", header);
  assert.match(
    SIDEBAR.slice(folderHeaderStart, header),
    /action=\{newFolderButton\}/,
    "the New project button left the Projects header",
  );
});

test("🔴 nothing a learner READS in this sidebar calls a project a folder", () => {
  // Owner 2026-08-26. The product had two names for one object: a `Projects` row in the nav, a
  // `/projects` route and a `ProjectsPage`, with this list calling the same thing a folder. Both
  // words were on screen at once.
  //
  // 🔴 IT READS ONLY THE STRINGS A PERSON SEES, which is why the whole file cannot simply be
  // grepped: `folderId`, `createFolder` and `kind: "folder"` are still correct and still there.
  const visible = [
    ...SIDEBAR.matchAll(/(?:aria-label|title|label|confirmLabel)=?[:=]?\s*"([^"]+)"/g),
  ].map((match) => match[1] ?? "");
  const menuText = [...SIDEBAR.matchAll(/>([A-Z][^<>{}]*?)<\/DropdownMenuItem>/g)].map((match) => (match[1] ?? "").trim());
  for (const phrase of [...visible, ...menuText]) {
    assert.ok(!/folder/i.test(phrase), `"${phrase}" still says folder to the learner`);
  }
  // And the create flow names the new row after the object it makes, not after the table it
  // lives in: an untitled project used to arrive on screen called "New folder".
  assert.ok(SIDEBAR.includes('createFolder(userId, "New project"'), "a new project is named after the table again");
});

test("🔴 Pinned and Canvases ARE conditional — no heading over nothing", () => {
  // A header with no rows under it reads as a list that failed to load, which is a worse lie than
  // an absent section. Both of these open their conditional BEFORE their label; Projects does not.
  // Pinned exists when either kind of pin does — a pinned PROJECT alone must still summon it.
  assert.ok(
    at(SIDEBAR, "{pinned.length > 0 || pinnedFolders.length > 0 ? (") < at(SIDEBAR, 'label="Pinned"'),
    "an empty Pinned header can now render",
  );
  assert.ok(at(SIDEBAR, "{unfiled.length > 0 ? (") < at(SIDEBAR, 'label="Canvases"'), "an empty Canvases header can now render");
});

test("🔴 every section header collapses, and the collapse persists (owner 2026-08-30)", () => {
  // His report named this exactly: "the canvases or projects or pinned things being collapsable".
  // The reference's Pinned/Projects/Chats headers are all buttons with a hover caret; collapse
  // hides the ROWS and never the header, and the choice survives a reload the same way open
  // folders do — stored as the CLOSED set, so a section that did not exist yet defaults open.
  assert.ok(!SIDEBAR.includes("collapsible={false}"), "a section header went back to being dead to clicks");
  for (const section of ['toggleSection("pinned")', 'toggleSection("projects")', 'toggleSection("canvases")']) {
    assert.ok(SIDEBAR.includes(section), `${section} is gone — that header no longer collapses`);
  }
  assert.match(SIDEBAR, /const CLOSED_SECTIONS_KEY = "nemesis\.sidebar\.canvases\.v1\.closedSections";/, "the collapse choice no longer persists");
  // 🔴 AND SINCE 2026-09-01 A SECTION GROWS SHUT RATHER THAN VANISHING — the same `<Reveal>` a
  // project body uses, so a header triangle and a project row move the rail the same way.
  for (const section of ["pinned", "projects", "canvases"]) {
    assert.ok(SIDEBAR.includes(`<Reveal open={!closedSections.has("${section}")}>`), `the ${section} section stopped using the shared reveal`);
  }
  // Collapsing must never hide the one create button: the Projects HEADER renders outside the gate.
  const gate = at(SIDEBAR, '<Reveal open={!closedSections.has("projects")}>');
  assert.ok(at(SIDEBAR, 'label="Projects"') < gate, "the Projects header moved inside its own collapse gate");
});

test("🔴 a project row is icon + name — no leading chevron (measured 2026-08-30)", () => {
  // The reference's project row wears nothing at rest but the project's own glyph; expandability
  // is what the click DOES. The old chevron also indented every project 14px past the canvases.
  const folderRowAt = SIDEBAR.indexOf("const folderRow =");
  const body = SIDEBAR.slice(folderRowAt, SIDEBAR.indexOf("const newFolderButton"));
  assert.ok(!body.includes("chevron-right"), "the project row grew its leading chevron back");
  assert.match(body, /aria-expanded=\{isOpen\}/, "the row no longer tells assistive tech it expands");
});

test("🔴 the groups keep the reference's order: pinned, then projects, then loose canvases", () => {
  const pinned = at(SIDEBAR, 'label="Pinned"');
  const folders = at(SIDEBAR, 'label="Projects"');
  const canvases = at(SIDEBAR, 'label="Canvases"');
  assert.ok(pinned < folders && folders < canvases, "the groups are out of order against the reference");
});

test("🔴 an account with nothing at all still gets one sentence, not three empty headings", () => {
  assert.match(SIDEBAR, /const isEmpty = canvases\.length === 0 && folders\.length === 0;/, "the all-empty case lost its own branch");
  assert.ok(SIDEBAR.includes("Your canvases will gather here."), "the empty state sentence is gone");
});

test("🔴 the section label is 14px — the size measured off the reference, not a size below it", () => {
  // It was --canvas-text-meta (12px), a step smaller than every row beneath it, which read as
  // fine print rather than as a quiet heading. The reference sets the label at the SAME size as
  // its rows and holds it back with colour and weight alone, so both must survive together:
  // 14px in the tertiary grey is a heading, 14px at full strength competes with the titles.
  // Anchored on the next declaration, not on the comment that introduces it — `strip()` deletes
  // comments before any of these guards run, so a comment anchor always slices from nothing.
  const label = PRIMITIVES.slice(at(PRIMITIVES, "export function SidebarPanelLabel"), at(PRIMITIVES, "export const countLabel"));
  assert.match(label, /text-\[length:var\(--canvas-text-small\)\]/, "the section label left the measured size");
  // 🔴 REPOINTED 2026-08-29 FROM `--ui-text-tertiary` TO `--sidebar-heading`, AND THE REASON IS THE
  // GROUND. `--ui-text-tertiary` is #0d0d0d at 45% ALPHA, which composites to rgb(147,147,147) on
  // white and to something else on every other surface — and the sidebar's ground is not white. The
  // reference's headings are a flat rgb(143,143,143), so the measured value is a COLOUR, not a
  // transparency. The invariant is unchanged and is what is still asserted: the label is the same
  // size as the rows and is held back to scaffolding by colour and weight alone.
  assert.match(label, /text-\(--sidebar-heading\)/, "the label lost the grey that keeps 14px from competing with the row titles");
  assert.match(label, /font-medium/, "the label lost the weight that pairs with the grey");
  assert.ok(!/uppercase|tracking-/.test(label), "the label went back to shouting");
  // 🔴 AND IT IS A REAL COLOUR IN BOTH THEMES. A token declared once, in light only, is the classic
  // unreadable-in-dark defect: the light grey would simply carry over onto the dark ground.
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--sidebar-heading: rgb\(143, 143, 143\);/, "the measured light grey is gone");
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--sidebar-heading: rgb\(/, "the heading grey has no dark value");
});

test("🔴🔴 a folder row is drawn exactly like a canvas row — only the icon tells them apart", () => {
  // Owner 2026-08-29: *"the sidebar kinda just looks like it's too bolded, especially the pages"*.
  // The folder row carried `font-medium` AND `--ui-text-secondary`: heavier than the canvases under
  // it and faded at the same time, which is the two ways of standing out cancelling each other out.
  // Measured on chatgpt.com the same day: a project row and a chat row are both 14px / weight 400 /
  // rgb(13,13,13), identical, told apart by the glyph alone.
  // 🔴 THE TWO ROWS ARE COMPARED TO EACH OTHER, NOT TO A REMEMBERED CLASS LIST. "Folders look like
  // canvases" is the invariant; naming the classes would pass the day someone restyled both.
  // 🔴 `canvasRow` IS DEFINED FIRST IN THE FILE. The first version of this guard sliced folderRow →
  // canvasRow and got an empty string, which made every negative assertion pass for free.
  const canvases = readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8");
  const rowClass = (name: string) => {
    const from = canvases.indexOf(`const ${name} =`);
    assert.ok(from >= 0, `${name} is gone`);
    const body = canvases.slice(from, from + 4000);
    // The literal itself, wherever it sits: the canvas row's is inside a `cn(...)` on its own line
    // while the folder row's is a bare `className=`, so anchoring on `className=` reads only one.
    const m = body.match(/"[^"]*rounded-\[var\(--nav-row-radius\)\] border border-transparent[^"]*"/);
    assert.ok(m, `${name} no longer has a row class this guard can read`);
    return m![0];
  };
  const folder = rowClass("folderRow"), canvas = rowClass("canvasRow");
  // Hover variants are excluded: they are behaviour, not the resting typography this is about.
  const typography = (c: string) =>
    c.split(/\s+/).filter((k) => !k.startsWith("hover:"))
      .filter((k) => /^(font-\w+|text-\(--[\w-]+\)|text-foreground|text-\[length:var\([^)]*\)\])$/.test(k)).sort();
  assert.deepEqual(typography(folder), typography(canvas), "a folder row is drawn differently from a canvas row");
  assert.ok(!/font-medium/.test(folder), "a folder row is bolder than the canvases under it again");
  assert.ok(!/text-\(--ui-text-secondary\)/.test(folder), "a folder row is faded again, which is the other half of the same fault");
  assert.match(folder, /text-foreground/, "a folder row lost the full-strength ink the canvases use");
});

test("🔴 the sidebar's rows and headings carry the reference's own line height, in pixels", () => {
  // 🔴 EXPLICIT px, NEVER A REM UTILITY. One rem is 18px in this app (`html { font-size: 112.5% }`),
  // so `leading-5` renders 22.5px and every rem-named class is 12.5% larger than its name. The
  // reference sets 14/400/20 on rows and 14/500/20 on headings; `leading-none` computed to 14px,
  // which sat the text a pixel high against the icon beside it inside a 36px row.
  assert.match(PRIMITIVES, /const rowLabel = "[^"]*leading-\[20px\]/, "the row label left the measured 20px line");
  assert.ok(!/const rowLabel = "[^"]*leading-none/.test(PRIMITIVES), "the row label went back to leading-none");
  const label = PRIMITIVES.slice(at(PRIMITIVES, "export function SidebarPanelLabel"), at(PRIMITIVES, "export const countLabel"));
  assert.match(label, /leading-\[20px\]/, "the section heading left the measured 20px line");
  assert.match(label, /pl-\[10px\]/, "the heading no longer aligns with the row text");
});
