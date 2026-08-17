"use client";

// The controls that float at the top right of the canvas.
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
//   ⛶  Territory (Minimap) which part of the material the learner has chosen to work on (§H)
//   ⋯  Session             renaming, filing, deleting — never learning actions (§48)
//
// 🔴 OBJECTIVES AND TERRITORY LOOK LIKE THEY OVERLAP. THEY DO NOT SHARE A SUBSTRATE.
// `ObjectivesControl` reads `canvas.concepts` / `weakConceptIds` / `correctedConceptIds` — the
// legacy six-stage machine's own fields, populated by a generated lesson. `MinimapControl` reads
// `PolicyRuntime.territories`, built from `canvas-focus.ts` over durable knowledge objects — the
// compositional Canvas's substrate. A canvas running the compositional runtime has empty
// `concepts` (so `ObjectivesControl` disables itself) and a real `territories` list; a canvas
// still on the six-stage machine has the reverse. They are not two views of one truth; they are
// two different truths that happen to sit in the same corner. Do not "unify" them here — ask
// Brain, this is a substrate question, not a presentation one.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { isFocused, WHOLE_CANVAS, type FocusScope } from "@/lib/learn/canvas-focus";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import { currentObjectiveLabel, objectiveMap, type ObjectiveState } from "@/lib/learn/canvas-objectives";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import type { ExtractionOutcome } from "@/lib/learn/knowledge-extraction";
import type { CanvasCoverage } from "@/lib/learn/knowledge-coverage";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";
import { entrySummary, groupByDay, type TranscriptEntry } from "@/lib/learn/session-transcript";
import {
  shouldAskAboutAutoDictation,
  type AutoDictation,
  type VoiceMode,
} from "@/lib/learn/voice-preferences";
import { cn } from "@/lib/utils";

