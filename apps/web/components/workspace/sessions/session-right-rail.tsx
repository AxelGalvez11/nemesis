"use client";

import { IconFileText, IconLayoutSidebarRightCollapse, IconLink } from "@tabler/icons-react";

import { Button } from "@/components/desktop-ui/button";
import type { SessionOutput, SessionSource } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

export type SessionRailPanel = "sources" | "outputs";

function domainFor(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function SessionRightRail({ panel, onPanelChange, onCollapse, sources, outputs }: { panel: SessionRailPanel; onPanelChange: (panel: SessionRailPanel) => void; onCollapse: () => void; sources: SessionSource[]; outputs: SessionOutput[] }) {
  return (
    <aside className="flex h-full w-[17.5rem] shrink-0 flex-col overflow-hidden border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(18rem,88vw)] max-md:shadow-xl">
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
          sources.length ? <div className="grid gap-2">{sources.map((source) => (
            <a className="grid gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) p-3 hover:border-(--ui-stroke-secondary) hover:bg-(--ui-control-hover-background)" href={source.url} key={source.url} rel="noopener noreferrer" target="_blank">
              <span className="flex items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary)"><IconLink size={12} />{domainFor(source.url)}</span>
              <span className="text-xs font-medium leading-snug text-foreground">{source.title || domainFor(source.url)}</span>
              {source.description && <span className="line-clamp-3 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">{source.description}</span>}
            </a>
          ))}</div> : <RailEmpty icon={<IconLink size={18} />} text="Sources from web searches will appear here." />
        ) : outputs.length ? (
          <div className="grid gap-2">{outputs.map((output) => {
            const body = <><span className="text-[0.6875rem] capitalize text-(--ui-text-tertiary)">{output.kind}</span><span className="text-xs font-medium text-foreground">{output.title}</span></>;
            return output.url ? <a className="grid gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) p-3 hover:bg-(--ui-control-hover-background)" href={output.url} key={output.id}>{body}</a> : <div className="grid gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) p-3" key={output.id}>{body}</div>;
          })}</div>
        ) : <RailEmpty icon={<IconFileText size={18} />} text="Flashcards, tests, slides, and reports created in this session will appear here." />}
      </div>
    </aside>
  );
}

function RailEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="grid min-h-48 place-items-center text-center"><div className="flex max-w-48 flex-col items-center gap-2 text-(--ui-text-quaternary)">{icon}<p className="text-[0.6875rem] leading-relaxed">{text}</p></div></div>;
}
