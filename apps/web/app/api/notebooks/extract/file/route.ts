// Notebook file source extraction — turns an uploaded PDF / Word / PowerPoint into plain text server
// side (Node runtime: unpdf + fflate need it), then hands the text back to the client, which writes
// the notebook_sources row under its own RLS session. The file bytes are never stored — text in,
// text out (the "extract to text" pipeline). This route holds no secrets and does no DB writes.
import { NextResponse } from "next/server";

import { extractDocxText, extractPptxText } from "@/lib/notebooks/office";
import { extractPdfText } from "@/lib/pdf/extract";

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
    if (kind === "pdf") {
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read that file." },
      { status: 422 },
    );
  }
}
