import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMissionEmail } from "./mission-email.ts";

const args = {
  question: "How effective is tirzepatide for weight loss?",
  cadence: "weekly" as const,
  reportTitle: "How effective is tirzepatide for weight loss?",
  sources: 44,
  reportUrl: "https://app.pharmaorb.app/app/reports/abc-123",
  manageUrl: "https://app.pharmaorb.app/app/monitor",
};

Deno.test("subject names the cadence and the topic", () => {
  const m = buildMissionEmail(args);
  assertEquals(m.subject, "Your weekly research report is ready: How effective is tirzepatide for weight loss?");
});

Deno.test("html and text both carry the report link, source count, and manage link", () => {
  const m = buildMissionEmail(args);
  for (const bodyText of [m.html, m.text]) {
    assertStringIncludes(bodyText, "44 sources");
    assertStringIncludes(bodyText, args.reportUrl);
    assertStringIncludes(bodyText, args.manageUrl);
  }
});

Deno.test("html escapes a question containing markup", () => {
  const m = buildMissionEmail({ ...args, question: "a<b>&c", reportTitle: "a<b>&c" });
  assertStringIncludes(m.html, "a&lt;b&gt;&amp;c");
});

Deno.test("long subject is trimmed to 140 chars", () => {
  const long = "x".repeat(300);
  const m = buildMissionEmail({ ...args, question: long, reportTitle: long });
  assertEquals(m.subject.length <= 140, true);
});
