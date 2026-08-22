// Finding the compound NAMES in a model's answer, so the structure comes from a resolver (§42).
//
// 🔴🔴 §42's RULE IS "WHERE A NAME EXISTS, THE NAME IS RESOLVED", AND UNTIL NOW NOTHING DID.
// `chem-resolver.ts` was built, tested and merged, and `grep -r resolveStructure` returned one
// dev-only route. So every molecule Nemesis has ever drawn is one the model REMEMBERED — which is
// exactly the case §42 was written about:
//
//   > A model asked for "the SMILES of aspirin" will produce one, fluently, and it will usually be
//   > right — which is exactly what makes it dangerous. There is no signal in the output
//   > distinguishing a remembered string from an invented one, and a SMILES that is wrong by one
//   > atom draws a clean, confident, incorrect molecule.
//
// A wrong plot looks wrong. A wrong molecule looks like chemistry.
//
// 🔴 SO THE MODEL NAMES THE COMPOUND AND STOPS THERE. `{"kind":"structure","compound":"aspirin"}`
// and `[compound: aspirin]` are requests to LOOK SOMETHING UP; the string that reaches the depiction
// library comes from PubChem, and the stamp saying so is written by the resolver.
//
// 🔴🔴 A GENERIC GROUP HAS NO NAME AND MUST NOT BE RESOLVED, which is why this is additive rather
// than a replacement. `*O` is an alcohol — every alcohol — and PubChem has no compound called "any
// alcohol". Notation the model writes directly still works exactly as it did; what changed is that
// a NAMED compound now has a better path available, and the prompt tells the model to prefer it.
//
// 🔴 AND `resolvedFrom` IS STRIPPED FROM ANYTHING THE MODEL SENT. The field means "a resolver was
// asked for this name and returned this string". A model can write those words, and a model that
// wrote them beside a remembered SMILES would be laundering its own memory into provenance — the
// same failure `subject-visuals.ts` guards against by stamping `traceOrigin` rather than reading it.
// The validator still accepts the field, because trusted callers set it; nothing that arrives from a
// model gets to keep it.
//
// PURE. Mirrors `computed-plot.ts` exactly, including the positional contract: two walks of one
// immutable value, agreeing by order alone.

/** How many lookups one answer may trigger. A lesson drawing more than this is not a lesson. */
const MAX_NAMES = 8;

/**
 * `[compound: aspirin]` — the same request as `[smiles: …]`, but asking us to go and find it.
 *
 * 🔴 A SOURCE STRING AND A FACTORY, NOT A SHARED `/g` REGEX. A global regex carries `lastIndex`
 * between calls, so a module-level one shared by `test`, `matchAll` and `replace` finds a token on
 * one pass and misses it on the next depending on where the previous call happened to stop. Two
 * walks that must agree by ORDER cannot be built on an object that remembers things.
 */
export const COMPOUND_PATTERN = String.raw`\[compound\s*:\s*([^\]\n]{1,120})\]`;

const token = () => new RegExp(COMPOUND_PATTERN, "gi");

export interface ResolvedStructureValue {
  readonly id: string;
  readonly name: string;
  readonly notation: "smiles";
  readonly provider: "pubchem";
  readonly value: string;
}

export type StructureResolution =
  | { ok: true; structure: ResolvedStructureValue }
  | { ok: false; reason: string; detail: string };

