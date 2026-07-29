// Notebook file source extraction — turns an uploaded PDF / Word / PowerPoint into plain text server
// side (Node runtime: unpdf + fflate need it), then hands the text back to the client, which writes
// the notebook_sources row under its own RLS session. The file bytes are never stored — text in,
// text out (the "extract to text" pipeline). This route does no DB writes.
//
// It is the single chokepoint for THREE lanes — Library import (library-sidebar.tsx), notebook
// sources (notebook-source-actions.ts), and chat attachments (chat-attachments.ts) — so the
// scanned-PDF vision fallback below reaches all of them from one place.
//
// Secrets: none required to PARSE. GEMINI_API_KEY is read only if present, to enable that fallback
// (lib/pdf/vision.ts) — and because it IS present in production, this route can turn an upload into
// a billed API call on our account. That is why the gate below is a real lookup: see verifyDeviceKey.
import { NextResponse } from "next/server";

import { bearerFrom, verifyDeviceKey } from "@/lib/device-key";
import { extractDocxText, pptxTextWithFigures, readPptxSlides } from "@/lib/notebooks/office";
import { capText, extractPdfText, guessTitle, TEXT_CAP } from "@/lib/pdf/extract";
import { finishPdfPages, planPdfRead, thinPages, unreadPages } from "@/lib/pdf/pages";
import { describeFiguresWithVision, readPdfPagesWithVision, readPdfWithVision } from "@/lib/pdf/vision";
import { PHOTO_PROMPT, readWithVision, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

export const runtime = "nodejs";
/** A picture-heavy lecture now costs several transcription calls in waves of
 *  three. The worst file in a real 83-PDF course needs 26 pages read — four
 *  requests, two waves — so the old implicit budget is no longer obviously
 *  enough to state by omission. */
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB upload ceiling.

type FileKind = "pdf" | "docx" | "pptx" | "image";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function kindFor(name: string, type: string): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || type === DOCX_MIME) return "docx";
  if (lower.endsWith(".pptx") || type === PPTX_MIME) return "pptx";
  if (visionMime(name, type)) return "image";
  return null;
}

/**
 * What a file IS, when its name no longer says.
 *
 * A real course folder had two lecture PDFs whose long filenames had been truncated
 * past the ".pdf" — the app refused both, and the student would have had no idea why
 * a file that opens fine everywhere else could not be added. The contents are
 * unambiguous, so read them: a PDF opens with "%PDF", and the Office formats are zips
 * whose first entry names say which one they are. PURE.
 */
