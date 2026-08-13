"use client";

// The three controls that float at the top right of the canvas.
//
// 🔴 THEY FLOAT. There is no toolbar, no bar background, no full-width border and no container
// of any kind — they sit directly on the same uninterrupted sheet the title and the back button
// sit on. `canvas-shell.test.ts` asserts the class lists carry no border or background utility,
// because the regression this replaced was a 1px line across every pixel of the viewport, which
// is the single detail that makes a workspace read as "an app page" instead of a document.
//
// Each opens a panel that also floats. A panel is an overlay: it closes on outside-click and on
// Escape, and it never pushes the document sideways.
//
// What each one is FOR is the part worth keeping straight:
//
//   ▣  Sources & Outputs   what went IN, and what Nemesis made
//   ⊞  Objectives          what Nemesis is trying to do with this learner
//   ⋯  Session             renaming, filing, deleting — never learning actions (§48)

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import { currentObjectiveLabel, objectiveMap, type ObjectiveState } from "@/lib/learn/canvas-objectives";
import { cn } from "@/lib/utils";

/** Close on outside click and Escape. Shared so the three panels cannot drift apart in how they
 *  dismiss — an overlay that only closes one of the two ways feels broken in a way people
 *  rarely report and always notice. */
function useDismiss(open: boolean, close: () => void) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [close, open]);
  return holder;
}

// 🔴 28×28, DOWN FROM 32 -- compact-UI pass, design judgement (owner spec, 2026-08-12; not
// measured against anything external, just quieted to match the smaller composer and header
// alongside it). The icon inside stays legible at 0.8125rem; only the surrounding box shrank.
const CONTROL =
  "flex h-[28px] w-[28px] items-center justify-center rounded-lg text-(--ui-text-tertiary) " +
  "transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)";

const PANEL =
  "absolute right-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-2xl bg-(--ui-bg-elevated) " +
  "p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-(--ui-stroke-tertiary)";

// ---------------------------------------------------------------- sources + outputs

/** One control, two roles (§2). Sources are what Nemesis grounds on; outputs are what it made
 *  at the learner's request. They belong to the same session and are emphatically not the same
 *  kind of thing, so the distinction is preserved in the panel even while outputs is empty —
 *  merging them now would be the hard thing to undo later. */
