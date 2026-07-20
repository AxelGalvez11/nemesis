"use client";

import { IconChevronLeft, IconFileText, IconLayoutSidebarRightCollapse, IconLink, IconMicrophone } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import type { SessionOutput, SessionSource } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

export type SessionRailPanel = "sources" | "outputs";

function domainFor(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export type SessionRailSource = Omit<SessionSource, "url" | "description"> & { url?: string; description?: string };

export function SessionRightRail({ panel, onPanelChange, onCollapse, sources, outputs }: { panel: SessionRailPanel; onPanelChange: (panel: SessionRailPanel) => void; onCollapse: () => void; sources: SessionRailSource[]; outputs: SessionOutput[] }) {
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [recordingView, setRecordingView] = useState<"transcript" | "notes">("transcript");
  const selectedOutput = outputs.find((output) => output.id === selectedOutputId) ?? null;

  useEffect(() => {
    if (panel !== "outputs") setSelectedOutputId(null);
  }, [panel]);

  return (
    <aside className="relative z-10 flex h-full w-[17.5rem] shrink-0 self-stretch flex-col overflow-hidden border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) animate-in slide-in-from-right-5 fade-in-0 duration-200 motion-reduce:animate-none max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(18rem,88vw)] max-md:shadow-xl" data-slot="session-right-rail">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-(--ui-stroke-tertiary) px-2">
        <div className="grid flex-1 grid-cols-2 rounded-xl bg-(--ui-bg-quaternary) p-0.5">
          {(["sources", "outputs"] as const).map((option) => (
            <button className={cn("rounded-[0.6rem] px-2 py-1.5 text-xs capitalize text-(--ui-text-tertiary)", option === panel && "bg-(--ui-control-active-background) text-foreground shadow-sm")} key={option} onClick={() => onPanelChange(option)} type="button">{option}</button>
          ))}
        </div>
        <Button aria-label="Collapse session sidebar" onClick={onCollapse} size="icon-xs" variant="ghost"><IconLayoutSidebarRightCollapse /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {panel === "sources" ? (
          sources.length ? <div className="grid gap-2">{sources.map((source, index) => {
            const body = <><span className="flex items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary)"><IconLink size={12} />{source.url ? domainFor(source.url) : "Notebook source"}</span><span className="text-xs font-medium leading-snug text-foreground">{source.title || (source.url ? domainFor(source.url) : "Source")}</span>{source.description && <span className="line-clamp-3 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">{source.description}</span>}</>;
            const className = "grid gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) p-3 hover:border-(--ui-stroke-secondary) hover:bg-(--ui-control-hover-background)";
            return source.url
              ? <a className={className} href={source.url} key={source.url} rel="noopener noreferrer" target="_blank">{body}</a>
              : <div className={className} key={`${source.title}:${index}`}>{body}</div>;
          })}</div> : <RailEmpty icon={<IconLink size={18} />} text="Sources from web searches will appear here." />
        ) : selectedOutput?.kind === "recording" ? (
          <div className="grid gap-4">
            <button className="flex items-center gap-1 text-xs text-(--ui-text-tertiary) hover:text-foreground" onClick={() => setSelectedOutputId(null)} type="button"><IconChevronLeft size={14} /> Outputs</button>
            <div><p className="text-sm font-semibold text-foreground">{selectedOutput.title}</p>{selectedOutput.durationSeconds !== undefined && <p className="mt-1 text-[0.6875rem] text-(--ui-text-tertiary)">{Math.floor(selectedOutput.durationSeconds / 60)}:{String(selectedOutput.durationSeconds % 60).padStart(2, "0")}</p>}</div>
            <div className="grid grid-cols-2 rounded-xl bg-(--ui-bg-quaternary) p-0.5">
              {(["transcript", "notes"] as const).map((view) => <button className={cn("rounded-[0.6rem] px-2 py-1.5 text-xs capitalize text-(--ui-text-tertiary)", recordingView === view && "bg-(--ui-control-active-background) text-foreground shadow-sm")} key={view} onClick={() => setRecordingView(view)} type="button">{view}</button>)}
            </div>
            <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{recordingView === "transcript" ? selectedOutput.transcript || "No transcript was captured." : selectedOutput.notes || "No notes were generated during this recording."}</div>
          </div>
        ) : outputs.length ? (
          <div className="grid gap-2">{outputs.map((output) => {
            const body = <><span className="flex items-center gap-1 text-[0.6875rem] capitalize text-(--ui-text-tertiary)">{output.kind === "recording" && <IconMicrophone size={12} />}{output.kind}</span><span className="text-xs font-medium text-foreground">{output.title}</span></>;
            return output.url ? <a className="grid gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) p-3 hover:bg-(--ui-control-hover-background)" href={output.url} key={output.id}>{body}</a> : <button className="grid gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) p-3 text-left hover:bg-(--ui-control-hover-background)" key={output.id} onClick={() => { setSelectedOutputId(output.id); setRecordingView("transcript"); }} type="button">{body}</button>;
          })}</div>
        ) : <RailEmpty icon={<IconFileText size={18} />} text="Flashcards, tests, slides, and reports created in this session will appear here." />}
      </div>
    </aside>
  );
}

function RailEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="grid min-h-48 place-items-center text-center"><div className="flex max-w-48 flex-col items-center gap-2 text-(--ui-text-quaternary)">{icon}<p className="text-[0.6875rem] leading-relaxed">{text}</p></div></div>;
}
