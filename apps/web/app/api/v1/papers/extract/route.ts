import { NextRequest, NextResponse } from "next/server";

import { extractPdfText } from "@/lib/pdf/extract";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// This route accepts an uploaded PDF and runs a CPU-bound parse, so it is not a public open door. Two
// guards mirror api/v1/evidence/search: (1) require a signed-in user; (2) a per-instance sliding-window
// rate cap. Plus a hard byte cap so a huge upload can't exhaust memory before we even parse.
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — matches the composer upload sheet's client-side cap
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20; // extractions per window per instance — a backstop, not the primary gate (auth is)
let hits: number[] = [];
function rateLimited(now: number): boolean {
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

/** Read the PDF bytes from either a multipart form (field "file") or a raw application/pdf body. */
async function readPdfBytes(req: NextRequest): Promise<{ bytes: Uint8Array } | { error: string; status: number }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Attach a PDF file in the 'file' field.", status: 400 };
    if (file.size > MAX_BYTES) return { error: "That PDF is over the 15 MB limit.", status: 413 };
    if (file.type && file.type !== "application/pdf") return { error: "Only PDF files are supported.", status: 415 };
    return { bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  if (contentType.includes("application/pdf")) {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return { error: "That PDF is over the 15 MB limit.", status: 413 };
    return { bytes: new Uint8Array(buf) };
  }
  return { error: "Send a PDF as multipart/form-data (field 'file') or as an application/pdf body.", status: 400 };
}

/** True when the bytes start with the PDF magic number "%PDF-". */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export async function POST(req: NextRequest) {
  const user = await verifyBearer(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized", message: "Sign in to upload a paper." }, { status: 401 });
  }
  if (rateLimited(Date.now())) {
    return NextResponse.json({ error: "rate_limited", message: "Too many uploads right now — try again shortly." }, { status: 429 });
  }

  const read = await readPdfBytes(req);
  if ("error" in read) {
    return NextResponse.json({ error: "bad_upload", message: read.error }, { status: read.status });
  }
  if (!looksLikePdf(read.bytes)) {
    return NextResponse.json({ error: "not_a_pdf", message: "That file is not a PDF." }, { status: 415 });
  }

  try {
    const result = await extractPdfText(read.bytes);
    if (!result.text) {
      return NextResponse.json(
        { error: "no_text_layer", message: "No selectable text found — this looks like a scanned image PDF. Journal-club appraisal needs a text-based PDF." },
        { status: 422 },
      );
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[papers/extract]", err);
    return NextResponse.json(
      { error: "extract_failed", message: "That PDF could not be read. It may be corrupt or password-protected." },
      { status: 422 },
    );
  }
}
