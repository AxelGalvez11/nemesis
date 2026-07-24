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
import { mergeImageDescriptions, planSlideMedia, type SlideMediaPlan } from "./slide-media";

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
  const { slides } = readPptxSlides(bytes);
  const text = collapseBlankLines(slides.filter((s) => s.length > 0).join("\n\n"));
  return { title: firstLine(text), text };
}

/** A deck opened once: its per-slide text plus the figures worth reading. Kept
 *  separate from extractPptxText so the zip is only unpacked a single time. */
export interface PptxContents {
  /** One entry per slide, in order. Blank entries are kept so slide N is index N-1
   *  — mergeImageDescriptions relies on that alignment. */
  slides: string[];
  media: SlideMediaPlan;
  /** Zip entry name → bytes, for the images the plan chose. */
  imageBytes: Map<string, Uint8Array>;
}

/** Open a .pptx once and return everything the importer needs from it. */
export function readPptxSlides(bytes: Uint8Array): PptxContents {
  const files = unzipSync(bytes);
  const slideNames = orderSlideFiles(Object.keys(files));
  if (!slideNames.length) throw new Error("That doesn't look like a PowerPoint (.pptx) file.");

  const slides: string[] = [];
  const slideXml = new Map<string, string>();
  for (const name of slideNames) {
    const data = files[name];
    if (!data) continue;
    const xml = strFromU8(data);
    slideXml.set(name, xml);
    slides.push(pptxSlideXmlToText(xml));
  }

  const relsXml = new Map<string, string>();
  const mediaSizes = new Map<string, number>();
  for (const [name, data] of Object.entries(files)) {
    if (/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name)) relsXml.set(name, strFromU8(data));
    else if (name.startsWith("ppt/media/")) mediaSizes.set(name, data.byteLength);
  }

  const media = planSlideMedia({ mediaSizes, relsXml, slideXml });
  const imageBytes = new Map<string, Uint8Array>();
  for (const image of media.images) {
    const data = files[image.name];
    if (data) imageBytes.set(image.name, data);
  }
  return { imageBytes, media, slides };
}

/** Fold figure descriptions into a deck's slides and flatten to one document. */
export function pptxTextWithFigures(contents: PptxContents, descriptions: ReadonlyMap<string, string>): OfficeExtract {
  const merged = mergeImageDescriptions(contents.slides, descriptions, contents.media.images);
  const text = collapseBlankLines(merged.filter((s) => s.length > 0).join("\n\n"));
  return { title: firstLine(text), text };
}
