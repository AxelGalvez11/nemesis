"use client";

// Popup for chat output artifacts (owner ask 2026-07-20): opens from the
// OutputCard in any chat transcript. Mounted once in workspace-shell, driven by
// lib/workspace/output-viewer.
//
// Two layouts:
//  - Recordings open a genuinely FULLSCREEN reader (owner item 3, 2026-07-23):
//    title + date + duration, then the AI notes and the full transcript stacked,
//    both scrollable and selectable. There is no audio playback — the audio file
//    is deleted after the enhance pass, so there is deliberately no play button.
//  - Every other kind keeps the compact centered modal with a Transcript | Notes
//    toggle (or a link out).

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
import { spokenRecordingDuration } from "@/lib/workspace/recording-title";

import { formatOutputDate, outputMetaLine } from "./output-card";

type ViewerTab = "notes" | "transcript";

const VIEWER_TABS = [
  { id: "transcript" as const, label: "Transcript" },
  { id: "notes" as const, label: "Notes" },
];

/** Header subline for the fullscreen recording view: "Recorded 25 minutes ·
 *  Jul 23" — same order as the card's subline, dropping the date if absent. */
function recordingHeaderMeta(createdAt: string | undefined, durationSeconds: number | undefined): string {
  return [spokenRecordingDuration(durationSeconds ?? 0), formatOutputDate(createdAt)].filter(Boolean).join(" · ");
}

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

  // ── Fullscreen recording reader ────────────────────────────────────────────
  if (output?.kind === "recording") {
    const title = output.title || "Recording";
    return (
      <Dialog onOpenChange={(open) => { if (!open) closeOutputViewer(); }} open={state.open}>
        <DialogContent fullscreen>
          <DialogHeader className="shrink-0 border-b border-(--ui-stroke-tertiary) px-6 py-4 text-left sm:px-8">
            <DialogTitle className="pr-10 text-[1.0625rem] font-semibold">{title}</DialogTitle>
            <DialogDescription>{recordingHeaderMeta(output.createdAt, output.durationSeconds)}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-9">
              {notes && (
                <section>
                  <h3 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-(--ui-text-tertiary)">Notes</h3>
                  <AssistantMarkdown className="text-[0.95rem] leading-relaxed" text={notes} />
                </section>
              )}
              {transcript && (
                <section>
                  <h3 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-(--ui-text-tertiary)">Transcript</h3>
                  <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-foreground">{transcript}</p>
                </section>
              )}
              {!notes && !transcript && (
                <p className="text-[0.9rem] text-(--ui-text-tertiary)">Nothing captured yet.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Compact modal for every other output kind ──────────────────────────────
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
