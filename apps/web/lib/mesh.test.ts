// npx tsx lib/mesh.test.ts
import assert from "node:assert/strict";
import type { SearchResult } from "@nemesis/shared";
import { classifyMeshTree, parseMeshEfetch, meshToSuggestion, catalogToSuggestion, mergeSuggestions, isMeshTerm } from "./mesh.ts";

// A faithful 2-record efetch sample (real db=mesh retmode=text shape): a device with an Entry Terms
// block FOLLOWED by the indented "All MeSH Categories" visual tree (the synonym parser must stop at the
// blank line and NOT slurp the tree), and a clean condition with trees but no Entry Terms.
const EFETCH = `1: Insulin Infusion Systems
Portable or implantable devices for infusion of insulin. Includes insulin pumps.

Subheadings:
    adverse effects
    economics

Tree Number(s): E02.319.300.508, E07.505.508, E07.858.082.505.508
Entry Terms:
    Infusion System, Insulin
    Infusion Systems, Insulin
    Insulin Infusion System

    All MeSH Categories
        Analytical, Diagnostic and Therapeutic Techniques and Equipment Category
            Equipment and Supplies
                Insulin Infusion Systems

2: Diabetes Mellitus
A heterogeneous group of disorders characterized by HYPERGLYCEMIA.

Tree Number(s): C18.452.394.750, C19.246
See Also:
    Glycosuria

    All MeSH Categories
        Diseases Category
            Endocrine System Diseases
`;

// --- parseMeshEfetch ---
const terms = parseMeshEfetch(EFETCH, ["68068098", "68003920"]);
assert.equal(terms.length, 2, "two records parsed");

const pump = terms[0]!;
assert.equal(pump.ui, "68068098");
assert.equal(pump.name, "Insulin Infusion Systems");
assert.deepEqual(pump.treeNumbers, ["E02.319.300.508", "E07.505.508", "E07.858.082.505.508"]);
// The synonym block must STOP at the blank line — NOT include "All MeSH Categories" or tree rows.
assert.deepEqual(pump.synonyms, ["Infusion System, Insulin", "Infusion Systems, Insulin", "Insulin Infusion System"]);
assert.ok(!pump.synonyms.some((s) => s.includes("MeSH Categories")), "visual tree not slurped as a synonym");

const dm = terms[1]!;
assert.equal(dm.ui, "68003920");
assert.equal(dm.name, "Diabetes Mellitus");
assert.deepEqual(dm.treeNumbers, ["C18.452.394.750", "C19.246"]);
assert.deepEqual(dm.synonyms, [], "no Entry Terms → no synonyms");

// empty / malformed text → no records
assert.deepEqual(parseMeshEfetch("", []), []);
assert.deepEqual(parseMeshEfetch("garbage with no record marker", []), []);

// --- classifyMeshTree (priority: device > procedure > drug > condition > topic) ---
assert.equal(classifyMeshTree(["E02.319.300.508", "E07.505.508"]), "device"); // E07 wins over E02
assert.equal(classifyMeshTree(["E04.555.110.110.115"]), "procedure"); // knee arthroplasty
assert.equal(classifyMeshTree(["D06.472.317.680.500.751"]), "drug"); // semaglutide
assert.equal(classifyMeshTree(["C18.452.394.750", "C19.246"]), "condition"); // diabetes
assert.equal(classifyMeshTree(["F03.900"]), "condition"); // mental disorder
assert.equal(classifyMeshTree(["A02.835.232"]), "topic"); // anatomy → not trackable
assert.equal(classifyMeshTree([]), "topic");
assert.equal(classifyMeshTree(undefined as unknown as string[]), "topic"); // schema-drift guard: no throw

// --- isMeshTerm (untrusted route-response shape guard) ---
assert.equal(isMeshTerm({ ui: "1", name: "X", treeNumbers: [], synonyms: [] }), true);
assert.equal(isMeshTerm({ name: "X", treeNumbers: [] }), false); // missing fields
assert.equal(isMeshTerm({ ui: "1", name: "X", treeNumbers: "C1", synonyms: [] }), false); // wrong type
assert.equal(isMeshTerm(null), false);
assert.equal(isMeshTerm("nope"), false);

// --- meshToSuggestion ---
const sugPump = meshToSuggestion(pump, 5);
assert.equal(sugPump.kind, "device");
assert.equal(sugPump.source, "mesh");
assert.equal(sugPump.id, "68068098");
assert.equal(sugPump.subtitle, "Infusion System, Insulin, Infusion Systems, Insulin, Insulin Infusion System");
const sugDm = meshToSuggestion(dm, 4);
assert.equal(sugDm.kind, "condition");
assert.equal(sugDm.subtitle, null, "no synonyms → null subtitle");

// --- catalogToSuggestion ---
const drugRow: SearchResult = { type: "drug", id: "sema", name: "Semaglutide", subtitle: "Ozempic", status: "approved", score: 1 };
const classRow: SearchResult = { type: "class", id: "glp1", name: "GLP-1 agonists", subtitle: null, status: "unknown", score: 0.5 };
assert.equal(catalogToSuggestion(drugRow).kind, "drug");
assert.equal(catalogToSuggestion(drugRow).source, "catalog");
assert.equal(catalogToSuggestion(drugRow).subtitle, "Ozempic");
assert.equal(catalogToSuggestion(classRow).kind, "topic", "a class is not a single trackable entity");

// --- mergeSuggestions: catalog leads, dedupe by name (catalog wins), cap ---
const merged = mergeSuggestions(
  [drugRow],
  [
    { ui: "68068098", name: "Insulin Infusion Systems", treeNumbers: ["E07.505.508"], synonyms: [] },
    { ui: "x", name: "Semaglutide", treeNumbers: ["D06.1"], synonyms: ["Ozempic"] }, // dupe of catalog drug
  ],
);
assert.equal(merged.length, 2, "the duplicate Semaglutide collapses to one");
assert.equal(merged[0]?.name, "Semaglutide");
assert.equal(merged[0]?.source, "catalog", "catalog wins the dedupe");
assert.equal(merged[1]?.name, "Insulin Infusion Systems");
assert.equal(merged[1]?.kind, "device");

// cap honored
const many = mergeSuggestions([], Array.from({ length: 12 }, (_, i) => ({ ui: `u${i}`, name: `Term ${i}`, treeNumbers: ["C1"], synonyms: [] })), 8);
assert.equal(many.length, 8);

console.log("mesh.test.ts OK");
