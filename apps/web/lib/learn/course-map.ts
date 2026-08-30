// The course, projected for the map: chapters, the sections inside them, and how each one stands.
//
// Owner, 2026-08-28: *"when you go to course mode, it's supposed to pretty much generate, like, a
// course for the user and pretty much bring up the icon of the map, which is gonna pretty much be,
// like, all the different chapters and sections… how you have that documentation map on the side
// where it just shows you, like, the overview or, like, the sections of it."* Shown four designs,
// they chose the mastery outline: *"Let's go mastery outline."*
//
// 🔴🔴 THERE ARE NO NUMBERS IN THIS FILE AT ALL, AND THAT WENT THROUGH TWO STEPS. The mock the four
// options were drawn from showed chapters at 100%, 62%, 25% — a continuous mastery score. **The
// model has no such number**, so the first build replaced it with an honest COUNT of sections
// ("1/4", "4 of 14 established"). Shown that, the owner drew the obvious conclusion: *"So if it
// can't track mastery then can we just remove the numbers? And instead do the outline way?"*
//
// They are right, and the reason is worth keeping. A fraction of SECTIONS is true but it is not the
// thing anybody wanted to know — it measures how finely a chapter happened to be split as much as
// it measures the learner. What survives is the only claim the model can actually make, per row,
// with no arithmetic on top: `territoryMark` returns exactly three values.
//
//   established   EVERY identity key the node names reads `correct`
//   developing    at least one key engaged, and not all of them correct
//   null          nothing in it has ever been engaged — "no mark, NOT unestablished"
//
// A percentage would have to be invented from those, and inventing one is the quiet fabrication
// this codebase refuses everywhere else (`via={null}` exists so a stored sentence is not stamped as
// typed when nothing established that it was).
//
// 🔴 SO A ROW CARRIES ITS MARK AND NOTHING ELSE, AND A CHAPTER'S MARK NEVER ROUNDS UP — a chapter is
// `established` only when every key beneath it is, which is `territoryMark`'s own rule applied to
// the whole subtree rather than a second opinion about it. A chapter whose sections are all `null`
// is not "0% done"; it is untouched, and the difference matters to somebody deciding where to go.
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

/** One chapter, with its sections. No counts: see the header. */
export interface CourseMapChapter {
  readonly label: string;
  /** Every key at or under the chapter, so a chapter with NO sections is still pickable — a flat
   *  plan is a real shape and its rows must not be dead controls. */
  readonly identityKeys: readonly string[];
  readonly sections: readonly CourseMapSection[];
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
      mark: territoryMark(keysUnder(chapter), evidence),
      reachable: chapter.reachable,
    };
  });
}

// 🔴 `courseProgress` AND `barWidths` WERE HERE AND ARE DELETED, NOT PARKED (2026-08-29). They
// existed only to fill a chapter bar and print "4 of 14 established"; the owner cut both in the
// same breath as the numbers. Keeping arithmetic nothing calls is how a future reader concludes the
// product has a progress score it does not have — which is the whole subject of this file.
