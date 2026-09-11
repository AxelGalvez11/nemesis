// ── A finished meeting's notes, as blocks ───────────────────────────────────────────────────────────────────────────
//
// The recording worker writes its notes as Markdown. They go through the Library's parser, as the old Library's notes
// did (library-import.ts), and become blocks inside the AI Meeting Notes block. Apart from meeting-notes.ts because the
// parser is heavy: runtime.js loads this only when a recording is done.

import { docToBlocks, nameId, type SpaceBlock } from "@/lib/space/library-import";
import { markdownToDoc } from "@/lib/workspace/note-doc";

/**
 * The notes as blocks whose top level sits inside the meeting block. Ids come from the recording job, so two tabs that
 * both see the job finish write the same blocks rather than two copies.
 */
export function summaryBlocks(markdown: string, parentId: string, jobId: string): { content: string[]; blocks: SpaceBlock[] } {
  let n = 0;
  const makeId = () => nameId(jobId, `summary:${++n}`);
  try {
    return docToBlocks(markdownToDoc(markdown), parentId, makeId);
  } catch {
    const blocks = markdown
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p): SpaceBlock => ({ id: makeId(), type: "text", title: [[p]], children: [], parent: parentId }));
    return { content: blocks.map((b) => b.id), blocks };
  }
}
