// "Find in chat" — PURE, no React, no I/O. The "…" menu's search field (item 6 of the iOS
// ChatGPT-parity pass, IMG_6536) hides every turn whose question and answer both miss the
// query; this is the one place that decides "miss".
//
// Structural: matches on the turn's own words (said + reply), never on subject-matter — a law
// canvas and a chemistry canvas search the same way (CLAUDE.md's field-agnostic rule).

// Relative, not "@/learn/web" — this file is Deno-tested (see canvas-find.test.ts), and Deno
// has no tsconfig path alias to resolve "@/…" against.
import type { CanvasThreadTurn } from "../learn/web.ts";

/** Whether `turn` should stay on screen for a "Find in chat" query. An empty (or
 *  whitespace-only) query matches everything — the search field starting empty must not hide
 *  the whole conversation. */
export function turnMatchesQuery(turn: Pick<CanvasThreadTurn, "said" | "reply">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${turn.said ?? ""}\n${turn.reply}`.toLowerCase();
  return haystack.includes(needle);
}

/** The turns a query keeps, in their original order. */
export function filterTurnsByQuery<T extends Pick<CanvasThreadTurn, "said" | "reply">>(
  turns: readonly T[],
  query: string,
): T[] {
  return turns.filter((turn) => turnMatchesQuery(turn, query));
}
