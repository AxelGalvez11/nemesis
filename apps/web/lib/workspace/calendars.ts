// Calendars — the things events belong to.
//
// 🔴 THIS IS WHAT "GOOGLE CALENDAR COLOURS" ACTUALLY NEEDED (owner 2026-09-01).
// A colour has to belong to something, and Nemesis had one flat list of events
// with nothing to hang one on. In Google you have several calendars — personal,
// each class, a shared one, a subscribed one — each with its own colour, its own
// timezone, and its own tick box. Adding a colour to events alone would answer a
// different question and leave the real one unanswerable.
//
// The storage shape follows calendar-model.ts exactly: signed-in reads the
// cloud, preview and signed-out stay pure-local on one key, and a network
// failure falls back to a per-account warm cache. That symmetry is deliberate —
// two stores in one page with different offline behaviour is a page that is
// half-there after a dropped connection.

import { supabase } from "@/lib/supabase";

import { calendarColorOf } from "./calendar-colors";

export interface Calendar {
  id: string;
  name: string;
  /** Google's calendar-colour id, "1".."24". Absent = no colour of its own. */
  colorId?: string;
  /** IANA zone new events here default to. */
  timeZone?: string;
  /** Google's `selected`, inverted — see the migration for why hidden not shown. */
  hidden?: boolean;
  /** Google's shape: [{ method: "popup", minutes: 10 }]. */
  defaultReminders?: { method: "popup" | "email"; minutes: number }[];
}

/**
 * The calendar an event with no `calendarId` is on.
 *
 * 🔴 NOT A ROW, AND THAT IS THE POINT. Every event that existed before this
 * stage has no calendar, and inventing one per account to stamp onto 172 rows is
 * a data migration that can half-fail in order to record something the reader
 * can work out for itself. Null means primary, here and in the database.
 */
/**
 * The calendar every event belongs to until a student makes another one.
 *
 * 🔴🔴 IT CARRIES A COLOUR NOW, AND WITHOUT ONE THE WHOLE CALENDAR WAS GREY. Owner, 2026-09-03:
 * *"can you make sure that Google Calendar's colours actually map onto the colours in Nemesis…
 * so that it looks more colourful, looks nicer."*
 *
 * The chain in `paintForEvent` is Google's own — the event's colour, then its CALENDAR's, then a
 * fallback — and it was already built and already correct. What was missing was the second step
 * having anything to say: no calendar had ever been given a colour, because nothing creates one
 * and this constant did not carry one. So the chain fell through to `DEFAULT_PAINT`, which is
 * `--ui-text-tertiary` grey by ruling (kinds were retired 2026-09-01), and every event a student
 * had not individually coloured came out the same grey.
 *
 * 🔴 BLUEBERRY, AND IT IS GOOGLE'S OWN. `#4986e7` is id 16 of Google's twenty-four CALENDAR
 * colours, read off `colors.get` — the blue Google itself gives a new primary calendar. Picking a
 * Nemesis blue would have meant a calendar that syncs with Google changing colour on the way in.
 */
export const PRIMARY_CALENDAR: Calendar = { colorId: "16", id: "", name: "My calendar" };

export const CALENDARS_STORAGE_KEY = "nemesis.web.calendars.v1";

const REMINDER_METHODS = new Set(["popup", "email"]);

/** Row → Calendar, dropping anything malformed rather than half-keeping it. */
export function decodeCalendar(raw: unknown): Calendar | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || !name) return null;

  const calendar: Calendar = { id, name };
  const colorId = typeof row.colorId === "string" ? row.colorId : typeof row.color_id === "string" ? row.color_id : "";
  // Only an id the palette has: an unknown one paints nothing and silently loses
  // whatever it was meant to override.
  if (colorId && calendarColorOf(colorId)) calendar.colorId = colorId;
  const timeZone = typeof row.timeZone === "string" ? row.timeZone : typeof row.time_zone === "string" ? row.time_zone : "";
  if (timeZone) calendar.timeZone = timeZone;
  if (row.hidden === true) calendar.hidden = true;

  const reminders = row.defaultReminders ?? row.default_reminders;
  if (Array.isArray(reminders)) {
    const clean = reminders
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({ method: String(entry.method), minutes: Number(entry.minutes) }))
      .filter((entry) => REMINDER_METHODS.has(entry.method) && Number.isInteger(entry.minutes) && entry.minutes >= 0)
      .map((entry) => ({ method: entry.method as "popup" | "email", minutes: entry.minutes }));
    if (clean.length > 0) calendar.defaultReminders = clean;
  }
  return calendar;
}

