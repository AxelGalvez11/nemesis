// Finding the MACROMOLECULE NAMES in a model's answer, so the accession comes from the structure
// database's own search rather than from memory (§42).
//
// 🔴 FOUR OPAQUE CHARACTERS ARE THE REMEMBERED-SMILES DANGER WITH FEWER CHANCES TO NOTICE. `1HHO`
// and `1HH0` are both plausible and are different structures, and a viewer will draw either one
// beautifully. So the request vocabulary takes a NAME — `{"kind":"macromolecule","molecule":
// "haemoglobin"}` — and the accession that reaches the spec was returned by RCSB's search together
// with the entry's own title, stamped as `resolvedFrom` by this pass and never copied from the
// request.
//
// 🔴 A MACROMOLECULE WITHOUT A NAME IS DROPPED, INCLUDING ONE ARRIVING WITH A BARE ACCESSION. There
// is no legitimate model-written-accession case the way there is a model-written-SMILES case (a
// generic group has no name; every protein does). A model that skips the name has skipped the
// resolver, which is the one thing this lane exists to prevent — the prose survives, the picture
// does not.
//
// PURE. Mirrors `structure-resolve.ts`, including the positional contract.

/** How many lookups one answer may trigger. A lesson drawing more than this is not a lesson. */
const MAX_MOLECULES = 4;

export interface ResolvedMacromolecule {
  /** The PDB entry id RCSB's search ranked first for this name. */
  readonly accession: string;
  /** The name that was looked up, kept so the stamp says what was asked rather than what matched. */
  readonly name: string;
  readonly provider: "rcsb";
  /** The entry's own title — what the accession actually is, shown beside the viewer. */
  readonly title?: string;
}

export type MacromoleculeResolution =
  | { ok: true; structure: ResolvedMacromolecule }
  | { ok: false; reason: string; detail: string };

/** Worth parsing? A substring test before any parse and any network call. */
export function mightResolveMacromolecule(text: string): boolean {
  return text.includes('"macromolecule"');
}

/** Every macromolecule name in an answer, in traversal order — the order IS the address. */
export function collectMacromoleculeNames(value: unknown): string[] {
  const names: string[] = [];
  walk(value, (name) => {
    if (names.length < MAX_MOLECULES) names.push(name);
  });
  return names;
}

/** The same answer, with every named macromolecule replaced by what the resolver returned. */
export function applyResolvedMacromolecules(
  value: unknown,
  results: readonly MacromoleculeResolution[],
): unknown {
  let cursor = 0;
  return rebuild(value, () => results[cursor++]);
}

// ------------------------------------------------------------------ the walk

function isMacromolecule(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === "macromolecule"
  );
}

/** The name this macromolecule asks us to look up, if it asks at all. */
function moleculeOf(value: Record<string, unknown>): string | null {
  const molecule = typeof value.molecule === "string" ? value.molecule.trim() : "";
  return molecule && molecule.length <= 120 ? molecule : null;
}

function walk(value: unknown, visit: (name: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  if (isMacromolecule(value)) {
    const molecule = moleculeOf(value);
    if (molecule) visit(molecule);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

function rebuild(value: unknown, next: () => MacromoleculeResolution | undefined): unknown {
  if (Array.isArray(value)) {
    const rebuilt = value.map((item) => rebuild(item, next));
    return rebuilt.filter((item, index) => item !== null || value[index] === null);
  }
  if (typeof value !== "object" || value === null) return value;

  if (isMacromolecule(value)) {
    const molecule = moleculeOf(value);
    // No name means no resolver ran, and whatever accession or stamp rode in is a model's claim.
    if (!molecule) return null;
    const result = next();
    if (!result?.ok) return null;
    const { molecule: _asked, accession: _claimed, resolvedFrom: _stamped, title: _titled, ...rest } =
      value as Record<string, unknown>;
    return {
      ...rest,
      accession: result.structure.accession,
      // 🔴 STAMPED HERE, FROM THE RESOLVER'S OWN ANSWER, NEVER COPIED FROM THE REQUEST.
      resolvedFrom: { id: result.structure.accession, name: result.structure.name, provider: result.structure.provider },
      ...(result.structure.title ? { title: result.structure.title } : {}),
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
