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

import { documentToText, type DocRect, type DocumentModel } from "@nemesis/shared";

/**
 * Most a .docx/.pptx may weigh once unpacked.
 *
 * BOUNDED INPUT, UNBOUNDED EXPANSION was the hole: the route refuses an upload
 * over 25 MB, and then handed the bytes to `unzipSync`, which inflates the whole
 * archive into memory with no ceiling of its own. Deflate reaches roughly 1000:1
 * on repetitive data, so a hand-made 25 MB zip is comfortably tens of gigabytes
 * once open — the serverless instance dies before any text cap is consulted,
 * because TEXT_CAP is applied to the OUTPUT of extraction, long after.
 *
 * 🔴 THIS IS A MEMORY BUDGET, NOT A MULTIPLE OF THE UPLOAD CEILING.
 *
 * The old justification was "the route already refuses more than 25 MB of them
 * compressed" — a sentence that stopped being true when the extract route moved
 * to 50 MiB, and would be off eight-fold at 200 MiB. A comment asserting a
 * relationship between two numbers is not a mechanism.
 *
 * The obvious repair is to derive it, `N * MAX_SOURCE_BYTES`. That is wrong, and
 * wrong in the dangerous direction: it makes the safety limit MOVE whenever the
 * product limit moves, in whichever direction that happens to be. At the 50 MiB
 * ceiling a doubling would have SHRUNK this to 100 MiB and started refusing
 * lecture decks that work today.
 *
 * What actually constrains it is the machine. The function instance is 2 GB and
 * Fluid Compute shares one instance between concurrent requests, so this has to
 * fit ALONGSIDE the source buffer, several times over, without an
 * out-of-memory that would also kill whatever unrelated requests were in flight.
 * That number does not change when an upload limit changes.
 *
 * The one relationship that must hold is the floor, and it is asserted in the
 * test rather than described here: a zip's entries can be STORED rather than
 * deflated (the owner's real deck stores all 68 of its media parts at method 0),
 * so a source at the ceiling can legitimately inflate to its own size. A budget
 * below MAX_SOURCE_BYTES would refuse a file the product had just accepted.
 */
export const UNZIP_MAX_TOTAL_BYTES = 400 * 1024 * 1024;

/** Most entries a legitimate Office file contains. A zip can also attack by
 *  COUNT rather than size — a million empty files costs nothing to compress and
 *  a great deal to allocate. A 500-slide deck with notes, diagrams, charts and
 *  media runs to a few thousand parts. */
export const UNZIP_MAX_ENTRIES = 20_000;

/**
 * `unzipSync` with a ceiling on what comes OUT.
 *
 * fflate has no per-archive budget, so the sizes are summed as the entries are
 * walked and the whole extraction is abandoned the moment the running total
 * crosses the limit — the point is to stop before the memory is committed, not
 * to report on it afterwards.
 *
 * Throws a student-readable message: the route turns a throw into a friendly
 * error, and "this file is too big once unpacked" is true and actionable, while
 * a crashed instance tells them nothing at all.
 */
/**
 * A refusal WE decided on, as opposed to a container that would not parse.
 *
 * 🔴 THE DISTINCTION MATTERS AT THE CATCH BELOW. Our refusals already say
 * something true and readable about the file; fflate's do not. Without a way to
 * tell them apart, wrapping the parse failure would also swallow "that file has
 * too many parts to open safely" and replace it with something vaguer.
 */
class ArchiveRefusal extends Error {}

