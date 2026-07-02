import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { meterForPoint } from "./claim-meter.ts";
import type { Citation } from "./answer.ts";

const cite = (tag: string, over: Partial<Citation>): Citation => ({
  chunk_tag: tag, source_id: tag, source_type: "pubmed_oa", title: "T", section: null,
  url: null, license: null, published_date: "2022-01-01", retrieved_at: null, ...over,
});

Deno.test("one meta-analysis with direct support outscores three weak mentions (no vote counting)", () => {
  const meta = meterForPoint(["1"], [cite("1", { publication_types: ["Meta-Analysis"], support_level: "direct" })]);
  const mentions = meterForPoint(["2", "3", "4"], [
    cite("2", { support_level: "weak" }), cite("3", { support_level: "weak" }), cite("4", { support_level: "weak" }),
  ]);
  if (!meta || !mentions) throw new Error("expected meters");
  assertEquals(meta.score > mentions.score, true);
  assertEquals(meta.label, "strong");
});

Deno.test("label bands", () => {
  const rct = meterForPoint(["1"], [cite("1", { publication_types: ["Randomized Controlled Trial"], support_level: "direct" })]);
  assertEquals(rct?.label, "strong");
  const weak = meterForPoint(["1"], [cite("1", { support_level: "weak" })]);
  assertEquals(weak?.label, "limited");
});

Deno.test("null when no citations resolve", () => {
  assertEquals(meterForPoint([], []), null);
  assertEquals(meterForPoint(["9"], [cite("1", {})]), null);
});
