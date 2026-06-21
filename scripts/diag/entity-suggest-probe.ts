// npx tsx scripts/diag/entity-suggest-probe.ts
//
// GO/NO-GO probe for the universal-picker (Slice A2) NCBI pipeline. Read-only. Proves the LIVE query
// shapes still hold before any code is built on them (the spec premise is "MeSH + espell can resolve a
// drug/device/condition/procedure from loose, possibly-misspelled text"). If NCBI drifted, this fails
// loudly and the slice stops here.
//
// Pipeline per query (the exact shape the route handler will use):
//   1. espell  — typo-correct the raw text (db=pubmed → <CorrectedQuery>).
//   2. esearch — db=mesh, term=<corrected>, sort=relevance: NCBI's own MeSH translation, RELEVANCE-
//                sorted so the canonical descriptor is #1 (diabetes → Diabetes Mellitus; heart attack →
//                Myocardial Infarction via entry term; insulin pump → Insulin Infusion Systems). NO
//                wildcard and NO [mh] field — both were empirically WORSE (probe 2026-06-20): *[mh]
//                returned "No items found" for common stems, and a trailing * degrades the ranking
//                (diabet* mis-ranks Diabetes Mellitus below Gestational). Resolves on a near-complete
//                word; partial-word drug typeahead is covered by the in-house catalog RPC, not MeSH.
//   3. efetch  — db=mesh, retmode=text: one call carries name + Entry Terms + Tree Number(s).
//   4. classify by MeSH tree prefix → drug | device | condition | procedure | topic.
//
// Keyless is fine here (local IP, not a shared Vercel egress IP); uses NCBI_API_KEY if present.

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY ?? "";
const TOOL = "pharmaorb-entity-suggest-probe";

type Kind = "drug" | "device" | "condition" | "procedure" | "topic";

