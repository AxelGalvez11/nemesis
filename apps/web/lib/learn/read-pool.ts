// A small concurrency pool for reading dropped files.
//
// 🔴🔴 FIFTY FILES USED TO MEAN FIFTY UPLOADS AT ONCE. `readStaged` started an `extractFile` call
// the instant each card was staged, with no limit, so a learner who dropped a folder of lectures
// opened fifty simultaneous uploads against a route whose function runs for up to five minutes.
// The failures that produced (a dropped connection, a 413, a queue full) then hit the attach loop,
// which aborted the whole batch on the first one. Owner, 2026-09-03: *"I should be able to drop in
// like 50 documents into the app and there should be no problem with any of them."*
//
// 🔴 A POOL, NOT A QUEUE OF ONE. Reads are network-bound and the parser is a separate service, so
// a handful in flight is faster than one at a time and kind to the route. The number is small on
// purpose and stated once, here.
//
// PURE. No React, no I/O of its own: it only decides WHEN a caller's function starts.

/** How many files are read at once. */
export const READ_POOL_SIZE = 4;

export interface ReadPool {
  /** Run `task` when a slot is free. The returned promise settles exactly as `task` does. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** How many tasks are running right now (for tests and captions). */
  readonly active: number;
  /** How many tasks are waiting for a slot. */
  readonly waiting: number;
}

/**
 * Make a pool of `size` slots.
 *
 * 🔴 ORDER IS PRESERVED. The first file dropped is the first file read, which is what the cards
 * on screen imply: they fill in from left to right rather than at random.
 *
 * 🔴 A REJECTION FREES THE SLOT AND NEVER STOPS THE LINE. One unreadable file must cost exactly
 * that file, so the failure is passed to its own caller and the next task starts regardless.
 */
export function createReadPool(size: number = READ_POOL_SIZE): ReadPool {
  const limit = Math.max(1, Math.floor(size));
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= limit) return;
    const start = queue.shift();
    if (!start) return;
    active += 1;
    start();
  };
  return {
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        // 🔴 THE SLOT IS FREED BEFORE THE CALLER HEARS THE RESULT. Chaining the release after the
        // resolution let a caller observe the pool between "task done" and "next task started",
        // which is a state the pool is never supposed to be in, and a test caught exactly that.
        const release = () => {
          active -= 1;
          next();
        };
        queue.push(() => {
          task().then(
            (value) => {
              release();
              resolve(value);
            },
            (error: unknown) => {
              release();
              reject(error);
            },
          );
        });
        next();
      });
    },
  };
}
