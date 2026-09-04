// Reading and writing boards: `public.canvas_boards`, one jsonb document per board, versioned.
//
// The write contract is Wondering's (docs/wondering-canvas-reference.md §1): every update carries
// the version it read; if the row has moved on, ZERO rows update and the caller gets a
// `BoardVersionConflict` to re-read from. That is what lets two tabs on one board keep both their
// documents and their undo history honest instead of the last writer winning.
//
// 🔴 NOT `lib/learn/canvas-store.ts`. That is the chat (`learning_canvases`); this is the board.

"use client";

import { supabase } from "@/lib/supabase";
import type { BoardDocument } from "./board-model";
import type { HistorySnapshot } from "./board-history";

const TABLE = "canvas_boards";

/** Fired on `window` after any board is created, renamed, saved or deleted. The sidebar re-reads. */
export const BOARDS_CHANGED_EVENT = "nemesis:boards-changed";

export function notifyBoardsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BOARDS_CHANGED_EVENT));
}

export class BoardVersionConflict extends Error {
  constructor(readonly boardId: string) {
    super("This canvas changed in another session.");
    this.name = "BoardVersionConflict";
  }
}

export interface BoardSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface LoadedBoard {
  document: BoardDocument;
  history: HistorySnapshot;
  version: number;
  title: string;
}

function readHistory(raw: unknown): HistorySnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { past: [], future: [] };
  const value = raw as { past?: unknown; future?: unknown };
  return {
    past: Array.isArray(value.past) ? (value.past as HistorySnapshot["past"]) : [],
    future: Array.isArray(value.future) ? (value.future as HistorySnapshot["future"]) : [],
  };
}

export async function listBoards(): Promise<BoardSummary[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,title,updated_at")
    .eq("deleted", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, updatedAt: row.updated_at as string }));
}

export async function getBoard(boardId: string): Promise<LoadedBoard> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,title,document,history,version")
    .eq("id", boardId)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This canvas could not be found.");
  return {
    document: data.document as BoardDocument,
    history: readHistory(data.history),
    version: Number(data.version) || 1,
    title: String(data.title ?? ""),
  };
}

export async function createBoard(input: {
  userId: string;
  /** Minted client-side so an in-flight reply can be filed under it before the row exists. */
  boardId?: string;
  title: string;
  document: BoardDocument;
  history?: HistorySnapshot | null;
}): Promise<{ id: string; version: number }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...(input.boardId ? { id: input.boardId } : {}),
      user_id: input.userId,
      title: input.title.slice(0, 120),
      document: input.document,
      ...(input.history ? { history: input.history } : {}),
    })
    .select("id,version")
    .single();
  if (error) throw error;
  notifyBoardsChanged();
  return { id: data.id as string, version: Number(data.version) || 1 };
}

export async function updateBoard(
  boardId: string,
  input: {
    expectedVersion: number;
    title?: string;
    document?: BoardDocument;
    history?: HistorySnapshot | null;
  },
): Promise<{ version: number }> {
  const nextVersion = input.expectedVersion + 1;
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      version: nextVersion,
      ...(input.title !== undefined ? { title: input.title.slice(0, 120) } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
      ...(input.history ? { history: input.history } : {}),
    })
    .eq("id", boardId)
    .eq("version", input.expectedVersion)
    .eq("deleted", false)
    .select("version");
  if (error) throw error;
  if (!data || data.length === 0) throw new BoardVersionConflict(boardId);
  notifyBoardsChanged();
  return { version: Number(data[0]?.version) || nextVersion };
}

/** The current version of a board, for a rename or delete that did not load the document. */
export async function boardVersion(boardId: string): Promise<number> {
  const { data, error } = await supabase.from(TABLE).select("version").eq("id", boardId).maybeSingle();
  if (error) throw error;
  return Number(data?.version) || 1;
}

export async function renameBoard(boardId: string, title: string): Promise<void> {
  const version = await boardVersion(boardId);
  await updateBoard(boardId, { expectedVersion: version, title });
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ deleted: true }).eq("id", boardId);
  if (error) throw error;
  notifyBoardsChanged();
}
