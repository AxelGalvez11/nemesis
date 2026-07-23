/**
 * Markdown-aware chunker for student Library notes.
 *
 * Distinct from core-source-sync/chunking.ts, which detects ALL-CAPS FDA/SPL
 * section headings. Notes use `#`/`##` markdown headings, so sections split on
 * those; long sections then split by size with overlap, the same way the
 * clinical chunker does (~500 tokens, ~50 token overlap).
 *
 * The heading is PREPENDED to each chunk's content so it lands in the embedding
 * — "Renal dosing" in the heading is often the only place the topic is named.
 */

export interface NoteChunk {
  content: string;
  heading: string | null;
  index: number;
}

const TARGET_CHARS = 2000; // ~500 tokens
const OVERLAP_CHARS = 200; // ~50 tokens
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;

interface Section {
  heading: string | null;
  body: string;
}

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: null, body: "" };
  for (const line of text.split("\n")) {
    const match = line.match(HEADING_RE);
    if (match) {
      if (current.heading !== null || current.body.trim()) sections.push(current);
      current = { heading: match[1].trim(), body: "" };
      continue;
    }
    current.body += `${line}\n`;
  }
  if (current.heading !== null || current.body.trim()) sections.push(current);
  return sections;
}

function splitBySize(text: string): string[] {
  if (text.length <= TARGET_CHARS) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + TARGET_CHARS, text.length);
    parts.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - OVERLAP_CHARS;
  }
  return parts;
}

export function chunkNote(text: string): NoteChunk[] {
  if (!text?.trim()) return [];
  const chunks: NoteChunk[] = [];
  for (const section of splitSections(text)) {
    const body = section.body.trim();
    if (!body && !section.heading) continue;
    const prefix = section.heading ? `${section.heading}\n\n` : "";
    for (const part of splitBySize(body)) {
      const content = `${prefix}${part}`.trim();
      if (!content) continue;
      chunks.push({ content, heading: section.heading, index: chunks.length });
    }
  }
  return chunks;
}
