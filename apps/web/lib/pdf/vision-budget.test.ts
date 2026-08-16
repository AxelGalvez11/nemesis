import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  DEFAULT_DOCUMENT_UNIT_CAP,
  VisionLedger,
  currentVisionLedger,
  documentUnitCap,
  grantableUnits,
  userDailyUnitCap,
  withVisionBudget,
} from "./vision-budget";
import {
  VISION_MODEL_LADDER,
  VISION_RETRY_ATTEMPTS,
  VISION_RETRY_BASE_MS,
  VISION_RETRY_CAP_MS,
  classifyVisionFailure,
  describeFiguresWithVision,
  readFiguresWithVision,
  readPdfPagesWithVision,
  readPdfWithVision,
  sleepUnlessAborted,
  visionBackoffMs,
  withVisionJitter,
} from "./vision";

/** A Gemini reply shaped exactly as `parseFigureDescriptions` expects, for `count` figures. */
function figureReply(count: number): string {
  const lines = Array.from({ length: count }, (_, index) => `[[figure ${index + 1}]] a described figure`);
  return JSON.stringify({ candidates: [{ content: { parts: [{ text: lines.join("\n") }] } }] });
}

describe("VisionLedger: the allowance cannot be spent twice", () => {
  test("take grants what is asked for while the budget lasts", () => {
    const ledger = new VisionLedger(10);
    assert.equal(ledger.take(4), 4);
    assert.equal(ledger.take(3), 3);
    assert.equal(ledger.remaining(), 3);
  });

  test("take never grants past the limit, however it is asked for", () => {
    const ledger = new VisionLedger(10);
    assert.equal(ledger.take(400), 10, "a 400-figure document gets the limit, not what it asked for");
    assert.equal(ledger.take(1), 0, "and nothing at all afterwards");
    assert.equal(ledger.exhausted(), true);
  });

  test("remaining never goes negative, so a caller cannot read -3 as three left", () => {
    const ledger = new VisionLedger(2);
    ledger.take(2);
    assert.equal(ledger.remaining(), 0);
    assert.equal(ledger.take(5), 0);
    assert.equal(ledger.spend().units, 2, "the refused take is not charged");
  });

  test("calls and units are counted separately, because batching makes them differ", () => {
    const ledger = new VisionLedger(100);
    ledger.take(8);
    ledger.noteCall();
    assert.deepEqual(ledger.spend(), { calls: 1, units: 8 });
  });

  test("a zero limit is a real limit, not an unset one", () => {
    const ledger = new VisionLedger(0);
    assert.equal(ledger.take(1), 0);
    assert.equal(ledger.exhausted(), true);
  });
});

describe("grantableUnits: the tighter of the two ceilings wins", () => {
  test("the document ceiling binds when the user has room to spare", () => {
    const granted = grantableUnits({
      documentCap: 120,
      documentSpent: 100,
      userDailyCap: 3000,
      userSpentToday: 0,
    });
    assert.equal(granted, 20);
  });

  test("the user ceiling binds when the document is fresh", () => {
    const granted = grantableUnits({
      documentCap: 120,
      documentSpent: 0,
      userDailyCap: 3000,
      userSpentToday: 2995,
    });
    assert.equal(granted, 5);
  });

  test("a breached ceiling grants zero, never a negative number", () => {
    // 🔴 THE FIXTURE IS OVERSPENT ON THE DOCUMENT SIDE ONLY, and the user side is
    // deliberately wide open. If `grantableUnits` returned `min` without clamping it
    // would return -30 here, and a caller doing `slice(0, -30)` would silently drop the
    // LAST thirty items while appearing to work. Only the clamp can catch this.
    const granted = grantableUnits({
      documentCap: 120,
      documentSpent: 150,
      userDailyCap: 3000,
      userSpentToday: 0,
    });
    assert.equal(granted, 0);
  });
});

