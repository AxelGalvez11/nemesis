import assert from "node:assert/strict";
import { test } from "node:test";

import { ommlSpans, renderOmml } from "./docx-omml";

/** OMML as Word actually writes it: every argument is an `<m:e>`-style slot. */
const run = (t: string) => `<m:r><w:rPr><w:rFonts w:ascii="Cambria Math"/></w:rPr><m:t>${t}</m:t></m:r>`;
const math = (inner: string) => `<m:oMath>${inner}</m:oMath>`;
const frac = (num: string, den: string) => `<m:f><m:fPr><m:ctrlPr/></m:fPr><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;
const sub = (base: string, s: string) => `<m:sSub><m:sSubPr><m:ctrlPr/></m:sSubPr><m:e>${base}</m:e><m:sub>${s}</m:sub></m:sSub>`;
const sup = (base: string, s: string) => `<m:sSup><m:e>${base}</m:e><m:sup>${s}</m:sup></m:sSup>`;

// ── The inversion: the defect this module exists for ──────────────────────

test("🔴 a fraction keeps its bar, so C₀/(2k) does not read as C₀ × 2k", () => {
  // The measured shape of the bug. `Equations.docx` from the owner's
  // pharmacokinetics folder writes zero-order half-life as a fraction; the old
  // reader concatenated the runs and produced "Co2k", which any student —
  // and any model — reads as a MULTIPLICATION. Every character was present.
  const xml = math(frac(sub(run("C"), run("o")), run("2k")));
  assert.equal(renderOmml(xml), "C_o/(2k)");
  // The failure mode itself, asserted so it cannot come back quietly.
  assert.notEqual(renderOmml(xml), "Co2k");
});

test("🔴 the denominator is bracketed whenever it is more than one character", () => {
  // `C_o/2k` is as wrong as `Co2k`: under ordinary precedence it is (C₀/2)·k.
  assert.equal(renderOmml(math(frac(run("a"), run("2k")))), "a/(2k)");
  // A single character needs nothing, and adding brackets there would only make
  // the common case harder to read.
  assert.equal(renderOmml(math(frac(run("a"), run("b")))), "a/b");
});

test("a numerator carrying an operator is bracketed; a bare symbol is not", () => {
  assert.equal(renderOmml(math(frac(`${run("a")}${run(" + ")}${run("b")}`, run("c")))), "(a + b)/c");
  assert.equal(renderOmml(math(frac(run("Cl"), run("F")))), "Cl/F");
});

test("brackets are not doubled on something already parenthesised", () => {
  const delim = `<m:d><m:e>${run("a")}${run("+")}${run("b")}</m:e></m:d>`;
  assert.equal(renderOmml(math(frac(delim, run("c")))), "(a+b)/c");
});

// ── Subscripts and superscripts ───────────────────────────────────────────

test("🔴 t½ comes out as t_(1/2), not as t12", () => {
  // A subscript that is itself a fraction is the single most common shape in a
  // pharmacokinetics or a physics document, and it is the one the old reader
  // mangled worst: the subscript's numerator and denominator glued to each other
  // AND to the base.
  const xml = math(sub(run("t"), frac(run("1"), run("2"))));
  assert.equal(renderOmml(xml), "t_(1/2)");
});

test("a superscript and a sub-superscript keep their positions", () => {
  assert.equal(renderOmml(math(sup(run("e"), `${run("-")}${run("kt")}`))), "e^(-kt)");
  const both = `<m:sSubSup><m:e>${run("X")}</m:e><m:sub>${run("i")}</m:sub><m:sup>${run("2")}</m:sup></m:sSubSup>`;
  assert.equal(renderOmml(math(both)), "X_i^2");
});

test("pre-scripts stay in front of the base, where they change the meaning", () => {
  const pre = `<m:sPre><m:sub>${run("n")}</m:sub><m:sup>${run("k")}</m:sup><m:e>${run("C")}</m:e></m:sPre>`;
  assert.equal(renderOmml(math(pre)), "_n^kC");
});

// ── Radicals, delimiters, n-ary operators ─────────────────────────────────

test("a radical says which root it is", () => {
  assert.equal(renderOmml(math(`<m:rad><m:deg/><m:e>${run("2gh")}</m:e></m:rad>`)), "sqrt(2gh)");
  assert.equal(renderOmml(math(`<m:rad><m:deg>${run("3")}</m:deg><m:e>${run("V")}</m:e></m:rad>`)), "root(3, V)");
});

test("delimiters are drawn as the author chose them, including square brackets", () => {
  const square = `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${run("drug")}</m:e></m:d>`;
  assert.equal(renderOmml(math(square)), "[drug]");
  // An explicitly empty delimiter means the author asked for none — substituting
  // the default would add a bracket that is not in the document.
  const none = `<m:d><m:dPr><m:begChr m:val=""/><m:endChr m:val=""/></m:dPr><m:e>${run("x")}</m:e></m:d>`;
  assert.equal(renderOmml(math(none)), "x");
});

test("🔴 an n-ary operator's SIGN survives, though it lives in an attribute", () => {
  // `<m:chr m:val="∑"/>` is an attribute, so a reader that only collects `<m:t>`
  // keeps the limits and loses the operation — leaving bounds attached to
  // nothing. The same applies to every integral in every engineering document.
  const sum = `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run("i=1")}</m:sub><m:sup>${run("n")}</m:sup><m:e>${run("x")}</m:e></m:nary>`;
  assert.equal(renderOmml(math(sum)), "∑_(i=1)^n x");
  // An n-ary with no `m:chr` is an integral by definition, not a blank.
  const integral = `<m:nary><m:naryPr><m:ctrlPr/></m:naryPr><m:sub>${run("0")}</m:sub><m:sup>${run("t")}</m:sup><m:e>${run("C dt")}</m:e></m:nary>`;
  assert.equal(renderOmml(math(integral)), "∫_0^t C dt");
});

// ── Constructs that must at least not be glued ────────────────────────────

test("a function, a limit, a matrix and an array keep their boundaries", () => {
  assert.equal(renderOmml(math(`<m:func><m:fName>${run("ln")}</m:fName><m:e>${run("C")}</m:e></m:func>`)), "ln(C)");
  assert.equal(
    renderOmml(math(`<m:limLow><m:e>${run("lim")}</m:e><m:lim>${run("t→0")}</m:lim></m:limLow>`)),
    "lim_(t→0)",
  );
  const matrix = `<m:m><m:mr><m:e>${run("a")}</m:e><m:e>${run("b")}</m:e></m:mr><m:mr><m:e>${run("c")}</m:e><m:e>${run("d")}</m:e></m:mr></m:m>`;
  // Without the row boundary "b" and "c" run together and the matrix reads as
  // one flat list.
  assert.equal(renderOmml(math(matrix)), "[a, b; c, d]");
});

test("a stacked no-bar fraction is a binomial, not a division", () => {
  const binom = `<m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>${run("n")}</m:num><m:den>${run("k")}</m:den></m:f>`;
  assert.equal(renderOmml(math(binom)), "binom(n, k)");
});

test("an unknown construct degrades to its contents rather than vanishing", () => {
  assert.equal(renderOmml(math(`<m:borderBox><m:e>${run("E=mc")}</m:e></m:borderBox>`)), "E=mc");
});

// ── Fidelity: nothing may be lost to make the output prettier ─────────────

test("🔴 every <m:t> character survives the rendering", () => {
  // The whole point of the change is fidelity, so the guard is fidelity: a
  // structured rendering that drops a character to look tidier is a worse defect
  // than the gluing it replaced. `m:subHide` and `m:degHide` are ignored for
  // exactly this reason.
  const hidden = `<m:nary><m:naryPr><m:chr m:val="∑"/><m:subHide m:val="1"/></m:naryPr><m:sub>${run("i")}</m:sub><m:sup>${run("n")}</m:sup><m:e>${run("x")}</m:e></m:nary>`;
  const xml = math(`${frac(sub(run("C"), run("o")), run("2k"))}${run(" = ")}${hidden}`);
  const rendered = renderOmml(xml);
  for (const m of xml.matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)) {
    for (const ch of (m[1] ?? "").trim()) {
      assert.ok(rendered.includes(ch), `lost ${JSON.stringify(ch)} from ${JSON.stringify(rendered)}`);
    }
  }
});

// ── The scanner ───────────────────────────────────────────────────────────

test("🔴 nesting is depth-counted, not matched lazily", () => {
  // `<m:e>` inside `<m:e>` is the normal case — a fraction inside a subscript
  // inside a fraction. A non-greedy match ends the outer element at the first
  // inner close and silently truncates everything after it.
  const inner = frac(run("a"), run("b"));
  const outer = frac(inner, run("c"));
  assert.equal(renderOmml(math(outer)), "(a/b)/c");
});

test("an attribute containing '>' does not truncate the tag", () => {
  const odd = `<m:oMath><m:r><m:t>x</m:t></m:r><m:d><m:dPr><m:begChr m:val=">"/><m:endChr m:val="<"/></m:dPr><m:e><m:r><m:t>y</m:t></m:r></m:e></m:d></m:oMath>`;
  assert.equal(renderOmml(odd), "x>y<");
});

test("spans report where each equation sat, so it can be spliced back in place", () => {
  const para = `<w:p><w:r><w:t>half-life is </w:t></w:r>${math(frac(run("0.693"), run("k")))}<w:r><w:t> hours</w:t></w:r></w:p>`;
  const spans = ommlSpans(para);
  assert.equal(spans.length, 1);
  assert.equal(spans[0]?.text, "0.693/k");
  assert.equal(para.slice(spans[0]!.start, spans[0]!.end).startsWith("<m:oMath>"), true);
  assert.equal(para.slice(spans[0]!.start, spans[0]!.end).endsWith("</m:oMath>"), true);
});

test("two equations in one paragraph are found separately", () => {
  const para = `${math(run("a"))}<w:r><w:t> and </w:t></w:r>${math(run("b"))}`;
  assert.deepEqual(ommlSpans(para).map((s) => s.text), ["a", "b"]);
});
