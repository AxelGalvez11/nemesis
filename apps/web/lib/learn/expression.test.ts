// The one place Nemesis runs something a model wrote.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `config({}) is refused`. It is the case that proved a scope
// allow list is not enough: evaluating with a scope of permitted functions blocks `import` and
// `createUnit`, which resolve through the scope — and lets `config({})` straight through, because it
// lives on the parser instance. The AST walk is what stops it, and if somebody ever "simplifies"
// this module down to a scope check, this test is what fails.

import assert from "node:assert/strict";
import test from "node:test";

import { checkExpression, evaluateAt, EXPRESSION_FUNCTIONS } from "./expression";

function value(source: string, variables: Record<string, number> = { x: 1 }): number | null {
  const checked = checkExpression(source, Object.keys(variables));
  assert.equal(checked.ok, true, `${source} was refused`);
  return checked.ok ? checked.evaluate(variables) : null;
}

// ─────────────────────────────────────────────────────────────── it does the maths

test("ordinary teaching expressions evaluate", () => {
  assert.equal(value("x^2", { x: 4 }), 16);
  assert.equal(value("2*x + 1", { x: 3 }), 7);
  assert.ok(Math.abs((value("sin(pi/2)") ?? 0) - 1) < 1e-12);
  assert.equal(value("sqrt(x)", { x: 9 }), 3);
  assert.equal(value("ln(e)"), 1);
  assert.equal(value("max(x, 10)", { x: 3 }), 10);
});

test("several variables at once", () => {
  assert.equal(value("n * r", { n: 6, r: 7 }), 42);
  const refused = checkExpression("n * r", ["n"]);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, "expression-unknown-symbol");
});

test("🔴 a hole in a curve is null, not an error", () => {
  // `1/x` at zero and `sqrt` below zero are legitimate gaps. Throwing would lose the whole plot for
  // one undefined point.
  assert.equal(value("1/x", { x: 0 }), null);
  assert.equal(value("sqrt(x)", { x: -1 }), null);
  assert.equal(value("ln(x)", { x: 0 }), null);
  // And the expression itself is still fine — the refusal is about the point, not the formula.
  assert.equal(checkExpression("1/x").ok, true);
});

// ─────────────────────────────────────────────────────────────── it refuses programs

test("🔴 config({}) is refused — the case that proved a scope allow list is not enough", () => {
  // Measured: evaluating with a constrained scope, this still RAN and returned the parser's whole
  // configuration, because `config` lives on the instance rather than in the scope. The AST walk
  // refuses it by name before anything is evaluated — which is the reason reported here.
  const result = checkExpression("config({})");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "expression-unknown-function");
});

test("🔴 and the object it was carrying is refused on its own, so neither half depends on the other", () => {
  const result = checkExpression("{a: 1}", ["a"]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "expression-not-an-expression");
});

test("the library's own escape hatches are refused by name", () => {
  for (const attempt of ['import("x")', 'createUnit("z")', "evil(2)"]) {
    const result = checkExpression(attempt);
    assert.equal(result.ok, false, `${attempt} was accepted`);
    assert.equal(result.ok === false && result.reason, "expression-unknown-function");
  }
});

test("🔴 every node type that is a step towards a program is refused", () => {
  const attempts: Array<[string, string]> = [
    ["f(x) = x^2", "a function definition"],
    ["a[1]", "an index"],
    ["{a: 1}", "an object"],
    ["[1, 2, 3]", "an array"],
    ["y = 3", "an assignment"],
  ];
  for (const [source, what] of attempts) {
    const result = checkExpression(source, ["x", "a", "y"]);
    assert.equal(result.ok, false, `${what} (${source}) was accepted`);
  }
});

test("a runaway expression is bounded before it is evaluated hundreds of times", () => {
  assert.equal(checkExpression(`${"1+".repeat(200)}1`).ok === false, true);
  assert.equal(checkExpression("x".repeat(500)).ok === false, true);
});

test("nonsense is refused as unparsable rather than as something more specific", () => {
  const result = checkExpression("x +* 2");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "expression-unparsable");
});

test("empty and non-string inputs are refused by name", () => {
  for (const bad of ["", "   ", null, undefined, 42, {}]) {
    const result = checkExpression(bad);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "expression-empty");
  }
});

// ─────────────────────────────────────────────────────────────── evaluateAt

test("evaluateAt answers a single question, and carries refusals through", () => {
  assert.deepEqual(evaluateAt("x^2 + 1", { x: 3 }), { ok: true, value: 10 });
  const refused = evaluateAt("config({})", { x: 1 });
  assert.equal(refused.ok, false);
});

test("the function list a prompt would show is the list actually enforced", () => {
  // If these drift, a model is told it may call something the walker will refuse.
  assert.ok(EXPRESSION_FUNCTIONS.includes("sin"));
  assert.equal(EXPRESSION_FUNCTIONS.includes("import"), false);
  assert.equal(EXPRESSION_FUNCTIONS.includes("config"), false);
  for (const name of EXPRESSION_FUNCTIONS) {
    assert.equal(checkExpression(`${name}(1)`).ok, true, `${name} is advertised and refused`);
  }
});
