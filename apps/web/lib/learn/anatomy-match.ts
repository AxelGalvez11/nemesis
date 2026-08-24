// Which region of the atlas holds an asked-for structure, and which meshes to pick out.
//
// 🔴 SERVER-SIDE, BECAUSE IT IMPORTS THE REGISTRY. `anatomy-atlas.ts` is generated from the atlas
// models' own node names and grows with every region harvested; the learner's browser must never
// download it to find out where the sacrum is. The route owns this module; the browser posts a
// name and receives a stamp.
//
// 🔴 MATCHING IS COVERAGE, NOT CONTAINMENT, AND THE DIFFERENCE WAS MEASURED. Plain containment
// looked right and was wrong the moment the limb models landed: the lower limb carries
// "Art cart of sacrum art process.r", so asking for the SACRUM matched several derived cartilage
// names in the leg and lost to them on count — the whole pelvis keystone highlighted as an ankle
// detail. Coverage asks how much of the candidate name the asked phrase actually accounts for:
// "Sacrum" scores 1.0, "Art cart of sacrum art process.r" scores 0.19, and only the strong band
// survives. It is the reference shelf's character-mass rule in a different medium, learned the
// same way — a weak match must never shadow a strong one.
//
// 🔴 THE MULTI-MATCH IS STILL A FEATURE. "cervical vertebrae" picks out C3–C7 together, "parietal
// bone" picks out left and right, "biceps brachii" picks out the muscle with its heads and tendon
// — every name inside the band travels, which is what a teacher's pointer does on a chart. What it
// refuses to do is pick ONE of them arbitrarily.
//
// 🔴 AND AN ASK TOO BROAD TO POINT AT ANYTHING BECOMES THE WHOLE REGION. "bone" matches nearly
// every node in the skeleton; highlighting everything is the same picture as highlighting nothing,
// so past the cap the resolver stamps the region with no highlights — the honest reading of "show
// me the skeleton" — rather than a smear of accent.

import { ANATOMY_ATLAS } from "./anatomy-atlas";

/** More matches than this is a region-level ask, not a structure. */
const BROAD_ASK = 24;

/**
 * How much of a candidate name the asked phrase has to account for.
 *
 * 🔴 A BAND UNDER THE BEST MATCH RATHER THAN A FIXED FLOOR, because "how specific is specific"
 * depends on the ask. `0.6` keeps "Short head of biceps brachii" (0.5) alongside "Biceps brachii
 * muscle" (0.67) — those ARE the biceps — while dropping the sacral cartilage (0.19) that a plain
 * containment rule let win. The absolute floor stops a whole field of weak matches promoting each
 * other when nothing good exists.
 */
const BAND = 0.6;
/**
 * 🔴 LOW, AND DELIBERATELY SO, BECAUSE AN ORGAN IS OFTEN NAMED ONLY BY ITS PARTS. The atlas has no
 * node called "Lung" — it has "Superior lobe of left lung" and four siblings, where the ask
 * accounts for a fifth of the name. A floor of 0.25 refused every one of them and reported a lung
 * as absent from a model that draws it in full. The BAND above is what keeps quality: once a
 * strong match exists anywhere, weak ones are dropped relative to it, so "sacrum" still refuses
 * the sacral cartilage. This floor only decides what is worth scoring at all.
 */
const MIN_COVERAGE = 0.1;

