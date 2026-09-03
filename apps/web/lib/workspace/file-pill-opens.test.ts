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

test("the canvas carries the id the panel needs, and passes a stable opener", () => {
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(canvas, /librarySourceId: source\.librarySourceId \?\? null/, "the pill cannot find the filed document");
  assert.match(canvas, /const openCitedFile = useCallback\(/, "the opener is not stable, so it restarts the fade-in every render");
  // 🔴 IT OPENS THE SOURCES PANEL NOW, NOT A PANE OF ITS OWN (owner 2026-09-03). It used to build a
  // synthetic pill and hand it to a second reader; the canvas has the source by id right here, so
  // the guess was never needed on this path.
  assert.match(canvas, /dock\.openDocument\(source\)/, "the opener does not reach the Sources panel");
  // Both places an answer is drawn: the thread and the turn being answered right now.
  assert.equal((canvas.match(/onOpenFile=\{openCitedFile\}/g) ?? []).length, 2, "one of the two answer renderers cannot open a pill");
});

test("🔴 the panel it opens into is the header's own, which holds several at once", () => {
  // 🔴 THE DESTINATION IS THE POINT OF THIS TEST, AND IT CHANGED. It used to assert the citation
  // pane's `open()` shape; that pane is deleted, and asserting anything about it would now be
  // asserting that it exists. What has to hold is that a chip and the header's Sources control
  // reach the SAME list of open documents — which is what one shared dock buys.
  const dock = code("../../components/workspace/learn/document-dock.tsx");
  assert.match(dock, /openPill: \(pill: DocumentPill\) => boolean;/, "the pill's opener changed shape or stopped reporting a miss");
  const controls = code("../../components/workspace/learn/canvas-controls.tsx");
  assert.match(controls, /const dock = useDocumentDock\(\);/, "the Sources panel went back to owning its own list of open documents");
  assert.doesNotMatch(controls, /useState<\{ open: CanvasSource\[\]; activeId/, "a second owner of the open documents is back");
});
