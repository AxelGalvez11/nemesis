/**
 * Which pages or slides are worth looking at — Nemesis Lab §7.
 *
 * 🔴 THE INSPECTOR IS USELESS ON A 100-PAGE LECTURE WITHOUT THIS. Reading every page by hand to
 * find the one the parser mangled is exactly the work the Lab exists to remove, so the strip has to
 * be able to say "these four pages hold a table, this one lost text, these two disagree".
 *
 * 🔴 EVERY FLAG IS A FACT THE PARSE ALREADY STATED, NEVER A HEURISTIC. A page carries `table`
 * because a block on it has a table, not because its text looked tabular; it carries `unread`
 * because `coverage.lostUnits` names it. Nothing here re-decides anything the parser decided, and
 * nothing here invents a suspicion the model cannot support. That keeps the strip in the same
 * relationship to the parse that the rest of the inspector is in: it reports, it does not judge.
 *
 * PURE. No React, no I/O.
 */

import type { DocumentModel, ExtractionCoverage } from "@nemesis/shared";

export interface UnitFlags {
  /** 0-based, matching `DocUnit.index` and `DocBlock.unit`. */
  unit: number;
  /** The author's own name for it, when they gave one. Never generated. */
  label: string | null;
  kind: string;
  blocks: number;
  characters: number;
  table: boolean;
  figure: boolean;
  equation: boolean;
  /** Speaker notes, or any other note block. */
  note: boolean;
  /** A picture is here that nobody looked at and nobody decided to skip. */
  unexaminedFigure: boolean;
  /** Coverage says nothing was read off this unit. */
  unread: boolean;
  /** Coverage located regions on this unit it could not read. */
  unreadableRegions: number;
  /** The comparison lane produced a different reading of this unit. */
  disagreement: boolean;
}

/** Does this unit deserve the owner's attention before the others? */
export function worthInspecting(flags: UnitFlags): boolean {
  return (
    flags.table ||
    flags.figure ||
    flags.equation ||
    flags.unexaminedFigure ||
    flags.unread ||
    flags.unreadableRegions > 0 ||
    flags.disagreement
  );
}

/**
 * Flag every unit in a parse.
 *
 * `disagreeingUnits` comes from a comparison run; an empty set is the ordinary single-lane case
 * and must never be confused with "the lanes agreed" — see `lib/lab/compare.ts`, which reports
 * whether a comparison happened at all.
 */
export function unitFlags(
  model: DocumentModel,
  coverage: ExtractionCoverage | null,
  disagreeingUnits: ReadonlySet<number> = new Set(),
): UnitFlags[] {
  const flags = model.units.map<UnitFlags>((unit) => ({
    blocks: 0,
    characters: 0,
    disagreement: disagreeingUnits.has(unit.index),
    equation: false,
    figure: false,
    kind: unit.kind,
    label: unit.label ?? null,
    note: false,
    table: false,
    unexaminedFigure: false,
    unread: false,
    unreadableRegions: 0,
    unit: unit.index,
  }));
  const byUnit = new Map(flags.map((entry) => [entry.unit, entry]));

  for (const block of model.blocks) {
    const entry = byUnit.get(block.unit);
    if (!entry) continue;
    entry.blocks += 1;
    entry.characters += block.text.length;
    if (block.table) entry.table = true;
    if (block.kind === "equation") entry.equation = true;
    if (block.kind === "note") entry.note = true;
    if (block.figure) {
      entry.figure = true;
      // 🔴 UNEXAMINED IS "NO DESCRIPTION AND NO STATED REASON", the same test `countDocument` uses.
      // A figure skipped for a named reason is a disclosed decision and is not a gap.
      if (!block.figure.description && !block.figure.skipped) entry.unexaminedFigure = true;
    }
  }

  for (const loss of coverage?.lostUnits ?? []) {
    // 🔴 `UnitLoss.unit` IS 0-BASED — the same space as `DocUnit.index`, confirmed at the producer
    // (`mergeUnitLosses` bounds it with `unit >= 0 && unit < units` over `pageTexts` array indexes),
    // not merely from its doc comment. An off-by-one here would light up the page BESIDE the broken
    // one, which is worse than no strip at all: it sends the owner to look at a page that is fine.
    const entry = byUnit.get(loss.unit);
    if (!entry) continue;
    if (loss.unread) entry.unread = true;
    entry.unreadableRegions += loss.unreadableRegions ?? 0;
  }

  return flags;
}
