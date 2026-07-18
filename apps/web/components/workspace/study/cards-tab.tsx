"use client";

// Cards tab, fresh-install state (library-study spec §3.3/§3.4): toolbar of
// three text-button actions that all open the same "build on your Mac"
// notice, the empty deck area, and the collapsed review-history section.

import { IconFileImport, IconFolderPlus } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Plus } from "@/lib/workspace/icons";

import { MacOnlyDialog } from "./mac-only-dialog";
import { ReviewHistory } from "./review-history";

export function CardsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
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
      <EmptyState description="Create a deck or import cards to get going." title="No decks yet" />
      <ReviewHistory />
      <MacOnlyDialog onOpenChange={setDialogOpen} open={dialogOpen} />
    </>
  );
}
