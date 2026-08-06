"use client";

// Report-style popup for chat output artifacts (owner ask 2026-07-20): opens
// from the OutputCard in any chat transcript. Recordings get a Transcript |
// Notes toggle; other kinds render their notes as markdown or link out.
// Mounted once in workspace-shell, driven by lib/workspace/output-viewer.

import { useEffect, useState, useSyncExternalStore } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { supabase } from "@/lib/supabase";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { useRecordingJobs } from "@/lib/workspace/use-recording-jobs";
import {
  closeOutputViewer,
  outputViewerServerSnapshot,
  outputViewerSnapshot,
  subscribeOutputViewer,
} from "@/lib/workspace/output-viewer";

import { outputMetaLine } from "./output-card";

type ViewerTab = "notes" | "transcript";

const VIEWER_TABS = [
  { id: "notes" as const, label: "Notes" },
  { id: "transcript" as const, label: "Transcript" },
];

export function OutputViewerDialog() {
  const state = useSyncExternalStore(subscribeOutputViewer, outputViewerSnapshot, outputViewerServerSnapshot);
  const [tab, setTab] = useState<ViewerTab>("notes");
  const output = state.output;

  // Open on the NOTES (owner 2026-07-28: "clicking on the artifact should open
  // a popup to view the note") — the write-up is the thing a student keeps; the
  // raw transcript is there to check it against. Falls back to the transcript
  // when the write-up failed, so the popup is never blank while there is
  // something to read.
  //
  // Keyed on the output's id, not the object: a store snapshot with a fresh
  // identity would otherwise snap the toggle back to Notes mid-read.
  const outputId = output?.id ?? null;
  useEffect(() => {
    if (state.open) setTab(output?.notes?.trim() ? "notes" : "transcript");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity of `output` churns; the id is what changes meaningfully.
  }, [outputId, state.open]);

  // A RECORDING IS READ FROM ITS ROW, NOT FROM THE MESSAGE.
  //
  // The message is written once, when the recording is handed to the pipeline,
  // and at that point there is no transcript and no write-up — both are filled
  // in later by the worker. Reading the artifact here is what lets the popup
  // open on a transcript while the notes are still being composed, and then
  // grow the notes underneath without the student closing and reopening it.
  const live = useLiveRecording(output?.kind === "recording" ? output.id : null);
  const transcript = (live?.transcript ?? output?.transcript ?? "").trim();
  const notes = (live?.notes ?? output?.notes ?? "").trim();
  const showToggle = Boolean(transcript && notes);
  const activeTab: ViewerTab = showToggle ? tab : notes ? "notes" : "transcript";

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

/**
 * The current transcript and notes for one recording artifact.
 *
 * Re-read whenever a watched job moves, which is exactly when these can have
 * changed — the worker writes the transcript at one stage and the notes at the
 * next. Returns null for anything that is not a recording, or before the first
 * read lands, so the caller falls back to whatever the message carries.
 */
function useLiveRecording(artifactId: string | null): { notes: string; transcript: string } | null {
  const jobs = useRecordingJobs();
  const [row, setRow] = useState<{ id: string; notes: string; transcript: string } | null>(null);
  // Only the jobs that could still change this artifact. Depending on the whole
  // snapshot would re-read on every unrelated recording's stage change.
  const stamp = jobs.find((job) => job.artifactId === artifactId)?.updatedAt ?? "";

  useEffect(() => {
    if (!artifactId) {
      setRow(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("chat_recording_artifacts")
      .select("id,transcript,notes")
      .eq("id", artifactId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setRow({
          id: data.id as string,
          notes: typeof data.notes === "string" ? data.notes : "",
          transcript: typeof data.transcript === "string" ? data.transcript : "",
        });
      });
    return () => { cancelled = true; };
  }, [artifactId, stamp]);

  // Guard against showing the PREVIOUS artifact's text for a frame when the
  // student opens one recording straight after another.
  return row && row.id === artifactId ? row : null;
}