// NOT exported: Next type-checks a route file's exports against its own Route
// type and rejects any extra one ("sniffKind is not a valid Route export
// field"), which fails `next build` outright. Nothing imports this — the export
// keyword was never load-bearing. If it is ever needed elsewhere, move the
// function to lib/ rather than exporting it from a route.
function sniffKind(bytes: Uint8Array): FileKind | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return null;
  // Only the entry names are needed, and they are plain ASCII in the headers, so a
  // scan beats unpacking a 25 MB archive to answer one question.
  const window = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512 * 1024))).toString("latin1");
  if (window.includes("ppt/slides/")) return "pptx";
  if (window.includes("word/document.xml")) return "docx";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  // 🔴 RESOLVE the device key; do not glance at how it starts.
  //
  // This used to be `bearer.startsWith("nmk_")` and nothing else, which is a
  // SHAPE check wearing an auth check's clothes. The sibling URL route and
  // /api/workspace/search carry the same-looking line and are fine, because both
  // FORWARD the header to a Supabase function that resolves it. This route
  // forwards it nowhere — so the line that read identically was, here, the only
  // thing between a made-up string and a Gemini bill on our key.
  //
  // lib/device-key.ts was written for exactly this (PR #284) and was never
  // imported by anything but its own test. A fix that is not wired in is not a
  // fix; grep for the CALLER, not the helper.
  const check = await verifyDeviceKey(bearerFrom(req.headers.get("authorization")));
  if (!check.ok) {
    // "unavailable" means our lookup broke, not that the caller is an impostor —
    // 503 so a database blip reads as "try again", never as "your device is
    // broken", and never as a pass.
    return check.reason === "unavailable"
      ? NextResponse.json({ error: "Can't check this device right now. Try again in a moment." }, { status: 503 })
      : NextResponse.json({ error: "This device needs to re-connect to your account. Try again." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (25 MB max)." }, { status: 413 });
  }

  // ONE defensive copy, here, at the door. pdf.js detaches whatever ArrayBuffer it
  // is handed, so every later reader of these bytes — the page slicer, a second
  // sniff — would silently see zeros. Copying at each call site instead would work
  // right up until the next reader was added and forgot.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const original = new Uint8Array(bytes);
  // Name first (cheap and right almost always), contents second (right when a name
  // has lost its extension). Refusing only after both have failed.
  const kind = kindFor(file.name, file.type) ?? sniffKind(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: "Unsupported file. Add a photo, a PDF, Word (.docx), or PowerPoint (.pptx)." },
      { status: 415 },
    );
  }
  if (kind === "image") {
    if (file.size > VISION_MAX_BYTES) {
      return NextResponse.json({ error: "That picture is too large (14 MB max)." }, { status: 413 });
    }
    if (!visionConfigured()) {
      return NextResponse.json({ error: "Reading photos isn't switched on for this app yet." }, { status: 503 });
    }
  }

  try {
    let result: { title: string | null; text: string };
    let readBy: string | undefined;
    let skippedFigures = 0;
    let coverage: Record<string, number | boolean> | undefined;
    if (kind === "image") {
      const seen = await readWithVision(original, visionMime(file.name, file.type) ?? "image/jpeg", {
        prompt: PHOTO_PROMPT,
      });
      result = { text: seen?.text ?? "", title: seen ? guessTitle(seen.text) : null };
      readBy = seen?.model;
    } else if (kind === "pdf") {
      const r = await extractPdfText(original);
      result = { title: r.meta.title, text: r.text };
      // Pages whose content is a picture. The old fallback below only fires when the
      // WHOLE file comes back empty, so a lecture with a readable contents page and
      // forty pictures of slides counted as fully read. Measured on the owner's real
      // course: 308 such pages across 83 files that all "read" fine before.
      const plan = planPdfRead(r.pageTexts);
      // Every page is a picture: readPdfWithVision reads the whole document in one
      // request, with no per-document page cap. Slicing is the fallback for that
      // shape, never the upgrade.
      if (plan.kind === "whole") {
        const whole = await readPdfWithVision(original);
        if (whole?.text.trim()) {
          const { text: capped, truncated } = capText(whole.text.trim(), TEXT_CAP);
          result = { title: result.title ?? guessTitle(capped), text: capped };
          readBy = whole.model;
          coverage = { pages: r.meta.pages, pagesFromText: 0, pagesRead: r.meta.pages, pagesUnread: 0, truncated };
        }
      }
      if (plan.kind !== "text" && !readBy) {
        const thin = thinPages(r.pageTexts);
        // A "whole" document that vision could not take (over the inline limit, or
        // the request failed) still gets its pages read one slice at a time.
        const needed = plan.kind === "pages" ? plan.needed : unreadPages(r.pageTexts);
        const seen = await readPdfPagesWithVision(original, needed);
        const read = finishPdfPages(r.pageTexts, seen, thin, TEXT_CAP);
        if (seen.size > 0) {
          result = { ...result, text: read.text };
          readBy = "pages";
        }
        coverage = {
          pages: r.meta.pages,
          pagesFromText: r.meta.pages - thin.length,
          pagesRead: seen.size,
          // Counted against EVERY picture-page, not just the ones that were sent —
          // a page dropped to the per-document cap is unread too, and rolling it
          // into pagesFromText would make the cap invisible.
          pagesUnread: thin.length - seen.size,
          truncated: seen.size > 0 ? read.truncated : r.meta.truncated,
        };
      } else if (plan.kind === "text" && r.meta.truncated) {
        // Nothing to read as a picture, but the tail was still dropped at TEXT_CAP.
        // That was computed and thrown away; say it, so a clipped source is never
        // presented as a whole one.
        coverage = { pages: r.meta.pages, truncated: true };
      }
    } else if (kind === "docx") {
      result = extractDocxText(bytes);
    } else {
      // A lecture deck's content is often a picture — a pathway, a curve, a labelled
      // figure — and the text extractor cannot see any of it. Read the figures the
      // slide-media plan judges to be content, then fold their descriptions in under
      // the slides they came from. When vision is unconfigured or fails,
      // describeFiguresWithVision returns an empty map and this is exactly the old
      // text-only extraction. readPptxSlides also brings the deck's speaker notes,
      // SmartArt and chart labels, which live outside ppt/slides/ entirely.
      const deck = readPptxSlides(bytes);
      const figures = deck.media.images.length
        ? await describeFiguresWithVision(
            deck.media.images.flatMap((image) => {
              const data = deck.imageBytes.get(image.name);
              return data ? [{ bytes: data, mime: image.mime, name: image.name }] : [];
            }),
          )
        : new Map<string, string>();
      result = pptxTextWithFigures(deck, figures);
      if (figures.size > 0) readBy = "figures";
      // Reading only some of a deck is allowed; presenting it as a full read is not.
      // The whole tally travels with the text: how many slides, notes pages, charts
      // and diagrams were read, how many pictures were found, and for each picture
      // that was NOT described, which reason applied.
      if (deck.media.droppedToCap > 0) skippedFigures = deck.media.droppedToCap;
      coverage = { ...deck.coverage, imagesDescribed: figures.size };
    }

    let text = result.text.trim();
    // Word and PowerPoint were never capped, only PDF was. A deck now carries slide
    // headings and bullet markers on top of its words, so the ceiling matters more
    // than it did — and an uncapped 300-slide deck would otherwise ride the whole
    // way into a database row and a prompt. Cap to the same TEXT_CAP the PDF lane
    // uses, and REPORT it: a partial read presented as a complete one is the one
    // outcome this route is built to avoid.
    if (kind !== "pdf") {
      const capped = capText(text, TEXT_CAP);
      text = capped.text;
      if (capped.truncated) coverage = { ...(coverage ?? {}), truncated: true };
    }
    // A scanned or photographed PDF has no text LAYER to extract — the words are
    // pixels. That used to be the end of the road (the 422 below). When vision is
    // configured we read the pages instead; when it is not, or the file is too
    // big, or the provider fails, readPdfWithVision returns null and the original
    // 422 stands unchanged. See lib/pdf/vision.ts.
    if (!text && kind === "pdf") {
      const seen = await readPdfWithVision(original);
      if (seen) {
        text = seen.text.trim();
        readBy = seen.model;
        // extractPdfText derives its title from the text layer, so a scanned PDF
        // always arrived here with title null. Now that there IS text, guess from
        // it — but ONLY on this path, so Word/PowerPoint titles are untouched.
        result = { ...result, title: result.title ?? guessTitle(text) };
      }
    }

    if (!text) {
      return NextResponse.json(
        {
          error:
            kind === "pdf"
              ? "This PDF has no selectable text (it may be scanned images)."
              : kind === "image"
                ? "Couldn't read anything in that picture. Try again with more light, or hold the camera steadier."
              : "No readable text was found in that file.",
        },
        { status: 422 },
      );
    }

    const baseName = file.name.replace(/\.[^.]+$/, "").trim();
    return NextResponse.json({
      kind,
      title: result.title ?? (baseName || "Untitled document"),
      text,
      bytes: file.size,
      // Present only when the pages had to be read as images, so a caller (and
      // the student) can tell a transcription apart from an exact text layer.
      ...(readBy ? { readBy } : {}),
      // Present only when a deck had more figures than the per-deck cap, so a
      // partial read is never presented as a complete one.
      ...(skippedFigures > 0 ? { skippedFigures } : {}),
      // The full account of what was read and what was not: slides, notes, charts
      // and figures for a deck; pages read from text, read as pictures, and left
      // unread for a PDF.
      ...(coverage ? { coverage } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read that file." },
      { status: 422 },
    );
  }
}