import {
  orderedTerritories,
  recommendedTerritoryLabel,
  sourceDisclosure,
  type Territory,
  type MarkedTerritory,
  type TerritoryMark,
} from "./canvas-minimap";

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
  modelKnowledge = false,
  onFiles,
  onUrl,
}: {
  canvas: LearningCanvas;
  /** Whether this canvas holds knowledge that provably came from the model rather than from
   *  attached material. See `canvas-provenance.ts` for why it is not simply "no sources". */
  modelKnowledge?: boolean;
  onFiles: (files: FileList | File[]) => void;
  /**
   * A pasted web link, read and filed as a source the same way an uploaded file is.
   *
   * 🔴 A LINK IS NAMED EXPLICITLY IN THE MANDATE'S OWN LIST ("Sources include uploaded files,
   * recordings, URLs, and explicitly imported web results"), and until this existed there was no
   * way to add one at all: `ACCEPTED_MATERIAL` is a file-extension allowlist with no URL case, and
   * the file picker below cannot open a link. Optional so a caller mid-migration is not forced to
   * wire it before this control can render at all.
   */
  onUrl?: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sources" | "outputs">("sources");
  const [urlDraft, setUrlDraft] = useState("");
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
        {/* Model knowledge counts here too. The dot means "there is something in this panel",
            and a canvas taught entirely from model knowledge has something in it. */}
        {(canvas.sources.length > 0 || modelKnowledge) && (
          <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-(--ui-text-quaternary)" />
        )}
      </button>

      {open && (
        <div className={cn(PANEL, "w-[19rem]")}>
          <div className="flex items-center gap-1 px-1 pb-1.5">
            {(["sources", "outputs"] as const).map((name) => (
              <button
                className={cn(
                  "rounded-md px-2 py-1 text-[length:var(--canvas-text-meta)] capitalize transition-colors",
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
              {/* 🔴 WHERE THE KNOWLEDGE CAME FROM, WHEN THERE IS NO FILE TO POINT AT (N10).
                  A canvas started by typing a topic holds no sources and a great deal of
                  knowledge. This panel used to report only the files, so it said "Nothing
                  attached yet." while fifty model-minted facts sat behind it — true about
                  attachments, false about provenance, on the one surface a learner opens to ask
                  where something came from.

                  It sits in the list, in the same shape as a source row, because it IS one of
                  the things this canvas was built from. It carries NO count: the territory
                  rebuilds on open and does not yet converge, so any number here would grow every
                  time the learner looked at it. A sparse line that is always true beats a rich
                  one that is sometimes wrong. */}
              {modelKnowledge && (
                <div className="px-2 py-1.5">
                  <p className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">Nemesis knowledge</p>
                  <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Generated from model knowledge</p>
                </div>
              )}

              {canvas.sources.length === 0 ? (
                // Guarded by `modelKnowledge`, and that guard is the whole fix: this sentence is
                // only honest when there is genuinely nothing behind the canvas at all.
                !modelKnowledge && (
                  <p className="px-2 py-3 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">Nothing attached yet.</p>
                )
              ) : (
                canvas.sources.map((source) => (
                  <div className="px-2 py-1.5" key={source.id}>
                    <p className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{source.title}</p>
                    <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                      {source.kind} · {source.excerpts.length} excerpt{source.excerpts.length === 1 ? "" : "s"}
                    </p>
                    {/* A source Nemesis could only half read says so here, not silently. */}
                    {source.coverageNote && (
                      <p className="mt-1 text-[length:var(--canvas-text-meta)] leading-relaxed text-amber-500">
                        {source.coverageNote.replace(/^\[|\]$/g, "")}
                      </p>
                    )}
                  </div>
                ))
              )}

              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary) has-[:focus-visible]:bg-(--ui-bg-tertiary) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--ui-accent)">
                <Codicon name="add" size="0.75rem" />
                Add source
                {/* `sr-only` keeps this reachable by keyboard; `hidden` would not. */}
                <input
                  accept={ACCEPTED_MATERIAL}
                  className="sr-only"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) onFiles(event.target.files);
                    setOpen(false);
                  }}
                  type="file"
                />
              </label>

              {/* A link is the other half of "add source" a file picker cannot do (see the
                  `onUrl` prop). Kept as a plain inline field rather than a second dialog: this
                  panel already is one, so a nested one would be the second dialog for something
                  the mandate treats as a peer of "upload a file", not a bigger action than it. */}
              {onUrl && (
                <form
                  className="mt-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 has-[:focus-visible]:bg-(--ui-bg-tertiary)"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const trimmed = urlDraft.trim();
                    if (!trimmed) return;
                    onUrl(trimmed);
                    setUrlDraft("");
                    setOpen(false);
                  }}
                >
                  <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="link" size="0.75rem" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[length:var(--canvas-text-small)] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
                    onChange={(event) => setUrlDraft(event.target.value)}
                    placeholder="Paste a link"
                    type="url"
                    value={urlDraft}
                  />
                </form>
              )}
            </>
          ) : outputs.length === 0 ? (
            // Says what this is for rather than pretending to be broken. Nothing generates
            // outputs yet; the tab exists because the distinction is architectural (§4).
            <p className="px-2 py-3 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-quaternary)">
              Things Nemesis makes for you, like a summary, slides or a document, will be kept here.
            </p>
          ) : (
            outputs.map((output) => (
              <div className="px-2 py-1.5" key={output.id}>
                <p className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{output.title}</p>
                <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{output.kind}</p>
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
          <p className="px-2 pb-1 pt-1 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
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
                  "text-[length:var(--canvas-text-small)] leading-snug",
                  objective.state === "untouched" ? "text-(--ui-text-quaternary)" : "text-(--ui-text-secondary)",
                  objective.state === "current" && "text-(--ui-text-primary)",
                )}
              >
                {objective.label}
                {/* The state in words, for the one row where it matters most.
                    🔴 A PERIOD, WAS AN EM DASH (Brain 2026-08-13 ruled it exempt — `sr-only` is
                    never rendered, so it read as "not on the Canvas" under the old "no em dashes
                    on the Canvas" framing — but that same ruling named the fix in advance: "make it
                    a period: a period gets the same pause more reliably across screen readers than
                    an em dash does." Contract rule 2's copy guard (2026-08-15) scans learner-facing
                    strings regardless of `sr-only`, since a screen reader still speaks this text to
                    a learner even though their eyes never do — so the pre-authorised fix is taken
                    now rather than carved out as a standing exception. */}
                <span className="sr-only">. {MEANING[objective.state]}</span>
              </span>
            </div>
          ))}

          {/* 🔴 No percentage, here or anywhere (§9). */}
          {focus && (
            <p className="mt-1.5 border-t border-(--ui-stroke-tertiary) px-2 pb-1 pt-2 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
              Nemesis is currently working on <span className="text-(--ui-text-secondary)">{focus}</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- territory (minimap)

/** Dots for the two marks a territory can carry. `null` (no evidence yet) renders no dot at all —
 *  see canvas-minimap.ts. Reusing `ObjectivesControl`'s exact palette for the same underlying
 *  facts (amber for "worth another look", the same fill for "shown"), so the app is not speaking
 *  two colour vocabularies about one thing on two panels a click apart. */
const TERRITORY_DOT: Record<TerritoryMark, string> = {
  developing: "bg-amber-500/80",
  established: "bg-(--ui-text-secondary)",
};

/** Said in words on hover — the same restraint `ObjectivesControl` uses, and its exact vetted
 *  copy for the states that mean the same thing. 🔴 NEITHER WORD IMPLIES FINISHED (§18/M1): a
 *  correct retrieval makes knowledge better established, not permanently done, so this stays an
 *  observation ("you've shown this") rather than a completion claim ("done" / a checkmark). */
const TERRITORY_MEANING: Record<TerritoryMark, string> = {
  developing: "Worth checking again",
  established: "You've shown this",
};

/** §H: a way to say "work on this part of the material", nothing more. Selecting a row calls
 *  `setFocus` with a `FocusScope` and NOTHING else — no operation, no difficulty, no mode ever
 *  crosses this boundary (H6). See `canvas-minimap.ts` for every derivation used here; this
 *  component only lays them out. */
export function MinimapControl({
  territories,
  focus,
  setFocus,
  decidedObjectiveKey,
  outcome,
  coverage,
  evidence,
}: {
  territories: readonly Territory[];
  focus: FocusScope;
  setFocus: (scope: FocusScope) => void;
  /** The objective the CURRENT decision names, if any — used only to find which territory
   *  Nemesis would work on next when nothing is manually focused (§H3). Never a ranking; see
   *  `recommendedTerritoryLabel`. */
  decidedObjectiveKey: string | null;
  outcome: ExtractionOutcome | "no-durable-source";
  coverage: CanvasCoverage;
  evidence: readonly LearnerEvidence[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const holder = useDismiss(open, () => setOpen(false));

  const recommended = recommendedTerritoryLabel(territories, decidedObjectiveKey, focus);
  const rows = orderedTerritories(territories, evidence, recommended);
  const disclosure = sourceDisclosure(outcome, coverage);
  const onWholeCanvas = focus.kind === "canvas";

  const renderTerritory = (territory: MarkedTerritory, depth = 0, path = territory.label): React.ReactNode => {
    const current = focus.kind === "selection" && focus.label === territory.label;
    const isRecommended = territory.label === recommended;
    const hasChildren = Boolean(territory.children?.length);
    const isExpanded = expanded.has(path);
    return (
      <div key={path}>
        <div className="flex items-center">
          {hasChildren ? (
            <button
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${territory.label}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)"
              onClick={() => setExpanded((currentSet) => {
                const next = new Set(currentSet);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })}
              type="button"
            >
              <Codicon name={isExpanded ? "chevron-down" : "chevron-right"} size="0.6875rem" />
            </button>
          ) : (
            <span aria-hidden className="h-7 w-7 shrink-0" />
          )}
          <button
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)",
              current && "bg-(--ui-bg-tertiary)",
            )}
            onClick={() => {
              setFocus({ identityKeys: territory.identityKeys, kind: "selection", label: territory.label });
              setOpen(false);
            }}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            title={territory.mark ? TERRITORY_MEANING[territory.mark] : undefined}
            type="button"
          >
            <span
              aria-hidden
              className={cn(
                "h-[7px] w-[7px] shrink-0 rounded-full",
                current && "ring-2 ring-(--ui-text-primary)/25",
                territory.mark ? TERRITORY_DOT[territory.mark] : "bg-transparent",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
              {territory.label}
              <span className="sr-only">
                {territory.mark ? `. ${TERRITORY_MEANING[territory.mark]}` : ""}
                {current ? ". Currently focused here." : ""}
              </span>
            </span>
            {isRecommended && (
              <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                Suggested next
              </span>
            )}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div>{territory.children!.map((child) => renderTerritory(child, depth + 1, `${path}/${child.label}`))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Territory"
        className={CONTROL}
        onClick={() => setOpen((current) => !current)}
        title="Territory"
        type="button"
      >
        <Codicon name="map" size="0.8125rem" />
        {/* §46 convention: a dot, not a count. It marks that a focus is narrowing the
            candidates — the one fact worth knowing without opening the panel. */}
        {isFocused(focus) && (
          <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-(--ui-accent)" />
        )}
      </button>

      {open && (
        <div className={cn(PANEL, "w-[20rem]")}>
          <p className="px-2 pb-1 pt-1 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
            Territory
          </p>

          {/* H5: source-side facts. Kept out of the per-territory dots below and out of each
              other — two different claims (RUNTIME-005), never merged into one. Both are
              canvas-wide; there is no per-territory coverage signal yet. */}
          {disclosure.readingGap && (
            <p className="px-2 pb-1.5 text-[length:var(--canvas-text-meta)] leading-relaxed text-amber-500">
              Nemesis could not read all of this material clearly. That is a gap in our reading,
              not in what you know.
            </p>
          )}
          {disclosure.unrepresented && (
            <p className="px-2 pb-1.5 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-quaternary)">
              Some of this material has not been turned into practice yet.
            </p>
          )}

          {/* Clearing focus and choosing "the whole canvas" are the same action (canvas-focus.ts:
              WHOLE_CANVAS is what both produce), so there is one row for it, not a separate
              "Clear" control living apart from the list it clears. */}
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)",
              onWholeCanvas && "bg-(--ui-bg-tertiary)",
            )}
            onClick={() => {
              setFocus(WHOLE_CANVAS);
              setOpen(false);
            }}
            type="button"
          >
            <span
              aria-hidden
              className={cn(
                "h-[7px] w-[7px] shrink-0 rounded-full",
                onWholeCanvas
                  ? "bg-(--ui-text-primary) ring-2 ring-(--ui-text-primary)/25"
                  : "border border-(--ui-stroke-primary)",
              )}
            />
            <span className="text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
              Whole canvas
              <span className="sr-only">{onWholeCanvas ? ". Currently focused here." : ""}</span>
            </span>
          </button>

          {rows.length === 0 ? (
            <p className="px-2 py-3 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
              Nothing to focus on within this canvas yet.
            </p>
          ) : (
            rows.map((territory) => renderTerritory(territory))
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
              className="w-full rounded-lg bg-(--ui-bg-tertiary) px-2.5 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-primary) outline-none"
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
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[length:var(--canvas-text-small)] transition-colors hover:bg-(--ui-bg-tertiary)",
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

// ---------------------------------------------------------------- voice mode

/**
 * Voice mode on or off, and the one-time question about the microphone.
 *
 * 🔴 A MODE THE LEARNER TURNS ON, NEVER A THING THAT STARTS TALKING. Somebody who opened a canvas
 * to read must not be spoken at, so `DEFAULT_VOICE_MODE` is off and this is the only way in.
 *
 * 🔴 IT DISAPPEARS DURING A RETRIEVAL WITH THE OTHER CONTROLS, AND THAT IS DELIBERATE. The rule at
 * the top of this file — every glyph on screen during a fast recall is read before the answer is
 * produced — applies to this button exactly as it does to Sources. Voice is session management,
 * not answering. What replaces it mid-question is not chrome: the learner starting to answer stops
 * the speech, which is what "do not talk over someone who is thinking" means in code.
 *
 * The ask about auto-dictation lives here rather than in a dialog because it is a preference about
 * this control, and because a modal over a canvas is the second card the composer's own header
 * spends a paragraph refusing.
 */
export function VoiceControl({
  autoDictation,
  dictationSupported,
  onSetAutoDictation,
  onToggle,
  speaking,
  voiceMode,
}: {
  voiceMode: VoiceMode;
  autoDictation: AutoDictation;
  /** False where the Web Speech API is absent — Firefox, most notably. Offering to open a
   *  microphone that cannot listen is a promise the product cannot keep. */
  dictationSupported: boolean;
  /** Audio is playing right now, so the icon can say so rather than looking idle. */
  speaking: boolean;
  onToggle: (next: VoiceMode) => void;
  onSetAutoDictation: (next: AutoDictation) => void;
}) {
  const on = voiceMode === "on";
  const asking = shouldAskAboutAutoDictation({ autoDictation, dictationSupported, voiceMode });

  return (
    <div className="pointer-events-auto relative shrink-0">
      <button
        aria-label={on ? "Turn voice off" : "Read questions out loud"}
        aria-pressed={on}
        className={cn(CONTROL, on && "text-(--ui-action) hover:text-(--ui-action)")}
        onClick={() => onToggle(on ? "off" : "on")}
        title={on ? "Voice on: questions and corrections are read aloud" : "Read questions out loud"}
        type="button"
      >
        {/* Two glyphs, not an animation: "on" and "on and talking right now" are different facts
            and the second one is how a learner knows the sound is Nemesis and not a tab. */}
        <Codicon name={speaking ? "unmute" : on ? "unmute" : "mute"} size="0.8125rem" />
      </button>

      {asking && (
        <div className={cn(PANEL, "w-[17rem] p-3")}>
          <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
            Open the microphone after each question?
          </p>
          <p className="mt-1.5 text-[length:var(--canvas-text-meta)] leading-normal text-(--ui-text-tertiary)">
            Nemesis reads the question, then starts listening so you can answer without touching
            anything. You can still type.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded-full bg-(--ui-action) px-3 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-bg-editor) transition-opacity hover:opacity-90"
              onClick={() => onSetAutoDictation("on")}
              type="button"
            >
              Yes, listen
            </button>
            <button
              className="rounded-full px-3 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
              onClick={() => onSetAutoDictation("off")}
              type="button"
            >
              No, I'll press it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- session record

/**
 * What happened in this session, on request.
 *
 * 🔴 A PANEL, NEVER A COLUMN. The teaching surface shows one cognitive object and lets the rest go
 * quiet; a permanent log beside it is the thing that whole design exists to avoid. But "the
 * interface is calm" is not an answer to a learner asking what they said an hour ago, so the record
 * exists and lives exactly one press away — behind the same kind of control as Sources and
 * Objectives, and gone during a retrieval with them.
 *
 * 🔴 IT READS THE EVIDENCE LOG, WHICH IS APPEND-ONLY. `canvas-events.ts` is a capped ring buffer
 * that drops its oldest rows, so a transcript built on it would silently lose the beginning of
 * every long session — which is the part worth looking back at.
 */
export function SessionRecordControl({
  entries,
  locale,
}: {
  entries: readonly TranscriptEntry[];
  locale?: string;
}) {
  const [open, setOpen] = useState(false);
  const holder = useDismiss(open, () => setOpen(false));
  const days = groupByDay(entries, locale);

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Session record"
        className={CONTROL}
        disabled={entries.length === 0}
        onClick={() => setOpen((current) => !current)}
        title="Session record"
        type="button"
      >
        <Codicon name="history" size="0.8125rem" />
      </button>

      {open && (
        <div className={cn(PANEL, "w-[22rem]")}>
          <p className="px-2 pb-1 pt-1 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
            Session record
          </p>
          {days.map((group) => (
            <div key={group.day}>
              <p className="px-2 pb-1 pt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                {group.day}
              </p>
              {group.entries.map((entry) => (
                <div className="rounded-lg px-2 py-1.5" key={entry.id}>
                  <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{entry.objective}</p>
                  <p className="mt-0.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                    {entrySummary(entry)}
                  </p>
                  {/* Their own words, quoted rather than narrated — the same rule §K holds on the
                      teaching surface: quote the learner, never tell them what they said. */}
                  {entry.said && (
                    <p className="mt-1 text-[length:var(--canvas-text-meta)] italic text-(--ui-text-quaternary)">
                      “{entry.said.slice(0, 160)}{entry.said.length > 160 ? "…" : ""}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
