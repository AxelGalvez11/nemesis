// Small helpers shared by the test files, so a type-safety concession is made once and explained
// once rather than forty times.
//
// 🔴 NOT A `!`, AND THE DIFFERENCE IS WHAT A FAILING TEST TELLS YOU. This repo compiles with
// `noUncheckedIndexedAccess`, which is right: `list[0]` really can be undefined, and the rule catches
// real defects in product code. In a test the index is usually one the test has just asserted the
// length of, so the honest options are a non-null assertion or a checked read.
//
// `list[0]!` silences the compiler and then throws "cannot read properties of undefined" several
// lines later, naming neither the list nor the index — a failure that reads like a crash rather than
// like an assertion. `at(list, 0)` fails at the moment the list is short, says so, and keeps the
// test's own message. Same strictness, better diagnosis.

import assert from "node:assert/strict";

/** The element at an index, or a failed assertion naming which index was empty. */
export function at<T>(list: readonly T[] | undefined, index = 0): T {
  assert.ok(list, "the list itself was missing");
  const found = list[index];
  assert.ok(found !== undefined, `nothing at index ${index} of ${list.length}`);
  return found;
}

/** A value the test has established is present. Fails loudly instead of asserting non-null. */
export function present<T>(value: T | null | undefined, what = "value"): T {
  assert.ok(value !== null && value !== undefined, `${what} was missing`);
  return value;
}