/** One resolved stamp, exactly what the validator requires. */
export interface AnatomyResolution {
  readonly region: string;
  readonly regionTitle: string;
  readonly assetPath: string;
  /** Which atlas this region came from, so the viewer credits the right one. */
  readonly source: string;
  readonly structures: readonly string[];
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * How much of `name` the asked phrase accounts for: 1 for an exact match, less as the candidate
 * carries more words the ask never mentioned. Zero when neither contains the other.
 */
function coverage(wanted: string, name: string): number {
  const have = normalise(name);
  if (!have) return 0;
  if (have === wanted) return 1;
  if (have.includes(wanted)) return wanted.length / have.length;
  // The ask may be the longer side — "the sacrum bone" against "Sacrum".
  if (wanted.includes(have)) return have.length / wanted.length;
  return 0;
}

/** The registry's answer for one asked name, or null when the atlas has nothing. */
export function resolveStructureName(asked: string): AnatomyResolution | null {
  const wanted = normalise(asked);
  if (!wanted) return null;

  const scored: Array<{ name: string; region: (typeof ANATOMY_ATLAS)[number]; score: number }> = [];
  for (const region of ANATOMY_ATLAS) {
    // A region asked for by its own name is the whole-region view.
    if (normalise(region.title) === wanted) {
      return { assetPath: region.assetPath, region: region.region, regionTitle: region.title, source: region.source, structures: [] };
    }
    for (const name of region.structures) {
      const score = coverage(wanted, name);
      if (score >= MIN_COVERAGE) scored.push({ name, region, score });
    }
  }
  if (scored.length === 0) return resolveLandmark(wanted);

  // 🔴 BREADTH DECIDES WHETHER THIS IS A STRUCTURE OR A CATEGORY, AND IT IS A STRUCTURAL SIGNAL
  // RATHER THAN A WORD LIST. Measured across the harvested atlas: every specific ask touches at
  // most a dozen candidates ("median nerve" 12, "cervical vertebrae" 5, "sacrum" 3), while a
  // category touches dozens ("bone" 60, "muscle" 34). So an ask that reaches past the cap is one
  // no highlight can answer, and the honest picture is the region itself. Nothing here knows what
  // a bone or a muscle is — only how many things the phrase could mean.
  const categorical = scored.length > BROAD_ASK;

  // 🔴 THE BAND IS DECIDED ACROSS THE WHOLE ATLAS, NOT PER REGION, which is the half that fixes
  // the sacrum: a perfect match anywhere disqualifies every region's weak ones before any region
  // is compared on count.
  const strongest = scored.reduce((best, row) => Math.max(best, row.score), 0);
  const kept = scored.filter((row) => row.score >= strongest * BAND);

  const byRegion = new Map<string, { best: number; matches: string[]; region: (typeof ANATOMY_ATLAS)[number] }>();
  for (const row of kept) {
    const entry = byRegion.get(row.region.region) ?? { best: 0, matches: [], region: row.region };
    entry.matches.push(row.name);
    entry.best = Math.max(entry.best, row.score);
    byRegion.set(row.region.region, entry);
  }

  // 🔴 THREE TERMS, IN THIS ORDER, AND EACH ONE FIXES A CASE THE ONE BEFORE IT GETS WRONG.
  //
  //   · STRONGEST MATCH FIRST — the model that names the thing exactly is the model that means it.
  //     The hand carries "1st metacarpal bone" while the whole skeleton carries it as
  //     "1st metacarpal bone.r"; both survive the band, and the hand is the one being asked about.
  //   · THEN MOST MATCHES — a group ask belongs where the whole group lives.
  //   · THEN THE MOST FOCUSED REGION, measured as the smallest, so a newly harvested region needs
  //     no ordering decision. The sacrum is named in the skeleton AND incidentally inside the
  //     upper-limb model, which carries the shoulder girdle for context; the bigger model is the
  //     wrong answer there, because the sacrum is not what it is about. The smaller file is also
  //     the cheaper download, and the camera frames whatever was named either way.
  let best: { best: number; matches: string[]; region: (typeof ANATOMY_ATLAS)[number] } | null = null;
  for (const entry of byRegion.values()) {
    const better =
      !best ||
      entry.best > best.best ||
      (entry.best === best.best &&
        (entry.matches.length > best.matches.length ||
          (entry.matches.length === best.matches.length &&
            entry.region.structures.length < best.region.structures.length)));
    if (better) best = entry;
  }
  if (!best) return null;

  const { matches, region } = best;
  return {
    assetPath: region.assetPath,
    region: region.region,
    regionTitle: region.title,
    source: region.source,
    structures: categorical || matches.length > BROAD_ASK ? [] : matches,
  };
}

/**
 * The region a named LANDMARK sits on, when no outlinable structure answered.
 *
 * 🔴 A SECOND PASS RATHER THAN A MERGED ONE, so a landmark can never beat a real structure. Only
 * once nothing with geometry matches does the atlas's landmark vocabulary get a say, and then the
 * answer is the region's own view — the model this thing is marked on — never a highlight, because
 * there is no geometry behind it to light.
 */
function resolveLandmark(wanted: string): AnatomyResolution | null {
  let best: { region: (typeof ANATOMY_ATLAS)[number]; score: number } | null = null;
  for (const region of ANATOMY_ATLAS) {
    for (const name of region.landmarks) {
      const score = coverage(wanted, name);
      if (score < MIN_COVERAGE) continue;
      if (!best || score > best.score || (score === best.score && region.structures.length < best.region.structures.length)) {
        best = { region, score };
      }
    }
  }
  if (!best) return null;
  return {
    assetPath: best.region.assetPath,
    region: best.region.region,
    regionTitle: best.region.title,
    source: best.region.source,
    structures: [],
  };
}
