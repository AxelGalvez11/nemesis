// Run: deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/turn-text.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { newCanvas, withExchange } from "./canvases.ts";
import { citedSources, exchangesFromCanvas, roundContinues, visibleProse, withoutFigureMarkers } from "./turn-text.ts";

const NOW = "2026-09-01T20:00:00.000Z";

Deno.test("exchangesFromCanvas: the last N pairs, oldest first, lesson-only turns skipped", () => {
  let canvas = newCanvas("c1", NOW);
  for (let i = 1; i <= 8; i += 1) {
    canvas = withExchange(canvas, { userText: `q${i}`, assistantText: `a${i}` }, `2026-09-01T20:0${i % 10}:00Z`, `m${i}`);
  }
  const last = exchangesFromCanvas(canvas, 3);
  assertEquals(last, [{ said: "q6", replied: "a6" }, { said: "q7", replied: "a7" }, { said: "q8", replied: "a8" }]);
  assertEquals(exchangesFromCanvas(newCanvas("c2", NOW), 6), []);
});

Deno.test("visibleProse hides the decision block until it closes, then streams the prose", () => {
  assertEquals(visibleProse(""), "");
  assertEquals(visibleProse("```json\n{\"then\": \"re"), "");
  assertEquals(visibleProse("```json\n{\"then\": \"reply\"}\n```"), "");
  assertEquals(visibleProse("```json\n{\"then\": \"reply\"}\n```\n\nA diode conducts"), "A diode conducts");
  assertEquals(visibleProse("```json\n{\"then\": \"reply\"}\n```\nA diode conducts one way."), "A diode conducts one way.");
});

Deno.test("visibleProse: a reply with no fence is prose from the first byte", () => {
  assertEquals(visibleProse("Sure — a diode"), "Sure — a diode");
  assertEquals(visibleProse("Here is code:\n```json\n{}\n```\nand more"), "Here is code:\n```json\n{}\n```\nand more");
});

Deno.test("withoutFigureMarkers drops the markers and tidies the spaces", () => {
  assertEquals(withoutFigureMarkers("The heart [figure 1] has four chambers [figure 2]."), "The heart has four chambers.");
  assertEquals(withoutFigureMarkers("No markers here"), "No markers here");
});

Deno.test("citedSources resolves [n] against the numbered list, in citation order, once each", () => {
  const numbered = [
    { title: "One", url: "https://a.example/1" },
    { title: "Two", url: "https://b.example/2" },
    { title: "Three", url: "https://c.example/3" },
  ];
  assertEquals(citedSources("Fact [3]. Another [1] and again [3]. Bogus [9].", numbered).map((s) => s.title), ["Three", "One"]);
  assertEquals(citedSources("No citations", numbered), []);
});

Deno.test("roundContinues: a closed decision asking for the web hides that round's prose", () => {
  assertEquals(roundContinues("```json\n{\"needsWeb\": true, \"webQuery\": \"x\"}\n```\nI can't see the web"), true);
  assertEquals(roundContinues("```json\n{\"needsPapers\": true}\n```\n"), true);
  assertEquals(roundContinues("```json\n{\"tools\": [{\"slug\": \"a\"}]}\n```\n"), true);
  assertEquals(roundContinues("```json\n{\"needsWeb\": false}\n```\nThe answer"), false);
  assertEquals(roundContinues("```json\n{\"needsWeb\": tr"), false, "not closed yet");
  assertEquals(roundContinues("Plain prose"), false);
});
