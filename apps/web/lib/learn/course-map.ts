// The course, projected for the map: chapters, the sections inside them, and how each one stands.
//
// Owner, 2026-08-28: *"when you go to course mode, it's supposed to pretty much generate, like, a
// course for the user and pretty much bring up the icon of the map, which is gonna pretty much be,
// like, all the different chapters and sections… how you have that documentation map on the side
// where it just shows you, like, the overview or, like, the sections of it."* Shown four designs,
// they chose the mastery outline: *"Let's go mastery outline."*
//
// 🔴🔴 THERE IS NO PERCENTAGE IN THIS FILE AND THERE MUST NOT BE, WHICH IS A CORRECTION TO THE
// DESIGN THE OWNER PICKED. The mock those four options were drawn from showed chapters at 100%,
// 62%, 25% — a continuous mastery score. **The model has no such number.** `territoryMark` returns
// exactly three values and its own note is emphatic about why:
//
//   established   EVERY identity key the node names reads `correct`
//   developing    at least one key engaged, and not all of them correct
//   null          nothing in it has ever been engaged — "no mark, NOT unestablished"
//
// A percentage would have to be invented from those, and inventing one is the quiet fabrication
// this codebase refuses everywhere else (`via={null}` exists so a stored sentence is not stamped as
// typed when nothing established that it was). So the bar the owner chose is filled by a COUNT of
// sections that is true — how many are established, how many are underway — and the number beside
// it is a fraction, never a percent.
//
// 🔴 AND THE COUNT NEVER ROUNDS UP, FOR THE SAME REASON `territoryMark` does not. A chapter whose
// sections are all `null` is not "0% done"; it is untouched, and the difference matters to somebody
// deciding where to go next.
//
// PURE. No React, no DOM, no clock — the panel is in `components/workspace/learn/course-map.tsx`.

import { territoryMark, type TerritoryMark } from "@/components/workspace/learn/canvas-minimap";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";

/** One section: the smallest thing the map lists, and the thing a learner clicks. */
export interface CourseMapSection {
  readonly label: string;
  readonly identityKeys: readonly string[];
  /** `null` means never engaged. It is not a zero. */
  readonly mark: TerritoryMark | null;
  /** False when the canvas holds no material for it — an honest source gap, carried from the plan. */
  readonly reachable: boolean;
}

/**
 * One chapter, with its sections and the three counts the bar is drawn from.
 *
 * 🔴 THE COUNTS ARE OF SECTIONS, NOT OF ANYTHING SMALLER. A section may name several identity keys
 * and `territoryMark` already folds those; counting keys instead would weight a chapter by how
 * finely its sections happened to be split, which is an authoring artefact and not a fact about
 * the learner.
 */
export interface CourseMapChapter {
  readonly label: string;
  /** Every key at or under the chapter, so a chapter with NO sections is still pickable — a flat
   *  plan is a real shape and its rows must not be dead controls. */
  readonly identityKeys: readonly string[];
  readonly sections: readonly CourseMapSection[];
  readonly established: number;
  readonly developing: number;
  readonly total: number;
  /** The chapter's own mark, folded from every key beneath it. Drives the row when it has no
   *  sections of its own — a flat plan is a real shape, not a degenerate one. */
  readonly mark: TerritoryMark | null;
  readonly reachable: boolean;
}

/** Every identity key at or under `node`, so a chapter can be marked as one thing. */
function keysUnder(node: PlanTerritory): readonly string[] {
  const child = (node.children ?? []).flatMap((c) => keysUnder(c));
  return [...node.identityKeys, ...child];
}

/**
 * The map's rows.
 *
 * 🔴 TWO LEVELS, DELIBERATELY, AGAINST A TREE THAT CAN BE DEEPER. `PlanNode` nests arbitrarily
 * (`parentKey`), so a curriculum may be four levels down. The map draws chapter and section and
 * FLATTENS anything below into the section list, because the owner's instruction names exactly two
 * ("all the different chapters and sections") and because a documentation map that can indent
 * forever stops being scannable at a glance, which is the one thing it is for. Nothing is dropped:
 * a grandchild becomes a section of its chapter rather than disappearing.
 *
 * 🔴 THE AUTHOR'S ORDER IS KEPT. Plan rows deliberately do not pass through `orderedTerritories` —
 * its recommended-then-marked re-sort is right for evidence-backed territories and would destroy an
 * authored sequence, which is the one thing a course has that a knowledge tree does not.
 */
export function buildCourseMap(
  plan: readonly PlanTerritory[],
  evidence: readonly LearnerEvidence[],
): readonly CourseMapChapter[] {
  return plan.map((chapter) => {
    const flat: PlanTerritory[] = [];
    const walk = (nodes: readonly PlanTerritory[]) => {
      for (const node of nodes) {
        flat.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(chapter.children ?? []);

    const sections: CourseMapSection[] = flat.map((node) => ({
      label: node.label,
      identityKeys: keysUnder(node),
      mark: territoryMark(keysUnder(node), evidence),
      reachable: node.reachable,
    }));

    return {
      label: chapter.label,
      identityKeys: keysUnder(chapter),
      sections,
      established: sections.filter((s) => s.mark === "established").length,
      developing: sections.filter((s) => s.mark === "developing").length,
      total: sections.length,
      mark: territoryMark(keysUnder(chapter), evidence),
      reachable: chapter.reachable,
    };
  });
}

/**
 * How much of the whole course is established, as a pair of counts.
 *
 * 🔴 A PAIR, NOT A RATIO, so the caller cannot accidentally print a percent. The header shows
 * "4 of 17 established", which is a sentence somebody can check against the rows below it.
 */
export function courseProgress(chapters: readonly CourseMapChapter[]): {
  readonly established: number;
  readonly developing: number;
  readonly total: number;
} {
  return chapters.reduce((acc, c) => {
    // 🔴🔴 A CHAPTER WITH NO SECTIONS COUNTS AS ONE THING TO KNOW, ON BOTH SIDES OF THE RATIO.
    // Counting it in `total` while reading its progress from a section list it does not have made a
    // finished flat course report "0 of 2 established" — caught by the test below, not on screen,
    // because every course in the fixtures happens to have sections.
    const own = c.total === 0;
    return {
      established: acc.established + (own ? (c.mark === "established" ? 1 : 0) : c.established),
      developing: acc.developing + (own ? (c.mark === "developing" ? 1 : 0) : c.developing),
      total: acc.total + (own ? 1 : c.total),
    };
  }, { established: 0, developing: 0, total: 0 });
}

/**
 * The two widths of the chapter bar, as percentages OF THE BAR — never of mastery.
 *
 * 🔴 THE NAME SAYS `Width` FOR A REASON. These are geometry: how much of a 100%-wide element each
 * segment occupies. Reading them as "62% mastered" is the mistake this whole file is written
 * against, and a caller that prints one as a score has misread it.
 *
 * A chapter with no sections has nothing to divide, so its bar is full or empty from its own mark.
 */
export function barWidths(chapter: CourseMapChapter): { established: number; developing: number } {
  if (chapter.total === 0) {
    if (chapter.mark === "established") return { established: 100, developing: 0 };
    if (chapter.mark === "developing") return { established: 0, developing: 100 };
    return { established: 0, developing: 0 };
  }
  return {
    established: (chapter.established / chapter.total) * 100,
    developing: (chapter.developing / chapter.total) * 100,
  };
}
