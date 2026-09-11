// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/canvas-find.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { filterTurnsByQuery, turnMatchesQuery } from "./canvas-find.ts";

Deno.test("turnMatchesQuery: an empty query matches everything", () => {
  assertEquals(turnMatchesQuery({ said: "hello", reply: "hi there" }, ""), true);
  assertEquals(turnMatchesQuery({ said: null, reply: "" }, "   "), true);
});

Deno.test("turnMatchesQuery: matches the question, the answer, or neither — case-insensitive", () => {
  const turn = { said: "What is promissory estoppel?", reply: "It is a doctrine that..." };
  assertEquals(turnMatchesQuery(turn, "promissory"), true);
  assertEquals(turnMatchesQuery(turn, "DOCTRINE"), true);
  assertEquals(turnMatchesQuery(turn, "negligence"), false);
});

Deno.test("turnMatchesQuery: a null said (an opener the app asked itself) still checks the reply", () => {
  assertEquals(turnMatchesQuery({ said: null, reply: "Welcome back" }, "welcome"), true);
});

Deno.test("filterTurnsByQuery: keeps original order, drops non-matches", () => {
  const turns = [
    { id: "a", said: "diode basics", reply: "..." },
    { id: "b", said: "promissory estoppel", reply: "..." },
    { id: "c", said: "more on diodes", reply: "..." },
  ];
  assertEquals(filterTurnsByQuery(turns, "diode").map((t) => t.id), ["a", "c"]);
});
