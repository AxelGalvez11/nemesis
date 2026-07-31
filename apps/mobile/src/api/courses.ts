import { knownCourses } from "@nemesis/shared";
import { supabase } from "./supabase";
import { loadCachedLibrary } from "./cloudLibrary";

/**
 * The courses this student is actually taking, in their own words.
 *
 * Two sources, both things they typed rather than anything we inferred: the
 * `course` field on their calendar events (which the syllabus import fills in),
 * and the top-level folders they have already made in their Library. Together
 * those cover the student who imported a syllabus and the one who just made a
 * folder called "Torts".
 *
 * 🔴 NEVER THROWS, ALWAYS DEGRADES TO []. This is called on the save path for a
 * recording. An empty list means the item is filed exactly where it is filed
 * today, which is a perfectly good outcome — losing a lecture because a folder
 * lookup timed out is not. Every caller treats [] as "no course, use the
 * fallback folder".
 */
export async function loadKnownCourses(uid: string): Promise<string[]> {
  const [calendar, library] = await Promise.all([
    (async () => {
      try {
        const { data } = await supabase
          .from("calendar_events")
          .select("course")
          .eq("user_id", uid)
          .not("course", "is", null)
          .limit(500);
        return (data ?? []).map((row) => (row as { course?: string }).course);
      } catch {
        return [] as (string | undefined)[];
      }
    })(),
    (async () => {
      try {
        const snapshot = await loadCachedLibrary(uid);
        return topLevelFolders(snapshot.notes.map((note) => note.path));
      } catch {
        return [] as string[];
      }
    })(),
  ]);
  return knownCourses(calendar, library);
}

/** The first segment of every note path that HAS a folder — the student's own
 *  top-level shelves. A note at the root has no folder and contributes nothing. */
export function topLevelFolders(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    if (segments.length > 1) out.add(segments[0] as string);
  }
  return [...out];
}
