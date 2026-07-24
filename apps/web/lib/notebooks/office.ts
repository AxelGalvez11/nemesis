// Word/PowerPoint extraction: open the .docx/.pptx zip (fflate) and hand its inner XML to the
// pure helpers in ./office-text. Runs in the Node route runtime only. Bytes in, text out — no
// filesystem writes. A corrupt/wrong-format file throws (the route turns that into a friendly error).
//
// A .pptx is not one document but a folder of them, and reading ppt/slides/ alone missed a
// measured 14% of the words in a real pharmacokinetics course:
//
//   ppt/slides/slideN.xml        the slide itself                    — always read
//   ppt/notesSlides/…            what the lecturer says out loud     — 136 pages in that course
//   ppt/diagrams/dataN.xml       SmartArt text (outside the slide)   — 21 diagrams
//   ppt/charts/chartN.xml        chart title and axis labels         — 23 charts
//   ppt/media/…                  the figures                         — see ./slide-media
//
// Each of those parts is reached the same way: through the slide's OWN relationship file, so a
// part always lands under the slide that uses it. Nothing is matched by filename index — notes
// slide 3 does not have to belong to slide 3, and in a deck with hidden slides it will not.
import { strFromU8, unzipSync } from "fflate";
import { createHash } from "node:crypto";

import { emfEmbeddedImage } from "./emf-bitmap";
import { imageSize } from "./image-dimensions";
import {
  chartXmlToText,
  collapseBlankLines,
  diagramXmlToText,
  docxXmlToText,
  firstLine,
  orderSlideFiles,
  pptxNotesXmlToText,
  pptxSlideXmlToText,
  type OfficeExtract,
} from "./office-text";
import {
  imageMime,
  mergeImageDescriptions,
  parseSlideRels,
  planSlideMedia,
  type MediaFact,
  type SlideMediaPlan,
} from "./slide-media";
import { tiffImage } from "./tiff-image";

/** Extract text from .docx bytes. Throws on a non-zip / a file missing word/document.xml. */
export function extractDocxText(bytes: Uint8Array): OfficeExtract {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That doesn't look like a Word (.docx) file.");
  const text = docxXmlToText(strFromU8(doc));
  return { title: firstLine(text), text };
}

/** Extract text from .pptx bytes (every slide, in order, with its notes, charts and SmartArt). */
export function extractPptxText(bytes: Uint8Array): OfficeExtract {
  const { slides } = readPptxSlides(bytes);
  const text = collapseBlankLines(slides.filter((s) => s.length > 0).join("\n\n"));
  return { title: firstLine(text), text };
}

/** What was found in a deck and what became of it. Reported so a partial read is never
 *  presented as a complete one — the same principle as a null pass rate meaning
 *  "nothing reviewed" rather than "reviewed and failed". */
export interface PptxCoverage {
  slides: number;
  notesPages: number;
  charts: number;
  diagrams: number;
  /** Distinct pictures placed on slides. */
  imagesFound: number;
  /** …of which these will be described. */
  imagesReadable: number;
  /** …these are genuine vector drawings nothing here can rasterise. */
  imagesUnreadable: number;
  /** …these are bullets, rules and icons. */
  imagesGlyphs: number;
  /** …and these lost out to the per-deck ceiling. */
  imagesDroppedToCap: number;
  /** Pictures recovered out of a metafile wrapper (./emf-bitmap). */
  imagesUnwrapped: number;
}

/** A deck opened once: its per-slide text plus the figures worth reading. Kept
 *  separate from extractPptxText so the zip is only unpacked a single time. */
export interface PptxContents {
  /** One entry per slide, in order. Blank entries are kept so slide N is index N-1
   *  — mergeImageDescriptions relies on that alignment. */
  slides: string[];
  media: SlideMediaPlan;
  /** Zip entry name → bytes to send. For a metafile that turned out to hold a
   *  bitmap, these are the UNWRAPPED PNG bytes, not the original file. */
  imageBytes: Map<string, Uint8Array>;
  coverage: PptxCoverage;
}

/** Identity of a picture's content, so the same crest stored under six entry names is
 *  described once. Cheap next to the vision call it saves. */
