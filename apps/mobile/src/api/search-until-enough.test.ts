import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

/** Source with comments stripped, so prose ABOUT a rule is never mistaken for the rule. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const chat = code(await Deno.readTextFile(new URL("./chat.ts", import.meta.url)));

// 🔴🔴 READ FROM THE SOURCE TEXT, NOT IMPORTED — AND THE IMPORT BROKE THE WHOLE MOBILE SUITE.
// `import { MAX_SEARCH_ROUNDS } from "./chat.ts"` puts chat.ts in the runtime module graph, and
// chat.ts imports "@/lib/chat-threads" — the tsconfig alias Deno has no import map for. Deno
// refuses the graph before a single test runs: `error: Import "@/lib/chat-threads" not a
// dependency`. It shipped anyway because the Actions runners were down the same day (2026-08-21),
// so the first CI run that ever executed this file was four days later, on the day the repo went
// public. This file already reads chat.ts as TEXT for every other assertion — and already extracts
// the Canvas's copy of this constant with the same regex below — so the value comes from the same
// channel. The parse is asserted, so a renamed constant fails loudly rather than comparing NaN.
const MAX_SEARCH_ROUNDS = Number(/MAX_SEARCH_ROUNDS = (\d+)/.exec(chat)?.[1] ?? Number.NaN);
assert(Number.isInteger(MAX_SEARCH_ROUNDS), "MAX_SEARCH_ROUNDS was renamed or is no longer a literal; re-point this extraction");

// 🔴🔴 THE PHONE SEARCHES UNTIL THE MODEL SAYS IT HAS ENOUGH, LIKE THE CANVAS.
//
// Owner, 2026-08-21: *"the phone should also follow the same as webapp canvas."* This was a single
// `if (decision.searchWeb)` — exactly one search — so a first query aimed slightly wrong ended the
// turn: the model had to answer from pages it may already have judged useless, with no way to say
// so. The Canvas has had the loop since `MAX_SEARCH_ROUNDS`; the phone had not, so one product
// looked twice as hard on one screen as on the other.

Deno.test("the search runs in a loop, and its condition is the model's own answer", () => {
  const loop = chat.slice(chat.indexOf("for (let round = 0"));
  assert(loop.length > 0, "the loop was replaced by a single pass again");
  assertStringIncludes(loop.slice(0, 120), "searched");
  // The bound is a backstop, not the decision. If the model's answer ever leaves this condition,
  // the turn searches a fixed number of times whatever it said.
  assertStringIncludes(loop.slice(0, 120), "round < MAX_SEARCH_ROUNDS");
  assertStringIncludes(chat, "searched = again.needsWeb");
});

Deno.test("what each round finds accumulates rather than replacing what came before", () => {
  // A later search narrows or corrects an earlier one. Dropping the earlier pages would make the
  // model re-find them, and would make an inline [3] in the answer point at whatever happened to
  // be third in the last batch rather than third in what it was shown.
  assertStringIncludes(chat, "const seen = new Set<string>()");
  assertStringIncludes(chat, "if (seen.has(source.url)) continue;");
  assertStringIncludes(chat, "formatWebSearchContext(found)");
});

Deno.test("the model is told how much rope is left, rather than being cut off silently", () => {
  // A model that knows it has one search left spends it on its best query. One that is cut off
  // mid-thought has already wasted it, and answers as though it had looked everywhere.
  assertStringIncludes(chat, "MAX_SEARCH_ROUNDS - round - 1");
  assertStringIncludes(chat, 'readIntent("", MAX_SEARCH_ROUNDS)');
});

Deno.test("the progress count is the running total, not the round's own haul", () => {
  // The student is watching one turn. A counter that went 12, then 9, then 14 would be describing
  // our loop rather than their search.
  assertStringIncludes(chat, "onPhase?.({ kind: \"reading\", sources: found.length })");
});

Deno.test("the bound is real, and the same number the Canvas uses", async () => {
  assert(MAX_SEARCH_ROUNDS >= 2, "one round is the single-search behaviour this replaced");
  assert(MAX_SEARCH_ROUNDS <= 6, `${MAX_SEARCH_ROUNDS} rounds is a turn nobody waits through`);
  // 🔴 ONE PRODUCT, ONE ANSWER TO "HOW HARD WILL NEMESIS LOOK". Two surfaces with different
  // budgets is the class of drift this repo has shipped three times already.
  const canvas = await Deno.readTextFile(
    new URL("../../../web/components/workspace/learn/canvas-chat.ts", import.meta.url),
  );
  const web = /MAX_SEARCH_ROUNDS = (\d+)/.exec(canvas)?.[1];
  assertEquals(String(MAX_SEARCH_ROUNDS), web, "the phone and the Canvas disagree about the budget");
});
