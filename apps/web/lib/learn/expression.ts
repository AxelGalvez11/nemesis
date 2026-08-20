// Running an expression a model wrote, without running whatever else it wrote (§45).
//
// 🔴 THIS IS THE ONE PLACE NEMESIS EXECUTES SOMETHING A MODEL PRODUCED, AND IT IS WHY THE FILE IS
// MOSTLY REFUSALS. §41 forbids the model generating drawing code; §45 permits it to generate a
// CALCULATION, because a calculation returns numbers that trusted code can check and draw, where
// generated markup returns pixels nobody can check. That distinction only holds if "a calculation"
// really is a calculation and not an arbitrary program, which is this module's whole job.
//
// 🔴 THE DEFENCE IS AN AST ALLOW LIST, AND THE SCOPE IS ONLY DEFENCE IN DEPTH. MEASURED, NOT
// ASSUMED. The obvious approach — evaluate with a scope containing exactly the functions we permit —
// blocks `import("x")` and `createUnit("z")`, which resolve through the scope and fail as undefined
// functions. It does NOT block `config({})`, which lives on the parser instance rather than in the
// scope and executed happily in a probe. So the real defence is walking the parsed tree and refusing
// every node type and every function name that is not named below; the constrained scope stays as
// the floor under it.
//
// 🔴 EVERY REFUSAL IS NAMED, so "the model wrote something we do not permit" and "the model wrote
// something that is not an expression at all" stay countable apart — the same discipline
// `unsafe-latex` keeps for equations, on a much more dangerous input.
//
// 🔴 NOT IMPORTED BY ANY CLIENT COMPONENT, DELIBERATELY. The maths parser is large and belongs where
// a lesson is built, not in the bundle a learner downloads. `computed-series.ts` turns an expression
// into points; the renderers only ever see points.

import {
  addDependencies,
  create,
  divideDependencies,
  modDependencies,
  multiplyDependencies,
  parseDependencies,
  powDependencies,
  subtractDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  type MathNode,
} from "mathjs";

/**
 * A parser and nothing else.
 *
 * 🔴 `create` WITH ONLY THE PARSE DEPENDENCIES RATHER THAN `all`, so the instance never gains
 * `createUnit`, the matrix machinery, or the rest of a very large library. Verified: `createUnit` is
 * `undefined` on this instance. `config` survives, which is exactly why the allow list below is the
 * defence rather than this.
 */
const math = create(
  {
    ...parseDependencies,
    // 🔴 THE ARITHMETIC IS IMPORTED BY NAME, AND LEAVING IT OUT WAS A REAL BUG. Operators do not
    // compile to JavaScript arithmetic — `a / b` compiles to a call into the instance's namespace,
    // so a parser-only instance parses `sin(pi/2)` happily and then fails to COMPILE it with
    // "Function divide missing in provided namespace". Measured, not guessed. Naming the eleven
    // pieces that operators need keeps the instance small and keeps `createUnit` off it entirely.
    ...addDependencies,
    ...divideDependencies,
    ...modDependencies,
    ...multiplyDependencies,
    ...powDependencies,
    ...subtractDependencies,
    ...unaryMinusDependencies,
    ...unaryPlusDependencies,
  },
  {},
);

/**
 * The only node types a teaching expression may contain.
 *
 * 🔴 EVERYTHING ELSE mathjs CAN PARSE IS A CAPABILITY, NOT A GAP. `FunctionAssignmentNode` defines
 * functions, `AccessorNode` and `IndexNode` reach into objects, `ObjectNode` and `ArrayNode` build
 * structures, `AssignmentNode` mutates scope, `BlockNode` sequences statements. None of them appear
 * in "x^2 + 3sin(x)", and each of them is a step away from an expression and towards a program.
 */
const ALLOWED_NODES: readonly string[] = [
  "ConstantNode",
  "FunctionNode",
  "OperatorNode",
  "ParenthesisNode",
  "SymbolNode",
];

