"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { SlidersHorizontal } from "@/lib/workspace/icons";

import { GraphControlsPanel } from "./controls-panel";
import { GraphCanvas } from "./graph-canvas";
import { buildGraphIndex, cloudNotesToVault, type GraphNode } from "./graph-notes";
import { DEFAULT_CONTROLS, type GraphControlsState, loadGraphSettings, saveGraphSettings } from "./graph-settings";

export function GraphWorkspace() {
  const router = useRouter();
  const { status, notes, error, select, createNote } = useCloudLibrary();
  const [panelOpen, setPanelOpen] = useState(false);
  const [controls, setControls] = useState<GraphControlsState>(DEFAULT_CONTROLS);
  const index = useMemo(() => buildGraphIndex(cloudNotesToVault(notes)), [notes]);

  useEffect(() => setControls(loadGraphSettings()), []);

  function handleControlsChange(next: GraphControlsState) {
    setControls(next);
    saveGraphSettings(next);
  }

  async function openNode(node: GraphNode) {
    if (node.path) {
      select(node.path);
      router.push(`/library?note=${encodeURIComponent(node.path)}`);
      return;
    }
    if (!node.target) return;
    const created = await createNote({ title: node.target });
    select(created.path);
    router.push(`/library?note=${encodeURIComponent(created.path)}`);
  }

  const ready = status === "loaded" && notes.length > 0;
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background) pt-(--titlebar-height)">
      <div className="relative flex h-full min-h-0 flex-col">
        <header className="pointer-events-none absolute left-6 top-5 z-10">
          <h1 className="text-lg font-semibold">Graph</h1>
        </header>

        {ready && (
          <div className="absolute right-6 top-5 z-10 flex flex-col items-end gap-2">
            <Button aria-label="Graph settings" onClick={() => setPanelOpen((value) => !value)} size="sm" variant={panelOpen ? "secondary" : "outline"}>
              <SlidersHorizontal size={14} />
            </Button>
            {panelOpen && <GraphControlsPanel controls={controls} onChange={handleControlsChange} />}
          </div>
        )}

        {status === "error" && <EmptyState className="flex-1" description={error ?? "Could not read the Library."} title="Graph unavailable" />}
        {(status === "idle" || status === "loading") && <EmptyState className="flex-1" description="Connecting your notes…" title="Building graph" />}
        {status === "loaded" && notes.length === 0 && <EmptyState className="flex-1" description="Create linked notes in the Library first." title="Nothing to map yet" />}
        {ready && <GraphCanvas className="min-h-0 flex-1" controls={controls} index={index} onNodeClick={(node) => void openNode(node)} />}
      </div>
    </div>
  );
}
