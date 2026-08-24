// Turning "show me the sacrum" into a region file and the named meshes to pick out (§42).
//
// 🔴 THE FIGURE PASS'S SHAPE WITH NO NETWORK IN IT. Every other resolve pass buys its answer from
// a route — PubChem, RCSB, the reference shelf — because its corpus is big or remote. This one's
// whole corpus is `anatomy-atlas.ts`, a few kilobytes of names GENERATED from the atlas's own
// nodes at harvest time, small enough to compile in beside this pass wherever it runs. Resolution
// is a synchronous walk: parse, match, stamp, stringify. No fetch, no deps, nothing to time out.
// (The MESHES stay out of every bundle — they are static files the viewer streams on demand.)
//
// 🔴 MATCHING IS CONTAINMENT OVER NORMALISED NAMES, AND THE MULTI-MATCH IS A FEATURE. "cervical
// vertebrae" picks out C3–C7 together; "parietal bone" picks out left and right; "atlas" finds
// "Atlas (C1)". What it refuses to do is pick ONE of those arbitrarily — the highlight is every
// match, which is what a teacher's pointer does on a chart.
//
// 🔴 AND AN ASK TOO BROAD TO POINT AT ANYTHING BECOMES THE WHOLE REGION. "bone" matches nearly
// every node in the skeleton; highlighting everything is the same picture as highlighting nothing,
// so past the cap the resolver stamps the region with no highlights — the honest reading of "show
// me the skeleton" — rather than a smear of accent.

import { ANATOMY_ATLAS } from "./anatomy-atlas";

/** More matches than this is a region-level ask, not a structure. */
const BROAD_ASK = 24;

/** One resolved stamp, exactly what the validator requires. */
export interface AnatomyResolution {
  readonly region: string;
  readonly regionTitle: string;
  readonly assetPath: string;
  readonly structures: readonly string[];
}

/** Is it worth parsing this at all? The gate every pass keeps. */
export function mightResolveAnatomy(text: string): boolean {
  return text.includes('"anatomy"');
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The registry's answer for one asked name, or null when the atlas has nothing.
 *
 * Exported alone so a test can hold the matching rules still without walking an envelope.
 */
export function resolveStructureName(asked: string): AnatomyResolution | null {
  const wanted = normalise(asked);
  if (!wanted) return null;

  let best: { matches: string[]; region: (typeof ANATOMY_ATLAS)[number] } | null = null;
  for (const region of ANATOMY_ATLAS) {
    // A region asked for by its own name is the whole-region view.
    if (normalise(region.title) === wanted || normalise(region.region).includes(wanted)) {
      return { assetPath: region.assetPath, region: region.region, regionTitle: region.title, structures: [] };
    }
    const matches = region.structures.filter((name) => {
      const have = normalise(name);
      return have === wanted || have.includes(wanted) || wanted.includes(have);
    });
    if (matches.length > 0 && (!best || matches.length > best.matches.length)) {
      best = { matches, region };
    }
  }
  if (!best) return null;

  const { matches, region } = best;
  if (matches.length > BROAD_ASK) {
    return { assetPath: region.assetPath, region: region.region, regionTitle: region.title, structures: [] };
  }
  return { assetPath: region.assetPath, region: region.region, regionTitle: region.title, structures: matches };
}

/**
 * The same answer with every anatomy request stamped, and every unresolvable one dropped whole.
 *
 * Text in, text out, synchronous — see the header. A request already carrying `resolved` passes
 * through untouched, so a stored block making a second trip is a no-op rather than a re-resolve.
 */
export function resolveAnatomy(text: string): string {
  if (!mightResolveAnatomy(text)) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  try {
    return JSON.stringify(rebuild(parsed));
  } catch {
    return text;
  }
}

function isRequest(value: unknown): value is Record<string, unknown> & { structure: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "anatomy" &&
    typeof record.structure === "string" &&
    record.structure.trim().length > 0 &&
    // `undefined` is unresolved; anything else — including a null or a malformed stamp — is left
    // for the validator to judge rather than silently re-resolved.
    record.resolved === undefined
  );
}

/** Every unresolved anatomy ask in an answer, for the progress label's count. */
export function collectAnatomyAsks(value: unknown): string[] {
  const found: string[] = [];
  const walk = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const entry of item) walk(entry);
      return;
    }
    if (typeof item !== "object" || item === null) return;
    if (isRequest(item)) {
      found.push(item.structure);
      return;
    }
    for (const entry of Object.values(item as Record<string, unknown>)) walk(entry);
  };
  walk(value);
  return found;
}

function rebuild(value: unknown): unknown {
  if (Array.isArray(value)) {
    const rebuilt = value.map((item) => rebuild(item));
    return rebuilt.filter((item, index) => item !== null || value[index] === null);
  }
  if (typeof value !== "object" || value === null) return value;

  if (isRequest(value)) {
    const resolved = resolveStructureName(value.structure);
    // The atlas has no such structure: the picture is lost, the prose survives, and the validator
    // never sees an unresolved request to refuse.
    if (!resolved) return null;
    return { ...value, resolved };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const rebuiltItem = rebuild(item);
    if (rebuiltItem === null && item !== null) continue;
    out[key] = rebuiltItem;
  }
  return out;
}