/**
 * Functions a teaching expression may call, and the implementations it gets.
 *
 * 🔴 THE MAP IS THE ALLOW LIST AND THE IMPLEMENTATION AT ONCE. Names are checked against these keys
 * while walking the tree, and the same object becomes the evaluation scope — so a name cannot be
 * permitted by one and missing from the other. Plain `Math` functions rather than the library's:
 * fewer moving parts, and nothing here can return a matrix, a unit or a complex number that a plot
 * would then have to make sense of.
 */
const FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  cbrt: Math.cbrt,
  ceil: Math.ceil,
  cos: Math.cos,
  cosh: Math.cosh,
  exp: Math.exp,
  floor: Math.floor,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  max: Math.max,
  min: Math.min,
  round: Math.round,
  sign: Math.sign,
  sin: Math.sin,
  sinh: Math.sinh,
  sqrt: Math.sqrt,
  tan: Math.tan,
  tanh: Math.tanh,
};

/** Constants a teaching expression may name, beyond its own variables. */
const CONSTANTS: Readonly<Record<string, number>> = { e: Math.E, pi: Math.PI };

/**
 * How big an expression may get.
 *
 * 🔴 NODES RATHER THAN CHARACTERS, BECAUSE COST FOLLOWS STRUCTURE. A short string can carry a deeply
 * nested expression that is evaluated once per sample point — 400 points times a heavy tree is the
 * shape of a slow lesson. Characters are bounded too, as the cheap first check.
 */
const MAX_NODES = 120;
const MAX_LENGTH = 400;

export type ExpressionRefusal =
  /** Not a string, or empty. */
  | "expression-empty"
  /** Past the character or node bound. */
  | "expression-too-large"
  /** mathjs could not parse it at all. */
  | "expression-unparsable"
  /**
   * A node type that is a step towards a program: an assignment, an index, an object, a block.
   *
   * 🔴 THE INTERESTING REFUSAL, AND THE ONE WORTH COUNTING. A model reaching for `f(x)=...` or
   * `a[1]` inside what was asked to be a formula is either confused or probing, and both are things
   * somebody should be able to see happening.
   */
  | "expression-not-an-expression"
  /** A function this Canvas does not offer. Includes every dangerous one, by omission. */
  | "expression-unknown-function"
  /** A name that is neither a declared variable nor a constant. */
  | "expression-unknown-symbol"
  /** Evaluation threw, or produced something that is not a finite number. */
  | "expression-not-finite";

export type ExpressionCheck =
  | { evaluate: (variables: Readonly<Record<string, number>>) => number | null; ok: true; source: string }
  | { detail: string; ok: false; reason: ExpressionRefusal };

/**
 * Check an expression and, if it is one, hand back something that can evaluate it.
 *
 * 🔴 THE COMPILED FORM IS RETURNED RATHER THAN THE RESULT, BECAUSE PLOTTING NEEDS HUNDREDS OF
 * EVALUATIONS. Re-parsing per sample point would make a smooth curve cost hundreds of parses, and
 * would give the tree hundreds of chances to be walked differently from the one that was checked.
 * Checked once, compiled once, evaluated many times.
 *
 * `variables` names what the expression is allowed to use — `["x"]` for a curve, `["n", "r"]` for a
 * formula with two inputs. Anything else it names is refused.
 */
