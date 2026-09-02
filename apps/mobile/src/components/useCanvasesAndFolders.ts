import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { listCanvases, listFolders, subscribeCanvasChanges } from "@/api/canvases";
import type { CanvasSummary, Folder } from "@/lib/canvases";

/**
 * The learner's canvases + projects, loaded while `active` and kept fresh three ways:
 * once on activation, again (debounced ~300ms) on every mutation any screen makes
 * through api/canvases.ts — this hook's own optimistic callers included, since every
 * mutator there `await`s its write before calling `emit()`, so a debounced re-read
 * always lands on post-write truth rather than undoing an optimistic change — and
 * again on returning to the foreground, so a canvas started on the web (or another
 * device) appears without leaving and reopening the screen.
 *
 * Shared by the drawer's sidebar and the Projects page, which both need exactly this;
 * `active` is "the drawer is open" for one and "true" (the screen itself is the
 * activity signal) for the other.
 */
export function useCanvasesAndFolders(uid: string | null, active: boolean) {
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  const refresh = useCallback(() => {
    if (!uid) return;
    Promise.all([listCanvases(uid), listFolders(uid)])
      .then(([cRows, fRows]) => {
        setCanvases(cRows);
        setFolders(fRows);
      })
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!active || !uid) return;
    let alive = true;
    Promise.all([listCanvases(uid), listFolders(uid)])
      .then(([cRows, fRows]) => {
        if (!alive) return;
        setCanvases(cRows);
        setFolders(fRows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, uid]);

  useEffect(() => {
    if (!active || !uid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeCanvasChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [active, uid, refresh]);

  useEffect(() => {
    if (!active || !uid) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [active, uid, refresh]);

  return { canvases, folders, refresh, setCanvases, setFolders };
}
