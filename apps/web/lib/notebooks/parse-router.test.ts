import assert from "node:assert/strict";
import { test } from "node:test";

import { doclingConfig, pollDelayMs } from "./docling-client.ts";
import { doclingFormats, routeFor } from "./parse-router.ts";

const KINDS = ["pdf", "docx", "pptx", "image"] as const;

test("an empty environment routes EVERY format to our own parser", () => {
  // This is the production-unchanged guarantee, asserted rather than assumed.
  const formats = doclingFormats({});
  assert.equal(formats.size, 0);
  for (const kind of KINDS) {
    assert.equal(routeFor(kind, { formats, serviceConfigured: true }).parser, "nemesis");
  }
});

test("the flag is per format, so enabling one does not move the others", () => {
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf" });
  const opts = { formats, serviceConfigured: true };
  assert.equal(routeFor("pdf", opts).parser, "docling");
  assert.equal(routeFor("docx", opts).parser, "nemesis");
  assert.equal(routeFor("pptx", opts).parser, "nemesis");
});

test("enabling a format without a service keeps the built-in parser", () => {
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf,docx" });
  const decision = routeFor("pdf", { formats, serviceConfigured: false });
  assert.equal(decision.parser, "nemesis");
  assert.match(decision.reason, /no service configured/);
});

test("a typo in the flag is ignored, never thrown", () => {
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf, pdff , ,DOCX" });
  assert.deepEqual([...formats].sort(), ["docx", "pdf"]);
});

test("images are never routed to docling", () => {
  // Our image lane is a vision call, not a document parse. There is nothing for
  // a layout model to do and routing it would spend money for no structure.
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf,docx,pptx,image" });
  assert.equal(routeFor("image", { formats, serviceConfigured: true }).parser, "nemesis");
});

test("service config is absent unless a real URL is set", () => {
  assert.equal(doclingConfig({}), null);
  assert.equal(doclingConfig({ DOCLING_SERVE_URL: "  " }), null);
  // A bare host is rejected: an unscheme'd URL would be resolved relative to the
  // app and quietly POST a student's document at ourselves.
  assert.equal(doclingConfig({ DOCLING_SERVE_URL: "docling.internal:5001" }), null);

  const cfg = doclingConfig({ DOCLING_SERVE_URL: "http://docling.internal:5001/" });
  assert.equal(cfg?.baseUrl, "http://docling.internal:5001");
});

test("client limits do not depend on how the service is configured", () => {
  // docling-serve ships a SEVEN DAY document timeout and no size or page cap at
  // all. These are ours and they apply whatever the server believes.
  const cfg = doclingConfig({ DOCLING_SERVE_URL: "http://x:5001" });
  assert.ok(cfg);

  // TWO limits, because the conversion is submitted asynchronously and they
  // bound different things. Conflating them is what an earlier single 120s
  // "timeout" did, and it would have killed the slowest legitimate document.
  //
  // `timeoutMs` bounds ONE request. Submitting and polling both return
  // immediately, so a control call that takes a minute is a broken service, not
  // a slow document.
  assert.ok(cfg.timeoutMs > 0 && cfg.timeoutMs <= 60_000, "a control call is short");

  // `taskBudgetMs` bounds the DOCUMENT, across however many attempts resume it.
  // Floor: the slowest legitimate document in the 154-PDF corpus took 297s (17
  // pages, 15 tables), and a shared sidecar adds queue wait on top.
  // Ceiling: it must stay obviously bounded against the server's 7-day default,
  // which is what this test exists to prevent us from inheriting.
  const SLOWEST_REAL_DOCUMENT_MS = 297_000;
  const SERVER_DEFAULT_MS = 604_800_000;
  assert.ok(cfg.taskBudgetMs > SLOWEST_REAL_DOCUMENT_MS, "clears the slowest measured document");
  assert.ok(cfg.taskBudgetMs <= SERVER_DEFAULT_MS / 500, "still tightly bounded");
  assert.ok(cfg.maxBytes > 0 && cfg.maxBytes <= 64 * 1024 * 1024, "a bounded upload");
});

test("the poll cadence starts tight and settles, so a fast document is not made slow", () => {
  // Half of these documents finish in under 13s; a 5s first poll would add 40%
  // to the median for nothing. It must also stop growing, or a queued task
  // would be checked once an hour.
  assert.ok(pollDelayMs(0) <= 2_000, "the first check is quick");
  assert.ok(pollDelayMs(1) > pollDelayMs(0), "it backs off");
  assert.equal(pollDelayMs(20), pollDelayMs(50), "and stops backing off");
  assert.ok(pollDelayMs(50) <= 10_000, "at a cadence a queued task can afford");
});
