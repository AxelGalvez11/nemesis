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
  readFiguresWithVision,
  readPdfPagesWithVision,
  readPdfWithVision,
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
