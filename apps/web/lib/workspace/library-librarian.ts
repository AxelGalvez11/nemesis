"use client";

// The librarian: what makes the Library MAINTAINED instead of accumulated.
//
// Owner 2026-08-03: "When new material is uploaded, it reads it, finds
// related notes, updates existing pages, creates new pages when needed, and
// adds links between related topics… instead of Lecture 1.pdf, Lecture
// 2.pptx, Notes-final-v2.docx the user gets clean topic pages."
//
// One model pass per uploaded document: the extracted text plus the student's
// OWN structure go in, a filing plan comes out — a folder, one or more clean
// topic pages cross-linked with [[wiki links]], and up to a few "Related"
// links added to existing notes. Trust rules from the collaborative-notes
// blueprint hold: the librarian CREATES pages and maintains link metadata,
// but it never rewrites prose the student wrote — content edits to existing
// pages stay a suggestion feature for later.
//
// TWO HARD RULES, both enforced in code, not just in the prompt:
// - FIELD-AGNOSTIC. The plan files into the student's own folder names or
//   names a new folder after what the DOCUMENT says — there is no subject
//   list anywhere here (law and mechanical engineering must work equally).
// - PERSONAL IS PRIVATE. Anything under a top-level "Personal" folder is
//   invisible to the librarian and can never be a filing target: journal
//   entries do not get cross-linked into coursework.
//
// Every failure — model down, malformed plan, over-limit — falls back to the
// plain one-note import, so organizing can only ever be an upgrade.

import { coverageNoticeForModel, type ExtractionCoverage } from "@nemesis/shared";

import type { WireMsg } from "@/lib/workspace/chat-api";
import { normalizeLibraryFolder, safeLibraryTitle } from "@/lib/workspace/library-links";

/** The engine this prompt was written against — same valve as chat/recordings. */
export const LIBRARIAN_MODEL = "deepseek-chat";

/** How much extracted document rides the call; the head carries the syllabus/
 *  outline half of most documents, so the clip keeps the START. */
export const LIBRARIAN_TEXT_CHARS = 60_000;

const MAX_PAGES = 8;
const MAX_PAGE_CHARS = 20_000;
const MAX_RELATED = 3;
const MAX_OUTLINE_LINES = 200;

export interface LibrarianPage {
  title: string;
  markdown: string;
  /** Where in the source this page came from — the provenance contract's
   *  location shapes ({page}, {pages:[a,b]}, {slide}, {slides:[a,b]}). */
  location: Record<string, unknown> | null;
}

export interface LibrarianRelated {
  /** Path of an EXISTING note (validated against the library) that should
   *  gain a Related link to one of the new pages. */
  path: string;
  /** The wiki-link target to add there — a new page title. */
  link: string;
}

export interface LibrarianPlan {
  folder: string;
  pages: LibrarianPage[];
  related: LibrarianRelated[];
  summary: string;
}

function isPersonalPath(path: string): boolean {
  return (path.split("/")[0] ?? "").trim().toLocaleLowerCase() === "personal";
}

/**
 * The structure the librarian is allowed to see: folder paths and note paths,
 * with everything under a top-level Personal folder removed before the model
 * ever sees it. Clamped so a huge library stays a cheap call.
 */
export function librarianOutline(notePaths: readonly string[], folderPaths: readonly string[]): string {
  const folders = folderPaths.filter((path) => path.trim() && !isPersonalPath(path)).map((path) => `${path}/`);
  const notes = notePaths.filter((path) => path.trim() && !isPersonalPath(path));
  const lines = [...folders, ...notes].slice(0, MAX_OUTLINE_LINES);
  return lines.join("\n");
}

