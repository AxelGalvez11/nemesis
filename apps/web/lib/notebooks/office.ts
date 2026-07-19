// Word/PowerPoint text extraction: open the .docx/.pptx zip (fflate) and hand its inner XML to the
// pure helpers in ./office-text. Runs in the Node route runtime only. Bytes in, text out — no
// filesystem writes. A corrupt/wrong-format file throws (the route turns that into a friendly error).
import { strFromU8, unzipSync } from "fflate";

import {
  collapseBlankLines,
  docxXmlToText,
  firstLine,
  orderSlideFiles,
  pptxSlideXmlToText,
  type OfficeExtract,
} from "./office-text";

/** Extract text from .docx bytes. Throws on a non-zip / a file missing word/document.xml. */
export function extractDocxText(bytes: Uint8Array): OfficeExtract {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That doesn't look like a Word (.docx) file.");
  const text = docxXmlToText(strFromU8(doc));
  return { title: firstLine(text), text };
}

/** Extract text from .pptx bytes (every slide, in order). Throws on a non-zip / no slides. */
export function extractPptxText(bytes: Uint8Array): OfficeExtract {
  const files = unzipSync(bytes);
  const slideNames = orderSlideFiles(Object.keys(files));
  if (!slideNames.length) throw new Error("That doesn't look like a PowerPoint (.pptx) file.");
  const slides: string[] = [];
  for (const name of slideNames) {
    const data = files[name];
    if (data) slides.push(pptxSlideXmlToText(strFromU8(data)));
  }
  const text = collapseBlankLines(slides.filter((s) => s.length > 0).join("\n\n"));
  return { title: firstLine(text), text };
}
