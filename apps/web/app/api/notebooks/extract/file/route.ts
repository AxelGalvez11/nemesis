// Notebook file source extraction — turns an uploaded PDF / Word / PowerPoint / PHOTOGRAPH into
// plain text server side (Node runtime: unpdf + fflate need it), then hands the text back to the
// client, which writes the notebook_sources row under its own RLS session. The file bytes are never
// stored — text in, text out (the "extract to text" pipeline). This route does no DB writes.
//
// It is the single chokepoint for Library import, notebook sources, chat attachments (web) and the
// phone camera, which is exactly why images are read HERE rather than through a route of their own:
// one endpoint learns to read a picture and all four lanes can.
//
// Secrets: GEMINI_API_KEY is read only to turn a picture into text (see lib/vision/gemini.ts), and
// the service role key only to VERIFY the caller's device key (lib/device-key.ts). Neither ever
// leaves the server; with no Gemini key an image upload is refused with a plain message and every
// document path behaves exactly as before.
import { NextResponse } from "next/server";

import { bearerFrom, verifyDeviceKey } from "@/lib/device-key";

import { extractDocxText, extractPptxText } from "@/lib/notebooks/office";
import { extractPdfText, guessTitle } from "@/lib/pdf/extract";
import { PHOTO_PROMPT, readWithVision, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

export const runtime = "nodejs";

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

export async function POST(req: Request): Promise<Response> {
  // VERIFY the student's device key against device_keys — do not merely look at how it starts.
  //
  // This used to be `bearer.startsWith("nmk_")` and nothing else, which meant the string "nmk_x"
  // opened the door. That was tolerable while an impostor could only spend CPU on a PDF parse.
  // It is not tolerable now that the same route calls a paid multimodal model: an unauthenticated
  // public URL that converts an upload into a billed API call is an open proxy on the owner's
  // account. See lib/device-key.ts — it fails closed on every branch.
  const check = await verifyDeviceKey(bearerFrom(req.headers.get("authorization")));
  if (!check.ok) {
    // An outage is separated from a rejection so a database blip doesn't tell a student their
    // device is broken and send them off re-pairing something that was never wrong.
    return check.reason === "unavailable"
      ? NextResponse.json({ error: "Couldn't verify this device right now. Try again in a moment." }, { status: 503 })
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

  const kind = kindFor(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      { error: "Unsupported file. Add a photo, a PDF, Word (.docx), or PowerPoint (.pptx)." },
      { status: 415 },
    );
  }

  if (kind === "image") {
    // Checked BEFORE reading the bytes, and against the vision ceiling rather than this route's
    // 25 MB one: a picture between the two limits would otherwise upload cleanly and then come
    // back as "nothing readable", which reads as a broken camera instead of an oversized file.
    if (file.size > VISION_MAX_BYTES) {
      return NextResponse.json({ error: "That picture is too large (14 MB max)." }, { status: 413 });
    }
    if (!visionConfigured()) {
      return NextResponse.json(
        { error: "Reading photos isn't switched on for this app yet." },
        { status: 503 },
      );
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    let result: { title: string | null; text: string };
    let readBy: string | undefined;
    if (kind === "image") {
      // A photograph has no text layer to extract — the words ARE pixels. Gemini reads it, and
      // describes it when there is nothing to read (a diagram, a piece of equipment), so a picture
      // that isn't a document still arrives as something the chat can talk about.
      const seen = await readWithVision(bytes, visionMime(file.name, file.type) ?? "image/jpeg", {
        prompt: PHOTO_PROMPT,
      });
      // A camera filename ("IMG_4821.HEIC") is worthless as a note title, so unlike every other
      // branch the title comes from what was actually read.
      result = { text: seen?.text ?? "", title: seen ? guessTitle(seen.text) : null };
      readBy = seen?.model;
    } else if (kind === "pdf") {
      const r = await extractPdfText(bytes);
      result = { title: r.meta.title, text: r.text };
    } else if (kind === "docx") {
      result = extractDocxText(bytes);
    } else {
      result = extractPptxText(bytes);
    }

    const text = result.text.trim();
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
      // Present only when the file had to be READ as a picture rather than parsed, so a caller
      // (and the student) can tell a transcription apart from an exact text layer.
      ...(readBy ? { readBy } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read that file." },
      { status: 422 },
    );
  }
}
