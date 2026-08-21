// The phone's door to the citation-marker vocabulary: `[1]` in a grounded answer, in and out of the
// `#nemesis-cite=` links `MessageBody.tsx` paints as source chips.
//
// THE LOGIC IS NOT HERE ANY MORE. It lives in `@nemesis/shared/workspace/chat-citations`, shared
// byte-for-byte with the web chat surface, and this file is a barrel that re-exports it unchanged.
// Everything the old header argued about the regexes, the in-range rule, the `n.extra` channel and
// the bare-URL test now lives in that module, next to the code it describes.
//
// 🔴 THE FILE STAYS HERE BECAUSE THE IMPORT PATH IS THE POINT (owner 2026-08-21, restating the
// 2026-08-20 decision it replaces). Everything about "this answer came from somewhere" sits in this
// folder — the favicon resolver, the site naming, the pill list, the popup's rows — and every one
// of those is imported by surfaces that are not the canvas (`MessageBody.tsx` draws chat, notes,
// review and flashcards through it). Splitting the marker parsing away from the source resolution
// it exists to reach would put two halves of one idea in two places, which is exactly how the phone
// ended up with two favicon resolvers. Sharing the IMPLEMENTATION with the web does not change
// that: `@/components/canvas/citation-markers` is still where a phone author looks and still what
// `MessageBody.tsx` imports, and that import did not change when the logic moved.
//   TRIED AND REJECTED: deleting this file and re-pointing `MessageBody.tsx` at the shared package.
//   It saves four lines and costs the reader the folder-level story above — and it would have edited
//   a file that a different lane owns.
//
// 🔴 WHY THE LOGIC MOVED AT ALL (owner 2026-08-21). This file and `apps/web/lib/workspace/
// chat-citations.ts` were a hand-port of one another: same two regexes, same functions, maintained
// twice. Two independent verifiers found the same two bugs sitting in BOTH copies — a run pattern
// whose `\s*` separator ate paragraph breaks, and a marker pattern that mangled markdown reference
// links. Both fixes now land once. The shared module carries the reproductions.
export {
  citationTarget,
  citationsToMarkdown,
  groupCitationRuns,
  isBareUrlLink,
  type CitationTarget,
} from "@nemesis/shared/workspace/chat-citations";
