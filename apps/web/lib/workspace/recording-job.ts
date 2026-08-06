// What a recording job IS, in one place both the chat card and the Library read.
//
// Everything here is pure so the vocabulary can be pinned by tests. The strings
// in STAGE_ORDER are also written by supabase/functions/recording-worker — a
// stage the worker sets and this file has never heard of would render as a blank
// progress line, which is why recording-job.test.ts reads the worker's source
// and checks the two lists still match.

/** Stages the SERVER owns. Same strings as the `stage` check constraint in
 *  20260805T01_recording_jobs.sql. */
export const SERVER_STAGES = ["queued", "transcribing", "composing", "filing", "indexing", "ready"] as const;
export type ServerStage = (typeof SERVER_STAGES)[number];

/**
 * `uploading` happens in the BROWSER, before a job row can exist.
 *
 * The audio only lives in a MediaRecorder buffer until it is pushed to storage,
 * so there is nothing durable to attach a stage to yet — this is the one part of
 * the pipeline a page genuinely does own, and the one window where closing the
 * tab still loses the recording. It is shown as a stage because it is one; it
 * simply cannot be a row.
 */
export const STAGE_ORDER = ["uploading", ...SERVER_STAGES] as const;
export type RecordingStage = (typeof STAGE_ORDER)[number];

export type RecordingJobStatus = "processing" | "ready" | "failed";

export interface RecordingJob {
  id: string;
  status: RecordingJobStatus;
  stage: ServerStage;
  failedStage: ServerStage | null;
  error: string | null;
  contextId: string | null;
  messageId: string | null;
  artifactId: string | null;
  libraryDocumentId: string | null;
  title: string | null;
  durationSeconds: number;
  silenceSkipped: string | null;
  transcriptWords: number | null;
  noteSections: number | null;
  indexPending: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The columns a job read needs. Named once so the browser's RLS select and the
 *  tests cannot drift from each other. */
export const RECORDING_JOB_COLUMNS =
  "id,status,stage,failed_stage,error,context_id,message_id,artifact_id,library_document_id,title," +
  "duration_seconds,silence_skipped,transcript_words,note_sections,index_pending,created_at,updated_at";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function asServerStage(value: unknown): ServerStage | null {
  return typeof value === "string" && (SERVER_STAGES as readonly string[]).includes(value)
    ? value as ServerStage
    : null;
}

/**
 * One database row as a job, or null.
 *
 * An UNRECOGNISED stage returns null rather than being coerced to something
 * plausible. A row this build cannot understand is a build that is behind the
 * worker, and showing a confidently wrong stage for a lecture that is still
 * running is worse than showing nothing.
 */
export function toRecordingJob(value: unknown): RecordingJob | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  const stage = asServerStage(value.stage);
  if (!stage) return null;
  const status = value.status === "ready" || value.status === "failed" ? value.status : "processing";
  return {
    id: value.id,
    status,
    stage,
    failedStage: asServerStage(value.failed_stage),
    error: text(value.error),
    contextId: text(value.context_id),
    messageId: text(value.message_id),
    artifactId: text(value.artifact_id),
    libraryDocumentId: text(value.library_document_id),
    title: text(value.title),
    durationSeconds: count(value.duration_seconds) ?? 0,
    silenceSkipped: text(value.silence_skipped),
    transcriptWords: count(value.transcript_words),
    noteSections: count(value.note_sections),
    indexPending: value.index_pending === true,
    createdAt: text(value.created_at) ?? new Date(0).toISOString(),
    updatedAt: text(value.updated_at) ?? new Date(0).toISOString(),
  };
}

/**
 * What each stage is called on screen.
 *
 * Present tense and plain: this is read by someone waiting, who wants to know
 * what is happening now, not what the system calls its phases.
 */
const STAGE_LABEL: Record<RecordingStage, string> = {
  uploading: "Uploading recording",
  queued: "Getting ready",
  transcribing: "Transcribing audio",
  composing: "Building lecture notes",
  filing: "Saving to your Library",
  indexing: "Preparing search",
  ready: "Ready",
};

/** Past tense, for "X failed" copy and the retry button. */
const STAGE_FAILURE_LABEL: Record<ServerStage, string> = {
  queued: "starting",
  transcribing: "transcribing the audio",
  composing: "writing the notes",
  filing: "saving to your Library",
  indexing: "preparing search",
  ready: "finishing",
};

export function stageLabel(stage: RecordingStage): string {
  return STAGE_LABEL[stage];
}

export function stageFailureLabel(stage: ServerStage): string {
  return STAGE_FAILURE_LABEL[stage];
}

/** How far through the list a stage sits, for a stepper that never runs
 *  backwards. Not a percentage — the steps are not the same length and
 *  pretending they are is the fabricated progress this pipeline avoids. */
export function stageIndex(stage: RecordingStage): number {
  const index = (STAGE_ORDER as readonly string[]).indexOf(stage);
  return index < 0 ? 0 : index;
}

/** mm:ss / h:mm:ss is for a running timer. A finished recording reads better in
 *  words, and this is the only place that decides how. */
export function describeRecordingLength(seconds: number): string | null {
  const whole = Math.max(0, Math.round(seconds));
  if (whole <= 0) return null;
  if (whole < 60) return `${whole}s recording`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} min recording`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr recording` : `${hours} hr ${rest} min recording`;
}

/**
 * The detail line under the stage label.
 *
 * ONLY THINGS THAT WERE COUNTED. Recording length is measured, the word count is
 * the transcript that came back, the section count is the headings in the notes
 * that were written. There is no percentage anywhere in this pipeline and no
 * estimate of time remaining: neither is known, and inventing one is the thing
 * the whole design exists to avoid.
 */
export function jobDetail(job: Pick<RecordingJob, "durationSeconds" | "noteSections" | "stage" | "transcriptWords">): string | null {
  const parts: string[] = [];
  const length = describeRecordingLength(job.durationSeconds);
  if (length) parts.push(length);
  if (job.transcriptWords !== null && job.transcriptWords > 0) {
    parts.push(`${job.transcriptWords.toLocaleString()} words`);
  }
  if (job.noteSections !== null && job.noteSections > 0) {
    parts.push(`${job.noteSections} section${job.noteSections === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** True once there is a transcript worth opening, even though the notes are
 *  still being written. This is what lets the card become clickable early
 *  instead of staying inert until everything is finished. */
export function transcriptReady(job: Pick<RecordingJob, "stage" | "status">): boolean {
  if (job.status === "ready") return true;
  return stageIndex(job.stage) >= stageIndex("composing");
}

/** One sentence for the chat message and the Library row. */
export function jobHeadline(job: Pick<RecordingJob, "failedStage" | "stage" | "status">): string {
  if (job.status === "failed") {
    const where = job.failedStage ? stageFailureLabel(job.failedStage) : "processing this recording";
    return `Nemesis stopped while ${where}.`;
  }
  if (job.status === "ready") return "Recording ready.";
  return `Nemesis is processing this recording — ${stageLabel(job.stage).toLowerCase()}.`;
}
