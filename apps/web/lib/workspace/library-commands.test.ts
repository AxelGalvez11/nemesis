import assert from "node:assert/strict";
import test from "node:test";

import { commandCaretOffset, LIBRARY_COMMANDS, matchLibraryCommands, slashTriggerAt } from "./library-commands";

// A slash is an ordinary character. Popping a menu over "and/or" or a date would
// make the editor feel possessed, and that is the boundary users actually hit.
test("an ordinary slash in prose never opens the menu", () => {
  for (const [line, column] of [
    ["and/or", 6],
    ["see https://example.com/docs", 28],
    ["due 12/3", 8],
    ["a / b", 5],
    ["word /", 6],
  ] as const) {
    assert.equal(slashTriggerAt(line, column), null, line);
  }
});

test("a slash opening the line does open it", () => {
  assert.deepEqual(slashTriggerAt("/", 1), { from: 0, query: "" });
  assert.deepEqual(slashTriggerAt("/head", 5), { from: 0, query: "head" });
  assert.deepEqual(slashTriggerAt("/HEAD", 5), { from: 0, query: "head" }, "query is lowercased");
});

// Wanting a heading from inside a list item is normal, so indentation and a
// list marker are allowed in front of it.
test("indentation and list markers still allow a command", () => {
  assert.deepEqual(slashTriggerAt("  /quote", 8), { from: 2, query: "quote" });
  assert.deepEqual(slashTriggerAt("- /", 3), { from: 2, query: "" });
  assert.deepEqual(slashTriggerAt("1. /tab", 7), { from: 3, query: "tab" });
  assert.deepEqual(slashTriggerAt("   * /code", 10), { from: 5, query: "code" });
});

// The caret has to be inside the token — moving away should close the menu.
test("the trigger follows the caret, not the line", () => {
  assert.equal(slashTriggerAt("/heading and more", 17), null, "typing past the token ends it");
  assert.deepEqual(slashTriggerAt("/heading and more", 8), { from: 0, query: "heading" });
});

test("a space ends the command", () => {
  assert.equal(slashTriggerAt("/quote ", 7), null);
});

test("an empty query offers everything", () => {
  assert.equal(matchLibraryCommands("").length, LIBRARY_COMMANDS.length);
});

// A beginner searches for what they want to DO, not for what markdown calls it.
test("commands are findable by the word a beginner would type", () => {
  const idsFor = (query: string) => matchLibraryCommands(query).map((command) => command.id);
  assert.ok(idsFor("todo").includes("todo"));
  assert.ok(idsFor("checkbox").includes("todo"));
  assert.ok(idsFor("bullet").includes("bullets"));
  assert.ok(idsFor("number").includes("numbers"));
  assert.ok(idsFor("line").includes("divider"), "'line' should find the divider");
  assert.ok(idsFor("table").includes("table"));
});

// Prefix, not substring: "/li" should offer lists, not everything with an L.
test("matching is by prefix so a short query stays useful", () => {
  const ids = matchLibraryCommands("li");
  assert.ok(ids.length > 0);
  assert.ok(ids.every((command) => [...command.keywords, ...command.label.toLowerCase().split(/\s+/)].some((word) => word.startsWith("li"))));
  assert.ok(!matchLibraryCommands("head").some((command) => command.id === "table"));
});

test("an unknown query offers nothing rather than everything", () => {
  assert.deepEqual(matchLibraryCommands("zzzz"), []);
});

test("the caret lands somewhere useful inside multi-line blocks", () => {
  const table = LIBRARY_COMMANDS.find((command) => command.id === "table");
  const code = LIBRARY_COMMANDS.find((command) => command.id === "code");
  assert.ok(table && code);
  // Inside the first cell, not after the whole table.
  assert.ok(commandCaretOffset(table) < table.insert.length);
  // On the blank line between the fences, not after them.
  assert.equal(code.insert.slice(commandCaretOffset(code) - 1, commandCaretOffset(code)), "\n");
  // A plain prefix just puts the caret at the end, ready to type.
  const h1 = LIBRARY_COMMANDS.find((command) => command.id === "h1")!;
  assert.equal(commandCaretOffset(h1), h1.insert.length);
});

test("every command is reachable and none collide", () => {
  const ids = LIBRARY_COMMANDS.map((command) => command.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids");
  for (const command of LIBRARY_COMMANDS) {
    assert.ok(command.insert.length > 0, command.id);
    assert.ok(matchLibraryCommands(command.label.toLowerCase()).some((hit) => hit.id === command.id), `${command.label} cannot find itself`);
  }
});
