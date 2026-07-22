// Deno unit tests (repo convention) for the phone's cloze renderer — mirrors
// apps/web/lib/workspace/study-cloze.test.ts, plus the image-answer shape that
// the Captain Hook starter deck actually stores and that broke on the phone.
// Run: deno test --no-check apps/mobile/src/lib/study-cloze.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { activeClozeNumber, clozeNumbers, hasCloze, renderCloze } from "./study-cloze.ts";

// Trimmed from a real study_cards row (deck "Captain Hook", card_type "cloze"):
// the answer to the blank IS an image, and the prompt carries another image
// plus markdown emphasis. Rendering this as plain text is what the owner saw.
const IMAGE_CLOZE =
  "![](https://x.supabase.co/m484.png)\n\nGive the equation for *capacitance*:\n\n{{c1:: ![](https://x.supabase.co/m284.png) }}";

Deno.test("hasCloze detects Anki syntax and ignores ordinary card text", () => {
  assertEquals(hasCloze(IMAGE_CLOZE), true);
  assertEquals(hasCloze("What is the capital of France?"), false);
  // A markdown image alone must NOT read as a cloze — that bracket is what made
  // the old front/back diff heuristic false-fire on these very cards.
  assertEquals(hasCloze("![](https://x.supabase.co/m484.png)"), false);
});

Deno.test("unrevealed active cloze becomes a bold blank, keeping the rest of the card", () => {
  const out = renderCloze(IMAGE_CLOZE, 1, false);
  assertEquals(out.includes("**[...]**"), true);
  assertEquals(out.includes("{{c1"), false);
  // The prompt's own image and emphasis survive untouched, so markdown can
  // still render them.
  assertEquals(out.includes("![](https://x.supabase.co/m484.png)"), true);
  assertEquals(out.includes("*capacitance*"), true);
});

Deno.test("revealing swaps the blank for the answer — an image answer included", () => {
  const out = renderCloze(IMAGE_CLOZE, 1, true);
  assertEquals(out.includes("**[...]**"), false);
  assertEquals(out.includes("![](https://x.supabase.co/m284.png)"), true);
  assertEquals(out.includes("{{c"), false);
});

Deno.test("an image answer is NOT wrapped in ** — the asterisks would show up as text", () => {
  // `** ![](url) **` is not a valid emphasis run, so markdown leaves the
  // asterisks literal and they float above and below the picture. Regression
  // guard for exactly that (seen on screenshot before the fix).
  const out = renderCloze(IMAGE_CLOZE, 1, true);
  assertEquals(out.includes("**"), false);
  assertEquals(out.includes("![](https://x.supabase.co/m284.png)"), true);
});

Deno.test("a plain text answer still bolds, and loses the authored padding", () => {
  assertEquals(renderCloze("Capital: {{c1:: Paris }}", 1, true), "Capital: **Paris**");
  // Multi-line answers skip emphasis for the same reason images do.
  assertEquals(renderCloze("A: {{c1::one\ntwo}}", 1, true), "A: one\ntwo");
});

Deno.test("a hint is the blank's text when one is authored", () => {
  assertEquals(renderCloze("The capital is {{c1::Paris::a city}}.", 1, false), "The capital is **[a city]**.");
  assertEquals(renderCloze("The capital is {{c1::Paris::a city}}.", 1, true), "The capital is **Paris**.");
});

Deno.test("inactive deletions always show their answer, so only one blank is tested at a time", () => {
  const text = "{{c1::Alpha}} and {{c2::Beta}}";
  assertEquals(renderCloze(text, 1, false), "**[...]** and Beta");
  assertEquals(renderCloze(text, 2, false), "Alpha and **[...]**");
});

Deno.test("the active number rotates with repetitions so every blank gets exercised", () => {
  const text = "{{c1::Alpha}} and {{c2::Beta}}";
  assertEquals(clozeNumbers(text), [1, 2]);
  assertEquals(activeClozeNumber(text, 0), 1);
  assertEquals(activeClozeNumber(text, 1), 2);
  assertEquals(activeClozeNumber(text, 2), 1);
  // Never trust a stored counter: negatives and NaN fall back to the first.
  assertEquals(activeClozeNumber(text, -3), 1);
  assertEquals(activeClozeNumber(text, Number.NaN), 1);
  assertEquals(activeClozeNumber("no cloze here", 0), null);
});

Deno.test("every marker is stripped even when none is active", () => {
  // Guards the worst outcome: raw {{c1::…}} reaching the screen, which is the
  // bug this module exists to fix.
  assertEquals(renderCloze("{{c1::Alpha}} and {{c2::Beta}}", null, false), "Alpha and Beta");
  assertEquals(renderCloze(IMAGE_CLOZE, null, false).includes("{{c"), false);
});
