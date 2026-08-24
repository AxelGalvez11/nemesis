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

import { useAuth } from "@/components/AuthProvider";
import { Codicon } from "@/components/desktop-ui/codicon";
import { faviconUrl, hostnameOf } from "@/lib/favicon";
import { isFocused, WHOLE_CANVAS, type FocusScope } from "@/lib/learn/canvas-focus";
import type { DeliverableKind } from "@/lib/learn/canvas-deliverables";
import type { CanvasSource, LearningCanvas } from "@/lib/learn/canvas-model";
import { currentObjectiveLabel, objectiveMap, type ObjectiveState } from "@/lib/learn/canvas-objectives";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { SourcePreview } from "./source-preview";
import type { ExtractionOutcome } from "@/lib/learn/knowledge-extraction";
import type { CanvasCoverage } from "@/lib/learn/knowledge-coverage";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";
import { entrySummary, groupByDay, type TranscriptEntry } from "@/lib/learn/session-transcript";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";
import {
  type AutoDictation,
  type VoiceMode,
} from "@/lib/learn/voice-preferences";
import type { CanvasVoice as CanvasVoiceState } from "./use-canvas-voice";
import { cn } from "@/lib/utils";

import {
  orderedTerritories,
  recommendedTerritoryLabel,
  sourceDisclosure,
  territoryMark,
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

// 🔴🔴 36×36 WITH A 20px GLYPH — MEASURED OFF CHATGPT, 2026-08-20, AND THIS REVERSES THE 08-12
// COMPACT PASS ON PURPOSE. The comment that stood here said the row went to 28×28 by "design
// judgement", and ended with its own caveat: *"not measured against anything external, this row has
// no ChatGPT equivalent to match."* There is one, and it has now been measured in the owner's own
// browser:
//
//     ChatGPT header button   36×36, radius 8px, glyph 20×20
//     Nemesis (before)        28×28, radius 13.5px (a full pill), glyph 14–15px
//
// So the box was 78% of the reference and the glyph 75% of it. Owner's instruction: *"make sure the
// canvas icons in upper header also match sizing and colour of chatgpt."* A judgement made in the
// absence of a reference is exactly the kind that a reference should overturn.
//
// 🔴 THE RADIUS MOVES FROM A PILL TO 8px, WHICH IS PART OF THE SAME MEASUREMENT. At 28px,
// `rounded-lg` computed to 13.5px — half the box — so these read as circles. ChatGPT's are rounded
// SQUARES at 8px, and at 36px `rounded-lg` is that. Pinned in px so it cannot drift with the box.
//
// 🔴 THE COLOUR WAS ALREADY RIGHT AND IS LEFT ALONE. `--ui-text-tertiary` composites to ≈#969696;
// ChatGPT's secondary header glyph is #8f8f8f. Within a hair, and both go to full-strength text on
// hover. Changing it to chase three units of grey would be a change nobody could see.
const CONTROL =
  "flex h-[36px] w-[36px] items-center justify-center rounded-[8px] text-(--ui-text-tertiary) " +
  "transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)";

const PANEL =
  "absolute -right-2 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-2xl bg-(--ui-bg-elevated) " +
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
  onMakeDeliverable,
  making = null,
}: {
  canvas: LearningCanvas;
  /** Whether this canvas holds knowledge that provably came from the model rather than from
   *  attached material. See `canvas-provenance.ts` for why it is not simply "no sources". */
  modelKnowledge?: boolean;
  onFiles: (files: FileList | File[]) => void;
  /** Make a deliverable from this canvas (owner 2026-08-25) — absent while a caller has not
   *  wired it, in which case the tab only lists. */
  onMakeDeliverable?: (kind: DeliverableKind) => void;
  /** Which deliverable is being made, for the busy row. */
  making?: DeliverableKind | null;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sources" | "outputs">("sources");
  // 🔴 THE PASTE-A-LINK FIELD IS GONE — owner cut, 2026-08-23: *"for the sources, I want you to
  // remove the paste URL part because that's not really necessary."* The `onUrl` prop, the draft
  // state and the inline form left with it. `attachUrl` itself survives untouched: grounding and
  // the reply's source cards still file pages through it; only this panel's manual door closed.
  /** The source whose ORIGINAL document is open in the preview card, or null. */
  const [previewing, setPreviewing] = useState<CanvasSource | null>(null);
  const { session } = useAuth();
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
        <Codicon name="library" size="20px" />
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
                canvas.sources.map((source) => {
                  // 🔴🔴 THE ROWS OPEN NOW. Owner, 2026-08-20: *"the sources box should be more the
                  // right and have the actual sources clickable in there."* This panel is the one
                  // place a learner goes to ask "where did that come from", and it answered with
                  // text they could not follow — a list of things that look like links and are not
                  // is worse than a list that plainly is not one.
                  //
                  // 🔴 THE HOST DECIDES THE ROW, NOT A FLAG — the same rule `source-pill.ts` states
                  // and the composer chips follow. `sourceUrl` is documented as absent for every
                  // file upload and present only for a page, so its presence IS the question "can
                  // this be opened, and where?". One idea, spelled once, in three places.
                  const host = hostnameOf(source.sourceUrl);
                  const body = (
                    <>
                      <span className="flex items-center gap-1.5">
                        {host ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
                          <img alt="" className="shrink-0 rounded-full" height={14} src={faviconUrl(host)} width={14} />
                        ) : (
                          <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="file" size="0.75rem" />
                        )}
                        <span className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{source.title}</span>
                      </span>
                      <span className="mt-0.5 block pl-[22px] text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                        {host ?? source.kind} · {source.excerpts.length} excerpt{source.excerpts.length === 1 ? "" : "s"}
                      </span>
                      {/* A source Nemesis could only half read says so here, not silently. */}
                      {source.coverageNote && (
                        <span className="mt-1 block pl-[22px] text-[length:var(--canvas-text-meta)] leading-relaxed text-amber-500">
                          {source.coverageNote.replace(/^\[|\]$/g, "")}
                        </span>
                      )}
                    </>
                  );
                  const row = "block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)";
                  return host && source.sourceUrl ? (
                    <a className={cn(row, "no-underline")} href={source.sourceUrl} key={source.id} rel="noopener noreferrer" target="_blank" title={source.title}>
                      {body}
                    </a>
                  ) : (
                    // 🔴🔴 A DOCUMENT OPENS A PREVIEW CARD, NOT THE LIBRARY — owner, 2026-08-23,
                    // after clicking one: *"it took me to the old library. It's supposed to take
                    // me to a small preview of it, a pop up."* The old anchor's reasoning ("the
                    // reader already exists, a preview would be a second answer") lost to the
                    // learner's actual context: they are mid-canvas, and a navigation to another
                    // surface for "what did I attach?" costs them the room they were in. The old
                    // link was also quietly broken — it interpolated the canvas-local slot id
                    // (`s1`, `s2`…) into a route that resolves `library_sources.id`, so it 404'd
                    // on every canvas regardless.
                    <button className={row} key={source.id} onClick={() => setPreviewing(source)} title={source.title} type="button">
                      {body}
                    </button>
                  );
                })
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

            </>
          ) : (
            <>
              {outputs.length === 0 ? (
                <p className="px-2 py-3 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-quaternary)">
                  {onMakeDeliverable
                    ? "Nothing made yet. Ask below, and it lands here and in your Library."
                    : "Things Nemesis makes for you, like a summary or flashcards, will be kept here."}
                </p>
              ) : (
                outputs.map((output) => {
                  const body = (
                    <>
                      <p className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{output.title}</p>
                      <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                        {output.kind === "flashcards"
                          ? "Flashcard deck · in your Library"
                          : output.kind === "note"
                            ? "Note · in your Library"
                            : output.kind === "slides"
                              ? "Slides · click to download .pptx"
                              : output.kind}
                      </p>
                    </>
                  );
                  const row = "block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary) no-underline";
                  // 🔴 EVERY ROW OPENS THE REAL THING — the deck in the Library, the note in the
                  // library's reader. A list of made things that cannot be opened is the sources
                  // panel's old defect all over again.
                  if (output.kind === "note" && output.notePath) {
                    return (
                      <a className={row} href={`/library/classic?note=${encodeURIComponent(output.notePath)}`} key={output.id}>
                        {body}
                      </a>
                    );
                  }
                  if (output.kind === "flashcards" && output.deckId) {
                    return (
                      <a className={row} href={`/library?deck=${output.deckId}`} key={output.id}>
                        {body}
                      </a>
                    );
                  }
                  if (output.kind === "slides" && output.deck) {
                    const deck = output.deck;
                    return (
                      <button
                        className={row}
                        key={output.id}
                        onClick={() => void import("@/lib/export/deck-download").then((m) => m.downloadDeck(deck, output.title))}
                        type="button"
                      >
                        {body}
                      </button>
                    );
                  }
                  return (
                    <div className="px-2 py-1.5" key={output.id}>
                      {body}
                    </div>
                  );
                })
              )}
              {onMakeDeliverable && (
                <div className="mt-1 border-t border-(--ui-stroke-tertiary) pt-1">
                  {(
                    [
                      { kind: "flashcards", icon: "layers", idle: "Make flashcards", busy: "Making flashcards…" },
                      { kind: "note", icon: "note", idle: "Make a summary note", busy: "Writing the note…" },
                      { kind: "slides", icon: "preview", idle: "Make slides", busy: "Building your slides…" },
                    ] as const
                  ).map((action) => (
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:cursor-default disabled:opacity-60"
                      disabled={making !== null}
                      key={action.kind}
                      onClick={() => onMakeDeliverable(action.kind)}
                      type="button"
                    >
                      <Codicon
                        className={making === action.kind ? "animate-spin" : undefined}
                        name={making === action.kind ? "loading" : action.icon}
                        size="0.75rem"
                      />
                      {making === action.kind ? action.busy : action.idle}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* The real document, in a card, over the canvas — see source-preview.tsx's header for the
          owner ruling. Mounted beside the panel rather than inside it so closing the panel does
          not tear the preview down mid-read. */}
      {previewing && (
        <SourcePreview onClose={() => setPreviewing(null)} source={previewing} uid={session?.user.id ?? null} />
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

/**
 * What Nemesis is working on, as a panel body.
 *
 * 🔴 NO LONGER ITS OWN HEADER BUTTON — owner call, 2026-08-19. The header is down to three glyphs
 * (`\u00d7`, Sources and outputs, Progress) plus `\u22ef`, and this moved inside the last of them. The
 * BODY is what mattered and it is unchanged; only the way in did.
 */
function ObjectivesPanel({
  canvas,
  activeTaskId,
}: {
  canvas: LearningCanvas;
  activeTaskId?: string | null;
}) {
  const objectives = objectiveMap(canvas, activeTaskId);
  const focus = currentObjectiveLabel(canvas, activeTaskId);

  if (objectives.length === 0) {
    return (
      <p className="px-2 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
        Nothing to work on yet.
      </p>
    );
  }

  return (
    <>
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
    </>
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
  plan = null,
  planTitle = null,
  focus,
  setFocus,
  decidedObjectiveKey,
  outcome,
  coverage,
  evidence,
}: {
  territories: readonly Territory[];
  /**
   * The canvas's COURSE, projected for this panel — null on the ordinary canvas that has none.
   *
   * 🔴 A SECOND, SEPARATELY-LABELLED TREE, NEVER MERGED INTO `territories`. The knowledge tree
   * earns its parents from the material's own explicit semantic relations — evidence-backed
   * grouping. A plan's structure is an AUTHOR'S claim about the subject. Folding one into the
   * other would leave the next reader believing the curriculum was derived from the learner's own
   * material — the provenance confusion this file's own header warns about for Objectives vs
   * Territory. A plan is a third thing in that corner, and it stays third.
   *
   * 🔴 AND ITS ROWS KEEP THE AUTHOR'S ORDER. Plan rows deliberately do NOT pass through
   * `orderedTerritories`, whose recommended-then-marked re-sort is right for evidence-backed
   * territories and would destroy an authored sequence.
   */
  plan?: readonly PlanTerritory[] | null;
  /** The course's title, shown over its rows. */
  planTitle?: string | null;
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

  /**
   * One course row. Deliberately NOT `renderTerritory`: that renderer offers "Suggested next" and
   * calls `setFocus` unconditionally, and a plan row has a state knowledge rows cannot have — a
   * node the canvas holds NO MATERIAL for. That row is not a button at all: `applyFocus` returns
   * everything when a filter empties, so focusing an empty node would silently focus the whole
   * canvas — a control that appears to work and does something else, the defect this codebase
   * names most often.
   *
   * 🔴 "No material yet" IS A SOURCE FACT, NOT A LEARNER STATE, and it must not be collapsed into
   * the reading-gap ◇ or the evidence dots: I3 keeps source uncertainty, learner unknown and
   * no-demonstration as separate states, and this is a fourth — there is no source here at all.
   *
   * 🔴 EXPANSION PATHS ARE NAMESPACED `course/…` so a plan node and a knowledge territory sharing
   * a label cannot toggle each other's chevrons.
   */
  const renderPlanRow = (entry: PlanTerritory, depth = 0, path = `course/${entry.label}`): React.ReactNode => {
    const mark = territoryMark(entry.identityKeys, evidence);
    const current = focus.kind === "selection" && focus.label === entry.label;
    const hasChildren = Boolean(entry.children?.length);
    const isExpanded = expanded.has(path);
    return (
      <div key={path}>
        <div className="flex items-center">
          {hasChildren ? (
            <button
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${entry.label}`}
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
          {entry.reachable ? (
            <button
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-bg-tertiary)",
                current && "bg-(--ui-bg-tertiary)",
              )}
              onClick={() => {
                setFocus({ identityKeys: entry.identityKeys, kind: "selection", label: entry.label });
                setOpen(false);
              }}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              title={mark ? TERRITORY_MEANING[mark] : undefined}
              type="button"
            >
              <span
                aria-hidden
                className={cn(
                  "h-[7px] w-[7px] shrink-0 rounded-full",
                  current && "ring-2 ring-(--ui-text-primary)/25",
                  mark ? TERRITORY_DOT[mark] : "bg-transparent",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
                {entry.label}
                <span className="sr-only">
                  {mark ? `. ${TERRITORY_MEANING[mark]}` : ""}
                  {current ? ". Currently focused here." : ""}
                </span>
              </span>
            </button>
          ) : (
            <div
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-transparent" />
              <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
                {entry.label}
              </span>
              <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                No material yet
              </span>
            </div>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>{entry.children!.map((child) => renderPlanRow(child, depth + 1, `${path}/${child.label}`))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Progress"
        className={CONTROL}
        onClick={() => setOpen((current) => !current)}
        title="Progress"
        type="button"
      >
        <Codicon name="map" size="20px" />
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

          {plan && plan.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-3 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
                Course{planTitle ? ` · ${planTitle}` : ""}
              </p>
              {plan.map((entry) => renderPlanRow(entry))}
            </>
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
        <Codicon name="kebab-vertical" size="20px" />
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
/**
 * Everything the canvas can be told to do that is not "here is the material" or "here is where you
 * are" — behind one `\u22ef`, the way the reference puts its own session options.
 *
 * 🔴 THIS EXISTS BECAUSE THE HEADER LOST THREE BUTTONS, NOT INSTEAD OF THEM. Owner call,
 * 2026-08-19: the header is `\u00d7` on the left, Sources and outputs, and Progress. Objectives, the
 * session record and voice came out of that row — and voice in particular was the ONLY way into
 * voice mode, so deleting the glyph without giving it a home would have shipped a feature that
 * exists, is deployed, and cannot be reached. That is the specific way this codebase loses things,
 * so the menu landed in the same change that removed the icons rather than after it.
 *
 * 🔴 THE TWO VOICE PREFERENCES ARE BOTH STATED, AND THE ONE-TIME QUESTION IS GONE. `VoiceControl`
 * asked "open the microphone after each question?" in a popover the first time voice was switched
 * on, because there was nowhere to put a second preference. A menu is that somewhere: both are
 * rows, both show their current state, and a learner who wants to change their mind has somewhere
 * to go rather than having to remember what they answered once.
 */
export function OptionsControl({
  canvas,
  activeTaskId,
  entries,
  locale,
  voice,
}: {
  canvas: LearningCanvas;
  activeTaskId?: string | null;
  entries: readonly TranscriptEntry[];
  locale?: string;
  /**
   * 🔴 THE HOOK'S OWN TYPE, NOT A THIRD COPY OF IT. This shape was written out by hand here AND in
   * the sibling that passes it through, so `useCanvasVoice` gaining a field left two declarations
   * behind and the compiler pointed at the consumer rather than at the omission. Referencing the
   * source means adding a control to the voice hook can never again require remembering two other
   * files.
   */
  voice?: CanvasVoiceState["header"];
}) {
  const [open, setOpen] = useState(false);
  // Which face the menu is showing. Sub-views render IN PLACE rather than as a second floating
  // panel: a panel hanging off a panel is two things to dismiss and two places to mis-click.
  const [view, setView] = useState<"menu" | "objectives" | "record">("menu");
  const holder = useDismiss(open, () => {
    setOpen(false);
    setView("menu");
  });

  const voiceOn = voice?.mode === "on";
  const listenOn = voice?.autoDictation === "on";

  return (
    <div className="pointer-events-auto relative shrink-0" ref={holder}>
      <button
        aria-expanded={open}
        aria-label="Options"
        className={cn(CONTROL, voiceOn && "text-(--ui-action) hover:text-(--ui-action)")}
        onClick={() => {
          setOpen((current) => !current);
          setView("menu");
        }}
        title="Options"
        type="button"
      >
        {/* 🔴 THE GLYPH REPORTS VOICE, BECAUSE VOICE IS THE ONE OPTION IN HERE THAT MAKES NOISE.
            Everything else behind this button is something the learner goes and looks at; voice
            acts on its own, afterwards, and a learner who left it on deserves to see that from the
            closed menu rather than by being spoken to. */}
        <Codicon name={voice?.speaking ? "unmute" : "kebab-vertical"} size="20px" />
      </button>

      {open && (
        <div className={cn(PANEL, view === "menu" ? "w-[15rem]" : "w-[22rem]")}>
          {view !== "menu" && (
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary)"
              onClick={() => setView("menu")}
              type="button"
            >
              <Codicon name="chevron-left" size="0.6875rem" />
              {view === "objectives" ? "Objectives" : "Session record"}
            </button>
          )}

          {view === "menu" && (
            <>
              {voice && (
                <>
                  {/* 🔴🔴 ONE VOICE DECISION LIVES ON THE CANVAS, AND IT IS NOT "WHICH VOICE" (§48).
                      Owner, 2026-08-22: *"Canvas should not make the user repeatedly choose a
                      voice… Canvas should have a simple option for: Automatically read responses
                      aloud."* The speaker, and whether to preview it, moved to Settings — they are
                      properties of the person, asked once. What is left here is the only voice
                      question that belongs to a session: should Nemesis start talking by itself.

                      🔴 THE READING SPEED WENT WITH THEM, AND IT DID NOT REAPPEAR AS A SETTING. It
                      was a SYNTHESIS argument — pressing it threw away a paid MP3 and bought
                      another at a different rate. Speed is now a property of listening, on the
                      player under the answer, where changing it is instant and free. */}
                  <ToggleItem
                    checked={voiceOn}
                    hint="Nemesis starts reading each answer as soon as it is finished. You can always press play yourself."
                    label="Read responses aloud"
                    onClick={() => voice.onToggle(voiceOn ? "off" : "on")}
                  />
                  {/* Offering to open a microphone that cannot listen is a promise the product
                      cannot keep — the same refusal `VoiceControl` made, kept. */}
                  <ToggleItem
                    checked={listenOn}
                    disabled={!voice.dictationSupported}
                    hint={voice.dictationSupported ? undefined : "This browser cannot listen"}
                    label="Open the mic after each question"
                    onClick={() => voice.onSetAutoDictation(listenOn ? "off" : "on")}
                  />
                  <div className="my-1 border-t border-(--ui-stroke-tertiary)" />
                </>
              )}
              {/* 🔴 OBJECTIVES AND SESSION RECORD ARE GONE FROM THIS MENU (owner 2026-08-20:
                  "the menu has a objectives tab, which I don't want... and assessment record,
                  which I also don't want"). Both panels remain in the file and are still
                  reachable by setting `view` — they are a developer's window into what the
                  runtime thinks, not something a learner asked to be shown mid-lesson. */}
            </>
          )}

          {view === "objectives" && <ObjectivesPanel activeTaskId={activeTaskId} canvas={canvas} />}
          {view === "record" && <SessionRecordPanel entries={entries} locale={locale} />}
        </div>
      )}
    </div>
  );
}

/** A preference that is on or off, showing which it currently is. Separate from `MenuItem` because
 *  a row that reports state and a row that performs an action are different things, and a check
 *  mark that sometimes means "selected" and sometimes means nothing is how a menu stops being
 *  readable. */
function ToggleItem({
  checked,
  label,
  onClick,
  disabled,
  hint,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[length:var(--canvas-text-small)] transition-colors",
        disabled
          ? "cursor-not-allowed text-(--ui-text-quaternary)"
          : "text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)",
      )}
      disabled={disabled}
      onClick={onClick}
      role="menuitemcheckbox"
      title={hint}
      type="button"
    >
      <span className="mt-[2px] flex h-[12px] w-[12px] shrink-0 items-center justify-center">
        {checked && <Codicon name="check" size="0.6875rem" />}
      </span>
      <span className="leading-snug">
        {label}
        {hint && (
          <span className="mt-0.5 block text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            {hint}
          </span>
        )}
      </span>
    </button>
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
/**
 * What happened in this session, as a panel body. See `ObjectivesPanel` for why this stopped being
 * its own header button on 2026-08-19; the reasoning about the record itself is unchanged and
 * still lives above `groupByDay`.
 */
function SessionRecordPanel({
  entries,
  locale,
}: {
  entries: readonly TranscriptEntry[];
  locale?: string;
}) {
  const days = groupByDay(entries, locale);

  if (entries.length === 0) {
    return (
      <p className="px-2 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
        Nothing has happened yet.
      </p>
    );
  }

  return (
    <>
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
    </>
  );
}
