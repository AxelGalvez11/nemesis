import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Source with its comments stripped: several guards below ban a shape that the note explaining
 *  the fix necessarily quotes, and a "must not appear" test that reads its own explanation fails
 *  the moment you document anything. */
function code(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// The pill a sentence pins to one of the learner's own documents. It rendered as decoration.

test("🔴 a file pill is a button, not decoration", () => {
  // Measured on production 2026-09-03, on a canvas holding thirty lectures: every file pill in
  // every answer was a `<span>` with `cursor: auto` and no handler. The reading pane it should
  // open has held several documents at once since #913; nothing in a conversation could reach it,
  // so the obvious gesture — click the document a sentence cites — did nothing at all.
  const markdown = code("./chat-markdown.tsx");
  assert.match(markdown, /onClick=\{\(\) => onOpenFile\(file\)\}/, "the file pill no longer opens anything");
  assert.match(markdown, /type="button"/, "the pill is not a real button");
});

test("it stays inert where there is no pane to open into", () => {
  // 🔴 THE HALF OF THE ORIGINAL REFUSAL THAT STANDS. `chat-markdown` renders in the Library reader
  // too, and "a pill that looks clickable and goes nowhere is worse than one that plainly does
  // not" is still true. The button appears only when a caller supplied somewhere to go.
  const markdown = code("./chat-markdown.tsx");
  assert.match(markdown, /if \(file && onOpenFile\)/, "the pill became a button even with nothing to open");
  assert.match(markdown, /onOpenFile\?: \(file: FileCitation\) => void;/, "the opener is not optional");
});

test("🔴 the memoised renderers depend on what they close over", () => {
  // 🔴 THE SUBTLE ONE. `markdownComponents` is memoised to stop the answer's fade-in restarting on
  // every keystroke. Adding `files`/`onOpenFile` to the call without adding them to the dependency
  // list freezes the first render's values in: clicking a pill would open whatever document
  // happened to be cited when the answer first mounted, which is a wrong document rather than a
  // missing one.
  const markdown = code("./chat-markdown.tsx");
  const deps = /\[onWikiLink, isWikiLinkAvailable, externalLinksInNewTab, sources, namedCitations([^\]]*)\]/.exec(markdown);
  assert.ok(deps, "the components memo's dependency list has moved");
  assert.match(deps![1]!, /files/, "`files` is closed over but not depended on");
  assert.match(deps![1]!, /onOpenFile/, "`onOpenFile` is closed over but not depended on");
});

test("the canvas carries the id the pane needs, and passes a stable opener", () => {
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(canvas, /librarySourceId: source\.librarySourceId \?\? null/, "the pill cannot find the filed document");
  assert.match(canvas, /const openCitedFile = useCallback\(/, "the opener is not stable, so it restarts the fade-in every render");
  assert.match(canvas, /sourceTabs\.open\(\{/, "the opener does not reach the reading pane");
  // Both places an answer is drawn: the thread and the turn being answered right now.
  assert.equal((canvas.match(/onOpenFile=\{openCitedFile\}/g) ?? []).length, 2, "one of the two answer renderers cannot open a pill");
});

test("the pane it opens into is the one that holds several at once", () => {
  const tabs = code("../learn/source-tabs.ts");
  assert.match(tabs, /export function openTab\(/, "the tab store lost its opener");
  const viewer = code("../../components/workspace/learn/source-tab-viewer.tsx");
  assert.match(viewer, /open: \(pill: DocumentPill\) => void;/, "the pane's open() changed shape under the pill");
});
