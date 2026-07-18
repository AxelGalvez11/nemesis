"use client";

// Cards tab, fresh-install state (library-study spec §3.3): toolbar of three
// text-button actions that all open the same "build on your Mac" notice, the
// empty deck area, and — near the bottom, centered — the GitHub-style activity
// heatmap on its own (the "Review history" card chrome was dropped per owner).

import { IconFileImport, IconFolderPlus } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Plus } from "@/lib/workspace/icons";

import { StudyHeatmap } from "./heatmap";
import { MacOnlyDialog } from "./mac-only-dialog";

export function CardsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-6 mb-1 flex items-center gap-4">
        <Button onClick={() => setDialogOpen(true)} size="inline" variant="text">
          <Plus size={13} />
          New deck
        </Button>
        <Button onClick={() => setDialogOpen(true)} size="inline" variant="text">
          <IconFileImport size={13} />
          Import
        </Button>
        <Button onClick={() => setDialogOpen(true)} size="inline" variant="text">
          <IconFolderPlus size={13} />
          New section
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState description="Create a deck or import cards to get going." title="No decks yet" />
      </div>
      <div className="flex shrink-0 justify-center px-6 pb-10 pt-4">
        <StudyHeatmap />
      </div>
      <MacOnlyDialog onOpenChange={setDialogOpen} open={dialogOpen} />
    </div>
  );
}
