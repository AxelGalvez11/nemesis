import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  awaitDoclingTask,
  doclingConfig,
  submitDoclingTask,
  type DoclingServiceConfig,
} from "./docling-client.ts";

const CONFIG = doclingConfig({ DOCLING_SERVE_URL: "http://docling.internal:5001" }) as DoclingServiceConfig;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answer each call in order. Records the paths so a test can assert the shape. */
function stubFetch(replies: (Record<string, unknown> | number)[]): { paths: string[] } {
  const paths: string[] = [];
  let index = 0;
  globalThis.fetch = (async (url: string | URL) => {
    paths.push(String(url));
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    if (typeof reply === "number") {
      return new Response("nope", { status: reply, statusText: "Server Error" });
    }
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { paths };
}

/** A clock and a sleep that advances it. No test waits on a real timer. */
function fakeTime() {
  let clock = 0;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test("a document over the size cap never reaches the network", async () => {
  const paths = stubFetch([{ task_id: "should-not-happen" }]).paths;
  const outcome = await submitDoclingTask(new Uint8Array(64), "big.pdf", { ...CONFIG, maxBytes: 32 });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "too-large");
  assert.deepEqual(paths, [], "the cap is checked before the request, not after paying for it");
});

test("submitting is asynchronous and returns a task id", async () => {
  const { paths } = stubFetch([{ task_id: "t-42", task_status: "pending" }]);
  const outcome = await submitDoclingTask(new Uint8Array([1, 2, 3]), "lecture.pdf", CONFIG);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok === true && outcome.taskId, "t-42");
  // 🔴 THE ASYNC ENDPOINT, NOT THE BLOCKING ONE. A blocking convert cannot cover
  // the measured distribution inside a 300s function, and the files it would
  // miss are the table-dense ones the whole lane exists for.
  assert.match(paths[0] ?? "", /\/v1\/convert\/file\/async$/);
});

test("a reply with no task id is malformed, not a silent success", async () => {
  stubFetch([{ task_status: "pending" }]);
  const outcome = await submitDoclingTask(new Uint8Array([1]), "x.pdf", CONFIG);
  assert.equal(outcome.ok === false && outcome.reason, "malformed");
});

test("a task that finishes inside the budget comes back with its document", async () => {
  const { paths } = stubFetch([
    { task_status: "pending", task_position: 2 },
    { task_status: "started" },
    { task_status: "success" },
    { document: { json_content: { body: { children: [] } } }, status: "success", processing_time: 12.8 },
  ]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, { budgetMs: 60_000, now: time.now, sleep: time.sleep });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok === true && outcome.processingSeconds, 12.8);
  assert.match(paths.at(-1) ?? "", /\/v1\/result\/t-42$/);
});

test("running out of THIS invocation's budget is not a failure", async () => {
  // 🔴 THE LOAD-BEARING CASE. The worker aborts itself at 240s; the slowest real
  // document took 297s. So an invocation will sometimes end with the conversion
  // still running, and that has to come back as "still-running" carrying the id.
  // Recording it as a failure is what turns one slow document into a retry storm
  // where every attempt resubmits the same file and queues behind itself.
  stubFetch([{ task_status: "started" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, { budgetMs: 4_000, now: time.now, sleep: time.sleep });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "still-running");
  assert.equal(outcome.ok === false && outcome.reason === "still-running" && outcome.taskId, "t-42");
});

test("a task resumed past its whole-life budget is given up, not resumed forever", async () => {
  // The other half of the same rule: an id that never completes must not be
  // picked up by attempt after attempt until the document runs out of them.
  stubFetch([{ task_status: "started" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, {
    budgetMs: 60_000,
    spentMs: CONFIG.taskBudgetMs + 1,
    now: time.now,
    sleep: time.sleep,
  });
  assert.equal(outcome.ok === false && outcome.reason, "timeout");
});

test("losing the lease while waiting stops everything immediately", async () => {
  // Waiting is still holding. A worker whose lease was reclaimed must not go on
  // to write a result over the newer owner's.
  stubFetch([{ task_status: "started" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, {
    budgetMs: 600_000,
    heartbeat: async () => false,
    now: time.now,
    sleep: time.sleep,
  });
  assert.equal(outcome.ok === false && outcome.reason, "lease-lost");
});

test("a heartbeat that throws is a database blip, not a lost lease", async () => {
  // The threaded lane already makes this distinction and this one must match:
  // throwing away a healthy conversion because one renewal failed is worse than
  // the miss, and the lease has room for several.
  stubFetch([{ task_status: "started" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, {
    budgetMs: 4_000,
    heartbeat: async () => {
      throw new Error("connection reset");
    },
    now: time.now,
    sleep: time.sleep,
  });
  assert.equal(outcome.ok === false && outcome.reason, "still-running");
});

test("docling reporting failure is a fallback reason, never a verdict about the file", async () => {
  stubFetch([{ task_status: "failure" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, { budgetMs: 60_000, now: time.now, sleep: time.sleep });
  assert.equal(outcome.ok === false && outcome.reason, "task-failed");
});

test("an HTTP error is a fallback reason too", async () => {
  stubFetch([503]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, { budgetMs: 60_000, now: time.now, sleep: time.sleep });
  assert.equal(outcome.ok === false && outcome.reason, "http");
});

test("an unrecognised task_status is refused rather than read as progress", async () => {
  // A status we do not know is not "still working". Treating it that way is how
  // a client sits in a poll loop against a service that has changed underneath
  // it, forever.
  stubFetch([{ task_status: "reticulating" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, { budgetMs: 60_000, now: time.now, sleep: time.sleep });
  assert.equal(outcome.ok === false && outcome.reason, "malformed");
});

test("a result with no json_content is malformed, not an empty document", async () => {
  // The difference matters: malformed falls back to our own parser, whereas an
  // empty document would be recorded as "this file has nothing in it".
  stubFetch([{ task_status: "success" }, { status: "success" }]);
  const time = fakeTime();
  const outcome = await awaitDoclingTask("t-42", CONFIG, { budgetMs: 60_000, now: time.now, sleep: time.sleep });
  assert.equal(outcome.ok === false && outcome.reason, "malformed");
});
