// Cloud calendar API (cloud-first phone spec §9): thin Supabase wrapper around
// the `calendar_events` table (see supabase/migrations/20260720210000_cloud_
// chat_calendar.sql — owner-only RLS, anon fully revoked). Pure network IO only:
// the agenda/grid logic (day sorting, month grids, day-key math) stays in
// lib/agenda.ts, unchanged, reused as-is against whatever this file returns.
//
// source:'agent' rows are read-only everywhere on the phone (like the web):
// createCalendarEvent always writes 'manual', and update/delete both filter on
// source='manual' server-side as a second line of defense — the calendar screen
// itself already only ever routes an agent event to the read-only view sheet.
//
// Offline cache: a small per-signed-in-user JSON file, same shape/convention as
// api/cloudLibrary.ts's cache (FileSystem.writeAsStringAsync/readAsStringAsync,
// try/catch best-effort, filename keyed by uid so a stale cache from a previous
// account can never leak into a new one on the same device).

import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import type { AgendaEvent, AgendaEventKind } from "@/lib/agenda";

const KINDS: ReadonlySet<string> = new Set(["assignment", "exam", "rotation", "class", "other"]);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_COLUMNS = "id,title,date,time,kind,course,note,source";

/** A calendar_events row mapped to the shared AgendaEvent shape — `source` is
 *  always present here (unlike the optional field on the general type, which
 *  also covers the old vault-doc events that never carried one). */
export type CloudCalendarEvent = AgendaEvent & { source: "agent" | "manual" };

export interface CalendarEventInput {
  title: string;
  /** yyyy-mm-dd, no timezone — always a LOCAL date. */
  date: string;
  time?: string;
  kind: AgendaEventKind;
  course?: string;
  note?: string;
}

export interface CalendarRange {
  /** Inclusive yyyy-mm-dd bounds. */
  from: string;
  to: string;
}

function fromRow(row: unknown): CloudCalendarEvent | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const id = typeof value.id === "string" && value.id ? value.id : null;
  const title = typeof value.title === "string" && value.title ? value.title : null;
  const date = typeof value.date === "string" && DATE_KEY_RE.test(value.date) ? value.date : null;
  const kind = typeof value.kind === "string" && KINDS.has(value.kind) ? (value.kind as AgendaEventKind) : null;
  if (!id || !title || !date || !kind) return null;
  return {
    id,
    title,
    date,
    kind,
    source: value.source === "agent" ? "agent" : "manual",
    ...(typeof value.time === "string" && value.time ? { time: value.time } : {}),
    ...(typeof value.course === "string" && value.course ? { course: value.course } : {}),
    ...(typeof value.note === "string" && value.note ? { note: value.note } : {}),
  };
}

function toRow(userId: string, input: CalendarEventInput) {
  return {
    user_id: userId,
    title: input.title,
    date: input.date,
    time: input.time?.trim() || null,
    kind: input.kind,
    course: input.course?.trim() || null,
    note: input.note?.trim() || null,
  };
}

// --- offline cache: one JSON file per signed-in user ------------------------------

interface DiskCache {
  v: 1;
  events: CloudCalendarEvent[];
}

const EMPTY_DISK_CACHE: DiskCache = { events: [], v: 1 };

const cachePathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}cloud-calendar-cache-v1-${uid}.json`;

function isEvent(value: unknown): value is CloudCalendarEvent {
  return fromRow(value) !== null;
}

async function readDiskCache(uid: string): Promise<DiskCache> {
  try {
    const path = cachePathFor(uid);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return EMPTY_DISK_CACHE;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as Partial<DiskCache> | null;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.events)) return EMPTY_DISK_CACHE;
    return { events: parsed.events.filter(isEvent), v: 1 };
  } catch {
    return EMPTY_DISK_CACHE;
  }
}

async function writeDiskCache(uid: string, cache: DiskCache): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(cachePathFor(uid), JSON.stringify(cache));
  } catch {
    // best-effort: worst case the next open re-fetches from the cloud
  }
}

/** Cache-only read — never throws, never touches the network. Powers instant
 *  open (render the last-known agenda immediately) and offline reading. */
export async function loadCachedCalendarEvents(uid: string): Promise<CloudCalendarEvent[]> {
  if (!uid) return [];
  return (await readDiskCache(uid)).events;
}

/** Fetch one bounded calendar window. The `(user_id, date)` index serves this
 *  shape directly, so opening Calendar remains proportional to one user's
 *  visible year rather than to the lifetime size of the table. Pagination
 *  avoids PostgREST's per-response row ceiling for unusually busy calendars. */
export async function listCalendarEvents(
  userId: string,
  range: CalendarRange,
): Promise<CloudCalendarEvent[]> {
  const pageSize = 500;
  const events: CloudCalendarEvent[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", userId)
      .gte("date", range.from)
      .lte("date", range.to)
      .order("date", { ascending: true })
      .order("time", { ascending: true, nullsFirst: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []).flatMap((row) => {
      const event = fromRow(row);
      return event ? [event] : [];
    });
    events.push(...page);
    if ((data?.length ?? 0) < pageSize) break;
  }

  // Keep offline data from other viewed years, while replacing this exact
  // range so edits/deletes made on web are reflected on the phone.
  const cached = await readDiskCache(userId);
  const merged = [
    ...cached.events.filter((event) => event.date < range.from || event.date > range.to),
    ...events,
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(-10_000);
  await writeDiskCache(userId, { events: merged, v: 1 });
  return events;
}

export async function createCalendarEvent(userId: string, input: CalendarEventInput): Promise<CloudCalendarEvent> {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...toRow(userId, input), source: "manual" })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const event = fromRow(data);
  if (!event) throw new Error("The event was saved but returned an invalid response.");
  return event;
}

export async function updateCalendarEvent(
  userId: string,
  id: string,
  input: CalendarEventInput,
): Promise<CloudCalendarEvent> {
  const { data, error } = await supabase
    .from("calendar_events")
    .update(toRow(userId, input))
    .eq("id", id)
    .eq("user_id", userId)
    .eq("source", "manual")
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const event = fromRow(data);
  if (!event) throw new Error("The event was updated but returned an invalid response.");
  return event;
}

export async function deleteCalendarEvent(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("source", "manual");
  if (error) throw new Error(error.message);
}