export function checkExpression(raw: unknown, variables: readonly string[] = ["x"]): ExpressionCheck {
  if (typeof raw !== "string") {
    return { detail: `expected a string, received ${typeof raw}`, ok: false, reason: "expression-empty" };
  }
  const source = raw.trim();
  if (!source) return { detail: "the expression is empty", ok: false, reason: "expression-empty" };
  if (source.length > MAX_LENGTH) {
    return { detail: `${source.length} characters, past the ${MAX_LENGTH} an expression may carry`, ok: false, reason: "expression-too-large" };
  }

  let tree: MathNode;
  try {
    // Typed as the single-expression overload deliberately: `parse` also accepts an array of
    // strings and returns an array, and inferring the return type picks that one.
    tree = math.parse(source) as MathNode;
  } catch (error) {
    return { detail: (error as Error)?.message ?? "could not be parsed", ok: false, reason: "expression-unparsable" };
  }

  const allowedSymbols = new Set([...variables, ...Object.keys(CONSTANTS)]);
  let nodes = 0;
  // 🔴 A HOLDER RATHER THAN A PLAIN `let`, BECAUSE THE CALLBACK DEFEATS NARROWING. TypeScript cannot
  // see that a closure passed to `traverse` runs before the checks below, so a `let x = null`
  // assigned only inside it narrows to `never` at every later read.
  const state: { refusal: { detail: string; reason: ExpressionRefusal } | null } = { refusal: null };

  tree.traverse((node: { type: string; fn?: unknown; name?: unknown }) => {
    if (state.refusal) return;
    nodes += 1;
    if (nodes > MAX_NODES) {
      state.refusal = { detail: `more than ${MAX_NODES} terms`, reason: "expression-too-large" };
      return;
    }
    if (!ALLOWED_NODES.includes(node.type)) {
      state.refusal = {
        detail: `${node.type} is not part of an expression — this is a program, not a formula`,
        reason: "expression-not-an-expression",
      };
      return;
    }
    if (node.type === "FunctionNode") {
      // The callee is itself a node; its `name` is what will be looked up at evaluation time.
      const called = (node.fn as { name?: unknown } | undefined)?.name;
      if (typeof called !== "string" || !(called in FUNCTIONS)) {
        state.refusal = { detail: `${String(called)} is not a function this Canvas offers`, reason: "expression-unknown-function" };
      }
      return;
    }
    if (node.type === "SymbolNode") {
      const name = node.name;
      // A SymbolNode also appears as the callee of a FunctionNode; those are checked above, and a
      // function name reaching here would otherwise be refused as an unknown variable.
      if (typeof name === "string" && !allowedSymbols.has(name) && !(name in FUNCTIONS)) {
        state.refusal = {
          detail: `${name} is not one of ${[...allowedSymbols].join(", ")}`,
          reason: "expression-unknown-symbol",
        };
      }
    }
  });

  if (state.refusal) return { detail: state.refusal.detail, ok: false, reason: state.refusal.reason };

  let compiled: { evaluate: (scope: Record<string, unknown>) => unknown };
  try {
    compiled = tree.compile();
  } catch (error) {
    return { detail: (error as Error)?.message ?? "could not be compiled", ok: false, reason: "expression-unparsable" };
  }

  return {
    // 🔴 RETURNS null RATHER THAN THROWING OR RETURNING NaN. A curve legitimately has holes —
    // `1/x` at zero, `sqrt(x)` below zero, `ln(x)` at zero — and a hole is not an error. The caller
    // draws a gap; a thrown exception would lose the whole plot for one undefined point.
    evaluate: (values) => {
      try {
        const result = compiled.evaluate({ ...FUNCTIONS, ...CONSTANTS, ...values });
        return typeof result === "number" && Number.isFinite(result) ? result : null;
      } catch {
        return null;
      }
    },
    ok: true,
    source,
  };
}

/**
 * Evaluate an expression once, at stated inputs.
 *
 * For the check "you said f(2) = 4" rather than for drawing. Returns a named refusal when the
 * expression is not usable and `null` when it simply has no value there.
 */
export function evaluateAt(
  raw: unknown,
  values: Readonly<Record<string, number>>,
): { ok: true; value: number | null } | { detail: string; ok: false; reason: ExpressionRefusal } {
  const checked = checkExpression(raw, Object.keys(values));
  if (!checked.ok) return checked;
  return { ok: true, value: checked.evaluate(values) };
}

/** The functions a teaching expression may call, for a prompt that has to tell a model what exists. */
export const EXPRESSION_FUNCTIONS: readonly string[] = Object.keys(FUNCTIONS);
