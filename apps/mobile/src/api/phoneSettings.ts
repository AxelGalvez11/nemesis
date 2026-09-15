/**
 * The phone's study and recording settings (canvas StudySettings). Saved in the person's own settings row
 * (ws_user_settings, where the web keeps its view preferences) under `phone`, so they follow the account.
 */
import { supabase } from './supabase';

export type PhoneSettings = {
  /** How many never-studied cards may join one flashcards sitting. Reviews always join. */
  newPerDay: number;
  reminderHour: number;
  reminderMinute: number;
  /** Off: the uploaded recording is deleted once its notes are on the page. */
  keepAudio: boolean;
  /** An alert when Nemesis finishes writing a recording's notes. */
  notesReadyAlert: boolean;
};

export const PHONE_DEFAULTS: PhoneSettings = { newPerDay: 20, reminderHour: 19, reminderMinute: 0, keepAudio: true, notesReadyAlert: true };

let cached: PhoneSettings = PHONE_DEFAULTS;

export function readPhoneSettings(settings: unknown): PhoneSettings {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).phone : null;
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
  return {
    newPerDay: num(p.newPerDay, PHONE_DEFAULTS.newPerDay, 1, 9999),
    reminderHour: num(p.reminderHour, PHONE_DEFAULTS.reminderHour, 0, 23),
    reminderMinute: num(p.reminderMinute, PHONE_DEFAULTS.reminderMinute, 0, 59),
    keepAudio: typeof p.keepAudio === 'boolean' ? p.keepAudio : PHONE_DEFAULTS.keepAudio,
    notesReadyAlert: typeof p.notesReadyAlert === 'boolean' ? p.notesReadyAlert : PHONE_DEFAULTS.notesReadyAlert,
  };
}

/** The last settings the app loaded, for code that runs outside a screen (finishing a recording). */
export function getPhoneSettings(): PhoneSettings {
  return cached;
}

export function primePhoneSettings(next: PhoneSettings): void {
  cached = next;
}

/** Saves a change and returns the merged set. ws_save_settings merges one level deep, so the whole `phone` object is sent. */
export async function savePhoneSettings(patch: Partial<PhoneSettings>): Promise<PhoneSettings> {
  const next = { ...cached, ...patch };
  const { data, error } = await supabase.rpc('ws_save_settings', { p_patch: { phone: next } });
  if (error) throw new Error('That setting did not save. Check your connection and try again.');
  cached = readPhoneSettings(data);
  return cached;
}
