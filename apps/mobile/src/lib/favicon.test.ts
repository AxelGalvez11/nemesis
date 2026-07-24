// Deno unit tests (repo convention) for the source-pill domain helpers.
// Run: deno test --no-check apps/mobile/src/lib/favicon.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { faviconUrl, hostnameOf, sourceLabel } from "./favicon.ts";

Deno.test("hostnameOf pulls the full host, subdomain and all", () => {
  assertEquals(hostnameOf("https://en.wikipedia.org/wiki/Argentina"), "en.wikipedia.org");
  assertEquals(hostnameOf("https://fifa.com/"), "fifa.com");
  // userinfo, port and query must not leak into the host.
  assertEquals(hostnameOf("https://user:pw@pubmed.ncbi.nlm.nih.gov:443/x?q=1"), "pubmed.ncbi.nlm.nih.gov");
});

Deno.test("hostnameOf returns null for anything without a real host", () => {
  assertEquals(hostnameOf(""), null);
  assertEquals(hostnameOf(null), null);
  assertEquals(hostnameOf(undefined), null);
  // A bare word is not a URL — no scheme, so no host (never echo the raw string).
  assertEquals(hostnameOf("not a url"), null);
});

Deno.test("sourceLabel strips language/mirror parts and capitalizes the real name", () => {
  assertEquals(sourceLabel("https://en.wikipedia.org/wiki/X"), "Wikipedia");
  assertEquals(sourceLabel("https://www.fifa.com/"), "Fifa");
  assertEquals(sourceLabel("https://pubmed.ncbi.nlm.nih.gov/123"), "Pubmed");
  assertEquals(sourceLabel("https://m.example.com/"), "Example");
});

Deno.test("sourceLabel is null when there is no host to name", () => {
  assertEquals(sourceLabel(""), null);
  assertEquals(sourceLabel(null), null);
});

Deno.test("faviconUrl builds the s2 request with the host encoded", () => {
  assertEquals(
    faviconUrl("en.wikipedia.org"),
    "https://www.google.com/s2/favicons?domain=en.wikipedia.org&sz=32",
  );
  // Size is overridable for the larger sheet icon.
  assertEquals(faviconUrl("fifa.com", 64).includes("sz=64"), true);
});
