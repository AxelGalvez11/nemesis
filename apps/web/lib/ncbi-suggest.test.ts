// npx tsx lib/ncbi-suggest.test.ts
import assert from "node:assert/strict";
import { fetchMeshSuggestions } from "./ncbi-suggest.ts";

const ESPELL = (corrected: string) => `<?xml version="1.0"?><eSpellResult><Query>q</Query><CorrectedQuery>${corrected}</CorrectedQuery></eSpellResult>`;
const ESEARCH = (ids: string[]) => JSON.stringify({ esearchresult: { idlist: ids } });
const EFETCH = `1: Insulin Infusion Systems
Devices for infusion of insulin.

Tree Number(s): E07.505.508
Entry Terms:
    Insulin Pump

    All MeSH Categories
        Equipment and Supplies

2: Diabetes Mellitus
A group of disorders.

Tree Number(s): C18.452.394.750, C19.246
`;

// A fetch stub that routes by eutils endpoint; optionally throws on a chosen endpoint.
function stub(map: { espell?: string; esearch?: string; efetch?: string }, failOn?: "espell" | "esearch" | "efetch"): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    const which = u.includes("espell") ? "espell" : u.includes("esearch") ? "esearch" : u.includes("efetch") ? "efetch" : "";
    if (failOn && u.includes(failOn)) throw new Error("network down");
    const body = (map as Record<string, string>)[which];
    if (body === undefined) return { ok: false, status: 404, text: async () => "" } as Response;
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as unknown as typeof fetch;
}

async function run() {
  // happy path: espell corrects, esearch returns ids, efetch returns 2 records → 2 parsed terms
  {
    const terms = await fetchMeshSuggestions("insulin pum", {
      fetchImpl: stub({ espell: ESPELL("insulin pump"), esearch: ESEARCH(["1", "2"]), efetch: EFETCH }),
    });
    assert.equal(terms.length, 2);
    assert.equal(terms[0]?.name, "Insulin Infusion Systems");
    assert.deepEqual(terms[0]?.treeNumbers, ["E07.505.508"]);
    assert.deepEqual(terms[0]?.synonyms, ["Insulin Pump"]);
    assert.equal(terms[1]?.name, "Diabetes Mellitus");
  }

  // espell network failure → falls back to the raw query, pipeline still completes
  {
    const terms = await fetchMeshSuggestions("diabetes", {
      fetchImpl: stub({ esearch: ESEARCH(["2"]), efetch: EFETCH }, "espell"),
    });
    assert.ok(terms.length >= 1, "espell failure must not sink the pipeline");
  }

  // esearch returns no ids → [] (no efetch needed)
  {
    const terms = await fetchMeshSuggestions("zxqwv", { fetchImpl: stub({ espell: ESPELL("zxqwv"), esearch: ESEARCH([]) }) });
    assert.deepEqual(terms, []);
  }

  // efetch failure → [] (fault-tolerant; drugs still come from the catalog client-side)
  {
    const terms = await fetchMeshSuggestions("diabetes", {
      fetchImpl: stub({ espell: ESPELL("diabetes"), esearch: ESEARCH(["2"]), efetch: EFETCH }, "efetch"),
    });
    assert.deepEqual(terms, []);
  }

  // too-short query → [] without any fetch
  {
    let called = false;
    const terms = await fetchMeshSuggestions("a", { fetchImpl: (async () => { called = true; return { ok: true, text: async () => "" } as Response; }) as unknown as typeof fetch });
    assert.deepEqual(terms, []);
    assert.equal(called, false, "no NCBI call for a <2 char query");
  }

  console.log("ncbi-suggest.test.ts OK");
}

run();
