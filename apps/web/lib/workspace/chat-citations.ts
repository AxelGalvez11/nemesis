// The web's door to the citation-marker vocabulary: `[1]` in a search-grounded answer, in and out
// of the `#nemesis-cite=` links `chat-markdown.tsx` paints as inline favicon pills.
//
// THE LOGIC IS NOT HERE ANY MORE. It lives in `@nemesis/shared/workspace/chat-citations`, shared
// byte-for-byte with the phone, and this file is a barrel that re-exports it unchanged. The
// reasoning that used to sit above each regex — the in-range rule, the code-span passthrough, the
// `n.extra` channel, the ChatGPT measurement behind grouping — moved with the code, so it stays
// next to what it describes.
//
// 🔴 WHY IT MOVED (owner 2026-08-21). This file and `apps/mobile/src/components/canvas/
// citation-markers.ts` were a hand-port of one another: same two regexes, same functions,
// maintained twice. Two independent verifiers found the same two bugs sitting in BOTH copies — a
// run pattern whose `\s*` separator ate paragraph breaks and deleted a citation, and a marker
// pattern that rewrote markdown reference links into broken text plus a bogus pill. That is what a
// hand-port buys: fix one copy and ship a phone and a web that disagree about what "[1]" means.
// Both fixes now land once, in the shared module, which carries the reproductions.
//
// 🔴 THE PATH STAYS BECAUSE THE IMPORT STAYS (owner 2026-08-21). `chat-markdown.tsx` imports
// `@/lib/workspace/chat-citations`, and `chat-citations.test.ts` and `chat-citations-grouping.test.ts`
// both import `./chat-citations`. Keeping this barrel means none of the three changed, so the tests
// still exercise the path production actually uses rather than a shortcut to the package.
//
// The phone-only helpers (`citationTarget`, `isBareUrlLink`) come through too. Nothing on the web
// calls them today — chat here draws a bare dot, with no pill text to protect — but re-exporting
// the whole vocabulary is what keeps the two doors identical, which was the entire point.
export {
  citationTarget,
  citationsToMarkdown,
  groupCitationRuns,
  isBareUrlLink,
  type CitationTarget,
} from "@nemesis/shared/workspace/chat-citations";
