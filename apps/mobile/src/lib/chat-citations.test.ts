// Deno unit tests (repo convention) for the phone's citation-marker rewrite.
// Ported alongside the module from web's chat-citations.test.ts so both surfaces
// prove identical grouping/edge behaviour.
// Run: deno test --no-check apps/mobile/src/lib/chat-citations.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { citationsToMarkdown, parseCitationHref } from "./chat-citations.ts";

Deno.test("an in-range marker becomes a cite link", () => {
  assertEquals(
    citationsToMarkdown("Argentina won in 2022 [1].", 3),
    "Argentina won in 2022 [1](#nemesis-cite=1).",
  );
});

Deno.test("every in-range marker converts", () => {
  assertEquals(
    citationsToMarkdown("First [1]. Second [2].", 2),
    "First [1](#nemesis-cite=1). Second [2](#nemesis-cite=2).",
  );
});

Deno.test("no sources means no rewriting", () => {
  assertEquals(citationsToMarkdown("See item [1] of the list.", 0), "See item [1] of the list.");
});

Deno.test("out-of-range and zero markers stay plain text (no fabricated pills)", () => {
  assertEquals(citationsToMarkdown("Claim [9].", 3), "Claim [9].");
  assertEquals(citationsToMarkdown("Claim [0].", 3), "Claim [0].");
});

Deno.test("an existing markdown link is not double-wrapped", () => {
  assertEquals(
    citationsToMarkdown("See [1](https://example.com).", 3),
    "See [1](https://example.com).",
  );
});

Deno.test("inline code and fenced blocks are left untouched", () => {
  assertEquals(citationsToMarkdown("Use `arr[1]` to index.", 3), "Use `arr[1]` to index.");
  assertEquals(
    citationsToMarkdown("```js\nconst x = arr[1];\n```", 3),
    "```js\nconst x = arr[1];\n```",
  );
});

Deno.test("prose converts while a fenced block in between is preserved", () => {
  assertEquals(
    citationsToMarkdown("Before [1].\n```js\narr[2]\n```\nAfter [2].", 2),
    "Before [1](#nemesis-cite=1).\n```js\narr[2]\n```\nAfter [2](#nemesis-cite=2).",
  );
});

Deno.test("adjacent markers merge into one grouped pill", () => {
  assertEquals(
    citationsToMarkdown("Argentina won [1][2].", 3),
    "Argentina won [1](#nemesis-cite=1,2).",
  );
});

Deno.test("a space-separated run merges, swallowing the gap", () => {
  assertEquals(
    citationsToMarkdown("Argentina won [1] [2].", 3),
    "Argentina won [1](#nemesis-cite=1,2).",
  );
});

Deno.test("a run of three merges", () => {
  assertEquals(
    citationsToMarkdown("Sources [1][2][3] agree.", 3),
    "Sources [1](#nemesis-cite=1,2,3) agree.",
  );
});

Deno.test("a comma between markers keeps them separate", () => {
  assertEquals(
    citationsToMarkdown("Both [1], [2] hold.", 3),
    "Both [1](#nemesis-cite=1), [2](#nemesis-cite=2) hold.",
  );
});

Deno.test("markers separated by a newline stay separate", () => {
  assertEquals(
    citationsToMarkdown("First [1]\n[2] next.", 3),
    "First [1](#nemesis-cite=1)\n[2](#nemesis-cite=2) next.",
  );
});

Deno.test("an out-of-range marker inside a run breaks the group and stays literal", () => {
  assertEquals(
    citationsToMarkdown("Mix [1][9][2] here.", 3),
    "Mix [1](#nemesis-cite=1)[9][2](#nemesis-cite=2) here.",
  );
});

Deno.test("a repeated index in a run is de-duplicated", () => {
  assertEquals(citationsToMarkdown("Dupe [1][1].", 3), "Dupe [1](#nemesis-cite=1).");
});

Deno.test("a lone marker is unchanged by grouping", () => {
  assertEquals(citationsToMarkdown("Solo [2].", 3), "Solo [2](#nemesis-cite=2).");
});

Deno.test("parseCitationHref reads one or many indices, rejects non-citations", () => {
  assertEquals(parseCitationHref("#nemesis-cite=3"), [3]);
  assertEquals(parseCitationHref("#nemesis-cite=1,2"), [1, 2]);
  assertEquals(parseCitationHref("#nemesis-cite=1,2,3"), [1, 2, 3]);
  assertEquals(parseCitationHref("https://example.com"), []);
  assertEquals(parseCitationHref(null), []);
  assertEquals(parseCitationHref("#nemesis-cite="), []);
});
