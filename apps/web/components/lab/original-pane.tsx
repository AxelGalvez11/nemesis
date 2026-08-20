"use client";

// The left half of the inspector: the document AS IT ACTUALLY LOOKS.
//
// 🔴 IT RENDERS THE FILE, NEVER A RECONSTRUCTION OF IT. The whole value of a side-by-side is that
// one side is ground truth. Drawing a "preview" from the parser's own model on this side would make
// every parse look perfect, because both halves would be the same claim.
//
// 🔴 AND IT REFUSES RATHER THAN SUBSTITUTES. Only PDF can be rasterised in the browser here; a
// PowerPoint or Word file has no page image without a renderer we do not ship. Those formats get a
// plain sentence saying so. Showing the extracted text on both sides would be the same lie in a
// different costume.

import { useEffect, useRef, useState } from "react";

import { openPdf, type PdfDocument } from "@/lib/reader/pdfjs";

export function OriginalPane({ file, unit }: { file: File | null; unit: number }) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isPdf = file ? file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf" : false;

  useEffect(() => {
    if (!file || !isPdf) {
      setPdf(null);
      return;
    }
    let closed = false;
    let close: (() => void) | null = null;
    setError(null);
    void file
      .arrayBuffer()
      .then((bytes) => openPdf(bytes))
      .then((opened) => {
        if (closed) {
          opened.close();
          return;
        }
        close = opened.close;
        setPdf(opened.document);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "could not open this PDF"));
    return () => {
      closed = true;
      close?.();
      setPdf(null);
    };
  }, [file, isPdf]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    // pdf.js pages are 1-based; the model's units are 0-based.
    const pageNumber = unit + 1;
    if (pageNumber < 1 || pageNumber > pdf.numPages) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.4 });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      const render = page.render({ canvas, canvasContext: context, viewport });
      task = render;
      void render.promise.catch(() => {
        // A cancelled render is the expected outcome of moving pages quickly, not an error.
      });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, unit]);

  if (!file) return <Empty>Drop a file to inspect.</Empty>;
  if (!isPdf) {
    return (
      <Empty>
        Nemesis Lab cannot show the original pages of a {file.name.split(".").pop()?.toUpperCase() ?? "file"} in
        the browser — there is no renderer for this format here. Open the file beside this window and
        compare it against the extracted side yourself.
      </Empty>
    );
  }
  if (error) return <Empty>Could not open this PDF in the browser: {error}</Empty>;
  if (!pdf) return <Empty>Opening…</Empty>;
  if (unit + 1 > pdf.numPages) {
    return (
      <Empty>
        Nemesis says this document has more units than the PDF has pages ({pdf.numPages}). That is itself
        worth knowing: page {unit + 1} does not exist in the file.
      </Empty>
    );
  }
  return (
    <div className="overflow-auto p-3">
      <canvas ref={canvasRef} className="max-w-full border border-neutral-800" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-sm text-neutral-500">{children}</div>;
}
