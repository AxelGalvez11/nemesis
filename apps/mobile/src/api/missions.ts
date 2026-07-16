import { supabase } from "./supabase";
import {
  titleFromPrompt,
  statusLabel,
  type Mission,
  type MissionEvent,
  type MissionEventType,
  type MissionStatus,
} from "./missions-helpers";

// Missions API — dispatch a task from the phone, watch it run on the desktop agent,
// review the result. Talks straight to PostgREST via the supabase client under RLS
// (Task 1's policies scope every row to auth.uid()); no edge function in v1. Pure
// logic (types, titleFromPrompt, statusLabel) lives in ./missions-helpers so it can
// be unit-tested without pulling in react-native — re-exported here so callers only
// ever need to import from "@/api/missions".
export { titleFromPrompt, statusLabel };
export type { Mission, MissionEvent, MissionEventType, MissionStatus };

const MISSION_COLUMNS = "id,title,prompt,status,result_summary,created_at,updated_at";

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const MISSION_STATUSES: readonly MissionStatus[] = [
  "queued",
  "claimed",
  "running",
  "needs_review",
  "done",
  "failed",
  "cancelled",
];

function isMissionStatus(v: unknown): v is MissionStatus {
  return typeof v === "string" && (MISSION_STATUSES as readonly string[]).includes(v);
}

/** Defensive narrowing from a raw PostgREST/realtime row to Mission — never trust
 * the network shape blindly (a NULL, a mid-migration column, a realtime payload
 * with extra fields all pass through `unknown` here first). */
function castMission(row: unknown): Mission | null {
  if (!isObj(row)) return null;
  const { id, title, prompt, status, result_summary, created_at, updated_at } = row;
  if (typeof id !== "string" || typeof title !== "string" || typeof prompt !== "string") return null;
  if (!isMissionStatus(status)) return null;
  return {
    id,
    title,
    prompt,
    status,
    result_summary: typeof result_summary === "string" ? result_summary : null,
    created_at: typeof created_at === "string" ? created_at : "",
    updated_at: typeof updated_at === "string" ? updated_at : "",
  };
}

const EVENT_TYPES: readonly MissionEventType[] = ["status", "log", "result", "error"];

function isMissionEventType(v: unknown): v is MissionEventType {
  return typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
}

function castMissionEvent(row: unknown): MissionEvent | null {
  if (!isObj(row)) return null;
  const { id, mission_id, type, payload, created_at } = row;
  if (typeof id !== "number" || typeof mission_id !== "string") return null;
  if (!isMissionEventType(type)) return null;
  return {
    id,
    mission_id,
    type,
    payload: isObj(payload) ? payload : {},
    created_at: typeof created_at === "string" ? created_at : "",
  };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`not signed in: ${error.message}`);
  const userId = data.user?.id;
  if (!userId) throw new Error("not signed in");
  return userId;
}

/** Dispatch a new mission. Title is derived from the prompt (first line, capped) —
 * the composer never asks the student to name their own mission. */
export async function createMission(prompt: string): Promise<Mission> {
  const trimmed = prompt.trim();
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("agent_missions")
    .insert({ user_id: userId, title: titleFromPrompt(trimmed), prompt: trimmed })
    .select(MISSION_COLUMNS)
    .single();
  if (error) throw new Error(`mission create failed: ${error.message}`);
  const mission = castMission(data);
  if (!mission) throw new Error("mission create failed: unexpected response shape");
  return mission;
}

/** The caller's missions, newest first. RLS already scopes this to auth.uid() —
 * no explicit .eq('user_id', ...) needed (matches the reports.ts convention). */
export async function listMissions(): Promise<Mission[]> {
  const { data, error } = await supabase
    .from("agent_missions")
    .select(MISSION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`missions list failed: ${error.message}`);
  return (data ?? []).map(castMission).filter((m): m is Mission => m !== null);
}

/** One mission by id, or null if it doesn't exist / isn't the caller's (RLS). Used
 * by the detail screen when opened from a push-notification deep link, where there
 * is no list-passed data to fall back on. */
export async function getMission(id: string): Promise<Mission | null> {
  const { data, error } = await supabase.from("agent_missions").select(MISSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`mission fetch failed: ${error.message}`);
  return castMission(data);
}

/** Oldest-first, capped at 200 — the detail screen's initial event-feed fetch,
 * merged with whatever subscribeMission streams in live after. */
export async function listMissionEvents(missionId: string): Promise<MissionEvent[]> {
  const { data, error } = await supabase
    .from("mission_events")
    .select("id,mission_id,type,payload,created_at")
    .eq("mission_id", missionId)
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw new Error(`mission events fetch failed: ${error.message}`);
  return (data ?? []).map(castMissionEvent).filter((e): e is MissionEvent => e !== null);
}

/** needs_review -> done. The .eq('status', 'needs_review') guard makes this a
 * no-op (not an error) if the mission moved on between fetch and tap. */
export async function markReviewed(id: string): Promise<void> {
  const { error } = await supabase
    .from("agent_missions")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "needs_review");
  if (error) throw new Error(`mark reviewed failed: ${error.message}`);
}

/** The "Needs changes" review action. Deliberately does NOT change mission status —
 * it just adds an event, the same channel the desktop uses for progress logs, so it
 * shows up in the feed as student feedback. Nothing here submits anything anywhere;
 * it's a note for whoever (student or, on a future turn, the agent) reads it next.
 * Returns the created event so the caller can show it immediately rather than
 * waiting on the realtime echo (subscribeMission dedupes by id, so no double-add
 * when that echo does arrive). */
export async function requestChanges(id: string, note?: string): Promise<MissionEvent> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("mission_events")
    .insert({
      mission_id: id,
      user_id: userId,
      type: "log",
      payload: { source: "review", note: note?.trim() || "Needs changes" },
    })
    .select("id,mission_id,type,payload,created_at")
    .single();
  if (error) throw new Error(`request changes failed: ${error.message}`);
  const event = castMissionEvent(data);
  if (!event) throw new Error("request changes failed: unexpected response shape");
  return event;
}

/** queued -> cancelled. Guarded to only-still-queued: once a mission is claimed the
 * desktop already owns it, so cancelling from the phone would race the run. */
export async function cancelMission(id: string): Promise<void> {
  const { error } = await supabase
    .from("agent_missions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued");
  if (error) throw new Error(`cancel mission failed: ${error.message}`);
}

/** Live updates for one mission: new mission_events rows (log lines, the final
 * result/error) and status flips on the mission itself. Returns an unsubscribe fn —
 * callers must invoke it on unmount (Realtime channels don't clean up on their own). */
export function subscribeMission(
  id: string,
  onEvent: (e: MissionEvent) => void,
  onStatus: (m: Mission) => void,
): () => void {
  const channel = supabase
    .channel(`mission-${id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "mission_events", filter: `mission_id=eq.${id}` },
      (payload: { new: unknown }) => {
        const row = castMissionEvent(payload.new);
        if (row) onEvent(row);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "agent_missions", filter: `id=eq.${id}` },
      (payload: { new: unknown }) => {
        const row = castMission(payload.new);
        if (row) onStatus(row);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Is there a desktop that's been seen in the last 5 minutes? Drives the "Waiting
 * for your Mac" vs "Queued" copy and the composer's offline note. Best-effort: a
 * query hiccup reads as offline rather than throwing and blocking the composer. */
export async function isDesktopOnline(): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("devices")
    .select("id")
    .eq("kind", "desktop")
    .gte("last_seen_at", fiveMinAgo)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