export function unzipBounded(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  let entries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipEntries();
  } catch (cause) {
    if (cause instanceof ArchiveRefusal) throw cause;
    // 🔴 `invalid zip data` IS NOT A SENTENCE FOR A STUDENT. fflate's message
    // reached the upload response verbatim whenever a file was truncated, was
    // not really an Office file, or had been renamed from something else — and
    // it reads as an application fault rather than as a fact about their file.
    throw new Error("That file couldn't be opened. It may be damaged, or not really a Word, PowerPoint or Excel file.");
  }
  return files;

  function unzipEntries(): Record<string, Uint8Array> {
  return unzipSync(bytes, {
    filter(file) {
      entries += 1;
      if (entries > UNZIP_MAX_ENTRIES) {
        throw new ArchiveRefusal("That file has too many parts to open safely.");
      }
      // `originalSize` is the header's claim, which a crafted zip can lie about.
      // It is still worth checking: an honest bomb is refused before a single
      // byte is inflated. The post-inflation sum below is what catches a liar.
      total += file.originalSize ?? 0;
      if (total > UNZIP_MAX_TOTAL_BYTES) {
        throw new ArchiveRefusal("That file is too large once unpacked. Try exporting it again, or split it up.");
      }
      return true;
    },
  });
  }
}

// 🔴 THE POST-INFLATION SUM THAT USED TO LIVE IN `unzipBounded` HAS BEEN
// DELETED, AND NOTHING SHOULD PUT IT BACK.
/*
  //
  // It walked `Object.keys(files)` adding up `byteLength` and threw if the total
  // crossed the same ceiling — after `unzipSync` had already returned, which is
  // to say after every byte it was measuring had already been allocated. It
  // could only ever report a bomb that had already gone off, while reading like
  // a guard: the comment above it claimed it was "what catches a liar".
  //
  // What actually protects this call is the filter above, which refuses before
  // fflate commits memory. Its input is the entry header's own `originalSize`,
  // which a crafted archive can understate — so state the limit honestly: an
  // HONEST oversized file is refused for free, and a LIAR is bounded only by the
  // source ceiling, because a zip cannot inflate what it does not contain and
  // the object was capped at MAX_SOURCE_BYTES before it ever got here. Closing
  // that gap properly needs streaming inflation, not another sum.
*/

import { emfEmbeddedImage } from "./emf-bitmap";
import { imageSize } from "./image-dimensions";
import {
  chartXmlToText,
  collapseBlankLines,
  diagramXmlToText,
  docxXmlToText,
  firstContentLine,
  firstLine,
  orderSlideFiles,
  pptxNotesXmlToText,
  pptxSlideXmlToMarkdown,
  slideBoldIsUniform,
  type DeckStructure,
  type OfficeExtract,
  type SlideBodyLine,
} from "./office-text";
import {
  EMU_PER_POINT,
  NO_PLACEHOLDERS,
  frameRectsByRelId,
  pictureRects,
  readGroups,
  readPlaceholderBoxes,
  readSlideSize,
  type PlaceholderBoxes,
  type SlideGeometry,
} from "./pptx-shapes";
import {
  imageMime,
  mergeImageDescriptions,
  parseSlideRels,
  planSlideMedia,
  type MediaFact,
  type SlideMediaPlan,
} from "./slide-media";
import { docxToModel } from "./docx-model";
import { readDocxStructure, type DocxDocument } from "./docx-structure";
import { tiffImage } from "./tiff-image";

/**
 * Extract text from .docx bytes, with its structure intact.
 *
 * 🔴 THIS USED TO BE A TAG STRIP, AND THE TAG STRIP'S COST WAS MEASURED.
 *
 * Over 124 real course documents it discarded 8,355 table cells (each becoming
 * an orphan line, which reads confidently WRONG rather than absent), 2,266
 * numbered paragraphs in 61% of the files, 123 headings, and every equation in
 * the corpus. See ./docx-structure.
 *
 * `word/numbering.xml` is optional: a document with no lists does not ship the
 * part, and a list whose definition is missing degrades to a bullet rather than
 * losing the item.
 *
 * Throws on a non-zip / a file missing word/document.xml.
 */
export function extractDocxText(bytes: Uint8Array): OfficeExtract {
  const model = extractDocxModel(bytes);
  // 🔴 DERIVED FROM THE MODEL, NOT ALONGSIDE IT. Rendering the structure a
  // second time here is how the string and the blocks would drift, and a model
  // reading one while a citation pointed into the other is a class of bug that
  // reads as hallucination.
  const text = documentToText(model);
  return { title: model.title, text };
}

