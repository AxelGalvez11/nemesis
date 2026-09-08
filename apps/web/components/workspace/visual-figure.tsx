"use client";

// A typed visual, drawn.
//
// Owner, 2026-09-04: *"the diagrams are too big and also plain and boring unlike the wondering.app
// ones"*. Their look, measured in his own canvas that afternoon: a bordered card with a centred
// bold title, chips with a 2px border and a flat saturated fill, cells stacked under each chip,
// dashed rules between columns, and a band across the bottom for what everything shares. A timeline
// is the same chips alternating above and below a 2px axis, with dots where they meet it.
//
// 🔴 THE SHAPE IS COPIED, THE COLOUR IS OURS. Their fills are four fixed brand colours; ours are
// the app's own `--ui-kind-*` tints, cycled by position, so a figure sits inside the learner's
// theme (light and dark) instead of importing somebody else's palette. Same reason the board was
// built on `--ui-action` rather than their blue (docs/wondering-canvas-reference.md, §"not copied").
//
// 🔴 NO GRAPH ENGINE HERE, DELIBERATELY. Mermaid lays out a graph, so given "compare three things"
// it draws boxes and arrows ABOUT a comparison. This draws the comparison. The mermaid fence stays
// for what it is genuinely good at: branching decisions, cycles, hierarchies with real edges.
//
// 🔴 EVERY STRING IS ALREADY TRIMMED AND CAPPED by `readVisualSpec`, and every one of them is
// rendered as TEXT. Nothing the model wrote reaches this component as markup, which is the whole
// difference between a figure and an embedded page.

import type { VisualSpec } from "@/lib/workspace/visual-block";
import { cn } from "@/lib/utils";

/** The tints a figure cycles through, in the app's own palette. */
const TINTS = ["--ui-kind-blue", "--ui-kind-green", "--ui-kind-amber", "--ui-kind-purple", "--ui-kind-cyan", "--ui-kind-red"] as const;

/**
 * A column's header chip: a bold flat fill, and the ink border every part of this figure wears.
 *
 * 🔴🔴 18% WAS THE WHOLE COMPLAINT. Owner, 2026-09-07: *"our visualizations look pretty much bland,
 * black and white"*. This was `color-mix(tint 18%)` with a hairline in the tint's own colour, which
 * is a wash. Measured in his own Wondering chat the same day: their header chip is a SATURATED fill
 * (`#7BCAFF` blue, `#879A39` olive) inside a **2px border in the ink colour** (`rgb(38,20,18)`),
 * and every cell under it wears the same 2px ink border on paper. The colour and the weight are
 * the whole look; ours had neither.
 *
 * 🔴 45%, NOT 100%, AND THE REASON IS CONTRAST. Their fills are pale brand colours carrying dark
 * text. Our `--ui-kind-*` are mid-tone in the light theme (`#2f6fd0` blue), so a full-strength fill
 * would put foreground text on a colour it cannot be read against. Mixing toward the panel keeps
 * the same bold reading at a contrast that holds in both themes.
 *
 * 🔴 THE BORDER IS THE TEXT COLOUR, WHICH IS HOW IT SURVIVES DARK MODE. Theirs is a fixed dark
 * brown because their figure only ever sits on cream. Ink that follows the foreground is the same
 * idea stated so it inverts.
 */
function chipStyle(index: number) {
  const tint = TINTS[index % TINTS.length] ?? TINTS[0];
  return {
    backgroundColor: `color-mix(in srgb, var(${tint}) 45%, var(--ui-bg-elevated))`,
    borderColor: "var(--ui-text-primary)",
  };
}

/** Measured on theirs: 27 tall, radius 8, 2px ink, header 14px bold and cells 16px regular. */
const CHIP = "rounded-[8px] border-2 px-[10px] py-[4px] text-center text-[14px] font-bold leading-[19px] text-foreground";
const CELL = "rounded-[8px] border-2 border-(--ui-text-primary) bg-(--ui-bg-elevated) px-[10px] py-[4px] text-center text-[14px] leading-[19px] text-foreground";

