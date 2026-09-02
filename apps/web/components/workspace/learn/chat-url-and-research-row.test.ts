// Three faults the owner reported on 2026-09-01, with a screenshot of a live web search.
//
// 1. *"the favicons and where it's supposed to be researching, there's a bug where it shows near
//    the composer, it's clipping."*
// 2. *"the thing in preview showing what it's doing, it doesn't have an icon for it, you know, like
//    it does in ChatGPT."*
// 3. *"from the URL, it looks like it's not making a new conversation, it's just staying on the
//    landing page… with ChatGPT it sort of makes a unique code of the chat."*
//
// All three reproduced on production by asking his own question, and all three measured:
//
//   · six chips beside a 76px character collapsed into a 116px-wide, 185px-TALL column at y 680,
//     and the composer starts at y 824 — the last two sites were drawn over its placeholder text
//   · the step caption read "Reading 8 pages" with nothing beside it
//   · the address bar read `?ask=what%20is%20the%20latest%20ai%20news%3F` and stayed that way; the
//     database showed two canvases named "Ohm's law" 43 seconds apart, the second created by
//     returning to that URL, the first orphaned
//
// What is pinned here is the shape of each fix, because no test can see a layout collapse.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CHIPS = readFileSync("components/DomainChips.tsx", "utf8");
const DOCK = readFileSync("components/character/character-dock.tsx", "utf8");
const PREVIEW = readFileSync("components/workspace/learn/canvas-thinking-preview.tsx", "utf8");
const CANVAS_RAW = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");

/**
 * The file with its commentary removed.
 *
 * 🔴 A GUARD THAT MATCHES A COMMENT IS NOT A GUARD, AND THIS ONE DID. Calibrating these by breaking
 * them caught it: commenting out the line that renames the URL left the text of that line in the
 * file, so the assertion below still found it and stayed green while the feature was gone. Only
 * whole-line comments are stripped, so a `https://` inside a string survives.
 */
const code = (source: string) => source.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const CANVAS = code(CANVAS_RAW);
const SESSION = code(readFileSync("components/workspace/learn/use-canvas-session.ts", "utf8"));

test("🔴🔴 the sites are a ROW, and a row cannot collapse into the composer", () => {
  // 🔴 THE COLLAPSE IS THE PART THAT LOOKS LIKE A CSS DETAIL AND IS ACTUALLY THE BUG. This row is
  // absolutely positioned beside the character with only a `left`, so its width is shrink-to-fit —
  // and shrink-to-fit on a WRAPPING flex container resolves toward the widest single item, not the
  // row. Six chips therefore stacked vertically instead of sitting side by side.
  assert.match(CHIPS, /flex-nowrap/, "the chip row can wrap again, so it will stack into a column");
  assert.ok(!/flex-wrap/.test(CHIPS), "the chip row can wrap again, so it will stack into a column");
  // 🔴 AND THE BOX AROUND IT TAKES ITS CONTENT'S WIDTH. Without this the caption is still
  // shrink-to-fit and still resolves narrow, which is the other half of the same collapse.
  assert.match(DOCK, /character-caption[^`]*\bw-max\b/, "the caption box lost `w-max`, so it collapses to its narrowest child again");
});

test("🔴 and it is short enough that it never needs to wrap", () => {
  const max = /const DEFAULT_MAX = (\d+);/.exec(CHIPS);
  assert.ok(max, "the chip cap is gone");
  const n = Number(max[1]);
  // Six was the old value and it is a 540px row beside a 76px character. The "+N" was always there;
  // it simply never had to do any work.
  assert.ok(n <= 4, `${n} chips beside the character is a row wide enough to need wrapping again`);
  assert.ok(n >= 2, `${n} chips is fewer than it takes to show that more than one site was read`);
  assert.match(CHIPS, /\+\{extra\}|\+\$\{extra\}|\{`\+\$\{extra\}`\}/, "the remainder stopped being shown, so the cap now hides sites silently");
});

test("🔴🔴 the step wears a mark only when it has a source to name", () => {
  // 🔴 THIS REVERSES PART OF A 2026-08-30 DECISION AND KEEPS THE REST, WHICH IS WHY BOTH ARE HERE.
  // What was deleted that day was a GENERIC glyph beside every working caption — measured against
  // ChatGPT with nothing connected, where the reference is a bare shimmering sentence. That is
  // still right, and plain thinking still gets nothing. The reference ALSO shows a globe while it
  // is searching the web, which is the case the owner is pointing at.
  assert.match(PREVIEW, /web\?: boolean;/, "the preview lost the fact that says this step is reading the web");
  assert.match(PREVIEW, /!appLogo && web \?/, "the globe is gone, or it no longer yields to a connected app's own logo");
  // 🔴 DRIVEN BY THE SITES, NEVER BY THE WORDS. Parsing the caption for "Reading" would put a globe
  // on the first unrelated step that borrowed the verb.
  assert.match(
    CANVAS,
    /<CanvasThinkingPreview app=\{session\.workApp\} label=\{preparingLabel\} web=\{session\.searchedDomains\.length > 0\} \/>/,
    "the globe is no longer driven by real sites, so it can appear over a step with no source behind it",
  );
  assert.ok(
    !/label[^\n]*\.includes\("Reading"\)|\/Reading\/\.test/.test(PREVIEW),
    "the mark is being chosen by reading the caption text, which is a guess about a sentence rather than a fact about a step",
  );
});

test("🔴🔴🔴 exactly ONE thing renames the address bar", () => {
  // `?ask=<sentence>` is an INSTRUCTION: `learnSurface` reads it, mints a canvas and sends the
  // question. Leaving it in the bar meant the URL of a chat was a way to create another one —
  // proved on production, two rows named "Ohm's law" 43 seconds apart, the second created by
  // returning to that URL and the first orphaned.
  //
  // 🔴🔴 AND THE FIX EXISTED TWICE FOR ABOUT AN HOUR, WHICH IS WHAT THIS TEST IS REALLY FOR. Two
  // sessions answered the same report on 2026-09-01 and both merged: #1047 renamed the bar from
  // `learning-canvas.tsx` keyed on `canvas.id`, #1050 from `use-canvas-session.ts` keyed on the
  // first successful save. They wrote the same id, so nothing broke on screen — a duplicate owner
  // that agrees with itself is invisible until the day it does not.
  //
  // The session's is the one kept, and on the merits: `canvas.id` is minted on the client before
  // any row exists, so renaming from the component could publish an address for a canvas that had
  // not been written yet. That happened, and needed a ref to correct the id afterwards.
  // `saveCanvas` reports whether the canvas is findable, so the session can wait until the address
  // is a promise it can keep.
  assert.match(SESSION, /const addressed = useRef\(Boolean\(canvasId\)\);/, "the session stopped owning the address bar");
  assert.match(SESSION, /replaceState/, "the session stopped renaming the address bar");
  assert.ok(
    !/replaceState/.test(CANVAS),
    "the canvas surface is renaming the address bar again — two owners of one URL, and they only look fine while they agree",
  );
});
