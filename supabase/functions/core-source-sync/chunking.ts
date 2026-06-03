/**
 * Phase 2: section-aware chunker for clinical / public-domain text.
 *
 * Optimized for FDA labels + DailyMed SPL where canonical section headings
 * matter for retrieval (CONTRAINDICATIONS, DOSAGE AND ADMINISTRATION,
 * WARNINGS AND PRECAUTIONS, etc.). The section field on core_source_chunks
 * is preserved so the hybrid RAG router can boost section-relevance.
 *
 * Targets ~500 token chunks (text-embedding-3-large optimal range) with
 * 50-token overlap to preserve cross-paragraph context.
 */

export interface SectionedChunk {
  readonly content: string;
  readonly section: string | null;
  readonly position: number;
  readonly span: { readonly start: number; readonly end: number };
}

const TARGET_CHARS = 2000; // ~500 tokens
const OVERLAP_CHARS = 200; // ~50 tokens

const SECTION_HEADING_RE = /^[\s]*(?:#+\s+)?([A-Z][A-Z0-9 ,/\-&]{4,})[\s:]*$/;

/**
 * Split a clinical text into section-aware chunks. Heading detection is
 * heuristic: ALL-CAPS lines >= 5 chars, or markdown `## HEADING` style.
 */
export function chunkClinicalText(text: string): SectionedChunk[] {
  if (!text?.trim()) return [];

  const lines = text.split("\n");
  const sections: Array<{
    heading: string | null;
    body: string;
    start: number;
  }> = [{ heading: null, body: "", start: 0 }];

  let charOffset = 0;
  for (const line of lines) {
    const m = line.match(SECTION_HEADING_RE);
    if (m && line.trim().length < 80) {
      sections.push({ heading: m[1].trim(), body: "", start: charOffset });
    } else {
      sections[sections.length - 1].body += line + "\n";
    }
    charOffset += line.length + 1;
  }

  const chunks: SectionedChunk[] = [];
  let chunkIdx = 0;

  for (const section of sections) {
    const body = section.body.trim();
    if (!body) continue;

    if (body.length <= TARGET_CHARS) {
      chunks.push({
        content: body,
        section: section.heading,
        position: chunkIdx++,
        span: { start: section.start, end: section.start + body.length },
      });
      continue;
    }

    const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim());
    let buffer = "";
    let bufferStart = section.start;
    let runningOffset = section.start;

    for (const para of paragraphs) {
      if (buffer.length + para.length > TARGET_CHARS && buffer) {
        chunks.push({
          content: buffer.trim(),
          section: section.heading,
          position: chunkIdx++,
          span: { start: bufferStart, end: bufferStart + buffer.length },
        });
        const overlapTail = buffer.slice(-OVERLAP_CHARS);
        bufferStart = runningOffset - overlapTail.length;
        buffer = overlapTail + "\n\n" + para;
      } else {
        buffer += (buffer ? "\n\n" : "") + para;
      }
      runningOffset += para.length + 2;
    }

    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        section: section.heading,
        position: chunkIdx++,
        span: { start: bufferStart, end: bufferStart + buffer.length },
      });
    }
  }

  // Fallback: if heading-detection swallowed all content (every line matched
  // SECTION_HEADING_RE leaving empty bodies), emit the raw text as a single
  // chunk so the source isn't silently dropped post-ingest.
  if (chunks.length === 0 && text.trim().length > 0) {
    const trimmed = text.trim();
    chunks.push({
      content:
        trimmed.length > TARGET_CHARS
          ? trimmed.slice(0, TARGET_CHARS)
          : trimmed,
      section: null,
      position: 0,
      span: { start: 0, end: Math.min(trimmed.length, TARGET_CHARS) },
    });
  }

  return chunks;
}

/** Estimate token count from char length (rough: 1 token ~ 4 chars). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
