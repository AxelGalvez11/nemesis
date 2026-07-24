// General settings (pure) — the phone's per-account preferences, stored
// on-device under a SecureStore key. Extracted out of app/profile/general.tsx
// because there are now TWO readers: the settings screen that edits them, and
// api/chat.ts's recording-enhance pass, which reads `saveTranscript` to decide
// whether a recording's Library note also carries the full transcript (owner
// item 4). One tested (de)serialization module keeps the two in agreement.
//
// The store STILL holds strings for everything web's Settings > General has
// (language / tone / nickname / occupation — not yet wired into the AI on
// either platform). `saveTranscript` is the first NON-string field, so
// parse/serialize are written to tolerate a legacy record that predates it: a
// missing or non-boolean key reads as the default (OFF), never as `true`.

export interface GeneralPrefs {
  language: string;
  tone: string;
  nickname: string;
  occupation: string;
  /** Owner item 4: also mirror the FULL transcript into a recording's Library
   *  note, not just the notes. Off by default — the note is notes-only unless
   *  the student opts in. A local, per-surface preference; there is no synced
   *  settings table. */
  saveTranscript: boolean;
}

export const DEFAULT_GENERAL_PREFS: GeneralPrefs = {
  language: "English",
  nickname: "",
  occupation: "",
  saveTranscript: false,
  tone: "Clear and direct",
};

// SecureStore keys allow [A-Za-z0-9._-]; the uid (a uuid) fits as-is. The `_v1_`
// name is unchanged from when the record was all-strings — adding a boolean
// field is backward-compatible (see parseGeneralPrefs), so it does NOT warrant a
// v2 that would strand everyone's existing language/tone/nickname.
export const generalPrefsStoreKey = (uid: string) => `nemesis_general_prefs_v1_${uid}`;

/** Read the stored JSON (or null when nothing is saved / SecureStore is empty)
 *  into a fully-populated GeneralPrefs. Every field falls back to its default
 *  individually, so a legacy record written before a field existed — or a
 *  corrupt/partial one — still yields a usable object rather than throwing.
 *  `saveTranscript` reads as the default unless the stored value is a real
 *  boolean, so a legacy record (no such key) is treated as OFF. */
export function parseGeneralPrefs(raw: string | null): GeneralPrefs {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<GeneralPrefs>) : null;
    return {
      language: typeof parsed?.language === "string" ? parsed.language : DEFAULT_GENERAL_PREFS.language,
      nickname: typeof parsed?.nickname === "string" ? parsed.nickname : DEFAULT_GENERAL_PREFS.nickname,
      occupation: typeof parsed?.occupation === "string" ? parsed.occupation : DEFAULT_GENERAL_PREFS.occupation,
      saveTranscript: typeof parsed?.saveTranscript === "boolean" ? parsed.saveTranscript : DEFAULT_GENERAL_PREFS.saveTranscript,
      tone: typeof parsed?.tone === "string" ? parsed.tone : DEFAULT_GENERAL_PREFS.tone,
    };
  } catch {
    return DEFAULT_GENERAL_PREFS;
  }
}

/** The string to persist. A plain JSON.stringify today; kept as a named function
 *  so both readers serialize identically and a future shape change has one home. */
export function serializeGeneralPrefs(prefs: GeneralPrefs): string {
  return JSON.stringify(prefs);
}