export function VisualFigure({ spec }: { spec: VisualSpec }) {
  return (
    <figure className="my-[16px] rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-[16px]">
      {/* Measured on theirs: 16px/24 weight 700, centred. */}
      {spec.title && <figcaption className="mb-[14px] text-center text-[16px] font-bold leading-[24px] text-foreground">{spec.title}</figcaption>}
      {spec.kind === "comparison" && <Comparison spec={spec} />}
      {spec.kind === "sequence" && <Sequence spec={spec} />}
      {spec.kind === "set" && <Parts spec={spec} />}
      {/* 🔴 THE FOOTER IS A FILLED BAND ON THEIRS, amber, not an outlined box. It is the one row
          that speaks for every column, so it reads as a conclusion rather than a seventh column. */}
      {spec.footer && (
        <div className="mt-[14px] rounded-[8px] border-2 border-(--ui-text-primary) px-[12px] py-[8px] text-center" style={{ backgroundColor: "color-mix(in srgb, var(--ui-kind-amber) 45%, var(--ui-bg-elevated))" }}>
          <p className="m-0 text-[12px] font-bold uppercase tracking-wide text-foreground">{spec.footer.label}</p>
          <p className="m-0 mt-[2px] text-[14px] leading-[19px] text-foreground">{spec.footer.text}</p>
        </div>
      )}
    </figure>
  );
}

/**
 * Things side by side on the same rows.
 *
 * 🔴 THE ROW NAMES RIDE THE LEFT WHEN THERE IS ROOM AND ARE DROPPED WHEN THERE IS NOT. A figure
 * inside a 640px card with four columns cannot also carry a label column without every cell
 * wrapping to three lines; the row order is still the row order, and the prose names them.
 */
function Comparison({ spec }: { spec: VisualSpec }) {
  const rows = Math.max(...spec.items.map((item) => item.lines.length), spec.rows?.length ?? 0);
  const labelled = Boolean(spec.rows?.length) && spec.items.length <= 3;
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-min gap-x-[10px] gap-y-[8px]"
        style={{ gridTemplateColumns: `${labelled ? "minmax(88px, auto) " : ""}repeat(${spec.items.length}, minmax(96px, 1fr))` }}
      >
        {labelled && <span />}
        {spec.items.map((item, at) => (
          <div className={CHIP} key={`h-${item.label}`} style={chipStyle(at)}>
            {item.label}
          </div>
        ))}
        {Array.from({ length: rows }, (_, row) => (
          <div className="contents" key={`r-${row}`}>
            {labelled && (
              <span className="self-center text-[11px] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">{spec.rows?.[row] ?? ""}</span>
            )}
            {spec.items.map((item) => (
              <div className={CELL} key={`${item.label}-${row}`}>
                {item.lines[row] ?? ""}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Steps or dates in order: chips above the line, what happens below it. */
function Sequence({ spec }: { spec: VisualSpec }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-min gap-x-[10px]" style={{ gridTemplateColumns: `repeat(${spec.items.length}, minmax(104px, 1fr))` }}>
        {spec.items.map((item, at) => (
          <div className="flex flex-col justify-end" key={`t-${item.label}`}>
            {item.at && <div className="truncate text-center text-[11px] font-bold text-(--ui-text-tertiary)">{item.at}</div>}
            <div className={cn(CHIP, "mt-[4px]")} style={chipStyle(at)}>
              {item.label}
            </div>
            <span className="mx-auto h-[10px] w-[2px] bg-(--ui-stroke-primary)" />
          </div>
        ))}
      </div>
      <div className="relative">
        <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-(--ui-stroke-primary)" />
        <div className="relative grid gap-x-[10px]" style={{ gridTemplateColumns: `repeat(${spec.items.length}, minmax(104px, 1fr))` }}>
          {spec.items.map((item, at) => (
            <span className="mx-auto my-[2px] block size-[12px] rounded-full border-2" key={`d-${item.label}`} style={chipStyle(at)} />
          ))}
        </div>
      </div>
      <div className="grid gap-x-[10px] pt-[6px]" style={{ gridTemplateColumns: `repeat(${spec.items.length}, minmax(104px, 1fr))` }}>
        {spec.items.map((item) => (
          <p className="m-0 text-center text-[12px] leading-[16px] text-(--ui-text-secondary)" key={`l-${item.label}`}>
            {item.lines[0] ?? ""}
          </p>
        ))}
      </div>
    </div>
  );
}

/** The parts of one whole: tiles, two across. */
function Parts({ spec }: { spec: VisualSpec }) {
  return (
    <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
      {spec.items.map((item, at) => (
        <div className="rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-[10px]" key={item.label}>
          <div className={CHIP} style={chipStyle(at)}>
            {item.label}
          </div>
          {item.lines[0] && <p className="m-0 mt-[8px] text-center text-[12px] leading-[16px] text-(--ui-text-secondary)">{item.lines[0]}</p>}
        </div>
      ))}
    </div>
  );
}
