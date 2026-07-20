"use client";

// Report-style popup for chat output artifacts (owner ask 2026-07-20): opens
// from the OutputCard in any chat transcript. Recordings get a Transcript |
// Notes toggle; other kinds render their notes as markdown or link out.
// Mounted once in workspace-shell, driven by lib/workspace/output-viewer.

import { useEffect, useState, useSyncExternalStore } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import {
  closeOutputViewer,
  outputViewerServerSnapshot,
  outputViewerSnapshot,
  subscribeOutputViewer,
} from "@/lib/workspace/output-viewer";

import { outputMetaLine } from "./output-card";

type ViewerTab = "notes" | "transcript";

const VIEWER_TABS = [
  { id: "transcript" as const, label: "Transcript" },
  { id: "notes" as const, label: "Notes" },
];

export function OutputViewerDialog() {
  const state = useSyncExternalStore(subscribeOutputViewer, outputViewerSnapshot, outputViewerServerSnapshot);
  const [tab, setTab] = useState<ViewerTab>("transcript");
  const output = state.output;

  // Start on Transcript when there is one, otherwise Notes.
  useEffect(() => {
    if (state.open) setTab(output?.transcript?.trim() ? "transcript" : "notes");
  }, [output, state.open]);

  const transcript = output?.transcript?.trim() ?? "";
  const notes = output?.notes?.trim() ?? "";
  const showToggle = Boolean(transcript && notes);
  const activeTab: ViewerTab = showToggle ? tab : transcript ? "transcript" : "notes";

  return (
    <Dialog onOpenChange={(open) => { if (!open) closeOutputViewer(); }} open={state.open}>
      <DialogContent className="flex h-[min(85vh,52rem)] w-[min(52rem,94vw)] max-w-[52rem] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-8">{output?.title ?? "Output"}</DialogTitle>
          <DialogDescription>{output ? outputMetaLine(output) : ""}</DialogDescription>
        </DialogHeader>
        {showToggle && (
          <div className="shrink-0">
            <SegmentedControl
              className="bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)]"
              onChange={setTab}
              options={VIEWER_TABS}
              value={activeTab}
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-5 py-4">
          {output?.url ? (
            <a className="text-[0.9rem] font-medium text-[var(--theme-primary)] underline underline-offset-4" href={output.url} rel="noreferrer" target="_blank">
              Open {output.title}
            </a>
          ) : activeTab === "transcript" && transcript ? (
            <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-foreground">{transcript}</p>
          ) : notes ? (
            <AssistantMarkdown className="text-[0.9rem] leading-relaxed" text={notes} />
          ) : (
            <p className="text-[0.85rem] text-(--ui-text-tertiary)">Nothing captured yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