export function SourcesControl({
  canvas,
  onFiles,
}: {
  canvas: LearningCanvas;
  onFiles: (files: FileList | File[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sources" | "outputs">("sources");
  const holder = useDismiss(open, () => setOpen(false));

  const outputs = canvas.outputs ?? [];

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Sources and outputs"
        className={CONTROL}
        onClick={() => setOpen((current) => !current)}
        title="Sources and outputs"
        type="button"
      >
        <Codicon name="library" size="0.8125rem" />
        {/* §46: a dot, not a count. The number is not the point and a badge reading "3" on every
            screen is noise the eye stops seeing anyway. */}
        {canvas.sources.length > 0 && (
          <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-(--ui-text-quaternary)" />
        )}
      </button>

      {open && (
        <div className={cn(PANEL, "w-[19rem]")}>
          <div className="flex items-center gap-1 px-1 pb-1.5">
            {(["sources", "outputs"] as const).map((name) => (
              <button
                className={cn(
                  "rounded-md px-2 py-1 text-[0.75rem] capitalize transition-colors",
                  tab === name
                    ? "bg-(--ui-bg-tertiary) text-(--ui-text-primary)"
                    : "text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)",
                )}
                key={name}
                onClick={() => setTab(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>

          {tab === "sources" ? (
            <>
              {canvas.sources.length === 0 ? (
                <p className="px-2 py-3 text-[0.8125rem] text-(--ui-text-quaternary)">Nothing attached yet.</p>
              ) : (
                canvas.sources.map((source) => (
                  <div className="px-2 py-1.5" key={source.id}>
                    <p className="truncate text-[0.8125rem] text-(--ui-text-primary)">{source.title}</p>
                    <p className="text-[0.6875rem] text-(--ui-text-quaternary)">
                      {source.kind} · {source.excerpts.length} excerpt{source.excerpts.length === 1 ? "" : "s"}
                    </p>
                    {/* A source Nemesis could only half read says so here, not silently. */}
                    {source.coverageNote && (
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-amber-500">
                        {source.coverageNote.replace(/^\[|\]$/g, "")}
                      </p>
                    )}
                  </div>
                ))
              )}

              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary) has-[:focus-visible]:bg-(--ui-bg-tertiary) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--ui-accent)">
                <Codicon name="add" size="0.75rem" />
                Add source
                {/* `sr-only` keeps this reachable by keyboard; `hidden` would not. */}
                <input
                  accept=".pdf,.docx,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp,.heic"
                  className="sr-only"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) onFiles(event.target.files);
                    setOpen(false);
                  }}
                  type="file"
                />
              </label>
            </>
          ) : outputs.length === 0 ? (
            // Says what this is for rather than pretending to be broken. Nothing generates
            // outputs yet; the tab exists because the distinction is architectural (§4).
            <p className="px-2 py-3 text-[0.8125rem] leading-relaxed text-(--ui-text-quaternary)">
              Things Nemesis makes for you — a summary, slides, a document — will be kept here.
            </p>
          ) : (
            outputs.map((output) => (
              <div className="px-2 py-1.5" key={output.id}>
                <p className="truncate text-[0.8125rem] text-(--ui-text-primary)">{output.title}</p>
                <p className="text-[0.6875rem] text-(--ui-text-quaternary)">{output.kind}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- objectives

/** Five states that have to be told apart at a glance and at 7px.
 *
 *  🔴 `needs_evidence` is amber rather than a lighter grey. The first version used grey, and
 *  "you have shown this" and "this is worth checking again" came out as two greys one shade
 *  apart — a distinction that survives a code review and not a glance. Amber is also what the
 *  diagnosis on the very same screen already uses for what needs work, so the map now agrees
 *  with the panel beside it instead of inventing a second vocabulary. */
const DOT: Record<ObjectiveState, string> = {
  demonstrated: "bg-(--ui-text-secondary)",
  corrected: "bg-(--ui-accent)",
  current: "bg-(--ui-text-primary) ring-2 ring-(--ui-text-primary)/25",
  needs_evidence: "bg-amber-500/80",
  untouched: "border border-(--ui-stroke-primary)",
};

/** Said in words on hover, because a legend of five glyphs is a thing nobody reads. */
const MEANING: Record<ObjectiveState, string> = {
  demonstrated: "You've shown this",
  corrected: "You fixed this after getting it wrong",
  current: "Working on this now",
  // 🔴 Never "forgotten". We know what we have not seen, not what they have lost (§35).
  needs_evidence: "Worth checking again",
  untouched: "Not covered yet",
};

export function ObjectivesControl({
  canvas,
  activeTaskId,
}: {
  canvas: LearningCanvas;
  activeTaskId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const holder = useDismiss(open, () => setOpen(false));

  const objectives = objectiveMap(canvas, activeTaskId);
  const focus = currentObjectiveLabel(canvas, activeTaskId);

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Objectives"
        className={CONTROL}
        disabled={objectives.length === 0}
        onClick={() => setOpen((current) => !current)}
        title="Objectives"
        type="button"
      >
        <Codicon name="list-tree" size="0.8125rem" />
      </button>

      {open && (
        <div className={cn(PANEL, "w-[20rem]")}>
          <p className="px-2 pb-1 pt-1 text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
            Objectives
          </p>
          {objectives.map((objective) => (
            <div className="flex items-start gap-2.5 px-2 py-1.5" key={objective.id} title={MEANING[objective.state]}>
              <span
                aria-hidden
                className={cn("mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full", DOT[objective.state])}
              />
              <span
                className={cn(
                  "text-[0.8125rem] leading-snug",
                  objective.state === "untouched" ? "text-(--ui-text-quaternary)" : "text-(--ui-text-secondary)",
                  objective.state === "current" && "text-(--ui-text-primary)",
                )}
              >
                {objective.label}
                {/* The state in words, for the one row where it matters most. */}
                <span className="sr-only"> — {MEANING[objective.state]}</span>
              </span>
            </div>
          ))}

          {/* 🔴 No percentage, here or anywhere (§9). */}
          {focus && (
            <p className="mt-1.5 border-t border-(--ui-stroke-tertiary) px-2 pb-1 pt-2 text-[0.75rem] leading-relaxed text-(--ui-text-tertiary)">
              Nemesis is currently working on <span className="text-(--ui-text-secondary)">{focus}</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- session menu

/** Session management only (§48). Quiz me, Explain simpler and Start recall are learning
 *  actions and belong to the canvas itself — putting them here would make this the place people
 *  look for the thing they want, which is the opposite of what a ⋯ menu is for. */
export function SessionControl({
  canvas,
  onRename,
  onDelete,
}: {
  canvas: LearningCanvas;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(canvas.title);
  const holder = useDismiss(open, () => {
    setOpen(false);
    setRenaming(false);
  });

  const commit = () => {
    const title = draft.trim();
    if (title && title !== canvas.title) onRename(title);
    setRenaming(false);
    setOpen(false);
  };

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Session options"
        className={CONTROL}
        onClick={() => {
          setDraft(canvas.title);
          setOpen((current) => !current);
        }}
        title="Session options"
        type="button"
      >
        <Codicon name="kebab-vertical" size="0.8125rem" />
      </button>

      {open && (
        <div className={cn(PANEL, "w-[15rem]")}>
          {renaming ? (
            <input
              autoFocus
              className="w-full rounded-lg bg-(--ui-bg-tertiary) px-2.5 py-2 text-[0.8125rem] text-(--ui-text-primary) outline-none"
              onBlur={commit}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setRenaming(false);
              }}
              placeholder="Name this session"
              value={draft}
            />
          ) : (
            <>
              <MenuItem icon="edit" label="Rename session" onClick={() => setRenaming(true)} />
              {/* 🔴 Pin and Move to folder are NOT here. Both need columns the table does not
                  have yet, and a menu item that quietly does nothing is worse than an absent
                  one — the learner cannot tell the difference between "did not work" and "did
                  not happen", so they try again. They arrive with the columns. */}
              <MenuItem
                danger
                icon="trash"
                label="Delete session"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] transition-colors hover:bg-(--ui-bg-tertiary)",
        danger ? "text-(--ui-text-tertiary) hover:text-red-500" : "text-(--ui-text-secondary)",
      )}
      onClick={onClick}
      type="button"
    >
      <Codicon name={icon} size="0.75rem" />
      {label}
    </button>
  );
}