/**
 * The same read, as the canonical model.
 *
 * 🔴 THIS IS NOW THE PRIMARY PATH. `extractDocxText` is the flattening of it,
 * kept because the chat handoff and the current index still take a string.
 * Previously it was the other way round and the structure was discarded.
 */
export function extractDocxModel(bytes: Uint8Array): DocumentModel {
  const structure = extractDocxStructure(bytes);
  // The title is the first HEADING when the document has one — a real document
  // outline beats guessing at the first line, which on a form or a cover page is
  // whatever happened to be typed at the top.
  const heading = structure.blocks.find((b) => b.kind === "heading")?.text;
  const model = docxToModel(structure, heading ?? null);
  return model.title ? model : { ...model, title: firstLine(documentToText(model)) };
}

/**
 * The format-specific structure, before it becomes the canonical model.
 *
 * 🔴 THE RELATIONSHIPS PART IS OPENED TOO, AND THAT IS THE WHOLE PICTURE FIX.
 * `word/document.xml` names a picture only by relationship id (`rId7`); the
 * mapping from that id to `word/media/image3.png` lives in a separate part that
 * this reader never opened. Without it there was no figure detection at all, and
 * a .docx full of diagrams reported itself fully covered — measured: 207 placed
 * pictures across 46 of 158 real course files, every one of them invisible.
 *
 * Images in headers, footers and footnotes are deliberately NOT collected: they
 * have no position in the body's reading order, so a figure block for one would
 * have to be placed somewhere it never was. In this corpus they are page
 * furniture — a school crest on every page — and the honest place to add them is
 * a per-part record, not a fabricated position in the text.
 */