describe("the ledger is per-parse, not per-process", () => {
  test("two parses running at once do not spend each other's budget", async () => {
    // 🔴 THIS IS THE SYNCHRONOUS-UPLOAD BUG IN MINIATURE. A module-level counter would
    // pass every other test in this file and fail only this one: the second parse would
    // find the budget already gone and describe nothing, with no error anywhere.
    const spent: number[] = [];
    const one = withVisionBudget(new VisionLedger(10), async () => {
      const ledger = currentVisionLedger();
      const first = ledger.take(6);
      await new Promise((resolve) => setTimeout(resolve, 5));
      spent.push(first + ledger.take(6));
    });
    const two = withVisionBudget(new VisionLedger(10), async () => {
      const ledger = currentVisionLedger();
      const first = ledger.take(6);
      await new Promise((resolve) => setTimeout(resolve, 5));
      spent.push(first + ledger.take(6));
    });
    await Promise.all([one, two]);
    assert.deepEqual(spent, [10, 10], "each parse got its own full allowance");
  });

  test("an uninstalled ledger is fresh each time, so a cap cannot become an outage", () => {
    // A single shared fallback would make this second call return 0 remaining.
    const first = currentVisionLedger();
    first.take(first.remaining());
    assert.equal(currentVisionLedger().remaining(), documentUnitCap());
  });

  test("the ambient ledger is the one the caller installed", async () => {
    await withVisionBudget(new VisionLedger(7), async () => {
      assert.equal(currentVisionLedger().remaining(), 7);
    });
  });
});

describe("caps come from the environment, and a bad value does not open the gate", () => {
  test("an unset variable keeps the measured default", () => {
    assert.equal(documentUnitCap({}), DEFAULT_DOCUMENT_UNIT_CAP);
  });

  test("a set variable is honoured", () => {
    assert.equal(documentUnitCap({ VISION_DOCUMENT_UNIT_CAP: "25" }), 25);
    assert.equal(userDailyUnitCap({ VISION_USER_DAILY_UNIT_CAP: "40" }), 40);
  });

  test("garbage falls back to the default rather than to unlimited", () => {
    // 🔴 THE FAILURE THIS FORBIDS IS `parseInt("unlimited")` -> NaN -> a comparison that
    // is false forever -> no cap at all. A typo in a Vercel variable must not silently
    // remove the ceiling.
    assert.equal(documentUnitCap({ VISION_DOCUMENT_UNIT_CAP: "unlimited" }), DEFAULT_DOCUMENT_UNIT_CAP);
    assert.equal(documentUnitCap({ VISION_DOCUMENT_UNIT_CAP: "-5" }), DEFAULT_DOCUMENT_UNIT_CAP);
  });
});

