"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { extractPaper, startAppraisal } from "@/lib/api";

const MAX_BYTES = 15 * 1024 * 1024;

type Phase = "idle" | "extracting" | "starting";

/** A small sheet: pick or drop a PDF, extract its text, then launch a journal-club appraisal run.
 *  Honest errors only — too big, not a PDF, empty/scanned, or a server error carry their real message. */
export function PaperUploadSheet({ onClose, onLaunch }: { onClose: () => void; onLaunch: (runId: string, title: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== "idle";

  async function handleFile(file: File) {
    setError(null);
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That PDF is over the 15 MB limit.");
      return;
    }
    try {
      setPhase("extracting");
      const { text, meta } = await extractPaper(file);
      setPhase("starting");
      const runId = await startAppraisal(text, meta);
      onLaunch(runId, meta.title ?? file.name.replace(/\.pdf$/i, ""));
      onClose();
    } catch (e) {
      setPhase("idle");
      // Surface the quota gate distinctly so a free user understands why it stopped.
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg === "quota_exceeded" ? "Journal-club appraisal is a Pro feature (or you've hit today's limit)." : msg);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="upload-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Upload a paper to appraise" onClick={onClose}>
      <div className="upload-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="upload-sheet-head">
          <b>Journal club — appraise a paper</b>
          <button type="button" className="upload-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div
          className={`upload-drop${dragOver ? " over" : ""}${busy ? " busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click(); }}
        >
          <Icon name="doc" size={24} />
          {phase === "extracting" ? <span>Reading the PDF…</span>
            : phase === "starting" ? <span>Starting the appraisal…</span>
            : <span>Drop a PDF here, or click to choose. Text-based PDFs only, up to 15 MB.</span>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
        {error ? <p className="upload-err">{error}</p> : null}
        <p className="upload-note">Your appraisal grounds every verdict in a verbatim quote from the paper. The original PDF is not stored.</p>
      </div>
    </div>
  );
}
