// Pure heading/outline logic for the note screen's pill bar (owner 2026-07-21:
// the ≡ button lists this note's headings and jumps to one). Dependency-free so
// note-outline.test.ts loads clean under Deno, same convention as the rest of
// src/lib.
//
// The note body renders as one <Markdown> block PER SECTION (a heading plus
// everything under it, until the next heading) so each section's on-screen y
// position falls out of an ordinary onLayout — that's what makes "jump to
// heading" an exact scroll instead of a guess. Splitting on headings is safe
// for the markdown these notes hold: the only cross-section constructs it
// could sever are reference-style link definitions, which the app's notes
// don't use ([[wikilinks]] and inline links both resolve within a section).

export interface NoteHeading {
  /** 1–6, from the number of leading #s. */
  level: number;
  /** The heading's own text, hashes stripped, trimmed. */
  text: string;
}

export interface NoteSection {
  /** null for the preamble before the first heading (or a heading-free note). */
  heading: NoteHeading | null;
  /** The section's full markdown, INCLUDING its own heading line. */
  body: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** Split markdown into heading-led sections. ATX headings only (the flavor the
 * editor's own toolbar writes); lines inside ``` / ~~~ fences never count. A
 * note with no headings comes back as one heading-less section, and a leading
 * preamble (text before the first heading) keeps section index 0. */
export function splitSections(content: string): NoteSection[] {
  const lines = content.split("\n");
  const sections: NoteSection[] = [];
  let current: string[] = [];
  let currentHeading: NoteHeading | null = null;
  let started = false;
  let fence: string | null = null;

  const push = () => {
    if (!started) return;
    sections.push({ body: current.join("\n"), heading: currentHeading });
  };

  for (const line of lines) {
    const fenceMark = FENCE_RE.exec(line)?.[1] ?? null;
    if (fence) {
      // Inside a fence: only a closing marker of the same character (and at
      // least as long) ends it; headings in here are code, not structure.
      if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = null;
      current.push(line);
      started = true;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      push();
      currentHeading = { level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "").trim() };
      current = [line];
      started = true;
      continue;
    }
    if (fenceMark) fence = fenceMark;
    current.push(line);
    started = true;
  }
  push();
  return sections.length > 0 ? sections : [{ body: content, heading: null }];
}

/** The outline rows the ≡ sheet lists: every section that HAS a heading, tagged
 * with its section index so a tap can scroll straight to that section's
 * measured position. */
export function outlineOf(sections: readonly NoteSection[]): { sectionIndex: number; level: number; text: string }[] {
  const rows: { sectionIndex: number; level: number; text: string }[] = [];
  sections.forEach((section, sectionIndex) => {
    if (section.heading) rows.push({ level: section.heading.level, sectionIndex, text: section.heading.text });
  });
  return rows;
}
