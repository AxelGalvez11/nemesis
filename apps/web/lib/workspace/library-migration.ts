// What an old Library would look like if it had been filed the way Nemesis
// files things now — worked out completely, and applied by nobody.
//
// Owner 2026-08-05, Phase 2 item 2: migrate the legacy `Nemesis/...` folders,
// the syllabi sitting at the Library root, root course files and historical
// Inbox items. Their conditions, in their words: preview every proposed move,
// never overwrite a conflicting note, preserve source-file relationships and
// links, be safe to rerun, produce before/after database evidence, and leave
// ambiguous content untouched for the student to look at.
//
// 🔴 THIS MODULE MOVES NOTHING. It reads the Library as it stands and returns a
// plan. That is what makes it idempotent without a migration table to keep in
// step: proposals are derived from where things are RIGHT NOW, so a note that
// has already moved is no longer legacy and is not proposed again, and a note
// that is ambiguous is proposed never. Run it a hundred times; nothing drifts.
//
// It also does no parsing. Rows move; content is not re-read, re-extracted or
// rewritten. A migration that reprocessed documents would be a second import,
// with a second import's failure modes.

import { courseFolderSegment, folderForNewItem, matchCourse } from "@nemesis/shared";

/** A note as the migration needs to see it. */
export interface MigratableNote {
  id: string;
  path: string;
  title: string;
  /** Null for folder rows; treated as empty. */
  content: string | null;
  kind: string;
}

/** An original uploaded file. Its folder is a plain string, not a path. */
export interface MigratableSource {
  id: string;
  fileName: string;
  folderPath: string;
}

export interface MigrationMove {
  kind: "note" | "source";
  id: string;
  /** Where it is now — `path` for a note, `folder_path` for a source. */
  from: string;
  /** Where it should go. */
  to: string;
  label: string;
  course: string;
  /** Why this destination, in words the student would accept. */
  why: string;
}

export interface MigrationSkip {
  kind: "note" | "source";
  label: string;
  where: string;
  reason: string;
}

export interface MigrationPlan {
  moves: MigrationMove[];
  /** Ambiguous, structural, or already filed — deliberately untouched. */
  leave_alone: MigrationSkip[];
  /** A real match whose destination is occupied. Never overwritten. */
  blocked: MigrationSkip[];
}

/**
 * Folders that pre-date filing by course. Everything directly at the Library
 * root counts too, and so does Inbox — Inbox is where an unrecognised upload is
 * SUPPOSED to wait, so an item that has since become recognisable belongs
 * somewhere better.
 */
export const LEGACY_FOLDERS = ["Nemesis", "Inbox"];

function isLegacyNotePath(path: string): boolean {
  if (!path.includes("/")) return true; // sitting at the Library root
  return LEGACY_FOLDERS.some((folder) => path.startsWith(`${folder}/`));
}

function isLegacySourceFolder(folder: string): boolean {
  const clean = folder.trim();
  return clean === "" || LEGACY_FOLDERS.some((legacy) => clean === legacy || clean.startsWith(`${legacy}/`));
}

/**
 * 🔴 Separators are word breaks, and the matcher does not know that.
 *
 * `Fall-2026-PHCY-2105-01-Interprofessional-Education-….pdf` scores ZERO
 * against every one of the student's six PHCY courses: the tokenizer reads
 * hyphenated runs as one enormous word, so the course number `2105` is inside a
 * token rather than being one. Splitting on hyphens, underscores and dots first
 * makes the same four syllabi match uniquely and correctly.
 *
 * This is done HERE, at the migration's own call site, rather than inside the
 * shared matcher — the owner froze course matching on 2026-08-05 and widening
 * it affects every filing decision in the product. It is worth their attention
 * separately; it is not worth taking without asking.
 */
export function looseText(value: string): string {
  return value.replace(/[-_.]+/g, " ");
}

/** Title plus the opening of the body — enough for a course number to appear
 *  without dragging in a whole lecture's worth of incidental words. */
const CONTENT_SNIFF_CHARS = 600;

function noteMatchText(note: MigratableNote): string {
  return looseText(`${note.title}\n${(note.content ?? "").slice(0, CONTENT_SNIFF_CHARS)}`);
}

/** Is this note the page that REPRESENTS its folder rather than content inside
 *  it? Those are structure — moving one out empties the folder it names. */
function isFolderPage(note: MigratableNote): boolean {
  if (note.kind === "folder") return true;
  const parent = note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : "";
  if (!parent) return false;
  const key = (value: string) => value.trim().toLowerCase().replace(/\.md$/, "");
  const leaf = key(note.path.split("/").pop() ?? "");
  const folderName = key(parent.split("/").pop() ?? "");
  return leaf === folderName || key(note.title) === folderName;
}

