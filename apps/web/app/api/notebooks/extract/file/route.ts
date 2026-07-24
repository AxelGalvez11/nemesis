// Notebook file source extraction — turns an uploaded PDF / Word / PowerPoint into plain text server
// side (Node runtime: unpdf + fflate need it), then hands the text back to the client, which writes
// the notebook_sources row under its own RLS session. The file bytes are never stored — text in,
// text out (the "extract to text" pipeline). This route does no DB writes.
//
// It is the single chokepoint for THREE lanes — Library import (library-sidebar.tsx), notebook
// sources (notebook-source-actions.ts), and chat attachments (chat-attachments.ts) — so the
// scanned-PDF vision fallback below reaches all of them from one place.
//
// Secrets: none required. GEMINI_API_KEY is read ONLY if present, purely to enable that fallback;
// with no key the route behaves exactly as it did before (see lib/pdf/vision.ts).
import { NextResponse } from "next/server";

import { extractDocxText, pptxTextWithFigures, readPptxSlides } from "@/lib/notebooks/office";
import { extractPdfText, guessTitle } from "@/lib/pdf/extract";
import { describeFiguresWithVision, readPdfWithVision } from "@/lib/pdf/vision";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB upload ceiling.

type FileKind = "pdf" | "docx" | "pptx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function kindFor(name: string, type: string): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || type === DOCX_MIME) return "docx";
  if (lower.endsWith(".pptx") || type === PPTX_MIME) return "pptx";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  // Require the student's device key — same gate as the URL route, so this parse endpoint can't be
  // hit anonymously to burn CPU on arbitrary uploads.
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer.startsWith("nmk_")) {
    return NextResponse.json({ error: "This device needs to re-connect to your account. Try again." }, { status: 401 });
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

  const kind = kindFor(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      { error: "Unsupported file. Add a PDF, Word (.docx), or PowerPoint (.pptx)." },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    let result: { title: string | null; text: string };
    let readBy: string | undefined;
    let skippedFigures = 0;
    if (kind === "pdf") {
      const r = await extractPdfText(bytes);
      result = { title: r.meta.title, text: r.text };
    } else if (kind === "docx") {
      result = extractDocxText(bytes);
    } else {
      // A lecture deck's content is often a picture — a pathway, a curve, a labelled
      // figure — and the text extractor cannot see any of it. Read the figures the
      // slide-media plan judges to be content, then fold their descriptions in under
      // the slides they came from. When vision is unconfigured or fails,
      // describeFiguresWithVision returns an empty map and this is exactly the old
      // text-only extraction.
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
      // Reading only some of a deck's figures must never look like reading all of
      // them, so say what was left out.
      if (deck.media.droppedToCap > 0) skippedFigures = deck.media.droppedToCap;
    }

    let text = result.text.trim();
    // A scanned or photographed PDF has no text LAYER to extract — the words are
    // pixels. That used to be the end of the road (the 422 below). When vision is
    // configured we read the pages instead; when it is not, or the file is too
    // big, or the provider fails, readPdfWithVision returns null and the original
    // 422 stands unchanged. See lib/pdf/vision.ts.
    if (!text && kind === "pdf") {
      const seen = await readPdfWithVision(bytes);
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read that file." },
      { status: 422 },
    );
  }
}
