import assert from "node:assert/strict";

import {
  chartXmlToText,
  collapseBlankLines,
  decodeXmlEntities,
  diagramXmlToText,
  docxXmlToText,
  firstLine,
  orderSlideFiles,
  pptxNotesXmlToText,
  pptxSlideTitle,
  pptxSlideXmlToMarkdown,
  pptxSlideXmlToText,
  slideBoldIsUniform,
} from "./office-text";

// decodeXmlEntities: named + numeric (decimal and hex).
{
  assert.equal(decodeXmlEntities("A &amp; B &lt;x&gt; &quot;q&quot; &#65; &#x42;"), 'A & B <x> "q" A B');
  assert.equal(decodeXmlEntities("no entities here"), "no entities here");
}

// collapseBlankLines: right-trims lines and collapses 3+ blank lines to one.
{
  assert.equal(collapseBlankLines("a   \n\n\n\nb  "), "a\n\nb");
  assert.equal(collapseBlankLines("  trimmed both ends  "), "trimmed both ends");
}

// firstLine: skips blank lines, returns the first real one.
{
  assert.equal(firstLine("\n\n  Title Line  \nbody"), "Title Line");
  assert.equal(firstLine("   \n  "), null);
}

// docxXmlToText: paragraphs become separate lines; tab runs and entities decode.
{
  const xml =
    "<w:document><w:body>" +
    "<w:p><w:r><w:t>Hello &amp; welcome</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Second</w:t></w:r><w:r><w:tab/><w:t>tabbed</w:t></w:r></w:p>" +
    "</w:body></w:document>";
  const text = docxXmlToText(xml);
  const lines = text.split("\n");
  assert.equal(lines[0], "Hello & welcome");
  assert.equal(lines[1], "Second\ttabbed");
  assert.equal(firstLine(text), "Hello & welcome");
}

// pptxSlideXmlToText: each paragraph on its own line.
{
  const xml =
    "<p:sld><p:cSld><p:spTree>" +
    "<a:p><a:r><a:t>Slide Title</a:t></a:r></a:p>" +
    "<a:p><a:r><a:t>Bullet one</a:t></a:r></a:p>" +
    "</p:spTree></p:cSld></p:sld>";
  assert.equal(pptxSlideXmlToText(xml), "Slide Title\nBullet one");
}

// orderSlideFiles: keeps only slides, sorts by true numeric index (slide2 before slide10).
{
  const input = [
    "ppt/slides/slide10.xml",
    "ppt/slides/slide2.xml",
    "ppt/slides/slide1.xml",
    "ppt/theme/theme1.xml",
    "docProps/app.xml",
  ];
  assert.deepEqual(orderSlideFiles(input), [
    "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml",
    "ppt/slides/slide10.xml",
  ]);
}

