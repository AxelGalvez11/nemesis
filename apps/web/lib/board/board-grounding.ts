// The board reads the learner's documents the way the chat does: retrieve the passages the
// question needs, put every attached document in front of the model, cite by excerpt id.
//
// Owner 2026-09-03: "i dont like that it makes up its own sources" and, asked whether to bring
// the chat's document grounding to the canvas, "yes". Until then a board PASTED each selected
// source into the question up to Wondering's limits (4 sources, 240k characters each), which is
// the reference's design and the wrong one for a product whose point is thirty dropped lectures.
//
// 🔴 NOTHING HERE IS A SECOND PIPELINE. Every function below is the chat's, called in the chat's
// order (components/workspace/learn/canvas-chat.ts, "THIS IS WHY TWENTY DOCUMENTS WORK"), so the
// narrowing rule, the inventory line, the retrieval note and the citation ids are one behaviour
// on two surfaces. A source dropped before `grounded` existed is given the chat's shape from its
// text on the fly, so an old board cites too.

import { buildExcerpts, groundingBlock } from "@/lib/learn/canvas-grounding";
import type { CanvasSource } from "@/lib/learn/canvas-model";
import {
  everyDocumentPresent,
  excerptsInChunks,
  inventoryNote,
  questionIsSpecific,
  retrievalIsBroad,
  retrievalNote,
  retrieveChunks,
  TURN_CHUNKS,
} from "@/lib/learn/canvas-retrieval";
import type { FileCitation } from "@/lib/workspace/chat-citations";

import type { BoardSource } from "./board-model";

/** The chat-shaped view of a board source; built from its text when it was filed before grounding. */
export function groundedSource(source: BoardSource, ordinal: number): CanvasSource | null {
  if (source.grounded) return source.grounded;
  if (source.status !== "ready" || !source.content.trim()) return null;
  const id = `s${ordinal}`;
  return { id, title: source.name, kind: source.type, excerpts: buildExcerpts(id, source.content), durability: "ephemeral" };
}

/** Every ready source in the chat's shape, in board order, ids stable across turns. */
export function groundedSources(sources: readonly BoardSource[]): CanvasSource[] {
  const out: CanvasSource[] = [];
  sources.forEach((source, index) => {
    const grounded = groundedSource(source, index + 1);
    if (grounded) out.push(grounded);
  });
  return out;
}

/** What the citation pills need: the chat-side id, the title, and the filed row if there is one. */
export function boardCitableFiles(sources: readonly BoardSource[]): FileCitation[] {
  return groundedSources(sources).map((source) => ({ id: source.id, title: source.title, librarySourceId: source.librarySourceId ?? null }));
}

/** The board source a citation pill names, by its chat-side id. */
export function boardSourceForFile(sources: readonly BoardSource[], fileId: string): BoardSource | null {
  let ordinal = 0;
  for (const source of sources) {
    const grounded = groundedSource(source, ordinal + 1);
    if (!grounded) continue;
    ordinal += 1;
    if (grounded.id === fileId) return source;
  }
  return null;
}

/**
 * The material packet for one question: the chat's assembly, verbatim.
 *
 * Retrieval returns null when nothing is embedded yet (a document dropped seconds ago, an
 * ephemeral source), and then every document is read in order, round-robin, exactly as the chat
 * does on the same day-one canvas.
 */
export async function boardMaterialContext(sources: readonly CanvasSource[], question: string): Promise<string> {
  if (sources.length === 0) return "";
  let retrieved: Awaited<ReturnType<typeof retrieveChunks>> = null;
  try {
    retrieved = await retrieveChunks(sources, question, TURN_CHUNKS);
  } catch {
    retrieved = null;
  }
  const focused = retrieved ? excerptsInChunks(sources, retrieved) : null;
  const narrowed =
    focused !== null && focused.sources.length > 0 && (retrievalIsBroad(sources.length, focused.sources.length) || questionIsSpecific(question));
  return narrowed
    ? [
        inventoryNote(sources, focused.sources),
        retrievalNote(focused.sources.length, retrieved?.length ?? 0, { documents: sources.length, openings: true }),
        groundingBlock(everyDocumentPresent(sources, focused.sources)),
      ].join("\n\n")
    : [inventoryNote(sources, sources), groundingBlock(sources)].filter(Boolean).join("\n\n");
}
