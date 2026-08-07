/**
 * Phase 6: what do the extracted facts actually BUILD, on real documents?
 *
 * The extractors were measured on 2026-08-06: 472 facts across 94 of 124 real
 * files, all with valid provenance. That number said nothing about the phase,
 * because nothing consumed them. This measures the consumers.
 *
 * The questions that matter:
 *
 *   YIELD       how many cards, calendar candidates, grading schemes and note
 *               sections come out, and from how many documents
 *   PROVENANCE  does EVERY artifact carry the blocks it came from — a derived
 *               thing with no source is exactly the unverifiable second corpus
 *               this phase exists not to build
 *   FABRICATION does any card contain text the document does not? A card is the
 *               author's words, sliced; if a front or back is not in the source,
 *               something wrote prose it should not have
 *   LOCATORS    does a .docx artifact ever claim a page?
 *
 * Run from apps/web:
 *   npx tsx scripts/phase6-artifacts.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describeLocator, documentToText, type DocumentModel } from "../../../packages/shared/src/document-model.ts";
import { extractFacts, type DocFact } from "../../../packages/shared/src/document-facts.ts";
import { fillOutlinePoints, proposeArtifacts } from "../../../packages/shared/src/document-artifacts.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { extractDocxModel } from "../lib/notebooks/office.ts";

function walk(root: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return []; }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("~$")) continue;
    const full = join(root, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(full, depth + 1));
    else if (/\.(pdf|docx)$/i.test(entry) && s.size < 60 * 1024 * 1024) out.push(full);
  }
  return out;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const files = walk(dir).slice(0, Number(process.argv[3] ?? "200"));
const describe = (fact: DocFact) => describeLocator(fact.locator);

let read = 0, failed = 0;
let facts = 0, cards = 0, events = 0, schemes = 0, sections = 0;
let filesWithCards = 0, filesWithEvents = 0, filesWithSchemes = 0;
let noProvenance = 0, fabricated = 0, docxClaimingPage = 0, emptySections = 0;
const unusedByKind: Record<string, number> = {};
const fabricationExamples: string[] = [];

/** Whitespace-insensitive containment: extraction inserts and removes spaces. */
function contains(haystack: string, needle: string): boolean {
  const flat = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  return flat(haystack).includes(flat(needle));
}

async function modelFor(file: string): Promise<DocumentModel> {
  const bytes = new Uint8Array(readFileSync(file));
  if (/\.pdf$/i.test(file)) return (await readPdfStructure(bytes)).model;
  return extractDocxModel(bytes);
}

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  try {
    const model = await modelFor(file);
    const found = extractFacts(model);
    const proposal = proposeArtifacts(model, describe, found);
    const filled = fillOutlinePoints(model, proposal.outline);
    const source = documentToText(model);

    facts += found.length;
    cards += proposal.cards.length;
    events += proposal.events.length;
    schemes += proposal.schemes.length;
    sections += filled.length;
    if (proposal.cards.length) filesWithCards += 1;
    if (proposal.events.length) filesWithEvents += 1;
    if (proposal.schemes.length) filesWithSchemes += 1;
    emptySections += filled.filter((section) => section.points.length === 0).length;
    for (const [kind, count] of Object.entries(proposal.unused)) {
      unusedByKind[kind] = (unusedByKind[kind] ?? 0) + count;
    }

    const everything = [...proposal.cards, ...proposal.events, ...proposal.schemes, ...filled];
    for (const artifact of everything) {
      if (artifact.provenance.blockIds.length === 0) noProvenance += 1;
      if (model.format === "docx" && /page/i.test(artifact.provenance.where)) docxClaimingPage += 1;
    }

    // 🔴 THE FABRICATION CHECK. A card whose front or back is not in the source
    // means something wrote prose, and a student revising from it cannot tell.
    for (const card of proposal.cards) {
      if (card.from !== "definition") continue;
      if (!contains(source, card.front) || !contains(source, card.back)) {
        fabricated += 1;
        if (fabricationExamples.length < 5) {
          fabricationExamples.push(`${name}: ${card.front.slice(0, 50)} / ${card.back.slice(0, 50)}`);
        }
      }
    }

    read += 1;
  } catch (error) {
    failed += 1;
    if (failed <= 3) console.log(`  ! ${name}: ${(error as Error).message.slice(0, 90)}`);
  }
}

console.log(`
FILES        ${read} read, ${failed} failed
FACTS        ${facts} extracted

BUILT        ${cards} flashcards across ${filesWithCards} files
             ${events} calendar candidates across ${filesWithEvents} files
             ${schemes} grading schemes across ${filesWithSchemes} files
             ${sections} note sections (${emptySections} with no text under them)

UNUSED       ${JSON.stringify(unusedByKind)}
             facts that produced nothing — a rule too strict, not a document too thin

PROVENANCE   ${noProvenance} artifacts with NO source blocks   <- must be 0
             ${docxClaimingPage} Word artifacts claiming a page  <- must be 0
FABRICATION  ${fabricated} cards containing text not in the document  <- must be 0
`);

for (const example of fabricationExamples) console.log(`  fabricated: ${example}`);
