// The chat "thinking preview": the short line the student reads between
// hitting send and the answer appearing.
//
// Every phrase here describes something the turn is ACTUALLY doing — the route
// decision, a real web search with its real query, the real number of sources
// that came back. Nothing is invented, and nothing costs an extra model call.
//
// That constraint comes from experience on the desktop build: making the line
// read like a first-person plan ("I'll compare X and Y…") needs a second LLM
// writing that sentence, because our engine's raw reasoning opens by restating
// the question rather than by planning. That was judged not worth paying for —
// double billing plus a second or two of latency on every single turn — while
// the status line driven by real activity was the part that worked well. So
// this file maps real pipeline stages to plain-English phrases, and stops
// there.

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
 *  answer itself has started, so the preview has done its job. */
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

/** The settled line shown once a turn finishes, mirroring the desktop's
 *  "Thought for Xs". Sub-second turns get nothing — a "Thought for 0s" badge
 *  reads worse than no badge. */
export function settledLabel(elapsedMs: number): string {
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 1) return "";
  return seconds === 1 ? "Thought for 1s" : `Thought for ${seconds}s`;
}
