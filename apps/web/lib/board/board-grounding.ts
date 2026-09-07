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

/** The ordinal a source's stored id carries (`s7` → 7), or 0 when it has none yet. */
export function sourceOrdinalOf(source: BoardSource): number {
  const match = /^s(\d+)$/.exec(source.grounded?.id ?? "");
  return match ? Number(match[1]) : 0;
}

/**
 * Every ready source in the chat's shape, in board order, ids stable across turns.
 *
 * 🔴 A STORED ID IS NEVER REASSIGNED, AND A BUILT ONE NEVER COLLIDES WITH IT. A source filed before
 * grounding existed has no id and is given the lowest free `sN`, skipping every id a stored source
 * holds, so two documents never share an excerpt namespace and a `[s3:e2]` pill opens the right file.
 */
export function groundedSources(sources: readonly BoardSource[]): CanvasSource[] {
  const taken = new Set(sources.map((source) => source.grounded?.id).filter((id): id is string => Boolean(id)));
  let next = 1;
  const free = () => {
    while (taken.has(`s${next}`)) next += 1;
    const id = `s${next}`;
    taken.add(id);
    return id;
  };
  const out: CanvasSource[] = [];
  for (const source of sources) {
    if (source.grounded) {
      out.push(source.grounded);
      continue;
    }
    if (source.status !== "ready" || !source.content.trim()) continue;
    const id = free();
    out.push({ id, title: source.name, kind: source.type, excerpts: buildExcerpts(id, source.content), durability: "ephemeral" });
  }
  return out;
}

/** What the citation pills need: the chat-side id, the title, and the filed row if there is one. */
export function boardCitableFiles(sources: readonly BoardSource[]): FileCitation[] {
  return groundedSources(sources).map((source) => ({ id: source.id, title: source.title, librarySourceId: source.librarySourceId ?? null }));
}

/** The board source a citation pill names, by its chat-side id. */
export function boardSourceForFile(sources: readonly BoardSource[], fileId: string): BoardSource | null {
  const grounded = groundedSources(sources);
  const index = grounded.findIndex((source) => source.id === fileId);
  if (index < 0) return null;
  // `groundedSources` keeps board order and skips only unready sources, so walk the same way.
  let seen = -1;
  for (const source of sources) {
    if (source.grounded || (source.status === "ready" && source.content.trim())) seen += 1;
    if (seen === index) return source;
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

/**
 * The chat-shaped view of ONE dropped document, for opening it in the reading panel.
 *
 * 🔴 BUILT OVER THE WHOLE LIST, NEVER OVER THE ONE SOURCE. The `s1`, `s2` ids are allocated across
 * every source on the board so a citation means the same thing everywhere; rebuilding a single
 * source in isolation would hand it `s1` no matter where it sits, and the panel would open one
 * document while the answer's marks pointed at another.
 */
export function groundedSourceFor(sources: readonly BoardSource[], sourceId: string): CanvasSource | null {
  const target = sources.find((source) => source.id === sourceId);
  if (!target) return null;
  if (target.grounded) return target.grounded;
  const included = sources.filter((source) => source.grounded || (source.status === "ready" && source.content.trim()));
  const index = included.findIndex((source) => source.id === sourceId);
  return index < 0 ? null : (groundedSources(sources)[index] ?? null);
}
