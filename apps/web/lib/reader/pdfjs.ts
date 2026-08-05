"use client";

// The ONE place pdf.js is configured. Everything that renders a PDF page goes
// through `loadPdfjs()`, so the worker is wired up exactly once and no other
// file has to know how.
//
// 🔴 Why the worker file is copied into public/ rather than resolved from
// node_modules: pdf.js runs its parser in a Web Worker, and the worker has to
// be fetched as a same-origin URL at runtime. Bundler-resolved worker URLs
// (`new URL(..., import.meta.url)`) behave differently under Turbopack dev and
// the production build, and a worker that fails to load makes pdf.js fall back
// to parsing on the main thread — which does not fail loudly, it just freezes
// the page on a big document. A static file in public/ has one behaviour in
// both environments. `scripts/copy-pdf-worker.mjs` keeps it in step with the
// installed pdfjs-dist version, and `pdfWorkerVersionMatches()` proves at
// runtime that the copy is not stale.
//
// The module is imported lazily (`await import`) so pdf.js — around a megabyte
// of parser — never lands in the bundle of a student who only ever opens notes.

import type * as PdfjsModule from "pdfjs-dist";

export type Pdfjs = typeof PdfjsModule;
export type PdfDocument = Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

/** Served from public/. Kept in step with node_modules by scripts/copy-pdf-worker.mjs. */
export const PDF_WORKER_URL = "/pdf/pdf.worker.min.mjs";

let pdfjsPromise: Promise<Pdfjs> | null = null;

export async function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    return pdfjs;
  });
  return pdfjsPromise;
}

export interface OpenedPdf {
  document: PdfDocument;
  /** Tears down the worker's copy of the document. Lives on the LOADING TASK,
   *  not on the document — calling it is what actually frees the worker, and
   *  skipping it leaks a worker per document opened. */
  close: () => void;
}

/** Open a PDF from bytes we already hold. Bytes rather than a URL on purpose:
 *  the caller fetches the short-lived signed URL itself, so pdf.js never sees a
 *  storage URL and a range request can never 403 halfway through a document. */
export async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  // pdf.js takes ownership of (and detaches) the buffer it is handed, so hand
  // it a copy — the same defensive copy the extraction route already makes.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const document = await task.promise;
  return {
    document,
    close: () => {
      void task.destroy();
    },
  };
}
