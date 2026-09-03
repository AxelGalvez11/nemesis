// The read pool: a bounded number of files in flight, in the order they were dropped.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createReadPool, READ_POOL_SIZE } from "./read-pool";

function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

test("🔴🔴 at most READ_POOL_SIZE reads run at once, and the rest wait their turn", async () => {
  const pool = createReadPool();
  const gates = Array.from({ length: READ_POOL_SIZE + 3 }, () => gate());
  const runs = gates.map((g, index) =>
    pool.run(async () => {
      await g.opened;
      return index;
    }),
  );
  assert.equal(pool.active, READ_POOL_SIZE, "every slot is used");
  assert.equal(pool.waiting, 3, "the overflow waits rather than starting");
  gates[0]!.open();
  await runs[0];
  assert.equal(pool.active, READ_POOL_SIZE, "a finished read hands its slot to the next one");
  assert.equal(pool.waiting, 2);
  for (const g of gates) g.open();
  const results = await Promise.all(runs);
  assert.deepEqual(results, gates.map((_, index) => index));
});

test("🔴 the order of starts is the order of drops", async () => {
  const pool = createReadPool(2);
  const started: number[] = [];
  const gates = [gate(), gate(), gate(), gate()];
  const runs = gates.map((g, index) =>
    pool.run(async () => {
      started.push(index);
      await g.opened;
    }),
  );
  assert.deepEqual(started, [0, 1]);
  gates[1]!.open();
  await runs[1];
  assert.deepEqual(started, [0, 1, 2], "the third file starts when a slot frees, the fourth still waits");
  gates[0]!.open();
  gates[2]!.open();
  gates[3]!.open();
  await Promise.all(runs);
  assert.deepEqual(started, [0, 1, 2, 3]);
});

test("🔴🔴 one unreadable file frees its slot and never stops the line", async () => {
  const pool = createReadPool(1);
  const bad = pool.run(async () => {
    throw new Error("could not read");
  });
  const good = pool.run(async () => "fine");
  await assert.rejects(bad, /could not read/);
  assert.equal(await good, "fine");
  assert.equal(pool.active, 0);
  assert.equal(pool.waiting, 0);
});

test("a size below one is treated as one, never zero", async () => {
  const pool = createReadPool(0);
  assert.equal(await pool.run(async () => 1), 1);
});