describe("the budget actually reaches the network, on every vision lane", () => {
  test("a 400-figure document sends only what the budget granted", async () => {
    const before = globalThis.fetch;
    let unitsSent = 0;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      // Count the images actually put on the wire, not what the caller intended.
      const body = JSON.parse(String(init?.body ?? "{}")) as { contents?: { parts?: unknown[] }[] };
      const parts = body.contents?.[0]?.parts ?? [];
      const images = parts.filter((part) => Boolean((part as { inline_data?: unknown }).inline_data));
      unitsSent += images.length;
      return new Response(figureReply(images.length), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const images = Array.from({ length: 400 }, (_, index) => ({
        bytes: new Uint8Array([1, 2, 3]),
        mime: "image/png",
        name: `figure-${index}`,
      }));
      await withVisionBudget(new VisionLedger(12), async () => {
        await readFiguresWithVision(images, { env: { GEMINI_API_KEY: "k" } });
      });
    } finally {
      globalThis.fetch = before;
    }
    assert.equal(unitsSent, 12, "the wire carried the grant, not the 400 the document held");
  });

  test("the page lane sends only the pages the budget granted", async () => {
    // The page lane had NO ceiling of any kind before this: `MAX_FIGURES_PER_DOC` guards
    // figures, and the 2,116 pages of a scanned book are not figures.
    //
    // 🔴 A REAL PDF, BUILT HERE, AND THE FIRST VERSION OF THIS TEST WAS WORTHLESS WITHOUT
    // ONE. `readPdfPagesWithVision` opens the bytes with pdf-lib before it batches
    // anything, so `new Uint8Array([1,2,3])` made it return on the `catch` two statements
    // in — and the test then observed "no requests were sent" and called that the budget
    // working. Deleting the budget line entirely left it green. A fixture has to reach
    // the code it is judging.
    //
    // Six pages against a budget of two also beats a zero budget as a fixture: zero would
    // pass if `take` were ignored and some OTHER early return fired, whereas "two of six
    // arrived" can only be produced by the grant being applied.
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.create();
    for (let page = 0; page < 6; page += 1) source.addPage([200, 200]);
    const bytes = await source.save();

    const before = globalThis.fetch;
    let pagesSent = 0;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      // Read the slice actually put on the wire and count its pages, so the assertion is
      // about bytes sent to Google rather than about our own bookkeeping.
      const body = JSON.parse(String(init?.body ?? "{}")) as { contents?: { parts?: unknown[] }[] };
      const inline = (body.contents?.[0]?.parts ?? []).find((part) =>
        Boolean((part as { inline_data?: unknown }).inline_data),
      ) as { inline_data?: { data?: string } } | undefined;
      const sliced = await PDFDocument.load(Buffer.from(inline?.inline_data?.data ?? "", "base64"));
      pagesSent += sliced.getPageCount();
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: Array.from({ length: sliced.getPageCount() }, (_, i) => `[[page ${i + 1}]] read`).join("\n"),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    try {
      await withVisionBudget(new VisionLedger(2), async () => {
        await readPdfPagesWithVision(bytes, [0, 1, 2, 3, 4, 5], { env: { GEMINI_API_KEY: "k" } });
      });
    } finally {
      globalThis.fetch = before;
    }
    assert.equal(pagesSent, 2, "four of the six pages were never paid for");
  });

  test("the whole-file lane refuses when the budget is gone", async () => {
    const before = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "text" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await withVisionBudget(new VisionLedger(0), async () => {
        assert.equal(await readPdfWithVision(new Uint8Array([1, 2, 3]), { env: { GEMINI_API_KEY: "k" } }), null);
      });
    } finally {
      globalThis.fetch = before;
    }
    assert.equal(calls, 0);
  });

  test("the model ladder's retries are counted, not just the first attempt", async () => {
    // 🔴 THE REASON `noteCall` LIVES IN `callGemini`. A 404 walks to the next model, and
    // that retry is a second billable request. A counter at the entry point would report
    // one call for three.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const ledger = new VisionLedger(50);
    try {
      await withVisionBudget(ledger, async () => {
        await readFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a" }], {
          env: { GEMINI_API_KEY: "k" },
        });
      });
    } finally {
      globalThis.fetch = before;
    }
    assert.equal(
      ledger.spend().calls,
      VISION_MODEL_LADDER.length,
      "every model the ladder tried was a real HTTP request and is counted as one",
    );
    assert.equal(ledger.spend().units, 1, "and the figure was still paid for");
  });
});

