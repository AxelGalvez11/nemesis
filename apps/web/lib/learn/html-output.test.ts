// 🔴🔴 A PAGE NEMESIS WROTE IS THE ONE OUTPUT THAT IS CODE. Owner, 2026-09-04: *"yes it should be
// able to display html"*. Everything else the canvas makes is prose or data; this one runs. So the
// rules that matter here are not about shape, they are about what the page is allowed to do, and
// about the one property that makes running it safe at all: it cannot reach the network.
//
// If any assertion in the first test fails, the page can talk to the internet. Read the header of
// `html-output.ts` before changing a character of it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { looksLikePage, OUTPUT_CSP, sandboxedPage, stripFence } from "@/lib/learn/html-output";
import { htmlAskParagraph, readDeliverableAsk } from "@/lib/learn/canvas-deliverables";

const PREVIEW = readFileSync(
  new URL("../../components/workspace/learn/output-preview.tsx", import.meta.url),
  "utf8",
);
const DELIVERABLES = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
const CARD = readFileSync(new URL("../../components/workspace/learn/artifact-card.tsx", import.meta.url), "utf8");

test("🔴🔴 a page Nemesis wrote cannot reach the network", () => {
  // Every fetching directive falls back to default-src, and default-src is none.
  assert.match(OUTPUT_CSP, /default-src 'none'/, "the page can fetch again");
  assert.ok(!/connect-src/.test(OUTPUT_CSP), "a connect-src was added, which reopens fetch and websockets");
  assert.match(OUTPUT_CSP, /img-src data: blob:;/, "an image could be loaded from a remote host");
  assert.match(OUTPUT_CSP, /font-src data:;/, "a font could be loaded from a remote host");
  assert.match(OUTPUT_CSP, /form-action 'none'/, "the page could post somewhere");
  assert.match(OUTPUT_CSP, /base-uri 'none'/, "a <base> tag could redirect every relative URL off-origin");

  // And the frame is opaque: scripts run, but nothing of this app is reachable from inside.
  assert.match(PREVIEW, /sandbox="allow-scripts"/, "the frame's sandbox changed");
  assert.ok(
    !/sandbox="[^"]*allow-same-origin/.test(PREVIEW),
    "allow-same-origin was added: the page could then read this app's storage, cookies and DOM",
  );
  assert.match(PREVIEW, /srcDoc=\{sandboxedPage\(output\.html\)\}/, "the page is rendered without its policy");
  assert.ok(
    !/dangerouslySetInnerHTML[^]{0,400}output\.html/.test(PREVIEW),
    "a model-written page reached dangerouslySetInnerHTML",
  );
});

test("🔴 the policy is placed where a browser will still obey it", () => {
  const withHead = sandboxedPage("<html><head><title>T</title></head><body>x</body></html>");
  assert.match(withHead, /<head><meta http-equiv="Content-Security-Policy"/, "the policy is not first inside <head>");
  assert.ok(withHead.indexOf("Content-Security-Policy") < withHead.indexOf("<title>"), "content precedes the policy");

  const headless = sandboxedPage("<div>hello</div>");
  assert.ok(headless.startsWith('<meta http-equiv="Content-Security-Policy"'), "a page with no head is left unguarded");

  // Case and attributes on the head tag must not defeat it.
  const shouty = sandboxedPage('<HTML><HEAD lang="en"><script>1</script></HEAD></HTML>');
  assert.ok(
    shouty.indexOf("Content-Security-Policy") < shouty.indexOf("<script>"),
    "an uppercase or attributed <head> let a script run ahead of the policy",
  );
});

test("🔴 the model's wrapper comes off, and only the outer one", () => {
  assert.equal(stripFence("```html\n<div>a</div>\n```"), "<div>a</div>");
  assert.equal(stripFence("```\n<div>a</div>\n```"), "<div>a</div>");
  assert.equal(stripFence("<div>a</div>"), "<div>a</div>");
  // A page may legitimately contain a fence inside a <pre>; a greedy strip would cut it in half.
  const inner = "<pre>```\nsample\n```</pre>";
  assert.equal(stripFence(inner), inner, "a fence inside the page was treated as the wrapper");
});

test("🔴 prose is refused, a page is accepted", () => {
  assert.ok(looksLikePage("<!doctype html><html><body>x</body></html>"));
  assert.ok(looksLikePage("<div class='x'>y</div>"));
  assert.ok(looksLikePage("<svg viewBox='0 0 1 1'></svg>"));
  assert.ok(!looksLikePage("I'm sorry, I can't build that page."));
  assert.match(DELIVERABLES, /if \(!looksLikePage\(html\)\) return \{ error:/, "an apology in prose would be saved as a page");
});

test("🔴 the learner's own words reach the page door", () => {
  for (const said of [
    "make me an interactive page about the Krebs cycle",
    "build an html page for this",
    "create a web page showing the timeline",
    "make an interactive diagram of the circuit",
    "generate an html file",
  ]) {
    assert.equal(readDeliverableAsk(said), "html", `"${said}" no longer reaches the page maker`);
  }
  // And it must not have eaten the doors either side of it.
  assert.equal(readDeliverableAsk("make me a document on insulin therapy"), "document");
  assert.equal(readDeliverableAsk("write me flashcards"), "flashcards");
  assert.equal(readDeliverableAsk("make me notes on chapter 4"), "note");
  assert.equal(readDeliverableAsk("make me slides"), "slides");
  // 🔴 THE IDIOM EXCLUSION SURVIVES. "build a document parser" is a computer-science question.
  assert.equal(readDeliverableAsk("build a document parser"), null);
});

test("🔴 the page writer is told there is no network, and stays field-agnostic", () => {
  const system = DELIVERABLES.split("const HTML_SYSTEM")[1]?.split(";")[0] ?? "";
  assert.ok(system.length > 0, "the page writer's instructions are gone");
  assert.match(system, /There " \+\n  "is no network/, "the writer is no longer told the frame has no network");
  assert.match(system, /Do not reference any URL/);
  assert.match(system, /prefers-color-scheme/, "a page could render unreadable in the other theme");
  assert.ok(!system.includes("—"), "an em dash reached a prompt (owner, 2026-08-25)");
  for (const word of ["drug", "patient", "clinical", "law student", "engineering"]) {
    assert.ok(!new RegExp(word, "i").test(system), `the page prompt scoped itself to ${word}`);
  }
});

test("🔴 the ask is quoted and capped, like the note writer's", () => {
  assert.equal(htmlAskParagraph(), "");
  assert.equal(htmlAskParagraph("   "), "");
  assert.match(htmlAskParagraph("a timeline of the reforms"), /The learner asked: "a timeline of the reforms"/);
  const long = htmlAskParagraph("x".repeat(500));
  assert.ok(long.includes("x".repeat(300)) && !long.includes("x".repeat(301)), "the ask is no longer capped at 300");
});

test("🔴 the page is a kind everywhere a kind is named", () => {
  assert.match(DELIVERABLES, /export type DeliverableKind = "document" \| "flashcards" \| "html"/);
  assert.match(CARD, /html: \{ extension: "html"/, "the chat card has no face for a page");
  assert.match(PREVIEW, /html: "Download \.html"/, "the download button has no label for a page");
  assert.match(PREVIEW, /output\.kind === "html" && output\.html\) return void downloadHtml/, "a page cannot be downloaded");
});
