// Finding the anatomy asks in a model's answer, and putting the atlas's stamps back (§42).
//
// 🔴 PURE, AND THAT IS LOAD-BEARING RATHER THAN TIDY. The atlas REGISTRY — every structure name in
// every harvested region — is server-side only, exactly as the maths layer is: a learner reading a
// history lesson must not download the names of 1,441 bones, muscles and vessels to find out that
// their answer contains none of them. So this file says WHAT was asked and WHERE the answer goes,
// `app/api/learn/anatomy/route.ts` does the matching, and nothing here imports the atlas.
//
// 🔴 THE SIBLING OF `figure-resolve.ts`, DELIBERATELY IDENTICAL IN SHAPE: a substring gate, a walk
// that finds requests in any envelope, and an apply pass addressed BY POSITION.

/** How many structures one model answer may ask the atlas for. */
const MAX_ASKS = 6;

/** What the route says about one asked-for structure. */
export type AnatomyResolutionResult =
  | {
      ok: true;
      resolved: {
        region: string;
        regionTitle: string;
        assetPath: string;
        source: string;
        structures: readonly string[];
      };
    }
  | { ok: false; reason: string; detail: string };

/**
 * Is it worth parsing this at all?
 *
 * A substring test before any `JSON.parse` and before any network call, because the overwhelming
 * majority of turns contain no anatomy and must not pay for one.
 */
export function mightResolveAnatomy(text: string): boolean {
  return text.includes('"anatomy"');
}

/**
 * Every unresolved anatomy ask in a model answer, in the order a walk finds them.
 *
 * 🔴 THE ORDER IS THE ADDRESS. `applyResolvedAnatomy` walks the identical tree in the identical
 * order and consumes results positionally; two walks of one immutable value cannot disagree.
 */
export function collectAnatomyAsks(value: unknown): string[] {
  const found: string[] = [];
  walk(value, (asked) => {
    if (found.length < MAX_ASKS) found.push(asked);
  });
  return found;
}

/**
 * The same answer with the atlas's stamps in place, and every unresolvable ask dropped whole.
 *
 * `results` is positional against `collectAnatomyAsks` on the SAME value. A structure the atlas
 * does not carry loses its visual entirely — the validator would refuse an unstamped request
 * anyway, and dropping it here keeps the failure a missing picture rather than a logged model
 * mistake. The prose the model wrote around it survives untouched.
 */
export function applyResolvedAnatomy(value: unknown, results: readonly AnatomyResolutionResult[]): unknown {
  let cursor = 0;
  const next = (): AnatomyResolutionResult | undefined => results[cursor++];
  return rebuild(value, next);
}

// ------------------------------------------------------------------ the walk

/** An anatomy request still in ask form: a name, with no stamp yet. */
function isRequest(value: unknown): value is Record<string, unknown> & { structure: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "anatomy" &&
    typeof record.structure === "string" &&
    record.structure.trim().length > 0 &&
    // `undefined` is unresolved; anything else — including a malformed stamp — is left for the
    // validator to judge rather than silently re-resolved.
    record.resolved === undefined
  );
}

function walk(value: unknown, visit: (asked: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (isRequest(value)) {
    visit(value.structure.trim());
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

function rebuild(value: unknown, next: () => AnatomyResolutionResult | undefined): unknown {
  if (Array.isArray(value)) {
    // A dropped view leaves the array rather than sitting in it as `null`, the same rule every
    // sibling pass keeps: a null entry would be reported downstream as a malformed model request.
    const rebuilt = value.map((item) => rebuild(item, next));
    return rebuilt.filter((item, index) => item !== null || value[index] === null);
  }
  if (typeof value !== "object" || value === null) return value;

  if (isRequest(value)) {
    const result = next();
    if (!result || !result.ok) return null;
    return { ...value, resolved: result.resolved };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const rebuiltItem = rebuild(item, next);
    if (rebuiltItem === null && item !== null) continue;
    out[key] = rebuiltItem;
  }
  return out;
}