describe("a dead model ladder is a provider failure, not an empty answer", () => {
  test("reached is false when every model 404s", async () => {
    // 🔴 THE EXACT PRODUCTION STATE ON 2026-08-15. All three models on the old ladder
    // returned 404 on generateContent — `gemini-2.5-flash` with the message "no longer
    // available to new users". The first figure-bearing lecture the worker ever parsed
    // sent 9 figures, made 3 requests, and recorded 0 descriptions, which coverage then
    // reported as `examined-empty`: something looked and had nothing to say. Nothing
    // looked at anything.
    const before = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 404, message: "no longer available" } }), {
        status: 404,
      })) as unknown as typeof fetch;
    try {
      const read = await readFiguresWithVision(
        [{ bytes: new Uint8Array([1]), mime: "image/png", name: "a" }],
        { env: { GEMINI_API_KEY: "k" } },
      );
      assert.equal(read.reached, false, "no request succeeded, so the provider was never reached");
      assert.equal(read.descriptions.size, 0);
    } finally {
      globalThis.fetch = before;
    }
  });

  test("reached is true when a reply comes back, even one that describes nothing", async () => {
    // The discriminating twin. A model that answers "none" for a decorative logo HAS been
    // reached, and that figure is honestly `examined-empty`. If this and the test above
    // both passed with a hardcoded value, neither would mean anything.
    const before = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. none" }] } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    try {
      const read = await readFiguresWithVision(
        [{ bytes: new Uint8Array([1]), mime: "image/png", name: "a" }],
        { env: { GEMINI_API_KEY: "k" } },
      );
      assert.equal(read.reached, true, "a reply arrived, so the provider WAS reached");
    } finally {
      globalThis.fetch = before;
    }
  });

  test("an unconfigured key never claims to have reached anything", async () => {
    const read = await readFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a" }], {
      env: {},
    });
    assert.equal(read.reached, false);
  });

  test("the shipped ladder holds no model this codebase has measured as retired", () => {
    // 🔴 A LADDER OF LITERALS ROTS SILENTLY, AND THIS ONE ROTTED COMPLETELY. Measured
    // against the live API on 2026-08-15: every one of these returns 404. Naming them
    // here means re-adding a dead model fails a test instead of failing production.
    const RETIRED = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite-preview"];
    for (const dead of RETIRED) {
      assert.ok(
        !VISION_MODEL_LADDER.includes(dead as (typeof VISION_MODEL_LADDER)[number]),
        `${dead} was measured as 404 on generateContent and must not be on the ladder`,
      );
    }
    assert.ok(VISION_MODEL_LADDER.length >= 2, "a ladder needs somewhere to fall back to");
  });
});

// =============================================================================
// A transient failure is retried on the SAME model; a terminal one is not.
//
// Measured against the live API 2026-08-15/16: `gemini-3.7-flash` answered 200 on
// 12/12 sequential and 6/6 concurrent calls, then hit a contiguous ~1-minute window
// where EVERY call returned 404 with a COMPLETELY EMPTY body — same key, same URL,
// same payload that had just succeeded — and recovered on its own. A genuinely
// retired model instead returns 404 WITH a body naming itself. Walking the ladder on
// an empty-bodied 404 (the old behaviour) turns one transient minute into every
// figure in the document going undescribed, because three models answer the same
// blip in milliseconds.
// =============================================================================

describe("classifyVisionFailure: the boundary between transient and terminal, PURE", () => {
  test("401 and 403 are terminal-key — the key itself is rejected", () => {
    assert.equal(classifyVisionFailure(401, ""), "terminal-key");
    assert.equal(classifyVisionFailure(403, "Forbidden"), "terminal-key");
  });

  test("400 is terminal-model regardless of body — the payload is the problem", () => {
    assert.equal(classifyVisionFailure(400, ""), "terminal-model");
    assert.equal(classifyVisionFailure(400, "invalid argument"), "terminal-model");
  });

  test("404 with an empty body is transient — the measured upstream-blip signature", () => {
    assert.equal(classifyVisionFailure(404, ""), "transient");
    assert.equal(classifyVisionFailure(404, "   \n  "), "transient", "whitespace-only counts as empty");
  });

  test("404 with a body is terminal-model — Google's real 'model retired' shape", () => {
    assert.equal(
      classifyVisionFailure(404, JSON.stringify({ error: { code: 404, message: "no longer available to new users" } })),
      "terminal-model",
    );
    // 🔴 A DELIBERATE BOUNDARY, NOT AN INCIDENTAL ONE. "{}" has no message but is not
    // EMPTY — the default is to advance rather than spend the retry budget on a body
    // that at least says something, even something this thin.
    assert.equal(classifyVisionFailure(404, "{}"), "terminal-model");
  });

  test("429 and 5xx default to transient — mirrors parse-worker.ts's isRetryable philosophy", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      assert.equal(classifyVisionFailure(status, "anything"), "transient", `status ${status} should be transient`);
    }
  });
});

