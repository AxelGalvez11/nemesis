// ── AI Meeting Notes, filled in by the recording pipeline ───────────────────────────────────────────────────────────
//
// A meeting note in the workspace records through the app's own durable pipeline: the audio goes to the private
// recordings bucket, /api/recordings/jobs files a job (surface "space", no Library note), and the recording worker
// transcribes it and writes the notes onto the job's artifact. These helpers turn what the worker wrote into what
// the meeting block shows: transcript lines and a plain progress line while it works. The summary blocks need the
// document parser, so they live apart in meeting-summary.ts and load only when a recording is done.

export interface TranscriptLine {
  speaker: string;
  /** A time into the recording. The transcript has none, so this stays empty rather than guessed. */
  t: string;
  text: string;
}

export interface JobRow {
  status?: unknown;
  stage?: unknown;
  error?: unknown;
}

export type MeetingProgress = { status: "processing"; label: string } | { status: "ready" } | { status: "failed"; error: string };

const LINE_CHARS = 600;

/** The transcript as the Transcript tab lists it: paragraphs, long ones cut at sentence ends. */
export function transcriptLines(text: string, speaker: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const clean = paragraph.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    let current = "";
    for (const sentence of clean.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [clean]) {
      if (current && current.length + sentence.length > LINE_CHARS) {
        lines.push({ speaker, t: "", text: current.trim() });
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) lines.push({ speaker, t: "", text: current.trim() });
  }
  return lines;
}

/** Where a recording job stands, in words for the meeting block. Stage names are the worker's (recording-job.ts). */
export function meetingProgress(job: JobRow): MeetingProgress {
  if (job.status === "ready") return { status: "ready" };
  if (job.status === "failed") {
    return { status: "failed", error: typeof job.error === "string" && job.error.trim() ? job.error : "This recording could not be written up." };
  }
  const label =
    job.stage === "composing" ? "Writing the summary" : job.stage === "filing" || job.stage === "indexing" ? "Almost done" : job.stage === "transcribing" ? "Transcribing" : "Getting the recording ready";
  return { status: "processing", label };
}

/** m:ss, or h:mm:ss past the hour, for the clock beside a recording. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
