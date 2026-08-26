// `\ce{…}` renders, because a chemistry answer is full of it.
//
// 🔴🔴🔴 MEASURED ON THE LIVE APP, 2026-08-25. Asked for an SNAr mechanism, Nemesis wrote
// `\ce{NH2CH2CH2OH + NaH -> NH^-CH2CH2OH + Na^+ + H2}` and the canvas printed a red `\ce` followed
// by the contents jumbled into ordinary maths. Twice in one answer. The extension that reads it has
// shipped inside `katex` all along and nothing imported it.
//
// 🔴 THE TEST LOADS IT THE SAME WAY THE APP DOES: a side-effect import next to `katex` itself. If
// somebody drops that line from `chat-markdown.tsx`, the wiring assertion at the bottom goes red
// even though this file's own render still passes, because this file imports it too.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import katex from "katex";
import "katex/contrib/mhchem";

const render = (latex: string) => katex.renderToString(latex, { throwOnError: false });

/**
 * What the learner actually reads, with the MathML source annotation stripped out.
 *
 * 🔴 KaTeX ECHOES THE SOURCE INTO EVERY RENDER, successful or not, inside an `<annotation>`. Testing
 * for the absence of "\\ce" in the raw HTML therefore fails on a PERFECT render, which is exactly
 * how this file failed on its first run.
 */
const shown = (latex: string) =>
  render(latex)
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<[^>]+>/g, "");

test("🔴🔴🔴 the exact equation the owner watched fail", () => {
  const equation = "\\ce{NH2CH2CH2OH + NaH -> NH^-CH2CH2OH + Na^+ + H2}";
  // KaTeX marks what it could not parse with its error colour and leaves the source in place.
  assert.doesNotMatch(render(equation), /katex-error/, "the equation still fails to parse");
  const text = shown(equation);
  assert.ok(!text.includes("ce"), `the command name is still on screen: ${text.slice(0, 60)}`);
  // "->" was two characters of prose; it is a real arrow now.
  assert.match(text, /→/, "the reaction arrow did not become an arrow");
});

test("🔴🔴 the ordinary shapes a chemistry answer uses", () => {
  for (const latex of [
    "\\ce{H2O}",
    "\\ce{2H2 + O2 -> 2H2O}",
    "\\ce{CO3^2-}",
    "\\ce{A <=> B}",
    "\\ce{SO4^2- + Ba^2+ -> BaSO4 v}",
    "\\ce{^{227}_{90}Th+}",
  ]) {
    assert.doesNotMatch(render(latex), /katex-error/, `${latex} did not parse`);
    assert.ok(!shown(latex).includes("ce"), `${latex} left its command name on screen`);
  }
});

test("🔴 ordinary maths is untouched by loading it", () => {
  // The extension adds commands; it must not change how anything already written renders.
  for (const latex of ["x^2 + y^2 = r^2", "\\frac{\\ln 2}{k}", "\\int_0^1 x\\,dx"]) {
    assert.doesNotMatch(render(latex), /katex-error/, `${latex} broke`);
  }
});

test("🔴🔴🔴 it is actually IMPORTED where the app renders, not only here", () => {
  // 🔴 THE LINK THAT KILLED `figure` FOR WEEKS: built, correct, and never called. The extension
  // registers itself as a side effect, so the import IS the wiring — there is no call site to
  // check, and nothing else in the file would look wrong if the line went missing.
  const markdown = readFileSync(new URL("./chat-markdown.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(markdown, /import "katex\/contrib\/mhchem"/, "chemical equations no longer render");
  assert.match(markdown, /import rehypeKatex from "rehype-katex"/, "the maths renderer is gone");
});

console.log("mhchem.test.ts OK");