describe("visionBackoffMs and withVisionJitter: bounded, decorrelated, PURE", () => {
  test("visionBackoffMs doubles from the base and stops at the cap", () => {
    assert.equal(visionBackoffMs(1), VISION_RETRY_BASE_MS);
    assert.equal(visionBackoffMs(2), VISION_RETRY_BASE_MS * 2);
    // Production never reaches attempt 10 with VISION_RETRY_ATTEMPTS this low, but the
    // safety net must hold anyway — this is what stops the formula ever proposing an
    // unbounded sleep if the attempt count is raised later.
    assert.equal(visionBackoffMs(10), VISION_RETRY_CAP_MS);
  });

  test("withVisionJitter stays within ±25% and does not touch zero", () => {
    const samples = Array.from({ length: 200 }, () => withVisionJitter(1000));
    for (const sample of samples) {
      assert.ok(sample >= 750 && sample <= 1250, `${sample} outside the [750,1250] jitter band`);
    }
    // Proves the RNG is actually consulted — a jitter formula that silently collapsed
    // to a constant would pass every other assertion here.
    assert.ok(new Set(samples).size > 1, "200 samples all landing on one value means jitter is not live");
  });

  test("withVisionJitter is deterministic given an injected random source", () => {
    assert.equal(withVisionJitter(1000, () => 0), 750, "random()=0 floors at 0.75x");
    assert.equal(withVisionJitter(1000, () => 1), 1250, "random()=1 (exclusive in practice) caps at 1.25x");
  });
});

describe("sleepUnlessAborted: the real timer — elapses, and cancels promptly on abort", () => {
  // 🔴 REAL TIMERS THROUGHOUT THIS BLOCK, DELIBERATELY. A fake clock that never
  // advances would make every assertion below pass in zero milliseconds while proving
  // nothing about whether a retry actually waits — see the task's own warning about
  // this exact failure shape. `Date.now()` is the only oracle trusted here.

  test("a positive delay genuinely elapses — not a fake, not a no-op", async () => {
    const start = Date.now();
    await sleepUnlessAborted(60);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 50, `slept only ${elapsed}ms for a 60ms request — the timer did not really wait`);
  });

  test("zero or negative ms resolves immediately", async () => {
    const start = Date.now();
    await sleepUnlessAborted(0);
    await sleepUnlessAborted(-5);
    assert.ok(Date.now() - start < 30);
  });

  test("an abort mid-sleep cancels promptly — never slept through", async () => {
    const controller = new AbortController();
    const start = Date.now();
    const sleeping = sleepUnlessAborted(5000, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await sleeping;
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 300, `aborted sleep took ${elapsed}ms against a 5000ms request — it slept through the abort`);
  });

  test("an already-aborted signal resolves immediately, without ever starting the timer", async () => {
    const controller = new AbortController();
    controller.abort();
    const start = Date.now();
    await sleepUnlessAborted(5000, controller.signal);
    assert.ok(Date.now() - start < 30);
  });
});

