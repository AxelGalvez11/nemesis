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
  // 🔴 THE DOWNLOADS MOVED INTO THE ARTIFACT CARD, so this asserts they are reachable from THERE.
  // Left pointed at the panel it would have gone red for the right change, which is how a guard
  // teaches the next person to delete it rather than move it. The card's own test is below.
});

test("🔴 the file rows are guarded on the payload, not on the kind", () => {
  // An output whose content failed to save is a row that would open an empty card, which is the
  // same dead end wearing a nicer coat.
  assert.match(CONTROLS, /\(output\.markdown \|\| output\.sheet\)/, "a row can open an artifact with nothing in it");
});

test("🔴🔴 a made file is an ARTIFACT you open, not a download the row fires", () => {
  // Owner, 2026-08-25: *"it should create an artifact as 'output' not just straight download."* A
  // row whose only action is to put a file in Downloads is a link that happens to be listed: you
  // cannot read what Nemesis wrote before deciding you want it, and seeing your own document again
  // means downloading it twice.
  //
  // Calibration: put `downloadDocx` back on the row's onClick and this reddens.
  assert.match(CONTROLS, /onClick=\{\(\) => onOpen\(output\)\}/, "the row does not open the artifact");
  assert.match(CONTROLS, /<OutputPreview[\s\n]/, "the artifact card is never mounted");
  assert.ok(!/downloadDocx|downloadPdf|downloadSheet/.test(CONTROLS), "🔴 the outputs panel downloads on click again");

  // …and the download is still reachable, one click further in. A preview with no way out would be
  // the opposite defect.
  const preview = code("../../components/workspace/learn/output-preview.tsx");
  for (const download of ["downloadDocx", "downloadPdf", "downloadSheet"]) {
    assert.match(preview, new RegExp(`${download}\\(`), `${download} is unreachable from the artifact card`);
  }
  // 🔴 THE CARD RENDERS THROUGH THE SAME PARSER THE WRITERS USE. A preview built from a second
  // interpretation would show a table the .docx silently drops, and the reader would find out
  // after opening Word.
  assert.match(preview, /docBlocks\(/, "the preview renders markdown by some other route than the writers do");
});

test("🔴 the finished notice is a Record, because the chain it replaced was already lying", () => {
  // It ended `: "Note saved to your Library."` — the branch every unnamed kind fell into. Making a
  // spreadsheet therefore announced a note, saved somewhere it had never been. A chain of ternaries
  // has no missing case for a compiler to find; a Record over the union does.
  const session = code("../../components/workspace/learn/use-canvas-session.ts");
  assert.match(session, /const MADE_NOTICE: Record<DeliverableKind, string \| null>/, "the notice can fall through to the wrong kind again");
  assert.match(session, /MADE_NOTICE\[kind\]/, "the notice is not read from the record");
  // 🔴 AND IT MUST NOT SEND ANYBODY TO THE LIBRARY FOR A FILE THAT IS NOT THERE. Documents, PDFs
  // and spreadsheets live on the canvas as artifacts; only the other three are filed.
  const notice = session.slice(session.indexOf("const MADE_NOTICE"), session.indexOf("};", session.indexOf("const MADE_NOTICE")));
  for (const kind of ["document", "pdf", "sheet"]) {
    const line = notice.split("\n").find((l) => l.trim().startsWith(`${kind}:`)) ?? "";
    assert.ok(!/Library/.test(line), `🔴 the ${kind} notice sends the learner to the Library, where it is not`);
  }
  // 🔴 AND FLASHCARDS SAY NOTHING, BECAUSE THE TURN ALREADY DID. Owner, 2026-08-31: *"remove the
  // 'flashcards saved' chip, that's not needed"* — the transcript prints "Flashcards ready: <name>"
  // with the deck row beneath it, so the strip was a second announcement of the same event.
  const cards = notice.split("\n").find((l) => l.trim().startsWith("flashcards:")) ?? "";
  assert.match(cards, /flashcards: null,/, "🔴 the flashcards notice is back, on top of the row the turn already printed");
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

test("🔴🔴 nothing routes to the old Library", () => {
  // Owner, 2026-08-25, with a screenshot of `/library/classic` reading "Couldn't reach your notes":
  // *"i dont want anything to route to this old library."*
  //
  // Two links went: the canvas's outputs row and the Library's own documents list — the second
  // being a navigation OFF the Library to read one of the Library's own documents. Both now open
  // `OutputPreview`, which fetches the note by path and renders it through the same parser the file
  // writers use, so a document reads identically wherever it is opened from.
  //
  // 🔴 THE ROUTE ITSELF IS NOT DELETED, and this guard does not ask for that. `/library/classic` is
  // still reachable by typing it, and `library-v2` is untouched — what the owner objected to is
  // being SENT there. Scanning for the href rather than for the string keeps that distinction, and
  // keeps this test from reddening on the comments that explain it.
  const LINKED = /href=\{?[`"'][^`"']*\/library\/classic/;
  for (const [name, text] of [
    ["the canvas outputs panel", CONTROLS],
    ["the Library's documents list", code("../../components/workspace/library/library-outputs.tsx")],
    ["the artifact card", code("../../components/workspace/learn/output-preview.tsx")],
  ] as const) {
    assert.ok(!LINKED.test(text), `🔴 ${name} still links to the old Library`);
  }

  // And the replacement genuinely opens something: a path alone is not a document.
  const preview = code("../../components/workspace/learn/output-preview.tsx");
  assert.match(preview, /readLibraryNote\(notePath\)/, "the card cannot turn a note path into anything to read");
  assert.match(preview, /Couldn&apos;t open this one/, "a note that fails to load shows an empty card instead of saying so");
  // 🔴 AND IT MUST NOT OFFER A DOWNLOAD THAT WOULD PRODUCE AN EMPTY FILE while the body is still
  // in flight — a 0-byte .docx downloads exactly as happily as a good one.
  assert.match(
    preview,
    /disabled=\{!markdown && !output\.sheet && !deck\}/,
    "the download can fire before there is anything to write",
  );
});

test("🔴🔴 an artifact renders in its own format, not as markdown", () => {
  // Owner, 2026-08-25: *"why are artifacts rendering in md and not their respective formats?"* A
  // PDF opened as a styled approximation of what the PDF would contain — close enough to look
  // right, and wrong about every question a person opens a PDF to answer: where the pages break,
  // whether the table fits, what it looks like printed.
  //
  // Calibration: send `pdf` down the DocBody branch again and this reddens.
  const preview = code("../../components/workspace/learn/output-preview.tsx");
  assert.match(preview, /output\.kind === "pdf" \? \(/, "a PDF artifact no longer takes its own branch");
  assert.match(preview, /<PdfPages blob=\{pdf\} \/>/, "the PDF is not rendered from its bytes");
  assert.match(preview, /pdfBlob\(markdown, output\.title\)/, "the rendered PDF is not built by the writer that hands over the download");

  // 🔴 THE SAME pdf.js DOOR THE READER AND THE SOURCE PREVIEW USE. A second one means a second
  // worker, a second copy of the library in the bundle, and two versions to drift apart.
  const pages = code("../../components/workspace/learn/pdf-pages.tsx");
  assert.match(pages, /from "@\/lib\/reader\/pdfjs"/, "a second pdf.js door was opened");
  // And the worker's copy is freed with the panel, as source-preview.tsx already requires.
  assert.match(pages, /close\?\.\(\)/, "the pdf.js document is never closed");
  // 🔴 A CONTAINER THAT MEASURES ZERO MUST NOT PRODUCE A ZERO-SIZED PAGE. `??` only catches null,
  // so a parent still laying out gives `scale = 0` and pdf.js renders a 0x0 canvas — a blank space
  // where the document is, with no error anywhere. Found in a browser, not by reading the code.
  assert.match(pages, /element\.parentElement\?\.clientWidth \|\| 560/, "a zero-width container renders a zero-sized page");
});

test("🔴 the docked panel collapses the sidebar without writing the preference", () => {
  // The obvious implementation — calling setSidebarOpen(false) — persists to
  // `nemesis.web.nav-rail`, so a learner who likes their sidebar open loses it permanently the
  // first time they read a document. responsive-sidebar.ts records that exact bug already.
  const preview = code("../../components/workspace/learn/output-preview.tsx");
  // 🔴 IT NOW DECLARES ITS WIDTH TOO, so the surface can be PUSHED by exactly that much rather than
  // covered — the reference's own behaviour, measured. Zero while full screen: a reader covering
  // everything has nothing to push.
  assert.match(preview, /useDeclareSidePanel\(mode === "docked" \? dock : 0\)/, "the panel does not declare itself");
  // 🔴 WIDTH, NOT PADDING, AND THE COMPOSER IS WHY. Padding was the obvious choice and it moved the
  // document while leaving the composer under the panel: an absolutely positioned child is laid out
  // against its containing block's PADDING box, which includes the padding. Narrowing the element
  // moves everything inside it, in flow or not. Seen on screen, not reasoned about.
  assert.match(
    code("../../components/workspace/learn/canvas-surface.tsx"),
    /width: inset \? `calc\(100% - \$\{inset\}px\)` : undefined/,
    "the canvas is covered by the reader instead of pushed by it",
  );
  assert.ok(!/setSidebarOpen|nav-rail/.test(preview), "🔴 the panel writes the learner's sidebar preference");
  const registry = code("../../components/workspace/shell/side-panel.tsx");
  assert.ok(!/localStorage/.test(registry), "🔴 the side-panel claim reaches storage — it must be transient");
  assert.match(registry, /return \(\) => actions\.release\(id\)/, "the claim is not released on unmount");

  // 🔴🔴 THE CLAIMING EFFECT'S DEPENDENCY MUST NEVER CHANGE IDENTITY, and this is a real bug fixed
  // rather than a hypothetical. The first version put `{ claim, open, release }` in one memoised
  // value; the claiming effect depends on that value, and its identity changed every time `open`
  // did — so claiming changed it, the effect re-ran, its CLEANUP released, that changed it again,
  // and React reported "Maximum update depth exceeded" with the page dead. Shipped in #849, found
  // by opening a deck in the panel.
  //
  // Calibration: put `open` back in the same context value as the actions and this reddens.
  assert.match(registry, /const SidePanelActionsContext/, "the actions share a context with the boolean again");
  assert.match(registry, /const SidePanelOpenContext/, "the open flag shares a context with the actions again");
  assert.match(registry, /\[actions, id, inset\]/, "the claiming effect depends on something that changes");
  const memo = registry.slice(registry.indexOf("useMemo<SidePanelActions>"));
  assert.match(memo.slice(0, memo.indexOf("}")), /setIds\(\(current\)/, "the actions read the set instead of the updater");
});

test("🔴🔴 a long artifact is not thrown away for running long", () => {
  // Owner, 2026-08-25, asking for a glycolysis deck: *"The slide plan came back unusable, so
  // nothing was saved."* Nothing in this app had ever set an output cap, so a twelve-slide deck ran
  // past the provider's default, the answer was cut off mid-object, `JSON.parse` threw, and the
  // learner was told the model failed — at a limit we never raised.
  //
  // Two fixes, and the guard holds both: the headroom, and the salvage for when it still runs long.
  const deliverables = code("./canvas-deliverables.ts");
  assert.match(deliverables, /maxTokens: DECK_MAX_TOKENS/, "the deck call has no output headroom");
  assert.match(deliverables, /maxTokens: CARDS_MAX_TOKENS/, "the cards call has no output headroom");
  assert.match(deliverables, /maxTokens: TABLE_MAX_TOKENS/, "the table call has no output headroom");
  assert.match(code("../workspace/chat-api.ts"), /max_tokens: options\.maxTokens/, "maxTokens never reaches the wire");

  // 🔴 EVERY PARSER THAT READS A MODEL'S JSON GOES THROUGH THE SALVAGE. Leaving one on the old
  // `JSON.parse` would be the same truncation bug still live in one place, behind a fix that reads
  // as complete — which is exactly what nearly happened to the flashcards parser, whose root is a
  // bare array rather than an object.
  assert.match(deliverables, /const parsed = readModelJson\(text\)/, "a maker still parses raw");
  assert.match(code("../export/deck-plan.ts"), /readModelJson\(text\)/, "the deck plan still parses raw");
});

test("🔴 a maker with nothing attached can go and look it up", () => {
  // Owner, 2026-08-25: *"it should be able to use websearch to build documents or other artifacts
  // if it needs information."*
  const deliverables = code("./canvas-deliverables.ts");
  assert.match(deliverables, /async function webContextForTopic/, "no maker can reach the web");
  assert.match(deliverables, /searchWebContext\(uid, subject\)/, "the topic never reaches a search");
  // 🔴 AND ONLY WHEN THERE IS NOTHING ATTACHED. A canvas WITH material has already been told what
  // to build from; searching anyway spends a metered unit to add pages nobody asked for, and lets
  // the web argue with the source the learner uploaded.
  assert.match(deliverables, /grounded \? "" : await webContextForTopic/, "the deck searches even when grounded");
  assert.ok(
    /canvasHasMaterial\(canvas\)\s*\?\s*canvasBrief\(canvas\)\s*:\s*\[/.test(deliverables),
    "a prose maker searches even when the canvas has material",
  );
});