function contentKey(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

/**
 * A picture in a format no vision model accepts, turned into one it does — or null
 * when it genuinely cannot be read. Both formats here were found on real slides
 * holding real lecture figures: metafile-wrapped screenshots (up to 9.7 MB) and
 * uncompressed TIFFs from decks built on a Mac. What still returns null is true
 * vector drawing (.wmf, hand-drawn .emf) and SVG, which is counted and reported
 * rather than quietly dropped.
 */
function recoverImage(name: string, bytes: Uint8Array): { bytes: Uint8Array; mime: string } | null {
  if (/\.emf$/i.test(name)) return emfEmbeddedImage(bytes);
  if (/\.tiff?$/i.test(name)) return tiffImage(bytes);
  return null;
}

/** Open a .pptx once and return everything the importer needs from it. */
export function readPptxSlides(bytes: Uint8Array): PptxContents {
  const files = unzipSync(bytes);
  const slideNames = orderSlideFiles(Object.keys(files));
  if (!slideNames.length) throw new Error("That doesn't look like a PowerPoint (.pptx) file.");

  const read = (name: string): string | null => {
    const data = files[name];
    return data ? strFromU8(data) : null;
  };

  const slides: string[] = [];
  const slideXml = new Map<string, string>();
  const relsXml = new Map<string, string>();
  let notesPages = 0;
  let charts = 0;
  let diagrams = 0;

  for (const name of slideNames) {
    const xml = read(name);
    if (xml === null) continue;
    slideXml.set(name, xml);

    const relsName = `ppt/slides/_rels/${name.split("/").pop()}.rels`;
    const rels = read(relsName);
    if (rels) relsXml.set(relsName, rels);
    const targets = rels ? [...parseSlideRels(rels).values()] : [];

    // Everything this slide points at, gathered under the slide that uses it.
    const blocks: string[] = [pptxSlideXmlToText(xml)];
    for (const target of targets) {
      if (/^ppt\/charts\/chart\d+\.xml$/.test(target)) {
        const text = chartXmlToText(read(target) ?? "");
        charts += 1;
        if (text) blocks.push(`[Chart: ${text}]`);
      } else if (/^ppt\/diagrams\/data\d+\.xml$/.test(target)) {
        const text = diagramXmlToText(read(target) ?? "");
        diagrams += 1;
        if (text) blocks.push(`[Diagram: ${text.replace(/\n+/g, " · ")}]`);
      } else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(target)) {
        const text = pptxNotesXmlToText(read(target) ?? "");
        if (text) {
          notesPages += 1;
          blocks.push(`[Speaker notes: ${text}]`);
        }
      }
    }
    slides.push(blocks.filter((block) => block.trim().length > 0).join("\n"));
  }

  // What the pictures are, before deciding which to read. A metafile is opened here
  // rather than judged by its extension: the ones that hold a pasted screenshot come
  // back as PNG and join the deck's figures; the ones that are real vector drawing
  // keep a null mime and are counted as unreadable.
  const media = new Map<string, MediaFact>();
  const imageBytes = new Map<string, Uint8Array>();
  let imagesUnwrapped = 0;
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith("ppt/media/")) continue;
    // Annotated because a recovered picture is freshly allocated: its buffer type is
    // the general one, not the exact type fflate hands back for a zip entry.
    let payload: Uint8Array<ArrayBufferLike> = data;
    let mime = imageMime(name);
    if (!mime) {
      const recovered = recoverImage(name, data);
      if (recovered) {
        payload = recovered.bytes;
        mime = recovered.mime;
        imagesUnwrapped += 1;
      }
    }
    const size = mime ? imageSize(payload) : null;
    media.set(name, {
      bytes: payload.byteLength,
      contentKey: contentKey(payload),
      height: size?.height ?? null,
      mime,
      width: size?.width ?? null,
    });
    if (mime) imageBytes.set(name, payload);
  }

  const plan = planSlideMedia({ media, relsXml, slideXml });
  // Only the pictures actually being described need to stay in memory.
  const keep = new Set(plan.images.map((image) => image.name));
  for (const name of [...imageBytes.keys()]) if (!keep.has(name)) imageBytes.delete(name);

  return {
    coverage: {
      charts,
      diagrams,
      imagesDroppedToCap: plan.droppedToCap,
      imagesFound: plan.found,
      imagesGlyphs: plan.skippedGlyphs,
      imagesReadable: plan.images.length,
      imagesUnreadable: plan.unreadable,
      imagesUnwrapped,
      notesPages,
      slides: slides.length,
    },
    imageBytes,
    media: plan,
    slides,
  };
}

/** Fold figure descriptions into a deck's slides and flatten to one document. */
export function pptxTextWithFigures(contents: PptxContents, descriptions: ReadonlyMap<string, string>): OfficeExtract {
  const merged = mergeImageDescriptions(contents.slides, descriptions, contents.media.images);
  const text = collapseBlankLines(merged.filter((s) => s.length > 0).join("\n\n"));
  return { title: firstLine(text), text };
}