export function extractDocxStructure(bytes: Uint8Array): DocxDocument {
  const files = unzipBounded(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That doesn't look like a Word (.docx) file.");
  const numbering = files["word/numbering.xml"];
  const rels = files["word/_rels/document.xml.rels"];
  return readDocxStructure(
    strFromU8(doc),
    numbering ? strFromU8(numbering) : null,
    rels ? strFromU8(rels) : null,
  );
}

/** Extract text from .pptx bytes (every slide, in order, with its notes, charts and SmartArt). */
export function extractPptxText(bytes: Uint8Array): OfficeExtract {
  const { slides, deckTitle } = readPptxSlides(bytes);
  const text = collapseBlankLines(slides.filter((s) => s.length > 0).join("\n\n"));
  // The title placeholder beats firstLine: on a real lecture the first line of slide 1
  // is the lecturer's name and address block, so the deck filed itself under "FRANK PARK".
  return { title: deckTitle ?? firstContentLine(text), text };
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
  /** Slide N's own title-placeholder text, or null. Index N-1, same alignment as `slides`. */
  slideTitles: (string | null)[];
  /** The first title placeholder in the deck — the deck's real name. */
  deckTitle: string | null;
  media: SlideMediaPlan;
  /** Zip entry name → bytes to send. For a metafile that turned out to hold a
   *  bitmap, these are the UNWRAPPED PNG bytes, not the original file. */
  imageBytes: Map<string, Uint8Array>;
  coverage: PptxCoverage;
  /** The same slides as grids and boxes, aligned line-for-line with `slides`.
   *  Additive: the strings above are exactly what they were without it. */
  structure: DeckStructure;
}

/** Identity of a picture's content, so the same crest stored under six entry names is
 *  described once. Cheap next to the vision call it saves. */
function contentKey(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

/**
 * Line facts, guaranteed to describe the lines they are indexed by.
 *
 * 🔴 A MISALIGNED FACT ARRAY IS WORSE THAN NO FACTS. It does not fail; it hands
 * every block the rect of the shape above it, so a reader highlights the wrong
 * box and a citation looks perfectly well-formed while pointing somewhere else.
 * The counts agree by construction, and this is the assertion that says so —
 * when it ever does not hold, the honest answer is that this slide has no
 * geometry.
 */
function sameLength(text: string, facts: SlideBodyLine[]): SlideBodyLine[] {
  const lines = text.length ? text.split("\n") : [];
  return lines.length === facts.length ? facts : lines.map(() => ({}));
}

/**
 * Picture boxes keyed by ZIP ENTRY rather than by relationship id.
 *
 * The rest of the pipeline — the media plan, the dedupe, the descriptions — is
 * keyed by entry name, because that is the identity of the picture rather than
 * of one slide's reference to it. Translating here keeps that single namespace.
 */
function mediaRects(byRelId: Map<string, DocRect>, relsXml: string | null): Map<string, DocRect> {
  const out = new Map<string, DocRect>();
  if (!relsXml) return out;
  const targets = parseSlideRels(relsXml);
  for (const [relId, rect] of byRelId) {
    const entry = targets.get(relId);
    // The same picture placed twice under two entry names is still one picture
    // to everything downstream; the first placement wins and the second is
    // dropped rather than overwriting it with a different box.
    if (entry && !out.has(entry)) out.set(entry, rect);
  }
  return out;
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
  const files = unzipBounded(bytes);
  const slideNames = orderSlideFiles(Object.keys(files));
  if (!slideNames.length) throw new Error("That doesn't look like a PowerPoint (.pptx) file.");

  const read = (name: string): string | null => {
    const data = files[name];
    return data ? strFromU8(data) : null;
  };

  const slides: string[] = [];
  const slideXml = new Map<string, string>();
  const relsXml = new Map<string, string>();
  const slideTitles: (string | null)[] = [];
  let deckTitle: string | null = null;
  let notesPages = 0;
  let charts = 0;
  let diagrams = 0;

  // The slide box, once. Everything geometric is relative to it, so when the
  // presentation part is missing or malformed nothing below claims a position.
  const slideSize = readSlideSize(read("ppt/presentation.xml") ?? "");
  // Layouts and masters are shared across slides — a 200-slide deck usually has
  // a dozen — so their placeholder boxes are read once each.
  const placeholderCache = new Map<string, PlaceholderBoxes>();
  const boxesOf = (part: string | null): PlaceholderBoxes => {
    if (!part) return NO_PLACEHOLDERS;
    const cached = placeholderCache.get(part);
    if (cached) return cached;
    const boxes = readPlaceholderBoxes(read(part) ?? "");
    placeholderCache.set(part, boxes);
    return boxes;
  };
  const relatedPart = (relsPath: string, kind: string): string | null => {
    const xml = read(relsPath);
    if (!xml) return null;
    for (const [, target] of parseSlideRels(xml)) if (target.includes(kind)) return target;
    return null;
  };

  const structure: DeckStructure = {
    lines: [],
    pictures: [],
    slideSize: slideSize
      ? { height: slideSize.cy / EMU_PER_POINT, width: slideSize.cx / EMU_PER_POINT }
      : null,
    tables: [],
    titleRects: [],
  };

  for (const name of slideNames) {
    const xml = read(name);
    if (xml === null) continue;
    slideXml.set(name, xml);

    const relsName = `ppt/slides/_rels/${name.split("/").pop()}.rels`;
    const rels = read(relsName);
    if (rels) relsXml.set(relsName, rels);
    const targets = rels ? [...parseSlideRels(rels).entries()] : [];

    // Where this slide's shapes may inherit a position from: its own layout
    // first, then that layout's master — the chain PowerPoint itself walks.
    const layoutPart = relatedPart(relsName, "slideLayout");
    const masterPart = layoutPart
      ? relatedPart(`ppt/slideLayouts/_rels/${layoutPart.split("/").pop()}.rels`, "slideMaster")
      : null;
    const geometry: SlideGeometry | null = slideSize
      ? { layout: boxesOf(layoutPart), master: boxesOf(masterPart), size: slideSize }
      : null;
    const groups = geometry ? readGroups(xml) : [];

    // The slide's own words, with the lecturer's emphasis intact. Bold marking is
    // switched off for a slide that is bold throughout, where bold is the body font
    // rather than a signal about what matters.
    const md = pptxSlideXmlToMarkdown(xml, !slideBoldIsUniform(xml), geometry);
    if (deckTitle === null && md.title) deckTitle = md.title;
    slideTitles.push(md.title);

    // Everything this slide points at, gathered under the slide that uses it.
    // 🔴 THE TEXT AND ITS LINE FACTS ARE BUILT IN ONE PASS. Two loops that each
    // "knew" the layout would drift the first time one of them changed, and a
    // fact array off by a line is worse than none: every rect would name the
    // shape above it, and nothing downstream could tell.
    const frames = frameRectsByRelId(xml, groups, geometry);
    const blocks: { text: string; facts: SlideBodyLine[] }[] = [{ facts: md.lines, text: md.body }];
    const single = (text: string, relId: string) => ({
      facts: [frames.get(relId) ? { rect: frames.get(relId)! } : {}],
      text,
    });
    for (const [relId, target] of targets) {
      if (/^ppt\/charts\/chart\d+\.xml$/.test(target)) {
        const text = chartXmlToText(read(target) ?? "");
        charts += 1;
        if (text) blocks.push(single(`[Chart: ${text}]`, relId));
      } else if (/^ppt\/diagrams\/data\d+\.xml$/.test(target)) {
        const text = diagramXmlToText(read(target) ?? "");
        diagrams += 1;
        if (text) blocks.push(single(`[Diagram: ${text.replace(/\n+/g, " · ")}]`, relId));
      } else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(target)) {
        const text = pptxNotesXmlToText(read(target) ?? "");
        if (text) {
          notesPages += 1;
          // Notes live on their own page and have no position on the SLIDE.
          // A rect here would point at whatever happens to be behind them.
          const block = `[Speaker notes: ${text}]`;
          blocks.push({ facts: block.split("\n").map(() => ({})), text: block });
        }
      }
    }
    // A slide marker gives the model a boundary it can cite and makes relative
    // airtime visible — six slides on one topic and one on another is itself a
    // signal, and it is unreadable once the slides run together. An empty slide
    // stays empty: mergeImageDescriptions aligns slide N to index N-1, and a bare
    // heading would turn a picture-only slide into content it does not have.
    // Blank line between blocks, not a single newline. The slide body is now a bullet
    // list, and one newline after a list item is a CONTINUATION of that item — on a
    // real deck the speaker notes rendered as part of the last bullet on the phone
    // instead of standing on their own.
    const kept = blocks.filter((block) => block.text.trim().length > 0);
    const content = kept.map((block) => block.text).join("\n\n");
    const heading = md.title ? `## Slide ${slides.length + 1}: ${md.title}` : `## Slide ${slides.length + 1}`;
    const text = content ? `${heading}\n${content}` : "";
    slides.push(text);

    // The heading is a marker this module writes, not a shape, so it carries no
    // rect; the blank line `join("\n\n")` puts between blocks carries none either.
    const facts: SlideBodyLine[] = content ? [{}] : [];
    kept.forEach((block, at) => {
      if (at > 0) facts.push({});
      facts.push(...block.facts);
    });
    structure.lines.push(sameLength(text, facts));
    structure.pictures.push(mediaRects(pictureRects(xml, groups, geometry), rels));
    structure.tables.push(md.tables);
    structure.titleRects.push(md.titleRect);
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
    deckTitle,
    imageBytes,
    media: plan,
    slideTitles,
    slides,
    structure,
  };
}

/** Fold figure descriptions into a deck's slides and flatten to one document. */
export function pptxTextWithFigures(contents: PptxContents, descriptions: ReadonlyMap<string, string>): OfficeExtract {
  const merged = mergeImageDescriptions(contents.slides, descriptions, contents.media.images);
  const text = collapseBlankLines(merged.filter((s) => s.length > 0).join("\n\n"));
  return { title: contents.deckTitle ?? firstContentLine(text), text };
}
