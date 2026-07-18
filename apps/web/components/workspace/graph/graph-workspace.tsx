"use client";

// Graph — verbatim from desktop graph/index.tsx §B.4–B.7. The inline caption
// under the <h1> IS the legend (no separate legend component). Title is
// text-lg (18px) — intentionally smaller than Calendar's text-2xl.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { SlidersHorizontal } from "@/lib/workspace/icons";

import { GraphControlsPanel } from "./controls-panel";
import { GraphCanvas } from "./graph-canvas";
import { buildGraphIndex, type GraphIndex, loadVaultNotes } from "./graph-notes";
import { DEFAULT_CONTROLS, type GraphControlsState, loadGraphSettings, saveGraphSettings } from "./graph-settings";

type GraphStatus = "loading" | "ready" | "empty" | "error";

export function GraphWorkspace() {
  const router = useRouter();
  const [status, setStatus] = useState<GraphStatus>("loading");
  const [index, setIndex] = useState<GraphIndex | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [controls, setControls] = useState<GraphControlsState>(DEFAULT_CONTROLS);

  // Controls: read from storage only after mount (SSR has no localStorage).
  useEffect(() => {
    setControls(loadGraphSettings());
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadVaultNotes()
      .then((notes) => {
        if (cancelled) return;
        if (notes.length === 0) {
          setStatus("empty");
          return;
        }
        setNoteCount(notes.length);
        setIndex(buildGraphIndex(notes));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleControlsChange(next: GraphControlsState) {
    setControls(next);
    saveGraphSettings(next);
  }

  const ghostCount = index?.ghostCount ?? 0;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background) pt-(--titlebar-height)">
      <div className="relative flex h-full min-h-0 flex-col">
        <header className="pointer-events-none absolute left-6 top-5 z-10">
          <h1 className="text-lg font-semibold">Graph</h1>
          <p className="text-xs text-muted-foreground">
            {status === "ready" ? `${noteCount} notes${ghostCount > 0 ? ` · ${ghostCount} to create` : ""} — click any node` : ""}
          </p>
          {status === "ready" && ghostCount > 0 && (
            <p className="text-[11px] text-muted-foreground/70">Dim nodes are [[links]] with no note yet — click one to create it.</p>
          )}
        </header>

        {status === "ready" && (
          <div className="absolute right-6 top-5 z-10 flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Button
                aria-label="Graph settings"
                className="active:scale-[0.97] motion-reduce:transition-none"
                onClick={() => setPanelOpen((v) => !v)}
                size="sm"
                variant={panelOpen ? "secondary" : "outline"}
              >
                <SlidersHorizontal size={14} />
              </Button>
              <Button onClick={() => router.push("/library")} size="sm" variant="outline">
                + New note
              </Button>
            </div>
            {panelOpen && <GraphControlsPanel controls={controls} onChange={handleControlsChange} />}
          </div>
        )}

        {status === "error" && <EmptyState className="flex-1" description="Could not read the Library vault." title="Graph unavailable" />}
        {status === "empty" && <EmptyState className="flex-1" description="Write linked notes in the Library first." title="Nothing to map yet" />}

        {status === "ready" && index && <GraphCanvas className="min-h-0 flex-1" controls={controls} index={index} />}
      </div>
    </div>
  );
}