function withCommon(url: string): string {
  let u = `${url}&tool=${TOOL}`;
  if (API_KEY) u += `&api_key=${API_KEY}`;
  return u;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getText(url: string): Promise<string> {
  const res = await fetch(withCommon(url));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split("?")[0]}`);
  return res.text();
}

/** espell: db=pubmed, parse <CorrectedQuery>. Returns the correction only when it differs + is non-empty. */
async function espell(q: string): Promise<string> {
  const xml = await getText(`${EUTILS}/espell.fcgi?db=pubmed&term=${encodeURIComponent(q)}`);
  const m = xml.match(/<CorrectedQuery>([\s\S]*?)<\/CorrectedQuery>/);
  const corrected = (m?.[1] ?? "").trim();
  return corrected && corrected.toLowerCase() !== q.toLowerCase() ? corrected : q;
}

/** esearch: db=mesh, NCBI translation, relevance-sorted (canonical descriptor first). Returns MeSH UIDs. */
async function esearchMesh(term: string): Promise<string[]> {
  const url = `${EUTILS}/esearch.fcgi?db=mesh&retmode=json&retmax=8&sort=relevance&term=${encodeURIComponent(term)}`;
  const json = JSON.parse(await getText(url)) as { esearchresult?: { idlist?: string[] } };
  return json.esearchresult?.idlist ?? [];
}

interface MeshTerm {
  ui: string;
  name: string;
  treeNumbers: string[];
  synonyms: string[];
}

/** efetch: db=mesh, retmode=text. Parse each "N: Name" record's name, Tree Number(s), Entry Terms. */
function parseMeshEfetch(text: string, uids: string[]): MeshTerm[] {
  // Records start at a line like "1: Diabetes Mellitus". Split on that marker, keep the index→uid order.
  const parts = text.split(/^\d+:\s+/m).map((s) => s.trim()).filter(Boolean);
  return parts.map((block, i) => {
    const lines = block.split("\n");
    const name = (lines[0] ?? "").trim();
    const treeLine = block.match(/Tree Number\(s\):\s*(.+)/);
    const treeNumbers = treeLine ? treeLine[1].split(",").map((t) => t.trim()).filter(Boolean) : [];
    // Entry Terms block: indented lines after "Entry Terms:" until the next "Key:" header or blank gap.
    const synonyms: string[] = [];
    const etIdx = lines.findIndex((l) => /^\s*Entry Terms:/.test(l));
    if (etIdx >= 0) {
      for (let j = etIdx + 1; j < lines.length; j++) {
        const l = lines[j];
        if (/^\S/.test(l) || /^\s*[A-Z][A-Za-z ()]+:/.test(l)) break; // next section
        const s = l.trim();
        if (s) synonyms.push(s);
      }
    }
    return { ui: uids[i] ?? "", name, treeNumbers, synonyms };
  });
}

/** MeSH tree prefix → entity kind. Device (E07) and procedure (E01–E06) before drug/condition. */
function classifyMeshTree(trees: string[]): Kind {
  if (trees.some((t) => t.startsWith("E07"))) return "device";
  if (trees.some((t) => /^E0[1-6]/.test(t))) return "procedure";
  if (trees.some((t) => t.startsWith("D"))) return "drug";
  if (trees.some((t) => t.startsWith("C") || t.startsWith("F03"))) return "condition";
  return "topic";
}

async function resolve(q: string): Promise<{ corrected: string; terms: Array<MeshTerm & { kind: Kind }> }> {
  const corrected = await espell(q);
  await sleep(350);
  const uids = await esearchMesh(corrected);
  if (uids.length === 0) return { corrected, terms: [] };
  await sleep(350);
  const text = await getText(`${EUTILS}/efetch.fcgi?db=mesh&retmode=text&id=${uids.join(",")}`);
  const terms = parseMeshEfetch(text, uids).map((t) => ({ ...t, kind: classifyMeshTree(t.treeNumbers) }));
  return { corrected, terms };
}

const CASES: Array<{ q: string; expectKind: Kind; expectNameIncludes?: string }> = [
  { q: "diabetis", expectKind: "condition", expectNameIncludes: "Diabetes" }, // typo → espell
  { q: "heart attack", expectKind: "condition", expectNameIncludes: "Myocardial" }, // synonym → MeSH
  { q: "insulin pump", expectKind: "device" },
  { q: "knee replacement", expectKind: "procedure" },
  { q: "semaglutide", expectKind: "drug" },
];

async function main() {
  console.log(`entity-suggest-probe — NCBI MeSH pipeline (key: ${API_KEY ? "set" : "none/keyless"})\n`);
  let pass = 0;
  for (const c of CASES) {
    try {
      const { corrected, terms } = await resolve(c.q);
      const kinds = terms.map((t) => t.kind);
      const hitKind = kinds.includes(c.expectKind);
      const nameOk = !c.expectNameIncludes
        || terms.some((t) => t.name.toLowerCase().includes(c.expectNameIncludes!.toLowerCase()));
      const ok = hitKind && nameOk && terms.length > 0;
      if (ok) pass++;
      const top = terms[0];
      console.log(
        `${ok ? "PASS" : "FAIL"}  "${c.q}"${corrected !== c.q ? ` → "${corrected}"` : ""}  ` +
        `expect=${c.expectKind}${c.expectNameIncludes ? `/${c.expectNameIncludes}` : ""}  ` +
        `got=[${terms.slice(0, 4).map((t) => `${t.name}:${t.kind}`).join(", ")}]`,
      );
      if (top) console.log(`        top trees: ${top.treeNumbers.join(", ") || "(none)"}  syn: ${top.synonyms.slice(0, 3).join("; ") || "(none)"}`);
    } catch (e) {
      console.log(`FAIL  "${c.q}"  ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(400);
  }
  console.log(`\n${pass}/${CASES.length} cases passed`);
  if (pass !== CASES.length) {
    console.log("NO-GO: NCBI shapes did not resolve as the spec assumes — stop and re-research before building.");
    process.exit(1);
  }
  console.log("GO: pipeline verified live.");
}

main();
