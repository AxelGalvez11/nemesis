// Applying a course to a canvas: the one write path from the Curriculum Registry to the marker.
//
// 🔴 CALLED AFTER THE TURN DID WHAT IT WAS GOING TO DO ANYWAY, NEVER INSTEAD OF IT. A course
// request usually rides a `study` turn; `begin` or `command` runs exactly as today, and then the
// plan is applied. That ordering is what keeps this a scope change rather than a mode — the
// teaching loop is not consulted, interrupted or reconfigured.
//
// 🔴 IT NEVER SILENTLY NO-OPS. Every way this can decline returns a named refusal with a sentence
// the learner can be shown. `canvas-territory.ts` names the recurring defect this guards against —
// a control that renders and does nothing — and a Course chip that swallowed its failure would be
// exactly that, one layer down.
//
// 🔴 IT NEVER TOUCHES `public.courses` AND NEVER SETS `course_id`. Those mean enrolment identity,
// are student-created only, and docs/course-identity-design.md forbids inferring one from topic
// overlap. A curriculum plan and a course enrolment are different facts that happen to share an
// English word.

import { KNOWLEDGE_IDENTITY_VERSION } from "./knowledge-identity";
import { loadCanvasTerritory, saveCanvasTerritory } from "./canvas-store";
import { planFromSkeleton, type CurriculumPlan } from "./curriculum-plan";
import { readCurriculum } from "./curriculum-registry";
import type { LearningCanvas } from "./canvas-model";

export type CourseRefusal =
  /** The registry holds nothing for this subject — the honest and common answer. */
  | "no-curriculum-for-subject"
  /** The skeleton exists and failed validation. Serving a broken plan would be worse. */
  | "skeleton-invalid";

export type CourseApplication =
  | { readonly ok: true; readonly plan: CurriculumPlan }
  | { readonly ok: false; readonly refusal: CourseRefusal; readonly detail: string };

/**
 * One line of product copy per refusal, for the reply surface.
 *
 * 🔴 SHOWN, NOT LOGGED. The learner pressed something and asked for something; if it cannot be
 * done, the reply says so in words about THEIR request — never a bare error state, and never
 * silence. The no-curriculum line also says what still works, because "no" with no path forward is
 * a dead end and this product's acceptance list bans those by name.
 */
export function courseRefusalLine(refusal: CourseRefusal, subject: string): string {
  if (refusal === "no-curriculum-for-subject") {
    return (
      `Nemesis doesn't have a ready-made course for ${subject} yet, so it can't lay out a full path — ` +
      "but it can still teach it: keep going here, or attach your own material and it will work from that."
    );
  }
  return `Nemesis found a course outline for ${subject}, but it failed its own checks, so it wasn't applied.`;
}

/**
 * Look the subject up, cut a plan, and persist it on the canvas's territory marker.
 *
 * 🔴 THE MARKER MAY NOT EXIST YET, AND THAT CASE IS REAL AND COMMON: on a fresh canvas the course
 * turn calls `begin()` and territory construction starts seconds later. The plan is written onto a
 * PRE-TERRITORY — `{topic, identityVersion, objects: [], plan}` — which `readTerritory` accepts
 * (the plan is why) and `territoryReuse` still reports as a MISS, so the real build runs exactly
 * as it would have. The build's own saves carry `plan` forward (see canvas-knowledge.ts), so the
 * plan survives the marker being replaced by the finished territory.
 *
 * 🔴 THE LOAD-THEN-SAVE CAN RACE THE BUILD'S OWN SAVE, AND THE FAILURE IS BOUNDED ON PURPOSE. Both
 * writes are whole-row upserts; if this one lands on a stale read it clobbers a just-built
 * territory back to a pre-territory. What follows is not corruption: the marker reads as a miss,
 * the next resolve rebuilds (idempotent by identity, so rows converge rather than double), and the
 * rebuild's save preserves this plan. The cost is one repeated build in a window of a few seconds
 * that requires the learner to have asked for a course at the exact moment a territory finished.
 * A SQL-side merge would close it and is not worth its complexity for that window — the same
 * judgement `learner-store.ts` records for its own version of this race.
 */
export async function applyCurriculumPlan(
  userId: string | null,
  canvas: LearningCanvas,
  subject: string,
  appliedAt: string,
): Promise<CourseApplication> {
  const lookup = readCurriculum(subject);
  if (!lookup.ok) return { detail: lookup.detail, ok: false, refusal: lookup.refusal };

  const plan = planFromSkeleton(lookup.skeleton, appliedAt);
  const stored = await loadCanvasTerritory(userId, canvas.id);
  await saveCanvasTerritory(userId, canvas, {
    ...(stored ?? {
      identityVersion: KNOWLEDGE_IDENTITY_VERSION,
      objects: [],
      topic: subject.trim() || lookup.skeleton.title,
    }),
    plan,
  });
  return { ok: true, plan };
}

/** Read the plan back for a canvas, for the session's own state on open. */
export async function loadCurriculumPlan(
  userId: string | null,
  canvasId: string,
): Promise<CurriculumPlan | null> {
  const stored = await loadCanvasTerritory(userId, canvasId);
  return stored?.plan ?? null;
}