/** Worth parsing? A substring test before any parse and any network call. */
export function mightResolveStructure(text: string): boolean {
  return text.includes('"compound"') || /\[compound\s*:/i.test(text);
}

/**
 * Every compound name in an answer, in traversal order.
 *
 * 🔴 THE ORDER IS THE ADDRESS, as in `computed-plot.ts`. Nothing records WHERE each name came from,
 * because `applyResolvedStructures` walks the identical tree in the identical order and consumes the
 * results positionally. The alternative is JSON pointers threaded through a recursive walk — a
 * second thing to keep correct, for no gain over "two walks of one immutable value cannot disagree".
 *
 * 🔴 A STRUCTURE VISUAL IS VISITED BEFORE THE STRINGS BESIDE IT, and `rebuild` does the same. This
 * only matters when one object holds both, which no envelope does today — but an order that is
 * merely true by accident is one a refactor silently breaks.
 */
export function collectCompoundNames(value: unknown): string[] {
  const names: string[] = [];
  walk(value, (name) => {
    if (names.length < MAX_NAMES) names.push(name);
  });
  return names;
}

/**
 * The same answer, with every named compound replaced by what the resolver returned.
 *
 * 🔴 A NAME THAT DID NOT RESOLVE LOSES ITS PICTURE, NEVER THE PROSE — the same policy computed plots
 * follow. Falling back to a model-written SMILES would mean the least trustworthy path runs exactly
 * when the trustworthy one found nothing, which is the failure §42 exists to prevent one layer down.
 */
export function applyResolvedStructures(value: unknown, results: readonly StructureResolution[]): unknown {
  let cursor = 0;
  return rebuild(value, () => results[cursor++]);
}

// ------------------------------------------------------------------ the walk

function isStructure(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === "structure"
  );
}

/** The name this structure asks us to look up, if it asks at all. */
function compoundOf(value: Record<string, unknown>): string | null {
  const compound = typeof value.compound === "string" ? value.compound.trim() : "";
  return compound && compound.length <= 120 ? compound : null;
}

function tokensIn(text: string): string[] {
  return [...text.matchAll(token())].map((match) => (match[1] ?? "").trim()).filter(Boolean);
}

function walk(value: unknown, visit: (name: string) => void): void {
  if (typeof value === "string") {
    for (const name of tokensIn(value)) visit(name);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  if (isStructure(value)) {
    const compound = compoundOf(value);
    if (compound) visit(compound);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

function rebuild(value: unknown, next: () => StructureResolution | undefined): unknown {
  if (typeof value === "string") {
    if (!token().test(value)) return value;
    // 🔴 A TOKEN BECOMES `[smiles: …]`, WHICH IS A CHANNEL THAT ALREADY WORKS. `reply-visuals.ts`
    // needs no new pattern, `chem-notation.ts` validates the resolver's answer like any other
    // string, and the drawing lands exactly where the model put the token — the positional property
    // the inline form was chosen for in the first place.
    return value.replace(token(), () => {
      const result = next();
      // 🔴 AN UNRESOLVED TOKEN IS REMOVED, NOT LEFT IN THE PROSE. `[compound: aspirin]` printed
      // literally to a learner is worse than a missing picture: it is a leaked internal format that
      // reads as a bug, and the sentence around it usually still stands on its own.
      return result?.ok ? `[smiles: ${result.structure.value}]` : "";
    });
  }

  if (Array.isArray(value)) {
    const rebuilt = value.map((item) => rebuild(item, next));
    return rebuilt.filter((item, index) => item !== null || value[index] === null);
  }
  if (typeof value !== "object" || value === null) return value;

  if (isStructure(value)) {
    const compound = compoundOf(value);
    if (!compound) {
      // Notation the model wrote directly. It keeps working; it just may not claim provenance.
      const { resolvedFrom: _claimed, ...rest } = value as Record<string, unknown>;
      return rest;
    }
    const result = next();
    if (!result?.ok) return null;
    const { compound: _asked, resolvedFrom: _claimed, ...rest } = value as Record<string, unknown>;
    return {
      ...rest,
      notation: result.structure.notation,
      // 🔴 STAMPED HERE, FROM THE RESOLVER'S OWN ANSWER, NEVER COPIED FROM THE REQUEST.
      resolvedFrom: { id: result.structure.id, name: result.structure.name, provider: result.structure.provider },
      value: result.structure.value,
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const rebuiltItem = rebuild(item, next);
    if (rebuiltItem === null && item !== null) continue;
    out[key] = rebuiltItem;
  }
  return out;
}
