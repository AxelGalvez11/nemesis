import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseOpenAlexWork, parseSciteTallies } from "./providers.ts";

Deno.test("parseOpenAlexWork extracts doi, retraction, cited_by", () => {
  const r = parseOpenAlexWork({
    ids: { doi: "https://doi.org/10.1001/JAMA.2023.1" },
    is_retracted: true,
    cited_by_count: 96,
  });
  assertEquals(r, { doi: "10.1001/jama.2023.1", retracted: true, cited_by: 96 });
});

Deno.test("parseOpenAlexWork tolerates missing fields", () => {
  assertEquals(parseOpenAlexWork({}), { doi: null, retracted: false, cited_by: null });
  assertEquals(parseOpenAlexWork(null), { doi: null, retracted: false, cited_by: null });
});

Deno.test("parseSciteTallies maps the tallies shape", () => {
  const t = parseSciteTallies({ total: 120, supporting: 41, contradicting: 3, mentioning: 76 });
  assertEquals(t, { supporting: 41, contrasting: 3, mentioning: 76 });
});

Deno.test("parseSciteTallies returns null on junk", () => {
  assertEquals(parseSciteTallies(null), null);
  assertEquals(parseSciteTallies({ error: "not found" }), null);
});