/** Source ids appear verbatim inside a note's citation links, which is how a
 *  note and the file it was made from stay connected. */
function citedSourceIds(note: MigratableNote, sources: readonly MigratableSource[]): string[] {
  const content = note.content ?? "";
  return sources.filter((source) => source.id && content.includes(source.id)).map((source) => source.id);
}

/**
 * The whole plan, from the Library exactly as it stands.
 *
 * Order matters in one place: a source that a MOVING note cites follows that
 * note, even when its own filename says nothing. That is the "preserve
 * source-file relationships" rule — a note filed under PHCY 2114 whose source
 * pill still points at Inbox is a broken-looking page, and the student did not
 * ask for half a move.
 */
export function planLibraryMigration(input: {
  notes: readonly MigratableNote[];
  sources: readonly MigratableSource[];
  courses: readonly string[];
}): MigrationPlan {
  const { courses, notes, sources } = input;
  const moves: MigrationMove[] = [];
  const leave_alone: MigrationSkip[] = [];
  const blocked: MigrationSkip[] = [];
  const takenPaths = new Set(notes.map((note) => note.path));
  /** Destinations already claimed within THIS plan — two legacy notes with the
   *  same title must not both be sent to the same new path. */
  const claimed = new Set<string>();
  /** sourceId → the course a moving note pulls it into. */
  const pulledBy = new Map<string, { course: string; note: string }>();

  for (const note of notes) {
    if (!isLegacyNotePath(note.path)) continue;
    if (isFolderPage(note)) {
      leave_alone.push({
        kind: "note",
        label: note.title,
        reason: "this page IS its folder — moving it would leave the folder nameless",
        where: note.path,
      });
      continue;
    }
    const matched = matchCourse(noteMatchText(note), courses);
    if (!matched) {
      leave_alone.push({
        kind: "note",
        label: note.title,
        reason: "nothing in it names one of the student's courses clearly enough to choose",
        where: note.path,
      });
      continue;
    }
    const to = `${folderForNewItem("note", noteMatchText(note), courses)}/${note.title}.md`;
    if (to === note.path) continue; // already exactly where it belongs
    if (takenPaths.has(to) || claimed.has(to)) {
      blocked.push({
        kind: "note",
        label: note.title,
        reason: `a different note already lives at '${to}' — nothing was overwritten`,
        where: note.path,
      });
      continue;
    }
    claimed.add(to);
    moves.push({
      course: matched.course,
      from: note.path,
      id: note.id,
      kind: "note",
      label: note.title,
      to,
      why: `it names ${matched.course}`,
    });
    for (const sourceId of citedSourceIds(note, sources)) {
      pulledBy.set(sourceId, { course: matched.course, note: note.title });
    }
  }

  for (const source of sources) {
    if (!isLegacySourceFolder(source.folderPath)) continue;
    const pulled = pulledBy.get(source.id);
    const matched = pulled ? { course: pulled.course } : matchCourse(looseText(source.fileName), courses);
    if (!matched) {
      leave_alone.push({
        kind: "source",
        label: source.fileName,
        reason: "its name does not identify one of the student's courses",
        where: source.folderPath || "the Library root",
      });
      continue;
    }
    const to = courseFolderSegment(matched.course);
    if (to === source.folderPath) continue;
    moves.push({
      course: matched.course,
      from: source.folderPath || "",
      id: source.id,
      kind: "source",
      label: source.fileName,
      to,
      why: pulled
        ? `the note “${pulled.note}” was made from it and is moving to ${matched.course}`
        : `its filename names ${matched.course}`,
    });
  }

  return { blocked, leave_alone, moves };
}

/** One plain-English line the model can lead with, so the count it reports is
 *  the count the plan actually holds. */
export function migrationSummary(plan: MigrationPlan): string {
  if (plan.moves.length === 0 && plan.blocked.length === 0) {
    return `Nothing to move. ${plan.leave_alone.length} item${plan.leave_alone.length === 1 ? "" : "s"} stay where they are because nothing in them names a course clearly enough to file them without guessing.`;
  }
  const parts = [`${plan.moves.length} item${plan.moves.length === 1 ? "" : "s"} can be filed under a course`];
  if (plan.leave_alone.length) parts.push(`${plan.leave_alone.length} left alone`);
  if (plan.blocked.length) parts.push(`${plan.blocked.length} blocked by a name already in use`);
  return `${parts.join(", ")}.`;
}
