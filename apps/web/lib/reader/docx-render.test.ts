// A Word file drawn as its pages: what may reach the page, and what happens when it cannot be drawn.
//
// The deck's rule, applied to the document (owner, 2026-09-04: *"make sure any documents can be
// viewed too"*): the real thing, in the browser, with no service, and scrubbed before it touches
// the page.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseHTML } from "linkedom";

import { cssLengthToPx, safeDocxStyle, scrubDocxNodes } from "@/lib/reader/docx-render";

const RENDER = readFileSync(new URL("./docx-render.ts", import.meta.url), "utf8");
const VIEW = readFileSync(new URL("../../components/workspace/reader/docx-document-view.tsx", import.meta.url), "utf8");

/** Nodes the way the renderer hands them over: top-level elements, in order. */
function nodes(html: string): Node[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return [...document.body.childNodes];
}

test("🔴🔴 a page that cannot be drawn falls back to the reflow, never to nothing", () => {
  assert.match(RENDER, /: Promise<RenderedDocx \| null>/, "the renderer stopped being allowed to say no");
  assert.match(RENDER, /catch \{\s*return null;/, "a throw escapes the renderer and takes the document with it");
  assert.match(VIEW, /\{pages \? \(/, "the view no longer prefers the real page");
  assert.match(VIEW, /<ReflowedDocument /, "the reflow is no longer the fallback");
  assert.match(VIEW, /renderDocxPages\(bytes\)/, "the view never asks for the pages");
});

test("🔴🔴 HTML chunks inside a Word file are never rendered", () => {
  // An altChunk is a web page embedded in a document. It is the one place a .docx carries HTML.
  assert.match(RENDER, /renderAltChunks: false/, "embedded HTML is rendered again");
});

test("🔴 an element the renderer has no business emitting is dropped whole", () => {
  const kept = scrubDocxNodes(nodes('<section class="nemesis-docx"><article><p>Hello</p><script>alert(1)</script><iframe src="https://x"></iframe><object data="x"></object></article></section><script>alert(2)</script>'));
  assert.equal(kept.length, 1, "a top-level script survived");
  const section = kept[0] as Element;
  assert.equal(section.querySelector("script, iframe, object"), null, "an executable element survived inside a page");
  assert.equal(section.textContent?.trim(), "Hello");
});

test("🔴 handlers and executable links are stripped; a web link is kept and opens elsewhere", () => {
  const kept = scrubDocxNodes(nodes('<section><p onclick="steal()"><a href="javascript:alert(1)">bad</a><a href="https://example.org/paper">good</a><a href="#bookmark">local</a></p></section>'));
  const section = kept[0] as Element;
  assert.equal(section.querySelector("[onclick]"), null, "an on* attribute survived");
  const links = [...section.querySelectorAll("a")];
  assert.equal(links[0]?.getAttribute("href"), null, "a javascript: link kept its target");
  assert.equal(links[1]?.getAttribute("href"), "https://example.org/paper");
  assert.equal(links[1]?.getAttribute("target"), "_blank");
  assert.equal(links[1]?.getAttribute("rel"), "noopener noreferrer");
  assert.equal(links[2]?.getAttribute("href"), "#bookmark", "a bookmark inside the document was cut");
});

test("🔴 a picture is local to the render or it is nothing", () => {
  const kept = scrubDocxNodes(nodes('<section><img src="https://tracker.example/pixel.gif"><img src="blob:https://app/abc"><img src="data:image/png;base64,AAAA"><svg><image xlink:href="https://x/y.png"></image></svg></section>'));
  const section = kept[0] as Element;
  const images = [...section.querySelectorAll("img")];
  assert.equal(images[0]?.getAttribute("src"), null, "a remote picture would fetch on render");
  assert.equal(images[1]?.getAttribute("src"), "blob:https://app/abc");
  assert.equal(images[2]?.getAttribute("src"), "data:image/png;base64,AAAA");
  assert.equal(section.querySelector("image")?.getAttribute("xlink:href"), null, "a remote VML picture would fetch on render");
});

test("🔴 a stylesheet keeps the document's own fonts and loses every remote reference", () => {
  const css = '@import url("https://evil/x.css"); .nemesis-docx { background: url(https://tracker/p.png); } @font-face { src: url(blob:https://app/font) }';
  const safe = safeDocxStyle(css);
  assert.ok(!safe.includes("@import"), "an @import survived");
  assert.ok(!safe.includes("tracker"), "a remote url() survived");
  assert.ok(safe.includes("url(blob:https://app/font)"), "the document's own embedded font was cut");
  const kept = scrubDocxNodes(nodes('<style>p { background: url(https://x/y.png) }</style><section><p style="background: url(https://x/z.png); color: red">t</p></section>'));
  assert.ok(!(kept[0] as Element).textContent?.includes("https://x"), "a remote url() in a top-level style survived");
  assert.equal((kept[1] as Element).querySelector("p")?.getAttribute("style"), null, "an inline style with a remote url() survived");
});

test("a page size the renderer wrote is read in any unit the file may use", () => {
  assert.equal(cssLengthToPx("612pt"), 816);
  assert.equal(cssLengthToPx("8.5in"), 816);
  assert.equal(Math.round(cssLengthToPx("210mm") ?? 0), 794);
  assert.equal(cssLengthToPx("816px"), 816);
  assert.equal(cssLengthToPx("wide"), null);
  assert.equal(cssLengthToPx(undefined), null);
});
