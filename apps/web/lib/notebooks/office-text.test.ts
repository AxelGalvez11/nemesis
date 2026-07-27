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
  pptxSlideXmlToText,
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
