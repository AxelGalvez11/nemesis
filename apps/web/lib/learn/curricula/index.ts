// The curriculum library, assembled. Library sweep 2026-08-23 — the owner's ruling: build the
// whole library at once, every skeleton provisional and honestly labelled, exam frameworks used
// as alignment checklists only. curriculum-registry.ts prepends GENERAL_CHEMISTRY (the longhand
// founding seed) and serves the union; nothing reads this array directly.

import type { CurriculumSkeleton } from "../curriculum-registry";
import { BIOLOGY_COURSES } from "./biology";
import { BUSINESS_LAW_COURSES } from "./business-law";
import { CHEMISTRY_COURSES } from "./chemistry";
import { COMPUTER_SCIENCE_COURSES } from "./computer-science";
import { ENGINEERING_COURSES } from "./engineering";
import { HEALTH_PROFESSION_COURSES } from "./health-professions";
import { HISTORY_HUMANITIES_COURSES } from "./history-humanities";
import { MATHEMATICS_COURSES } from "./mathematics";
import { PHYSICS_EARTH_SPACE_COURSES } from "./physics-earth-space";
import { SOCIAL_SCIENCE_COURSES } from "./social-sciences";
import { WORLD_LANGUAGE_COURSES } from "./world-languages";

export const CURRICULUM_LIBRARY: readonly CurriculumSkeleton[] = [
  ...CHEMISTRY_COURSES,
  ...BIOLOGY_COURSES,
  ...PHYSICS_EARTH_SPACE_COURSES,
  ...MATHEMATICS_COURSES,
  ...COMPUTER_SCIENCE_COURSES,
  ...SOCIAL_SCIENCE_COURSES,
  ...HISTORY_HUMANITIES_COURSES,
  ...WORLD_LANGUAGE_COURSES,
  ...BUSINESS_LAW_COURSES,
  ...HEALTH_PROFESSION_COURSES,
  ...ENGINEERING_COURSES,
];
