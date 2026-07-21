import type { WireMsg } from "@/lib/workspace/chat-api";

export const LIVE_AUDIO_SAMPLE_RATE = 16_000;
export const LIVE_AUDIO_MAX_KEYTERMS = 100;
export const LIVE_AUDIO_INSIGHT_TRANSCRIPT_CHARS = 8_000;

export interface LiveTranscriptSegment {
  id: string;
  text: string;
  startSecond: number;
  endSecond: number;
  final: boolean;
}
export interface LiveAudioInsights {
  notes: string[];
  suggestions: string[];
  explore: string[];
}

export interface AssemblyTurnMessage {
  type: "Turn";
  turn_order?: number;
  transcript?: string;
  end_of_turn?: boolean;
  words?: Array<{ start?: number; end?: number; text?: string }>;
}

export interface LiveAudioTokenResponse {
  token: string;
  reservationId: string;
  reservedSeconds: number;
  speechModel: string;
  usage: {
    plan: string;
    usedSeconds: number;
    limitSeconds: number;
  };
  webhook: {
    url: string;
    headerName: string;
    headerValue: string;
  };
}

function cleanLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compact || null;
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const clean = cleanLine(item, maxLength);
    if (clean) unique.add(clean);
    if (unique.size >= maxItems) break;
  }
  return Array.from(unique);
}

export function sanitizeLiveAudioKeyterms(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const clean = cleanLine(value, 50);
    if (clean && clean.length >= 2) unique.add(clean);
    if (unique.size >= LIVE_AUDIO_MAX_KEYTERMS) break;
  }
  return Array.from(unique);
}

export function assemblyTurnToSegment(message: AssemblyTurnMessage): LiveTranscriptSegment | null {
  const text = cleanLine(message.transcript, 12_000);
  if (!text) return null;
  const words = Array.isArray(message.words) ? message.words : [];
  const firstStart = words.find((word) => typeof word.start === "number")?.start;
  const lastEnd = [...words].reverse().find((word) => typeof word.end === "number")?.end;
  const order = Number.isFinite(message.turn_order) ? Number(message.turn_order) : 0;
  return {
    endSecond: typeof lastEnd === "number" ? Math.max(lastEnd / 1_000, 0) : 0,
    final: Boolean(message.end_of_turn),
    id: `turn-${order}`,
    startSecond: typeof firstStart === "number" ? Math.max(firstStart / 1_000, 0) : 0,
    text,
  };
}

export function upsertTranscriptSegment(
  segments: LiveTranscriptSegment[],
  next: LiveTranscriptSegment,
): LiveTranscriptSegment[] {
  const index = segments.findIndex((segment) => segment.id === next.id);
  if (index < 0) return [...segments, next];
  const copy = [...segments];
  copy[index] = next;
  return copy;
}

export function transcriptText(segments: LiveTranscriptSegment[], finalOnly = false): string {
  return segments
    .filter((segment) => !finalOnly || segment.final)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
}

export function parseLiveAudioInsights(raw: string): LiveAudioInsights | null {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
    const insights = {
      explore: cleanList(parsed.explore, 3, 180),
      notes: cleanList(parsed.notes, 6, 240),
      suggestions: cleanList(parsed.suggestions, 3, 180),
    };
    return insights.notes.length || insights.suggestions.length || insights.explore.length
      ? insights
      : null;
  } catch {
    return null;
  }
}

export function mergeLiveAudioInsights(
  previous: LiveAudioInsights,
  next: LiveAudioInsights,
): LiveAudioInsights {
  const merge = (left: string[], right: string[], limit: number) =>
    Array.from(new Set([...left, ...right])).slice(-limit);
  return {
    explore: merge(previous.explore, next.explore, 6),
    notes: merge(previous.notes, next.notes, 18),
    suggestions: next.suggestions.length ? next.suggestions : previous.suggestions,
  };
}

export function buildLiveAudioInsightMessages(
  transcript: string,
  previousNotes: string[],
  context?: string,
): WireMsg[] {
  const clippedTranscript = transcript.slice(-LIVE_AUDIO_INSIGHT_TRANSCRIPT_CHARS);
  const contextLine = cleanLine(context, 500);
  return [
    {
      role: "system",
      content:
        "You are Nemesis's live learning copilot. Support any subject, discipline, major, profession, meeting, interview, or research conversation; never assume a biomedical context. " +
        // Notes only (owner 2026-07-21): the Explore/suggestions panel was cut
        // from the recorder, so generating those bullets would waste tokens.
        // parseLiveAudioInsights still tolerates the extra keys if a model
        // returns them.
        "Extract only what the speaker actually established. Separate uncertainty from fact. Return strict JSON with exactly one string-array key: notes (up to 6 concise new note bullets). " +
        "Do not repeat prior notes. Do not include markdown fences or any text outside the JSON object.",
    },
    {
      role: "user",
      content: [
        contextLine ? `Known session context: ${contextLine}` : "",
        previousNotes.length ? `Notes already captured:\n- ${previousNotes.slice(-12).join("\n- ")}` : "",
        `Most recent transcript:\n${clippedTranscript}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

export function formatLiveDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