export function encodeCalendar(calendar: Calendar, userId: string): Record<string, unknown> {
  return {
    color_id: calendar.colorId ?? null,
    default_reminders: calendar.defaultReminders && calendar.defaultReminders.length > 0 ? calendar.defaultReminders : null,
    hidden: calendar.hidden ?? false,
    id: calendar.id,
    name: calendar.name,
    time_zone: calendar.timeZone ?? null,
    user_id: userId,
  };
}

export interface CalendarsCtx {
  userId: string | null;
  preview: boolean;
}

function readLocal(): Calendar[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CALENDARS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { calendars?: unknown };
    if (!Array.isArray(parsed.calendars)) return [];
    return parsed.calendars.map(decodeCalendar).filter((c): c is Calendar => c !== null);
  } catch {
    return [];
  }
}

function writeLocal(calendars: Calendar[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify({ calendars }));
  } catch {
    // Quota or private mode — the in-memory copy stays authoritative for the tab.
  }
}

export async function loadCalendars(ctx: CalendarsCtx): Promise<Calendar[]> {
  if (ctx.preview || !ctx.userId) return readLocal();
  try {
    const { data, error } = await supabase
      .from("calendars")
      .select("id,name,color_id,time_zone,hidden,default_reminders")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const calendars = (data ?? []).map(decodeCalendar).filter((c): c is Calendar => c !== null);
    writeLocal(calendars);
    return calendars;
  } catch {
    // Offline: the warm cache still renders a calendar list rather than an
    // empty rail that looks like the student never made one.
    return readLocal();
  }
}

export async function saveCalendar(calendar: Calendar, ctx: CalendarsCtx): Promise<void> {
  const next = [...readLocal().filter((c) => c.id !== calendar.id), calendar];
  writeLocal(next);
  if (ctx.preview || !ctx.userId) return;
  const { error } = await supabase.from("calendars").upsert(encodeCalendar(calendar, ctx.userId), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteCalendar(id: string, ctx: CalendarsCtx): Promise<void> {
  writeLocal(readLocal().filter((c) => c.id !== id));
  if (ctx.preview || !ctx.userId) return;
  // The events survive: the column is ON DELETE SET NULL, so they fall back to
  // the primary calendar. Deleting a colour grouping says nothing about whether
  // the exams on it still exist.
  const { error } = await supabase.from("calendars").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Which calendars a student has, primary first.
 *
 * The primary one is always present and never stored, so a brand-new account and
 * an account whose only calendar row failed to load look the same: one calendar,
 * called "My calendar", holding everything.
 */
export function calendarList(stored: readonly Calendar[]): Calendar[] {
  // 🔴🔴 A STORED `""` REPLACES THE BUILT-IN ONE, and without this a Google sync could not colour
  // anything. `PRIMARY_CALENDAR`'s Blueberry is a stand-in for "nobody has told us"; once Google's
  // calendar list has arrived, the real primary — the owner's is Grape — is a stored row under the
  // same empty id. Prepending the constant unconditionally would put the stand-in in front of the
  // answer, and every lookup takes the first match.
  const own = stored.find((calendar) => calendar.id === "");
  return [own ?? PRIMARY_CALENDAR, ...stored.filter((calendar) => calendar.id !== "")];
}

export function calendarById(stored: readonly Calendar[], id: string | undefined): Calendar {
  if (!id) return PRIMARY_CALENDAR;
  return stored.find((calendar) => calendar.id === id) ?? PRIMARY_CALENDAR;
}

/** The ids a student has switched off, for filtering events out of every view. */
export function hiddenCalendarIds(stored: readonly Calendar[]): Set<string> {
  return new Set(stored.filter((calendar) => calendar.hidden).map((calendar) => calendar.id));
}
