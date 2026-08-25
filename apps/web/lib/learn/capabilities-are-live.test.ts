import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAPABILITY_COPY, COMPOSER_CAPABILITIES, MAKER_CAPABILITIES, isMakerCapability } from "./composer-capability";

// 🔴🔴 EVERY CAPABILITY IN THE MENU HAS TO DO SOMETHING, AND THIS IS THE FILE THAT SAYS SO.
//
// Owner, 2026-08-25, adding five of them at once: *"make everything live."* That is not a nicety —
// this repo has shipped the failure it guards against more than once. A row that stages a
// capability nothing routes on reads as broken rather than absent, and it fails SILENTLY: no error,
// no console, just a send that produces an ordinary answer and a learner who concludes the feature
// does not work. `canvas-dead-controls.test.ts` holds the same line for the canvas's own controls.
//
// The rule: for each member of the union, name the code path that acts on it. If a capability
// cannot be pointed at one, it does not belong in the menu yet.

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

/** Comments removed as SPANS, so a guard reads code and not the prose explaining it. */
const code = (path: string): string =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const SESSION = code("../../components/workspace/learn/use-canvas-session.ts");
const CHAT = code("../../components/workspace/learn/canvas-chat.ts");
const DELIVERABLES = code("./canvas-deliverables.ts");
const CONTROLS = code("../../components/workspace/learn/canvas-controls.tsx");

test("🔴🔴 every capability is routed somewhere — none is a row that does nothing", () => {
  // The four kinds of destination, in the order `converse` checks them.
  const routed: Record<string, () => boolean> = {
    // Rides in the turn packet as a fact the model weighs.
    course: () => /capability === "course"/.test(SESSION),
    // Plans, shows the card, and spends nothing until Start.
    research: () => /if \(capability === "research"\)/.test(SESSION),
    // Forces the first round to search.
    search: () => /const forceWeb = capability === "search"/.test(SESSION) && /forceWeb && decision/.test(CHAT),
    // Goes straight to its maker.
    ...Object.fromEntries(
      MAKER_CAPABILITIES.map((maker) => [maker, () => /if \(capability && isMakerCapability\(capability\)\)/.test(SESSION)]),
    ),
  };

  for (const capability of COMPOSER_CAPABILITIES) {
    const check = routed[capability];
    assert.ok(check, `🔴 ${capability} is offered in the menu and this guard knows no path that acts on it`);
    assert.ok(check(), `🔴 ${capability} is offered in the menu and nothing routes on it — it is a dead control`);
  }
});

test("🔴 the maker branch reads the LIST, so a new maker cannot fall through to an ordinary turn", () => {
  // Spelled `capability === "document" || capability === "pdf" || …` in the session file, this stops
  // being complete the moment the union grows — silently, with the new capability answering as
  // though nothing had been declared.
  assert.match(SESSION, /isMakerCapability\(capability\)/, "the makers are routed by name rather than by the list");
  assert.ok(!/capability === "document"/.test(SESSION), "a maker is routed by name in the session file");
  assert.ok(!/capability === "sheet"/.test(SESSION), "a maker is routed by name in the session file");
});

test("🔴 every maker has a maker, and every made thing has a way out", () => {
  const MAKERS: Record<string, RegExp> = {
    document: /makeDocumentDeliverable\(uid, latest\.current, kind, topic\)/,
    pdf: /makeDocumentDeliverable\(uid, latest\.current, kind, topic\)/,
    sheet: /makeSheetDeliverable\(uid, latest\.current, topic\)/,
    slides: /makeSlidesDeliverable\(uid, latest\.current, topic\)/,
  };
  for (const maker of MAKER_CAPABILITIES) {
    assert.match(SESSION, MAKERS[maker]!, `${maker} has no maker wired into makeDeliverable`);
    // 🔴 AND THE ROW IT PRODUCES MUST OPEN. A file that is made and then sits in a list that cannot
    // hand it over is the same dead end one step later — the defect the Outputs panel already had
    // once, when a report row fell through to a plain div.
    assert.match(CONTROLS, new RegExp(`${maker}: "`), `${maker} outputs have no icon, so the row renders a gap`);
  }
  for (const download of ["downloadDocx", "downloadPdf", "downloadSheet"]) {
    assert.match(CONTROLS, new RegExp(`${download}\\(`), `${download} is imported but never wired to a row`);
  }
});

test("🔴 the file writers are guarded on the payload, not on the kind", () => {
  // An output whose markdown failed to save is a row that would download an empty file, which is
  // worse than a row that plainly does not download.
  assert.match(CONTROLS, /output\.kind === "document" \|\| output\.kind === "pdf"\) && output\.markdown/);
  assert.match(CONTROLS, /output\.kind === "sheet" && output\.sheet/);
});

test("only Course reaches the turn model; the rest are decisions already made", () => {
  const capability = code("./composer-capability.ts");
  assert.match(capability, /if \(capability !== "course"\) return ""/, "a capability other than Course can now argue with the model");
});

test("every capability names what the learner gets, and asks its own question", () => {
  for (const capability of COMPOSER_CAPABILITIES) {
    const copy = CAPABILITY_COPY[capability];
    assert.ok(copy.label.length > 0 && copy.detail.length > 0, `${capability} has no menu copy`);
    assert.ok(copy.icon.length > 0, `${capability} has no icon`);
    assert.ok(copy.prompt.endsWith("?"), `${capability}'s placeholder should ask something: ${copy.prompt}`);
    // §38's copy rule: a control says what the learner GETS, never what the system does.
    assert.ok(!/^(Run|Enable|Turn on|Use )/i.test(copy.label), `${capability} names an operation rather than an outcome`);
  }
});

test("🔴 Web search and Deep research do not read as the same offer twice", () => {
  // One answers the question you asked, now, from live pages. The other goes away and comes back
  // with a document. Identical copy would make the pair meaningless, and the wrong one gets picked.
  assert.notEqual(CAPABILITY_COPY.search.detail, CAPABILITY_COPY.research.detail);
  assert.notEqual(CAPABILITY_COPY.search.label, CAPABILITY_COPY.research.label);
  assert.ok(isMakerCapability("slides"));
  assert.ok(!isMakerCapability("search"), "Web search is not a maker — it changes the turn, it does not replace it");
  assert.ok(!isMakerCapability("research"), "Deep research is not a maker — it plans and stops");
});

test("🔴 a forced search overrides the FIRST round only, or the loop cannot end", () => {
  // The loop stops when `needsWeb` comes back false. A flag that pinned it true would spin to
  // MAX_SEARCH_ROUNDS buying metered searches the model has already said it does not need.
  assert.match(CHAT, /if \(forceWeb && decision && !decision\.needsWeb\)/, "the forced search is not applied once before the loop");
  const loop = CHAT.slice(CHAT.indexOf("while ("), CHAT.indexOf("while (") + 600);
  assert.ok(!/forceWeb/.test(loop), "🔴 the force flag is read inside the search loop — it can never terminate");
});

test("🔴 a spreadsheet row is always rectangular, whatever the model returned", () => {
  const deliverables = DELIVERABLES;
  // A short row shifts every later cell left in the spreadsheet; a long one spills into a column
  // with no header. Both open successfully and are silently wrong.
  assert.match(deliverables, /columns\.map\(\(_, index\) => String\(row\[index\] \?\? ""\)\.trim\(\)\)/);
});
