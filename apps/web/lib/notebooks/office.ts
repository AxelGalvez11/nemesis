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
export function unzipBounded(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  let entries = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      entries += 1;
      if (entries > UNZIP_MAX_ENTRIES) {
        throw new Error("That file has too many parts to open safely.");
      }
      // `originalSize` is the header's claim, which a crafted zip can lie about.
      // It is still worth checking: an honest bomb is refused before a single
      // byte is inflated. The post-inflation sum below is what catches a liar.
      total += file.originalSize ?? 0;
      if (total > UNZIP_MAX_TOTAL_BYTES) {
        throw new Error("That file is too large once unpacked. Try exporting it again, or split it up.");
      }
      return true;
    },
  });

  // 🔴 THE POST-INFLATION SUM THAT USED TO LIVE HERE HAS BEEN DELETED, AND
  // NOTHING SHOULD PUT IT BACK.
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
  return files;
}

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
  const files = unzipBounded(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That doesn't look like a Word (.docx) file.");
  const text = docxXmlToText(strFromU8(doc));
  return { title: firstLine(text), text };
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

  for (const name of slideNames) {
    const xml = read(name);
    if (xml === null) continue;
    slideXml.set(name, xml);

    const relsName = `ppt/slides/_rels/${name.split("/").pop()}.rels`;
    const rels = read(relsName);
    if (rels) relsXml.set(relsName, rels);
    const targets = rels ? [...parseSlideRels(rels).values()] : [];

    // The slide's own words, with the lecturer's emphasis intact. Bold marking is
    // switched off for a slide that is bold throughout, where bold is the body font
    // rather than a signal about what matters.
    const md = pptxSlideXmlToMarkdown(xml, !slideBoldIsUniform(xml));
    if (deckTitle === null && md.title) deckTitle = md.title;
    slideTitles.push(md.title);

    // Everything this slide points at, gathered under the slide that uses it.
    const blocks: string[] = [md.body];
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
    // A slide marker gives the model a boundary it can cite and makes relative
    // airtime visible — six slides on one topic and one on another is itself a
    // signal, and it is unreadable once the slides run together. An empty slide
    // stays empty: mergeImageDescriptions aligns slide N to index N-1, and a bare
    // heading would turn a picture-only slide into content it does not have.
    // Blank line between blocks, not a single newline. The slide body is now a bullet
    // list, and one newline after a list item is a CONTINUATION of that item — on a
    // real deck the speaker notes rendered as part of the last bullet on the phone
    // instead of standing on their own.
    const content = blocks.filter((block) => block.trim().length > 0).join("\n\n");
    const heading = md.title ? `## Slide ${slides.length + 1}: ${md.title}` : `## Slide ${slides.length + 1}`;
    slides.push(content ? `${heading}\n${content}` : "");
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
  };
}

/** Fold figure descriptions into a deck's slides and flatten to one document. */
export function pptxTextWithFigures(contents: PptxContents, descriptions: ReadonlyMap<string, string>): OfficeExtract {
  const merged = mergeImageDescriptions(contents.slides, descriptions, contents.media.images);
  const text = collapseBlankLines(merged.filter((s) => s.length > 0).join("\n\n"));
  return { title: contents.deckTitle ?? firstContentLine(text), text };
}
