// Pure logic for the missions feature: types + the two derivations Task 7 unit-tests
// (titleFromPrompt, statusLabel). Deliberately dependency-free — no supabase client,
// no react-native import — so missions.test.ts loads it clean under Deno (the repo's
// CI runs `deno test apps/mobile/src/`), the same way derive.ts stays Deno-testable:
// importing ./supabase.ts here would throw at module load (missing
// EXPO_PUBLIC_SUPABASE_URL) and react-native does not parse outside Metro.
// missions.ts re-exports everything in this file, so callers never see the split.

export type MissionStatus =
  | "queued"
  | "claimed"
  | "running"
  | "needs_review"
  | "done"
  | "failed"
  | "cancelled";

export interface Mission {
  id: string;
  title: string;
  prompt: string;
  status: MissionStatus;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type MissionEventType = "status" | "log" | "result" | "error";

export interface MissionEvent {
  id: number;
  mission_id: string;
  type: MissionEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

const TITLE_MAX = 80;

/** First non-empty line of the prompt, trimmed, capped at 80 chars (+ an ellipsis
 * if longer). Empty/whitespace-only prompts fall back to 'New mission' — the
 * composer never lets that happen, but createMission() calls this defensively. */
export function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "New mission";
  if (firstLine.length <= TITLE_MAX) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX)}…`;
}

/** Student-facing status copy. Desktop polls every 30s (Task 2), so a `queued`
 * mission with no desktop device seen recently reads as "waiting", not "queued"
 * forever — the honest answer for a closed laptop, not a stuck one. */
export function statusLabel(m: Pick<Mission, "status">, desktopOnline: boolean): string {
  switch (m.status) {
    case "queued":
      return desktopOnline ? "Queued" : "Waiting for your Mac";
    case "claimed":
      return "Starting on your Mac";
    case "running":
      return "Running on your Mac";
    case "needs_review":
      return "Ready for review";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default: {
      // Exhaustiveness guard: a new DB status without a matching UI label should
      // fail typecheck here rather than silently render "undefined" on-screen.
      const _exhaustive: never = m.status;
      return _exhaustive;
    }
  }
}
