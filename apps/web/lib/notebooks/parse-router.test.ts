import assert from "node:assert/strict";
import { test } from "node:test";

import { doclingConfig } from "./docling-client.ts";
import { doclingFormats, routeFor } from "./parse-router.ts";

const KINDS = ["pdf", "docx", "pptx", "image"] as const;

test("an empty environment routes EVERY format to our own parser", () => {
  // This is the production-unchanged guarantee, asserted rather than assumed.
  const formats = doclingFormats({} as NodeJS.ProcessEnv);
  assert.equal(formats.size, 0);
  for (const kind of KINDS) {
    assert.equal(routeFor(kind, { formats, serviceConfigured: true }).parser, "nemesis");
  }
});

test("the flag is per format, so enabling one does not move the others", () => {
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf" } as NodeJS.ProcessEnv);
  const opts = { formats, serviceConfigured: true };
  assert.equal(routeFor("pdf", opts).parser, "docling");
  assert.equal(routeFor("docx", opts).parser, "nemesis");
  assert.equal(routeFor("pptx", opts).parser, "nemesis");
});

test("enabling a format without a service keeps the built-in parser", () => {
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf,docx" } as NodeJS.ProcessEnv);
  const decision = routeFor("pdf", { formats, serviceConfigured: false });
  assert.equal(decision.parser, "nemesis");
  assert.match(decision.reason, /no service configured/);
});

test("a typo in the flag is ignored, never thrown", () => {
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf, pdff , ,DOCX" } as NodeJS.ProcessEnv);
  assert.deepEqual([...formats].sort(), ["docx", "pdf"]);
});

test("images are never routed to docling", () => {
  // Our image lane is a vision call, not a document parse. There is nothing for
  // a layout model to do and routing it would spend money for no structure.
  const formats = doclingFormats({ DOCLING_FORMATS: "pdf,docx,pptx,image" } as NodeJS.ProcessEnv);
  assert.equal(routeFor("image", { formats, serviceConfigured: true }).parser, "nemesis");
});

test("service config is absent unless a real URL is set", () => {
  assert.equal(doclingConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(doclingConfig({ DOCLING_SERVE_URL: "  " } as NodeJS.ProcessEnv), null);
  // A bare host is rejected: an unscheme'd URL would be resolved relative to the
  // app and quietly POST a student's document at ourselves.
  assert.equal(doclingConfig({ DOCLING_SERVE_URL: "docling.internal:5001" } as NodeJS.ProcessEnv), null);

  const cfg = doclingConfig({ DOCLING_SERVE_URL: "http://docling.internal:5001/" } as NodeJS.ProcessEnv);
  assert.equal(cfg?.baseUrl, "http://docling.internal:5001");
});

test("client limits do not depend on how the service is configured", () => {
  // docling-serve ships a SEVEN DAY document timeout and no size or page cap at
  // all. These are ours and they apply whatever the server believes.
  const cfg = doclingConfig({ DOCLING_SERVE_URL: "http://x:5001" } as NodeJS.ProcessEnv);
  assert.ok(cfg);
  assert.ok(cfg.timeoutMs > 0 && cfg.timeoutMs <= 300_000, "a bounded timeout");
  assert.ok(cfg.maxBytes > 0 && cfg.maxBytes <= 64 * 1024 * 1024, "a bounded upload");
});
