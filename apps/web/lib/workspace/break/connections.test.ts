import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTIONS_LIVES,
  allConnectionsItems,
  connectionsStatus,
  evaluateGuess,
  mistakesUsed,
  remainingItems,
  solvedGroups,
  validateConnectionsPuzzle,
  type ConnectionsPuzzle,
} from "./connections";

const PUZZLE: ConnectionsPuzzle = {
  groups: [
    { title: "Coffee orders", items: ["Latte", "Mocha", "Cortado", "Flat white"] },
    { title: "___ break", items: ["Spring", "Lunch", "Tie", "Commercial"] },
    { title: "Things that pop", items: ["Quiz", "Corn", "Bubble", "Question"] },
    { title: "Rest ___", items: ["Stop", "Area", "Room", "Assured"] },
  ],
};

test("solving a group is order-independent", () => {
  const result = evaluateGuess(PUZZLE, [], ["Mocha", "Latte", "Flat white", "Cortado"]);
  assert.deepEqual(result, { kind: "solved", groupIndex: 0 });
});

test("three right = one away, fewer = miss, retry = duplicate", () => {
  assert.deepEqual(evaluateGuess(PUZZLE, [], ["Latte", "Mocha", "Cortado", "Spring"]), { kind: "one-away" });
  assert.deepEqual(evaluateGuess(PUZZLE, [], ["Latte", "Mocha", "Quiz", "Spring"]), { kind: "miss" });
  const tried = [["Latte", "Mocha", "Cortado", "Spring"]];
  assert.deepEqual(evaluateGuess(PUZZLE, tried, ["Spring", "Cortado", "Mocha", "Latte"]), { kind: "duplicate" });
});

test("state derives from the guess log", () => {
  const guesses = [
    ["Latte", "Mocha", "Cortado", "Flat white"],
    ["Spring", "Lunch", "Tie", "Quiz"],
    ["Spring", "Lunch", "Tie", "Commercial"],
  ];
  assert.deepEqual(solvedGroups(PUZZLE, guesses), [0, 1]);
  assert.equal(mistakesUsed(PUZZLE, guesses), 1);
  assert.equal(connectionsStatus(PUZZLE, guesses), "playing");
});

test("four mistakes lose, four groups win", () => {
  const wrong = ["Latte", "Spring", "Quiz", "Stop"];
  const variations = [
    wrong,
    ["Latte", "Spring", "Quiz", "Area"],
    ["Latte", "Spring", "Quiz", "Room"],
    ["Latte", "Spring", "Quiz", "Assured"],
  ];
  assert.equal(connectionsStatus(PUZZLE, variations), "lost");
  assert.equal(mistakesUsed(PUZZLE, variations), CONNECTIONS_LIVES);
  const solved = PUZZLE.groups.map((group) => group.items);
  assert.equal(connectionsStatus(PUZZLE, solved), "won");
});

test("remaining tiles keep board order and drop solved groups", () => {
  const order = allConnectionsItems(PUZZLE).reverse();
  const remaining = remainingItems(PUZZLE, [["Latte", "Mocha", "Cortado", "Flat white"]], order);
  assert.equal(remaining.length, 12);
  assert.ok(!remaining.includes("Latte"));
  assert.equal(remaining[0], "Assured"); // reverse order preserved
});

test("bank validation catches shape mistakes", () => {
  assert.deepEqual(validateConnectionsPuzzle(PUZZLE), []);
  const broken = validateConnectionsPuzzle({
    groups: [
      { title: "A", items: ["x", "y", "z", "x"] },
      { title: "A", items: ["p", "q", "r", "s"] },
      { title: "C", items: ["1", "2", "3", "4"] },
      { title: "D", items: ["5", "6", "7"] },
    ],
  });
  assert.ok(broken.some((problem) => problem.includes("overlap")));
  assert.ok(broken.some((problem) => problem.includes("unique")));
  assert.ok(broken.some((problem) => problem.includes("4 items")));
});