describe("callGemini: transient failures retry the SAME model; terminal ones walk the ladder", () => {
  // 🔴 THE REQUIRED DISCRIMINATING PAIR. Same status code (404), opposite bodies, and
  // that difference alone must flip both the fetch pattern AND the timing. Built so
  // that only the rule under test can pass either one:
  //   - the empty-bodied 404 succeeds ONLY if the SAME model is retried
  //   - the JSON-bodied 404 succeeds ONLY if the ladder advances WITHOUT retrying
  // A guard that retried everything, or that never retried anything, fails one half.

  test("DISCRIMINATING PAIR (1/2): an empty-bodied 404 is retried on the SAME model, and the figure IS described", async () => {
    const calls: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response("", { status: 404 }); // transient: empty body
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. A nephron diagram." }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const start = Date.now();
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
      });
      const elapsed = Date.now() - start;
      assert.equal(out.get("a.png"), "A nephron diagram.", "the figure IS described after the transient retry succeeded");
      assert.equal(calls.length, 2, "exactly two requests: the empty 404 and its retry");
      assert.ok(calls.every((url) => url.includes(VISION_MODEL_LADDER[0]!)), "the ladder never advanced — both calls hit the FIRST model");
      // Secondary/generous — the structural assertions above are what actually
      // discriminates. A floor comfortably below the jittered minimum (300ms at
      // VISION_RETRY_BASE_MS=400) proves a real backoff happened without risking a
      // flake if CI is briefly slow.
      assert.ok(elapsed >= 200, `only ${elapsed}ms elapsed — a real backoff must have happened before the retry`);
    } finally {
      globalThis.fetch = before;
    }
  });

  test("DISCRIMINATING PAIR (2/2): a JSON-bodied 'no longer available' 404 advances the ladder immediately, with no retry", async () => {
    const calls: string[] = [];
    const before = globalThis.fetch;
    const retiredBody = JSON.stringify({
      error: { code: 404, message: "This model models/gemini-3.7-flash is no longer available to new users.", status: "NOT_FOUND" },
    });
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(retiredBody, { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. A nephron diagram." }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const start = Date.now();
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
      });
      const elapsed = Date.now() - start;
      assert.equal(out.get("a.png"), "A nephron diagram.");
      // STRUCTURAL, and primary: two requests, to two DIFFERENT models. This is
      // impossible to produce by retrying — only an immediate ladder walk gets here.
      assert.equal(calls.length, 2, "exactly two requests: the retired first model, then the second");
      assert.ok(calls[0]!.includes(VISION_MODEL_LADDER[0]!));
      assert.ok(calls[1]!.includes(VISION_MODEL_LADDER[1]!), "the ladder advanced to the SECOND model, not a retry of the first");
      // Secondary/generous headroom — nothing in the terminal path sleeps at all, so
      // this should be a handful of milliseconds even under a slow CI runner.
      assert.ok(elapsed < 200, `${elapsed}ms elapsed for a path with no backoff in it — retirement must not be treated as transient`);
    } finally {
      globalThis.fetch = before;
    }
  });

  test("401/403 still short-circuits the WHOLE ladder, not just the current model's retry loop", async () => {
    // 🔴 RECALIBRATING AN EXISTING INVARIANT, NOT A NEW ONE. The retry loop sits
    // INSIDE the per-model iteration; this proves the auth short-circuit still fires
    // before the ladder is ever walked, exactly as it did before this fix.
    const calls: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response("", { status: 401 });
    }) as unknown as typeof fetch;
    try {
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
      });
      assert.equal(out.size, 0);
      assert.equal(calls.length, 1, "a rejected key must not be retried, and must not walk to a second model");
    } finally {
      globalThis.fetch = before;
    }
  });

  test("a network throw is transient: retried on the SAME model, not an immediate ladder walk", async () => {
    // 🔴 A BEHAVIOUR CHANGE FROM BEFORE THIS FIX, NAMED EXPLICITLY. A thrown fetch used
    // to `continue` straight to the next model with no retry at all — the same defect
    // shape as the empty-404 case, just via a different exception path.
    const calls: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (calls.length === 1) throw new Error("network reset");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. A nephron diagram." }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
      });
      assert.equal(out.get("a.png"), "A nephron diagram.");
      assert.equal(calls.length, 2);
      assert.ok(calls.every((url) => url.includes(VISION_MODEL_LADDER[0]!)), "both calls hit the SAME model — the throw was retried, not walked past");
    } finally {
      globalThis.fetch = before;
    }
  });

  test("400 is terminal: the ladder advances immediately, retrying an unacceptable payload wastes nothing", async () => {
    const calls: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(JSON.stringify({ error: { code: 400, message: "invalid argument" } }), { status: 400 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. A nephron diagram." }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const start = Date.now();
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
      });
      const elapsed = Date.now() - start;
      assert.equal(out.get("a.png"), "A nephron diagram.");
      assert.equal(calls.length, 2);
      assert.ok(calls[1]!.includes(VISION_MODEL_LADDER[1]!), "advanced to the second model, not retried");
      assert.ok(elapsed < 200, `${elapsed}ms elapsed — 400 must not back off at all`);
    } finally {
      globalThis.fetch = before;
    }
  });

  test("transient retries are BOUNDED: exactly VISION_RETRY_ATTEMPTS per model, then the ladder advances", async () => {
    const perModel: Record<string, number> = {};
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      const model = VISION_MODEL_LADDER.find((candidate) => String(url).includes(candidate))!;
      perModel[model] = (perModel[model] ?? 0) + 1;
      if (model === VISION_MODEL_LADDER[0]) return new Response("", { status: 404 }); // always transient
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "1. A nephron diagram." }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
      });
      assert.equal(out.get("a.png"), "A nephron diagram.", "recovered on the second rung after the first exhausted its retries");
      assert.equal(
        perModel[VISION_MODEL_LADDER[0]!],
        VISION_RETRY_ATTEMPTS,
        `the first model must be tried exactly ${VISION_RETRY_ATTEMPTS} times (bounded), not fewer and not unboundedly more`,
      );
      assert.equal(perModel[VISION_MODEL_LADDER[1]!], 1, "the second model succeeded on its first try");
    } finally {
      globalThis.fetch = before;
    }
  });

  test("an abort mid-backoff stops retrying immediately — no further attempt, no sleeping through it", async () => {
    const calls: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response("nope", { status: 500 }); // transient every time, so it would retry if not aborted
    }) as unknown as typeof fetch;
    const controller = new AbortController();
    try {
      const start = Date.now();
      const resultPromise = describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], {
        env: { GEMINI_API_KEY: "k" },
        signal: controller.signal,
      });
      // Abort well inside the backoff window (floor is 300ms at VISION_RETRY_BASE_MS=400)
      // but after the first request has definitely gone out.
      setTimeout(() => controller.abort(), 30);
      const out = await resultPromise;
      const elapsed = Date.now() - start;
      assert.equal(out.size, 0, "an aborted call describes nothing, honestly — never throws");
      assert.equal(calls.length, 1, "no retry attempt was made after the abort fired");
      assert.ok(elapsed < 250, `${elapsed}ms elapsed — the abort must cancel the backoff sleep, not be slept through`);
    } finally {
      globalThis.fetch = before;
    }
  });

  test("transient retries are counted by the ledger exactly like ladder walks are", async () => {
    // 🔴 EXTENDS THE EXISTING 'retries are counted' GUARD ABOVE THIS BLOCK. That one
    // proved a ladder WALK is billed per HTTP request; this proves a same-model RETRY
    // is too — `noteCall()` sits inside the retry loop, not outside it, so a request
    // that never reached a different model still cost exactly what it used.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch; // transient, always
    const ledger = new VisionLedger(50);
    try {
      await withVisionBudget(ledger, async () => {
        await readFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a" }], {
          env: { GEMINI_API_KEY: "k" },
        });
      });
    } finally {
      globalThis.fetch = before;
    }
    assert.equal(
      ledger.spend().calls,
      VISION_MODEL_LADDER.length * VISION_RETRY_ATTEMPTS,
      "every retry on every rung was a real HTTP request and is counted as one",
    );
    assert.equal(ledger.spend().units, 1, "and the figure was still paid for exactly once");
  });
});
