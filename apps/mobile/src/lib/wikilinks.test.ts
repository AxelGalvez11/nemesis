// Deno unit tests (repo convention) for the wikilink helpers.
// Run: deno test --no-check apps/mobile/src/lib/wikilinks.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNoteResolver,
  isWikilinkUrl,
  normalizeLinkKey,
  preprocessWikilinks,
  resolveWikilinkUrl,
  type ResolvableNote,
} from "./wikilinks.ts";

Deno.test("preprocessWikilinks rewrites plain, aliased and heading links", () => {
  assertEquals(preprocessWikilinks("see [[Beta Blockers]]"), "see [Beta Blockers](wikilink:Beta%20Blockers)");
  assertEquals(preprocessWikilinks("[[ACE Inhibitors|ACEis]]"), "[ACEis](wikilink:ACE%20Inhibitors)");
  assertEquals(preprocessWikilinks("[[Diuretics#Loop]]"), "[Diuretics](wikilink:Diuretics)");
});

Deno.test("preprocessWikilinks leaves prose and empty markers untouched", () => {
  assertEquals(preprocessWikilinks("no links here"), "no links here");
  assertEquals(preprocessWikilinks("[[ ]] [[|only label]]"), "[[ ]] [[|only label]]");
});

Deno.test("buildNoteResolver maps title, basename and path; first note wins", () => {
  const notes: ResolvableNote[] = [
    { title: "Beta Blockers", path: "Pharm/Beta Blockers.md", pathHash: "aa" },
    { title: "Beta Blockers", path: "Old/Beta Blockers.md", pathHash: "bb" }, // dup title, later
  ];
  const map = buildNoteResolver(notes);
  assertEquals(map.get("beta blockers"), "aa"); // first wins
  assertEquals(map.get("pharm/beta blockers"), "aa");
  assertEquals(map.get("old/beta blockers"), "bb"); // path is unique to the 2nd
});

Deno.test("resolveWikilinkUrl resolves by title/basename, null when unknown or external", () => {
  const map = buildNoteResolver([{ title: "Diuretics — Loop", path: "Pharm/Diuretics.md", pathHash: "d1" }]);
  assertEquals(resolveWikilinkUrl("wikilink:Diuretics%20%E2%80%94%20Loop", map), "d1"); // by title
  assertEquals(resolveWikilinkUrl("wikilink:Diuretics", map), "d1"); // by basename
  assertEquals(resolveWikilinkUrl("wikilink:Nope", map), null);
  assertEquals(resolveWikilinkUrl("https://example.com", map), null);
});

Deno.test("normalizeLinkKey and isWikilinkUrl", () => {
  assertEquals(normalizeLinkKey("  Beta Blockers.md "), "beta blockers");
  assertEquals(isWikilinkUrl("wikilink:x"), true);
  assertEquals(isWikilinkUrl("https://x"), false);
});
