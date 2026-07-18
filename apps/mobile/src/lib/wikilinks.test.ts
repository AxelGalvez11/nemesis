// Deno unit tests (repo convention) for the wikilink helpers.
// Run: deno test --no-check apps/mobile/src/lib/wikilinks.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNoteResolver,
  isExternalUrl,
  normalizeLinkKey,
  preprocessWikilinks,
  resolveInternalHref,
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

Deno.test("normalizeLinkKey and isExternalUrl", () => {
  assertEquals(normalizeLinkKey("  Beta Blockers.md "), "beta blockers");
  assertEquals(isExternalUrl("https://x"), true);
  assertEquals(isExternalUrl("mailto:a@b.co"), true);
  assertEquals(isExternalUrl("wikilink:x"), false);
  assertEquals(isExternalUrl("Some Note.md"), false);
});

Deno.test("resolveInternalHref: wikilinks AND bare relative markdown links both resolve", () => {
  const map = buildNoteResolver([{ title: "Beta Blockers", path: "Pharm/Beta Blockers.md", pathHash: "bb" }]);
  // wikilink: scheme (from the preprocessor).
  assertEquals(resolveInternalHref("wikilink:Beta%20Blockers", map), "bb");
  // Bare relative markdown link the agent may write — the case that used to die
  // silently: not a wikilink, not external, so nothing handled it.
  assertEquals(resolveInternalHref("Beta Blockers.md", map), "bb"); // by basename
  assertEquals(resolveInternalHref("Pharm/Beta%20Blockers.md", map), "bb"); // by full path, encoded
  assertEquals(resolveInternalHref("./Beta Blockers", map), "bb"); // leading ./ stripped
  assertEquals(resolveInternalHref("Beta Blockers#Dosing", map), "bb"); // heading anchor stripped
  // External and unresolved both return null (caller opens vs. flashes a notice).
  assertEquals(resolveInternalHref("https://example.com", map), null);
  assertEquals(resolveInternalHref("Missing Note.md", map), null);
});
