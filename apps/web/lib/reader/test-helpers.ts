import assert from "node:assert/strict";

// Small assertion helpers for the reader's tests.
//
// `noUncheckedIndexedAccess` is on for this project, which is right for source
// code and noisy in tests: `blocks[0].kind` is a type error even when the test
// has just asserted there are three blocks. These turn that into one honest
// assertion rather than a scattering of `!` marks that would also hide a real
// off-by-one.

/** The item at `index`, asserting it exists. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined, `expected an item at index ${index}, got ${items.length} items`);
  return item;
}

/** Narrow a discriminated union by its `kind`, asserting the discriminant. */
export function ofKind<T extends { kind: string }, K extends T["kind"]>(value: T | undefined, kind: K): Extract<T, { kind: K }> {
  assert.ok(value !== undefined, `expected a ${kind}, got nothing`);
  assert.equal(value.kind, kind);
  return value as Extract<T, { kind: K }>;
}