/** The single filing pass. Pure, so tests can pin the instructions. */
export function buildLibrarianMessages(input: {
  fileName: string;
  text: string;
  outline: string;
  /** What the extractor managed to read. Absent means unknown — an older
   *  deployment or a lane that does not report — and is stated as nothing at
   *  all rather than as a clean bill of health. */
  coverage?: ExtractionCoverage;
}): WireMsg[] {
  const kept = input.text.slice(0, LIBRARIAN_TEXT_CHARS);
  const clipped = { dropped: input.text.length - kept.length, text: kept };
  return [
    {
      role: "system",
      content:
        "You are the librarian of one student's personal wiki. Any subject or profession — law, engineering, history, nursing, trades — never assume one. " +
        "You receive the text extracted from a document they uploaded, plus the wiki's current structure (folder paths ending in /, then note paths). " +
        "Turn the document into clean wiki pages a student would revise from, and file them where they belong. " +
        "Filing rules: if one of THEIR existing folders clearly fits, use it (their names, verbatim); otherwise name a new folder after the subject as the DOCUMENT itself presents it. Never invent a course name. Never file under Personal. " +
        "Page rules: split into focused topic pages when the document genuinely covers several topics; one page is fine for one topic; at most " + String(MAX_PAGES) + ". " +
        "Each page is markdown that stands alone: the point, the mechanism or reasoning, and the examples, numbers and definitions EXACTLY as the document gives them. Never add material the document does not contain. " +
        "Use $...$ and $$ fenced blocks for any formulas. Connect ideas with [[wiki links]]: link the new pages to each other where they relate, and to existing note titles from the structure when genuinely related — a link is a claim, not decoration. " +
        "Do not begin a page with a heading that just repeats its title. " +
        "Also list up to " + String(MAX_RELATED) + " EXISTING notes (exact paths from the structure) that should gain a Related link pointing at one of your new pages. Only notes where the connection is real. " +
        'Reply with STRICT JSON only, no code fences, in exactly this shape: {"folder": "Course/Topic", "summary": "one plain sentence describing what was filed", "pages": [{"title": "...", "markdown": "...", "location": {"pages": [1, 4]}}], "related": [{"path": "existing/note path.md", "link": "New page title"}]}. ' +
        "location is optional per page; when the document has page or slide numbers use {\"page\": n}, {\"pages\": [a, b]}, {\"slide\": n} or {\"slides\": [a, b]}; omit it otherwise.",
    },
    {
      role: "user",
      content: [
        `Uploaded file: ${input.fileName}`,
        input.outline ? `Current wiki structure:\n${input.outline}` : "The wiki is empty so far.",
        // 🔴 TWO WAYS THIS DOCUMENT CAN BE INCOMPLETE, AND THE LIBRARIAN MUST
        // KNOW ABOUT BOTH — it is writing the pages a student will revise from,
        // so a page presented as covering a lecture it only partly saw is worse
        // than a page that says which part is missing.
        //
        //   the extractor could not read some of it  -> coverageNoticeForModel
        //   the text is longer than this prompt      -> the slice below
        //
        // The slice was silent until now: a 300-slide deck was filed from its
        // first LIBRARIAN_TEXT_CHARS characters and the resulting pages claimed
        // to be the document.
        ...(input.coverage ? [coverageNoticeForModel(input.coverage) ?? ""] : []),
        clipped.dropped > 0
          ? `[This document is longer than what follows: ${clipped.text.length.toLocaleString()} of ${input.text.length.toLocaleString()} characters are shown. Do not write pages that claim to cover what you cannot see, and do not invent an ending.]`
          : "",
        `Document text:\n${clipped.text}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

function asLocation(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Parse and DISARM the model's plan. Structural problems return null (the
 * caller falls back to the plain import); over-limits are clamped; anything
 * aimed at Personal is rejected outright.
 */
export function parseLibrarianPlan(raw: string, existingNotePaths: readonly string[]): LibrarianPlan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const shape = parsed as Record<string, unknown>;

  const folder = normalizeLibraryFolder(typeof shape.folder === "string" ? shape.folder : "");
  if (!folder || isPersonalPath(folder) || folder.split("/").length > 3) return null;

  if (!Array.isArray(shape.pages) || shape.pages.length === 0) return null;
  const pages: LibrarianPage[] = [];
  for (const entry of shape.pages.slice(0, MAX_PAGES)) {
    if (typeof entry !== "object" || entry === null) return null;
    const page = entry as Record<string, unknown>;
    const title = safeLibraryTitle(typeof page.title === "string" ? page.title : "");
    const markdown = typeof page.markdown === "string" ? page.markdown.trim().slice(0, MAX_PAGE_CHARS) : "";
    if (!title || title === "Untitled note" || !markdown) return null;
    pages.push({ location: asLocation(page.location), markdown, title });
  }

  const knownPaths = new Map(existingNotePaths.map((path) => [path.toLocaleLowerCase(), path] as const));
  const related: LibrarianRelated[] = [];
  if (Array.isArray(shape.related)) {
    for (const entry of shape.related) {
      if (related.length >= MAX_RELATED) break;
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const requested = typeof item.path === "string" ? item.path.trim() : "";
      const resolved = knownPaths.get(requested.toLocaleLowerCase());
      const link = typeof item.link === "string" ? item.link.trim() : "";
      if (!resolved || !link || isPersonalPath(resolved)) continue;
      related.push({ link, path: resolved });
    }
  }

  const summary = (typeof shape.summary === "string" ? shape.summary : "").trim().slice(0, 300);
  return { folder, pages, related, summary };
}

/**
 * Add a Related link to an existing note's markdown. Metadata maintenance
 * only: the student's prose is untouched, the link lands in (or starts) a
 * "## Related" section at the end. A note that already mentions the target
 * anywhere comes back unchanged, so re-imports never pile up duplicates.
 */
export function appendRelatedLink(content: string, target: string): string {
  if (content.includes(`[[${target}]]`) || content.includes(`[[${target}|`)) return content;
  const trimmed = content.replace(/\s+$/, "");
  const lastHeading = trimmed.split("\n").filter((line) => /^#{1,6}\s/.test(line)).pop() ?? "";
  if (/^##\s+Related\s*$/i.test(lastHeading.trim())) {
    return `${trimmed}\n- [[${target}]]\n`;
  }
  return `${trimmed ? `${trimmed}\n\n` : ""}## Related\n\n- [[${target}]]\n`;
}

export interface ApplyLibrarianDeps {
  createNote: (input: { title: string; folder: string; content: string }) => Promise<{ id: string; path: string }>;
  saveNote: (input: { id: string; title: string; content: string }) => Promise<unknown>;
  findNote: (path: string) => { id: string; title: string; content: string } | null;
  /** Best-effort provenance stamp for one created page; failures are the
   *  caller's to swallow (the table is read-only until its migration lands). */
  recordSource?: (noteId: string, location: Record<string, unknown> | null) => Promise<void>;
}

/**
 * Carry out a plan with the ordinary store verbs. Returns the path of the
 * first created page (what the importer opens). Related-link maintenance
 * failures are non-fatal — pages landing matters more than a link line.
 */
export async function applyLibrarianPlan(plan: LibrarianPlan, deps: ApplyLibrarianDeps): Promise<string> {
  let firstPath = "";
  for (const page of plan.pages) {
    const created = await deps.createNote({ content: page.markdown, folder: plan.folder, title: page.title });
    if (!firstPath) firstPath = created.path;
    if (deps.recordSource) {
      try {
        await deps.recordSource(created.id, page.location);
      } catch {
        // Provenance is still read-only in production; pills light up once
        // the migration is applied. The page itself is already saved.
      }
    }
  }
  for (const relation of plan.related) {
    try {
      const existing = deps.findNote(relation.path);
      if (!existing) continue;
      const updated = appendRelatedLink(existing.content, relation.link);
      if (updated !== existing.content) {
        await deps.saveNote({ content: updated, id: existing.id, title: existing.title });
      }
    } catch {
      // Non-fatal by design.
    }
  }
  return firstPath;
}
