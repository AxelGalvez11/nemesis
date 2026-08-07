/**
 * Turning extracted facts into the things a student actually uses.
 *
 * 🔴 THE PHASE IS NOT THE EXTRACTOR. `document-facts.ts` finds outlines,
 * definitions, procedures, dates and weighting schemes by shape; until something
 * *builds* from them they are a second summary corpus that nobody reads. This
 * file is that something — and every artifact it produces carries the locator of
 * the block it came from, so it can be checked, reopened, and re-derived when
 * the parser improves.
 *
 * 🔴 IT PROPOSES. IT DOES NOT WRITE.
 *
 * Nothing here touches a database, a calendar, or a deck. Extraction finding a
 * date is not consent to put it in someone's calendar — the existing
 * confirmation flows stay exactly where they are, and these functions produce
 * the *candidates* those flows present. A pure module cannot accidentally
 * acquire a side effect, which is the strongest form that guarantee takes.
 *
 * 🔴 AND IT NEVER WRITES PROSE THE DOCUMENT DID NOT CONTAIN. A flashcard's
 * front and back are the author's own words, sliced. Where a model is genuinely
 * needed — turning a procedure into an exam item, say — that belongs upstairs
 * with the generator, which already knows how to disclose that it wrote
 * something. Anything this file emits can be quoted back to the student as
 * theirs, because it is.
 */

import type { DocumentModel } from "./document-model.ts";
import { extractFacts, type DocFact } from "./document-facts.ts";

/** Where an artifact came from. Travels with it, everywhere, always. */
export interface ArtifactProvenance {
  /** The exact blocks. A citation can be verified against these. */
  blockIds: string[];
  /** Rendered location — "page 4 · Assessment", or just the heading trail. */
  where: string;
  /** The document's own section names, outermost first. */
  headingPath: string[];
  /** 0-based unit, absent when the format has none (Word has no pages). */
  unit?: number;
}

export interface CardCandidate {
  front: string;
  back: string;
  provenance: ArtifactProvenance;
  /** Which extractor produced it, so a bad batch can be traced to a rule. */
  from: "definition" | "procedure";
}

export interface EventCandidate {
  title: string;
  /** ISO date, only where the document's format was unambiguous. */
  date: string;
  /** The date exactly as the author wrote it, for the confirmation screen. */
  asWritten: string;
  provenance: ArtifactProvenance;
}

export interface GradingScheme {
  parts: { label: string; percent: number }[];
  total: number;
  provenance: ArtifactProvenance;
}

export interface NoteSection {
  heading: string;
  level: number;
  /** Bullets, in the document's own words. */
  points: string[];
  provenance: ArtifactProvenance;
}

export interface ArtifactProposal {
  cards: CardCandidate[];
  events: EventCandidate[];
  schemes: GradingScheme[];
  outline: NoteSection[];
  /**
   * Facts that produced nothing, by kind.
   *
   * 🔴 REPORTED, BECAUSE "WE FOUND NOTHING" AND "WE BUILT NOTHING FROM WHAT WE
   * FOUND" ARE DIFFERENT FACTS. The second means a rule here is too strict, and
   * it is invisible unless counted.
   */
  unused: Partial<Record<DocFact["kind"], number>>;
}

/** How a fact's location is spoken about in an artifact. */
function provenanceOf(fact: DocFact, describe: (fact: DocFact) => string): ArtifactProvenance {
  const unitKind = fact.locator.unitKind;
  return {
    blockIds: [...fact.blockIds],
    headingPath: [...fact.headingPath],
    where: describe(fact),
    // 🔴 OMITTED FOR A FORMAT WITH NO UNITS. Word paginates at layout time, so a
    // page number for a .docx is invented — and an artifact carrying an invented
    // page is worse than one carrying none, because every later check of it
    // passes.
    ...(unitKind === "body" || unitKind === "image" ? {} : { unit: fact.locator.unit }),
  };
}

