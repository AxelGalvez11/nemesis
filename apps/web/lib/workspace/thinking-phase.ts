// The chat "thinking preview": the short line the student reads between
// hitting send and the answer appearing. This is the WEB port of the phone's
// apps/mobile/src/lib/thinking-phase.ts — same phrases, so both surfaces say
// the same kinds of things. (There is no shared package across web and mobile,
// so the two files are kept in parity by hand and each has its own tests.)
//
// Every phrase here describes something the turn is ACTUALLY doing — the route
// decision, a real web search with its real query, the real number of sources
// that came back. Nothing is invented, and nothing costs an extra model call.
//
// That constraint comes from experience on the desktop build: making the line
// read like a first-person plan ("I'll compare X and Y…") needs a second LLM
// writing that sentence, because our engine's raw reasoning opens by restating
// the question rather than by planning. That was judged not worth paying for —
// double billing plus a second or two of latency on every single turn. So this
// file maps real pipeline stages to plain-English phrases, and stops there. The
// model's live working-out is a separate, free stream — see reasoning-preview.ts.

export type ThinkingPhase =
  | { kind: "routing" }
  | { kind: "searching"; query: string }
  | { kind: "reading"; sources: number }
  | { kind: "thinking"; deep: boolean }
  | { kind: "writing" };

/** How much of the student's own question to echo back inside the search line
 *  before trimming — long enough to recognise, short enough for one line. */
const QUERY_MAX = 42;

/** Collapse a question to a single tidy line for display inside a phrase. */
export function shortQuery(query: string, max: number = QUERY_MAX): string {
  const flat = query.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  // Prefer breaking at a word boundary so the echo doesn't cut mid-word.
  const clipped = flat.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.replace(/[,;:.\s]+$/, "")}…`;
}

/** The line to show for a phase. An empty string means show nothing — the
 *  answer itself has started, so the preview has done its job. The live strip
 *  MUST render nothing when this is empty (writing phase); otherwise an empty
 *  row and a ticking timer linger under the streaming answer. */
export function phaseLabel(phase: ThinkingPhase): string {
  switch (phase.kind) {
    case "routing":
      return "Working out how to answer";
    case "searching":
      return phase.query.trim() ? `Searching the web for “${shortQuery(phase.query)}”` : "Searching the web";
    case "reading":
      // Zero is a real outcome (the search found nothing usable) and saying so
      // beats a cheerful lie about reading sources that don't exist.
      if (phase.sources <= 0) return "No sources came back — answering from what I know";
      return phase.sources === 1 ? "Reading 1 source" : `Reading ${phase.sources} sources`;
    case "thinking":
      return phase.deep ? "Thinking it through" : "Putting this together";
    case "writing":
      return "";
  }
}

/** "21s" under a minute, "1m 2s" at or above — matches the desktop's
 *  formatDuration. Web keeps the minute form (mobile's settledLabel is
 *  seconds-only) because a web turn can run long enough for it to matter. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

/** The settled caption shown once a turn finishes ("Thought for 6s"), mirroring
 *  the desktop. Sub-2s turns get nothing — a "Thought for 1s" badge reads worse
 *  than no badge, and matches the strip's prior threshold. `null` seconds (no
 *  timing known) is also quiet. */
export function settledLabel(seconds: number | null): string {
  if (seconds === null || seconds < 2) return "";
  return `Thought for ${formatDuration(seconds)}`;
}
