// Turning one piece of attached material into a `CanvasSource` — the phone's version of the
// web's `attachFilesInner` (apps/web/components/workspace/learn/use-canvas-session.ts:1041-1170).
// Read that function before changing this one: every field below is copied from a specific line
// there, and a port that drifts from its fallback order fails silently — a table's structure
// quietly downgrades to prose, or a picture's filename gets replaced by a caption nobody asked
// to see.
//
// 🔴 EXCERPTS ARE A PARAMETER, NOT COMPUTED HERE — AND THAT IS A DELIBERATE SEAM, NOT A
// SHORTCUT. `buildExcerpts` / `buildExcerptsFromModel` / `excerptsFromSourceContext` live behind
// `@/learn/sources`, which reaches `@/lib/sources/source-context` (canvas-grounding.ts's own
// import) — a path alias Deno's module resolver has no mapping for at all (proved: `deno eval`
// on a module reaching it fails with "Import ... not a dependency", not a type error). Metro and
// tsc resolve it fine (the phone's tsconfig `@/*` fallback to `../web/*`), so the actual excerpt
// building stays correct and lives in api/canvas-sources.ts, which calls it directly. This file
// takes the RESULT as a parameter so its own field assembly — which excerpts land, which title,
// which durability — can be pinned by a real, running Deno test instead of merely typechecked.
// `excerptSourceFor` below pins the ORDER of that three-tier choice the same way, without needing
// to call the unresolvable functions itself.
//
// PURE. No React, no I/O, no `@/lib/sources/*`.
//
// 🔴 RELATIVE IMPORTS ONLY, EVEN FOR THE PHONE'S OWN MODULES. Deno has no import map for this
// repo's `@/` tsconfig alias — it resolves `@nemesis/shared` (a real npm workspace package) fine,
// and silently drops a TYPE-ONLY `@/...` import (erased before resolution ever runs), but a
// VALUE import written as `@/learn/web` fails exactly like the source-context one this file's
// header describes. Every other Deno-tested file in `src/lib` already reaches its siblings this
// way (see chat-thread.ts) — this file follows the same rule for the same reason.

import { documentTitle, type CanvasSource, type LearningCanvas, type SourceExcerpt } from "../learn/web.ts";
import type { Extracted } from "./pending-attachment.ts";

/**
 * The web's `s${sources.length+1}` (`use-canvas-session.ts`'s own comment on that line): "a slot
 * number, not a document identity... only unique because nothing removes a source". Mint it
 * against the canvas the CALLER'S loop has accumulated so far — not the canvas at the start of a
 * multi-file attach — or two files landing in one send both become "s1" and the second overwrites
 * the first (`mergeSourceIntoCanvas`'s `isSameDocument` id branch). Callers must re-mint after
 * every merge; see api/canvas-sources.ts's loop.
 */
export function nextSourceId(canvas: Pick<LearningCanvas, "sources">): string {
  return `s${canvas.sources.length + 1}`;
}

/** Which of the three excerpt builders a file's grounding comes from, in the web's own priority
 *  order (`use-canvas-session.ts`'s comment: "1. the STORED canonical parse... 2. the model from
 *  this request... 3. the flat text"). A missing model is UNKNOWN, never "flat" — so this checks
 *  `canonical` first and `model` second, never the other way round. */
export function excerptSourceFor(canonicalOk: boolean, hasModel: boolean): "canonical" | "model" | "text" {
  if (canonicalOk) return "canonical";
  if (hasModel) return "model";
  return "text";
}

/**
 * A freshly read file, as a `CanvasSource` — field for field the web's construction
 * (`use-canvas-session.ts` lines ~1097-1163). `excerpts` and `parseQuality` are already resolved
 * by the caller (see this file's header); everything else is decided here.
 */
export function buildFileCanvasSource(
  id: string,
  fileName: string,
  extracted: Pick<Extracted, "title" | "kind" | "librarySourceId">,
  excerpts: readonly SourceExcerpt[],
  parseQuality: "full" | "degraded" | "failed" | undefined,
  coverageNote: string | null,
): CanvasSource {
  return {
    id,
    // An image is titled by its file, never by what a vision read said it saw (the web's own
    // 2026-08-20 fix) — everything else prefers the parser's own title, but only once
    // `documentTitle` has rejected a table header or a row of column names.
    title: extracted.kind === "image" ? fileName : documentTitle(extracted.title, fileName),
    kind: extracted.kind ?? "text",
    excerpts: [...excerpts],
    ...(coverageNote ? { coverageNote } : {}),
    // Stated, not inferred from whether `librarySourceId` happens to be set — see
    // `CanvasSource.durability`'s own comment (canvas-model.ts).
    durability: extracted.librarySourceId ? "durable" : "ephemeral",
    ...(extracted.librarySourceId ? { librarySourceId: extracted.librarySourceId } : {}),
    ...(parseQuality ? { parseQuality } : {}),
  };
}

/**
 * An existing Library note, as a `CanvasSource`. `excerpts` is `buildExcerpts(id, note.content)`,
 * resolved by the caller for the same Deno-resolution reason as the file builder above.
 *
 * 🔴 THE WEB HAS NO "ATTACH AN EXISTING NOTE" DOOR TO COPY THIS FROM. Its own `attachUrl`
 * synthesises a real `File` and runs it through the SAME filing path an upload takes, so it
 * always ends up with a genuine `library_sources` row. A phone Library note lives in
 * `readable_library_documents`, a different table neither `loadCanonicalSource` nor
 * `ensureKnowledgeForCanvas` reads — so `librarySourceId` is left OFF here. Setting it to the
 * note's id would type-check and look identical to a filed source while pointing at a row that
 * does not exist in the table those readers query: a false "durable" that resolves to nothing.
 * The note is real and persists on its own regardless of what this canvas does with it; what is
 * missing is only the canvas's own retrieval/citation anchor into it, which is what `durability`
 * is actually reporting here.
 */
export function buildNoteCanvasSource(
  id: string,
  note: { title: string },
  excerpts: readonly SourceExcerpt[],
): CanvasSource {
  const title = note.title.trim();
  return {
    id,
    title: title || "Untitled note",
    kind: "text",
    excerpts: [...excerpts],
    durability: "ephemeral",
  };
}