// pptxNotesXmlToText: the lecturer's own words, without the page furniture.
{
  const notes = (body: string) =>
    `<p:notes><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:notes>`;
  const para = (text: string) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;

  assert.equal(
    pptxNotesXmlToText(notes(`<p:sp><p:txBody>${para("Emphasise first-pass metabolism here.")}</p:txBody></p:sp>`)),
    "Emphasise first-pass metabolism here.",
  );

  // A notes page whose only content is the automatic slide number is not notes. Real
  // decks are full of these — 44 of 136 pages in one course — and importing them
  // would pepper the document with stray numbers.
  const slideNumberOnly = notes(
    `<p:sp><p:txBody><a:p><a:fld id="{X}" type="slidenum"><a:t>25</a:t></a:fld></a:p></p:txBody></p:sp>`,
  );
  assert.equal(pptxNotesXmlToText(slideNumberOnly), "");

  // The number field is dropped, the writing around it is kept.
  const mixed = notes(
    `<p:sp><p:txBody><a:p><a:r><a:t>Ask about half-life.</a:t></a:r><a:fld type="slidenum"><a:t>7</a:t></a:fld></a:p></p:txBody></p:sp>`,
  );
  assert.equal(pptxNotesXmlToText(mixed), "Ask about half-life.");

  // The thumbnail placeholder repeats the slide's own text; keeping it would double
  // every slide in the imported document.
  const withThumbnail = notes(
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:txBody>${para("Slide title copy")}</p:txBody></p:sp>` +
      `<p:sp><p:txBody>${para("The real note")}</p:txBody></p:sp>`,
  );
  assert.equal(withThumbnail.includes("Slide title copy"), true);
  assert.equal(pptxNotesXmlToText(withThumbnail), "The real note");
}

// chartXmlToText: the labels, never the raw series.
{
  const chart =
    `<c:chart><c:title><c:rich><a:p><a:r><a:t>Example</a:t></a:r><a:r><a:t> of Oral Data</a:t></a:r></a:p></c:rich></c:title>` +
    `<c:valAx><c:title><c:rich><a:p><a:r><a:t>Conc. (mg/L)</a:t></a:r></a:p></c:rich></c:title></c:valAx>` +
    `<c:ser><c:val><c:numCache><c:pt idx="0"><c:v>12.5</c:v></c:pt><c:pt idx="1"><c:v>9.75</c:v></c:pt></c:numCache></c:val></c:ser></c:chart>`;
  const text = chartXmlToText(chart);
  // PowerPoint splits a title across runs mid-word ("Example" + " of Oral Data");
  // joining and collapsing gives back the sentence the lecturer typed.
  assert.equal(text, "Example of Oral Data Conc. (mg/L)");
  // 24,000 characters of data points across one course: noise to a flashcard writer,
  // and it would crowd out the lecture itself under any length limit.
  assert.equal(text.includes("12.5"), false);
  assert.equal(chartXmlToText("<c:chart/>"), "");
}

// diagramXmlToText: SmartArt keeps its words, which live outside the slide entirely.
{
  const diagram =
    `<dgm:dataModel><dgm:pt><dgm:t><a:p><a:r><a:t>Absorption</a:t></a:r></a:p></dgm:t></dgm:pt>` +
    `<dgm:pt><dgm:t><a:p><a:r><a:t>Distribution</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:dataModel>`;
  assert.equal(diagramXmlToText(diagram), "Absorption\nDistribution");
}

console.log("notebooks/office-text.test.ts: all assertions passed");

// --- Emphasis fidelity: what the lecturer marked as important survives ---------------
// These shapes mirror what PowerPoint actually writes, verified by reading a real
// 316-slide course rather than by assuming: bold sits on 61% of its slides, a title
// placeholder on 63%, indent levels on 31%, and <a:highlight> on 1 slide in 316.

const sp = (inner: string) => `<p:sp><p:nvSpPr><p:nvPr>${inner}</p:nvPr></p:nvSpPr></p:sp>`;
const run = (text: string, rPr = "") => `<a:r><a:rPr lang="en-US"${rPr}/><a:t>${text}</a:t></a:r>`;
const para = (runs: string, lvl?: number) =>
  `<a:p>${lvl === undefined ? "" : `<a:pPr lvl="${lvl}"/>`}${runs}</a:p>`;

// The title comes from the title placeholder, NOT the first line of a flat blob.
// On a real lecture that bug made the deck title the professor's name.
{
  const xml =
    sp(`<p:ph type="title"/>` + para(run("Rate kinetics and primary variables"))) +
    sp(para(run("FRANK PARK, Ph.d.")));
  const md = pptxSlideXmlToMarkdown(xml);
  assert.equal(md.title, "Rate kinetics and primary variables");
  assert.match(md.body, /FRANK PARK/);
  // ctrTitle is the placeholder an actual title slide uses.
  assert.equal(pptxSlideTitle(sp(`<p:ph type="ctrTitle"/>` + para(run("Pharmacokinetics 1")))), "Pharmacokinetics 1");
  // No placeholder means no title — never a guess.
  assert.equal(pptxSlideTitle(sp(para(run("just a text box")))), null);
}

// Bold survives as markdown, so "know this" stops reading like body text.
{
  const xml = sp(para(run("Normal ") + run("know this", ' b="1"') + run(" tail")));
  assert.match(pptxSlideXmlToMarkdown(xml).body, /Normal \*\*know this\*\* tail/);
}

// Delimiters hug the word: "** bold **" would render as literal asterisks, so a
// run's own padding has to be carried outside the markers.
{
  const body = pptxSlideXmlToMarkdown(sp(para(run(" spaced ", ' b="1"')))).body;
  assert.match(body, /\*\*spaced\*\*/);
  assert.doesNotMatch(body, /\*\* spaced \*\*/);
}

// Italic and underline map to the marks BOTH renderers already support.
{
  const body = pptxSlideXmlToMarkdown(sp(para(run("em", ' i="1"') + run("under", ' u="sng"')))).body;
  assert.match(body, /\*em\*/);
  assert.match(body, /<u>under<\/u>/);
}

// Indent level becomes nesting, so a sub-point stops outranking a main point.
{
  const xml = sp(para(run("Main point"), 0) + para(run("Sub point"), 1) + para(run("Deeper"), 2));
  assert.equal(pptxSlideXmlToMarkdown(xml).body, "- Main point\n  - Sub point\n    - Deeper");
}

// Emphasis is DIFFERENTIAL. An all-bold slide is using bold as its body font, and
// marking it would wrap the whole slide in ** for no signal at all.
{
  const allBold = sp(para(run("one", ' b="1"') + run("two", ' b="1"')));
  const mixed = sp(para(run("one", ' b="1"') + run("two")));
  assert.equal(slideBoldIsUniform(allBold), true);
  assert.equal(slideBoldIsUniform(mixed), false);
  assert.doesNotMatch(pptxSlideXmlToMarkdown(allBold, false).body, /\*\*/);
}

// The automatic slide-number field must not become a junk bullet on every slide.
{
  const xml = sp(`<a:p><a:fld id="x" type="slidenum"><a:t>12</a:t></a:fld></a:p>` + para(run("Real content")));
  const body = pptxSlideXmlToMarkdown(xml).body;
  assert.match(body, /Real content/);
  assert.doesNotMatch(body, /12/);
}

// Entities are decoded inside an emphasised run.
{
  assert.match(pptxSlideXmlToMarkdown(sp(para(run("Cmax &amp; t&#189;", ' b="1"')))).body, /\*\*Cmax & t½\*\*/);
}

// Adjacent runs with the SAME formatting merge before any marker is emitted.
// Found on a real slide: PowerPoint stores "Cmax" as <a:t>C</a:t> + <a:t>max</a:t>
// (the subscript), which marked run-by-run produced "**C****max**" -- four asterisks,
// not valid emphasis, and a term neither search nor a flashcard can match.
{
  const xml = sp(para(run("C", ' b="1"') + run("max", ' b="1"') + run(": maximum concentration")));
  const body = pptxSlideXmlToMarkdown(xml).body;
  assert.match(body, /\*\*Cmax\*\*: maximum concentration/);
  assert.doesNotMatch(body, /\*\*\*/);
}

// A table's cells are paragraphs inside <p:graphicFrame>, NOT inside <p:sp>. Walking
// shapes alone silently dropped them -- 38 distinct words on one real lecture.
{
  const xml =
    sp(para(run("Body text"))) +
    `<p:graphicFrame><a:graphic><a:tbl><a:tr><a:tc><a:txBody>${para(run("CYP3A4"))}</a:txBody></a:tc>` +
    `<a:tc><a:txBody>${para(run("Renal clearance"))}</a:txBody></a:tc></a:tr></a:tbl></a:graphic></p:graphicFrame>`;
  const body = pptxSlideXmlToMarkdown(xml).body;
  assert.match(body, /CYP3A4/);
  assert.match(body, /Renal clearance/);
}

console.log("notebooks/office-text.test.ts: emphasis fidelity assertions passed");
