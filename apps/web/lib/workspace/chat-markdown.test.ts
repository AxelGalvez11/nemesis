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
  assert.match(
    SOURCE,
    /import \{ Children, useMemo \} from "react";/,
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
