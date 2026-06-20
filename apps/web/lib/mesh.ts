// Pure helpers for the universal picker (Slice A2): turn NCBI MeSH efetch text into ranked
// EntitySuggestions and merge them with the in-house drug catalog. No I/O here — the route handler
// (ncbi-suggest.ts) does the fetching and passes raw text in, so all of this is unit-testable with
// `npx tsx`. The live query shapes these assume are proven by scripts/diag/entity-suggest-probe.ts.

import type { EntitySuggestion, SearchResult, SuggestKind } from "@pharmabro/shared";

export interface MeshTerm {
  ui: string;
  name: string;
  treeNumbers: string[];
  synonyms: string[];
}

// In-house catalog EntityTypes that are "drug-like" → map to the universal `drug` kind (the rest, e.g.
// class/company, are not a single trackable entity → `topic`).
const CATALOG_DRUG_LIKE = new Set(["drug", "supplement", "peptide", "biologic"]);

/** MeSH tree prefix → universal entity kind. Order matters: a descriptor can sit in several trees
 *  (e.g. an insulin pump is both equipment E07 and a therapeutic procedure E02), and we want the most
 *  actionable kind for catalyst routing — device before procedure before drug before condition. */
export function classifyMeshTree(trees: readonly string[]): SuggestKind {
  if (trees.some((t) => t.startsWith("E07"))) return "device"; // Equipment & Supplies
  if (trees.some((t) => /^E0[1-6]/.test(t))) return "procedure"; // Diagnosis/Therapeutics/Procedures
  if (trees.some((t) => t.startsWith("D"))) return "drug"; // Chemicals & Drugs
  if (trees.some((t) => t.startsWith("C") || t.startsWith("F03"))) return "condition"; // Diseases + mental disorders
  return "topic";
}

/** Parse `efetch.fcgi?db=mesh&retmode=text` output into MeSH terms, zipped to the requested UIDs (efetch
 *  preserves id order). Each record starts at a "N: Name" line; we read the canonical name, the
 *  `Tree Number(s):` line, and the indented `Entry Terms:` synonym block — which ENDS at the first blank
 *  line, before the indented "All MeSH Categories" visual tree that would otherwise be slurped in. */
export function parseMeshEfetch(text: string, uids: readonly string[]): MeshTerm[] {
  if (!/^\d+:[ \t]+/m.test(text)) return []; // no "N: Name" record marker → not an efetch body
  const blocks = text.split(/^\d+:[ \t]+/m).map((s) => s.replace(/\s+$/, "")).filter((s) => s.trim());
  return blocks.map((block, i) => {
    const lines = block.split("\n");
    const name = (lines[0] ?? "").trim();
    const treeMatch = block.match(/Tree Number\(s\):[ \t]*(.+)/);
    const treeNumbers = treeMatch ? treeMatch[1].split(",").map((t) => t.trim()).filter(Boolean) : [];

    const synonyms: string[] = [];
    const etIdx = lines.findIndex((l) => /^[ \t]*Entry Terms:/.test(l));
    if (etIdx >= 0) {
      for (let j = etIdx + 1; j < lines.length; j++) {
        const raw = lines[j];
        if (raw.trim() === "") break; // blank line closes the Entry Terms block (visual tree follows)
        if (/^\S/.test(raw)) break; // a non-indented line is the next top-level section
        synonyms.push(raw.trim());
      }
    }
    return { ui: uids[i] ?? "", name, treeNumbers, synonyms };
  }).filter((t) => t.name);
}

/** A MeSH term → a picker suggestion. Subtitle shows a couple of synonyms (display only — NOT folded
 *  into query_terms; broadening retrieval blindly is held until Slice B can verify it). */
export function meshToSuggestion(t: MeshTerm, score: number): EntitySuggestion {
  const subtitle = t.synonyms.slice(0, 3).join(", ") || null;
  return { kind: classifyMeshTree(t.treeNumbers), source: "mesh", id: t.ui, name: t.name, subtitle, score };
}

/** An in-house catalog row → a picker suggestion. Drug-like catalog types become `drug`; class/company
 *  become `topic` (not a single trackable entity). */
export function catalogToSuggestion(r: SearchResult): EntitySuggestion {
  return {
    kind: CATALOG_DRUG_LIKE.has(r.type) ? "drug" : "topic",
    source: "catalog",
    id: r.id,
    name: r.name,
    subtitle: r.subtitle,
    score: r.score,
  };
}

/** Merge catalog hits (precise, brand→generic) with MeSH hits (conditions/devices/procedures + any
 *  drugs PubMed indexes). Catalog leads — it's the best drug UX and the common case — then MeSH fills
 *  the rest, de-duped by canonical name so a drug that's in both lists shows once (catalog wins). */
export function mergeSuggestions(catalog: readonly SearchResult[], mesh: readonly MeshTerm[], limit = 8): EntitySuggestion[] {
  const out: EntitySuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: EntitySuggestion) => {
    const key = s.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  catalog.map(catalogToSuggestion).forEach(push);
  mesh.map((t, i) => meshToSuggestion(t, mesh.length - i)).forEach(push); // preserve relevance order
  return out.slice(0, limit);
}
