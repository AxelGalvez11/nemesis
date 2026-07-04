import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { displayReportTitle } from "./report-title.ts";

Deno.test("report-title: strips the trailing Focus: scoping suffix", () => {
  assertEquals(
    displayReportTitle("does creatine help cognition\n\nFocus: older adults; memory"),
    "Does creatine help cognition",
  );
});

Deno.test("report-title: collapses internal + trailing whitespace", () => {
  assertEquals(displayReportTitle("  metformin   and\n\n\naging  "), "Metformin and aging");
});

Deno.test("report-title: uppercases the first letter", () => {
  assertEquals(displayReportTitle("is retatrutide effective"), "Is retatrutide effective");
});

Deno.test("report-title: leaves an already-capitalized title alone (aside from trim)", () => {
  assertEquals(displayReportTitle("GLP-1 evidence review"), "GLP-1 evidence review");
});

Deno.test("report-title: truncates past 90 chars with an ellipsis", () => {
  const long = "a".repeat(120);
  const out = displayReportTitle(long);
  assertEquals(out.length, 90);
  assertEquals(out.endsWith("…"), true);
  assertEquals(out.startsWith("A"), true); // first letter uppercased
});

Deno.test("report-title: empty input yields empty string (no crash)", () => {
  assertEquals(displayReportTitle(""), "");
  assertEquals(displayReportTitle("   "), "");
});

Deno.test("report-title: a Focus-only tail leaves a clean title", () => {
  assertEquals(displayReportTitle("semaglutide safety\nFocus: pregnancy"), "Semaglutide safety");
});
