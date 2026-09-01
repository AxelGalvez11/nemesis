// 🔴 SOURCE ASSERTIONS, FOR THE SAME REASON `handoff-and-mascot.test.ts` USES THEM. The bug this
// guards is a REMOUNT, not a wrong value — `AssistantMarkdown` renders correctly either way, so no
// assertion about its output can tell the two states apart. What differs is whether React reuses
// the DOM it already has or tears it down and rebuilds it on every render, and this repo's test
// runner has no DOM to observe that with (see the header of `use-canvas-speech.ts`, which states
// the same limit about hearing audio). Reading the source is what is left, so the positive
// assertions pin the memoised shape down and the negative one reddens if the inline call it
// replaced ever comes back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SOURCE = readFileSync(new URL("./chat-markdown.tsx", import.meta.url), "utf8");

test("🔴🔴 the components map is memoised, not rebuilt on every render", () => {
  // Owner, 2026-08-26: "turning on read out loud makes the text flicker on and off". Root cause,
  // verified against `hast-util-to-jsx-runtime` (what `ReactMarkdown` renders through): a custom
  // renderer like `p` or `a` becomes the `type` argument of the element React creates for it. A
  // fresh function reference on every call — which is what `markdownComponents(...)` returns —
  // is therefore a fresh `type` on every render, and React remounts rather than updates an
  // element whose `type` changed, even when its `key` did not. `useResponseAudio`'s `<audio>`
  // fires `ontimeupdate`/`onprogress` several times a second while a reply reads itself aloud, and
  // those ticks re-render whatever renders this component — so every one of them was tearing down
  // and rebuilding the whole answer, replaying its CSS entry animation (`canvas-answer-block` in
  // globals.css) each time. The learner saw that as the text blinking on and off.
  // 🔴 THE IMPORT LIST GREW (2026-08-31) when the code block gained the reference's header strip:
  // its copy control needs `useState` for the confirmation and `useRef` to read the block's text.
  // What this guard is about is `useMemo` still being there, so it now asks for that rather than
  // for the exact shape of the line — a list that cannot gain a member is a guard about imports,
  // not about memoisation.
  assert.match(
    SOURCE,
    /import \{[^}]*\buseMemo\b[^}]*\} from "react";/,
    "useMemo is no longer imported — the components map cannot be memoised without it",
  );
  assert.match(
    SOURCE,
    /const components = useMemo\(\s*\n\s*\(\) => markdownComponents\(onWikiLink, isWikiLinkAvailable, externalLinksInNewTab, sources, namedCitations\),\s*\n\s*\[onWikiLink, isWikiLinkAvailable, externalLinksInNewTab, sources, namedCitations\],\s*\n\s*\);/,
    "markdownComponents(...) is no longer memoised with useMemo, or its dependency list changed",
  );
  assert.match(
    SOURCE,
    /<ReactMarkdown\s*\n\s*components=\{components\}/,
    "ReactMarkdown is not reading the memoised components value",
  );
  // The negative half, which is what makes the positive half mean anything: this exact inline call
  // used to sit directly in the `components` prop, rebuilding every renderer function on every
  // render. If this pattern is back, the memoisation above was undone (or bypassed) and the
  // remount storm — and the flicker — is back with it.
  assert.equal(
    /components=\{markdownComponents\(/.test(SOURCE),
    false,
    "markdownComponents(...) is being called inline in the components prop again — every custom " +
      "renderer gets a new identity on every render, and ReactMarkdown remounts the whole answer",
  );
});

// ── the mermaid fence, 2026-08-30 ───────────────────────────────────────────────────────────────

test("🔴 a ```mermaid fence routes to the diagram component, every other fence stays a code block", () => {
  // Owner order: "flow charts, diagrams, graphs, mind maps in chat. Like, that's literally all I
  // want." The routing lives in the `pre` override so the diagram replaces the WHOLE block.
  assert.match(SOURCE, /import \{ MermaidDiagram \} from "@\/lib\/workspace\/mermaid-diagram";/, "the diagram component is not imported");
  assert.match(SOURCE, /language-mermaid/, "nothing detects the mermaid fence");
  assert.match(SOURCE, /<MermaidDiagram chart=/, "the fence does not reach the diagram component");
});

test("🔴 the diagram is parse-gated, strict, lazy, and falls back to the exact plain block", () => {
  const diagram = readFileSync(new URL("./mermaid-diagram.tsx", import.meta.url), "utf8");
  assert.match(diagram, /securityLevel: "strict"/, "strict mode left the initializer — model text could run things");
  assert.match(diagram, /mermaid\.parse\(text, \{ suppressErrors: true \}\)/, "render is no longer parse-gated; a half-streamed fence would show an error box");
  assert.match(diagram, /import\("mermaid"\)/, "mermaid is statically imported — a megabyte in every learner's bundle");
  // The fallback wears the SAME classes as chat-markdown's plain block, so an invalid or
  // still-streaming fence is indistinguishable from what every fence drew before this existed.
  assert.match(diagram, /aui-md-code-block my-2 overflow-x-auto rounded-\[0\.375rem\] border border-border bg-muted\/35 p-2\.5 text-foreground/, "the fallback no longer matches the plain code block");
});