/**
 * Build everything a document supports, from the facts it contains.
 *
 * `describe` is injected rather than imported so this module does not depend on
 * the rendering of a locator — and so a caller can render one differently
 * without this file growing an opinion about it.
 */
export function proposeArtifacts(
  doc: DocumentModel,
  describe: (fact: DocFact) => string,
  facts: readonly DocFact[] = extractFacts(doc),
): ArtifactProposal {
  const cards: CardCandidate[] = [];
  const events: EventCandidate[] = [];
  const schemes: GradingScheme[] = [];
  const outline: NoteSection[] = [];
  const unused: Partial<Record<DocFact["kind"], number>> = {};
  const skip = (fact: DocFact) => {
    unused[fact.kind] = (unused[fact.kind] ?? 0) + 1;
  };

  for (const fact of facts) {
    const provenance = provenanceOf(fact, describe);

    if (fact.kind === "definition") {
      // The author's term and the author's gloss. Nothing is rewritten, so the
      // card can be shown as a quotation from the source.
      if (!fact.term || !fact.meaning) { skip(fact); continue; }
      cards.push({ back: fact.meaning, from: "definition", front: fact.term, provenance });
      continue;
    }

    if (fact.kind === "procedure") {
      const steps = fact.steps ?? [];
      // A one-step "procedure" is a sentence, and a card asking "what are the
      // steps" with one step teaches nothing.
      if (steps.length < 2) { skip(fact); continue; }
      const heading = fact.headingPath.at(-1);
      cards.push({
        back: steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
        from: "procedure",
        // The question names what the DOCUMENT called this, so the prompt is in
        // the student's own field without anything here knowing the field.
        front: heading ? `What are the steps in ${heading}?` : "What are the steps, in order?",
        provenance,
      });
      continue;
    }

    if (fact.kind === "date") {
      // 🔴 NO ISO, NO EVENT. `dateFacts` deliberately leaves ambiguous numeric
      // forms unparsed — 03/04 is two different days on two continents — and a
      // calendar entry on the wrong day is worse than no calendar entry.
      if (!fact.iso) { skip(fact); continue; }
      events.push({
        asWritten: fact.asWritten ?? fact.text,
        date: fact.iso,
        // The surrounding text is the title. A generated one would be a claim
        // about what the date MEANS, which is exactly what nobody can check.
        title: fact.text.trim(),
        provenance,
      });
      continue;
    }

    if (fact.kind === "weighting") {
      if (!fact.weights?.length) { skip(fact); continue; }
      schemes.push({ parts: [...fact.weights], provenance, total: fact.total ?? 0 });
      continue;
    }

    if (fact.kind === "outline") {
      outline.push({
        heading: fact.text.trim(),
        level: fact.level ?? 1,
        // Filled by the caller from the document, not invented here.
        points: [],
        provenance,
      });
      continue;
    }

    skip(fact);
  }

  return { cards, events, outline, schemes, unused };
}

/**
 * Attach each outline section's own text, so a note is the document's words.
 *
 * Separate from `proposeArtifacts` because it needs the model, and keeping the
 * fact-to-artifact mapping free of block lookups keeps it easy to reason about.
 */
export function fillOutlinePoints(
  doc: DocumentModel,
  sections: readonly NoteSection[],
  options: { maxPoints?: number } = {},
): NoteSection[] {
  const maxPoints = options.maxPoints ?? 8;
  const index = new Map(doc.blocks.map((block, position) => [block.id, position]));

  return sections.map((section, order) => {
    const start = index.get(section.provenance.blockIds[0] ?? "");
    if (start === undefined) return section;
    const nextStart = index.get(sections[order + 1]?.provenance.blockIds[0] ?? "") ?? doc.blocks.length;

    const points: string[] = [];
    for (let at = start + 1; at < nextStart && points.length < maxPoints; at += 1) {
      const block = doc.blocks[at];
      if (!block) break;
      if (block.kind === "heading") break;
      const text = block.text.trim();
      if (text) points.push(text);
    }
    return { ...section, points };
  });
}
