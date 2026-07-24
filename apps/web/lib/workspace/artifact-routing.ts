// Where an auto-generated deliverable lands (owner item 6, 2026-07-24). One
// tested decision so every producer files things the same way:
//   - flashcards / practice tests / mind maps  → the Study page (study_* tables)
//   - recordings                               → Library "Recordings/"
//   - slides                                   → Library "Slides/"
//   - deep-research reports                    → Library "Research/"
//
// Library folders are IMPLICIT: writing a document at path "Recordings/My
// lecture.md" makes the folder appear on both web and mobile (mobile derives
// the tree by splitting paths, apps/mobile/src/lib/library-sync.ts). So this
// module never creates a folder row — it only names the folder a writer should
// prefix onto the note path, mirroring the "Imported" precedent in
// library-sidebar.tsx.
//
// This partitions AUTO-GENERATED deliverables only. A student's own imported
// documents and hand-written notes are never moved by anything that reads this.
//
// NOTE: slides and deep-research reports have NO generator yet — the routing is
// here so the day a producer ships, it files into the right folder with no
// further decision. Nothing calls routeArtifact("slides"|"report") today.

/** Every deliverable kind we route. Superset of the study kinds and the
 *  Library-bound kinds so the switch below is exhaustive. */
export type ArtifactKind = "flashcards" | "test" | "mindmap" | "recording" | "slides" | "report";

export type ArtifactDestination =
  | { surface: "study" }
  | { surface: "library"; folder: string };

/** The three implicit Library folders auto-generated deliverables live under.
 *  Exported so writers and tests share the exact spelling — a typo here would
 *  scatter recordings across "Recordings" and "recording". */
export const RECORDINGS_FOLDER = "Recordings";
export const SLIDES_FOLDER = "Slides";
export const RESEARCH_FOLDER = "Research";

/** Decide where one deliverable kind is saved. Study material stays on the
 *  Study page; producible Library artifacts get their folder. */
export function routeArtifact(kind: ArtifactKind): ArtifactDestination {
  switch (kind) {
    case "flashcards":
    case "test":
    case "mindmap":
      return { surface: "study" };
    case "recording":
      return { surface: "library", folder: RECORDINGS_FOLDER };
    case "slides":
      return { surface: "library", folder: SLIDES_FOLDER };
    case "report":
      return { surface: "library", folder: RESEARCH_FOLDER };
  }
}

/** The Library folder a kind files into, or null when it belongs on Study.
 *  Convenience for the common "give me the folder to prefix" call. */
export function libraryFolderFor(kind: ArtifactKind): string | null {
  const destination = routeArtifact(kind);
  return destination.surface === "library" ? destination.folder : null;
}
