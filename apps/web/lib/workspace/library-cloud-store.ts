"use client";

// Cloud Library notes — read-only slice 1. Fetches the signed-in user's rows from
// `readable_library_documents` (a new, plaintext-content Supabase table; RLS scopes every row
// to `user_id = auth.uid()`, so no explicit user filter is needed here) and exposes them
// through a tiny external store — the same useSyncExternalStore shape as sessions-store.ts —
// so the Library sidebar (tree + counts) and the Library main pane (selected note) share one
// fetch and one selection without prop drilling between page.tsx's two sibling components.
//
// The generated Supabase types don't know about this table yet (regenerating them is out of
// scope for this read-only slice), so raw rows come back loosely typed and every field is
// defensively re-validated in toNote() below regardless — never trust a network response's
// shape, typed client or not.

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";

import { titleFromPath, type CloudLibraryNote } from "./library-tree";

// Seeded notes for the /dev-preview/workspace/library screenshot harness (no real cloud
// session there) — lets the reader UI (folder tree, selection, markdown) render demo content.
const PREVIEW_NOTES: CloudLibraryNote[] = [
  {
    path: "Pharmacology/Cardiovascular/ACE inhibitors.md",
    title: "ACE inhibitors",
    updatedAt: "",
    content:
      "# ACE inhibitors\n\n**Mechanism:** block angiotensin-converting enzyme → less angiotensin II → vasodilation and less aldosterone.\n\n## Key points\n- First-line for hypertension and heart failure\n- Classic side effect: a dry cough (bradykinin-mediated)\n\n## Related\n- Contrasts with: [[ARBs]]\n- Applied in: [[Lisinopril case]]",
  },
  {
    path: "Pharmacology/Cardiovascular/Beta blockers.md",
    title: "Beta blockers",
    updatedAt: "",
    content:
      "# Beta blockers\n\nReduce heart rate and contractility (beta-1 blockade).\n\n| Agent | Selectivity | NAPLEX weight |\n| --- | --- | --- |\n| Metoprolol | Beta-1 selective | High |\n| Propranolol | Non-selective | High |",
  },
  {
    path: "Immunology/01 Intro to Immunology.md",
    title: "01 Intro to Immunology",
    updatedAt: "",
    content: "# Introduction to Immunology\n\n- Innate vs. adaptive immunity — the two arms\n- Key cells: leukocytes, lymphocytes, phagocytes",
  },
];

export type { CloudLibraryNote } from "./library-tree";

export type LibraryLoadStatus = "idle" | "loading" | "loaded" | "error";

interface StoreState {
  status: LibraryLoadStatus;
  notes: CloudLibraryNote[];
  error: string | null;
  selectedPath: string | null;
}

const EMPTY_STATE: StoreState = { status: "idle", notes: [], error: null, selectedPath: null };

let state: StoreState = EMPTY_STATE;
/** The user id the current `notes`/`status` reflect — guards against two mounted consumers
 *  (sidebar + main pane) both firing a fetch, and against a stale user's rows flashing on a
 *  same-tab account switch (see loadNotes: it clears notes before the request lands). */
let loadedForUserId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setState(next: StoreState) {
  state = next;
  emit();
}

function getSnapshot(): StoreState {
  return state;
}

// Server snapshot is a stable empty state (this store is client/auth-only).
function getServerSnapshot(): StoreState {
  return EMPTY_STATE;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function toNote(raw: unknown): CloudLibraryNote | null {
  if (!isObj(raw)) return null;
  const path = typeof raw.path === "string" ? raw.path : "";
  if (!path) return null;
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  return {
    path,
    title: rawTitle.length > 0 ? rawTitle : titleFromPath(path),
    content: typeof raw.content === "string" ? raw.content : "",
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : "",
  };
}

async function loadNotes(userId: string): Promise<void> {
  loadedForUserId = userId;
  // Clear notes/selection up front (not just flip to "loading"): on a same-tab account
  // switch this is the only thing standing between the new user and a flash of the
  // previous user's cached rows while the request is in flight.
  setState({ status: "loading", error: null, notes: [], selectedPath: null });

  if (isPreviewMode) {
    setState({ status: "loaded", error: null, notes: [], selectedPath: null });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("readable_library_documents")
      .select("path,kind,title,content,updated_at,deleted")
      .eq("kind", "note")
      .eq("deleted", false);
    if (error) throw new Error(error.message);

    const notes = Array.isArray(data)
      ? data.flatMap((row) => {
          const note = toNote(row);
          return note ? [note] : [];
        })
      : [];
    setState({ status: "loaded", error: null, notes, selectedPath: null });
  } catch (e) {
    setState({
      status: "error",
      error: e instanceof Error ? e.message : "Couldn't load your notes.",
      notes: [],
      selectedPath: null,
    });
  }
}

function reset() {
  loadedForUserId = null;
  setState(EMPTY_STATE);
}

function select(path: string | null) {
  setState({ ...state, selectedPath: path });
}

export interface UseCloudLibraryApi {
  status: LibraryLoadStatus;
  notes: CloudLibraryNote[];
  error: string | null;
  selectedPath: string | null;
  select: (path: string | null) => void;
  reload: () => void;
}

/** Drives the fetch off the signed-in session and exposes the shared store. Safe to call from
 *  multiple components (sidebar + main pane) — only the first mount per user id triggers a
 *  network request; the rest read the same shared snapshot. */
export function useCloudLibrary(): UseCloudLibraryApi {
  const { session } = useAuth();
  const preview = useWorkspacePreview();
  const userId = session?.user.id ?? null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Screenshot harness (/dev-preview/workspace/library): render seeded demo notes so the
    // reader UI is visible without a real cloud session. No network call in this path.
    if (preview) {
      if (loadedForUserId !== "__preview__") {
        loadedForUserId = "__preview__";
        setState({ status: "loaded", error: null, notes: PREVIEW_NOTES, selectedPath: PREVIEW_NOTES[0]?.path ?? null });
      }
      return;
    }
    if (!userId) {
      if (loadedForUserId) reset();
      return;
    }
    if (loadedForUserId === userId) return;
    void loadNotes(userId);
  }, [preview, userId]);

  const reload = useCallback(() => {
    if (userId) void loadNotes(userId);
  }, [userId]);

  return {
    status: snap.status,
    notes: snap.notes,
    error: snap.error,
    selectedPath: snap.selectedPath,
    select: useCallback((path: string | null) => select(path), []),
    reload,
  };
}
