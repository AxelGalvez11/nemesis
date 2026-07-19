import assert from "node:assert/strict";

import {
  collapseBlankLines,
  decodeXmlEntities,
  docxXmlToText,
  firstLine,
  orderSlideFiles,
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

console.log("notebooks/office-text.test.ts: all assertions passed");
