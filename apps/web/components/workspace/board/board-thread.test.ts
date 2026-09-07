import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── entering a thread on the canvas ────────────────────────────────────────────────────────────
//
// Owner, 2026-09-06: *"i feel like the canvas is nice to visualize and organize but having a chat is
// nice to focus on … could there be a way to allow users to enter individual chats in the canvas so
// chat and canvas converge into one? like having canvas be the top layer, and chat be inner layer
// with sidebar functionality?"*, then *"yes lets do it this way, lets trial it in local preview,
// users should be able to join individual chats"*, and the question this answers: *"should artifacts
// like flashcards, quizzess only exist in canvas or also in chat sidebar?"*

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const THREAD = read("./board-thread.tsx");
const PROVIDER = read("./board-provider.tsx");
const SURFACE = read("./board-surface.tsx");
const CARD = read("./conversation-card.tsx");
const STUDIO = read("./board-studio.tsx");
const PAGE = read("./board-page.tsx");
const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

test("🔴🔴 entering a thread is a LAYER, never a route: the board keeps its camera and its running turn", () => {
  assert.match(PROVIDER, /enteredCardId: string \| null;/);
  assert.match(PROVIDER, /const \[enteredCardId, setEnteredCardId\] = useState<string \| null>\(null\);/, "the entered thread is not state on the provider, so leaving cannot be free");
  assert.ok(!/router\.(push|replace)/.test(THREAD), "entering navigates, which remounts the provider and drops a streaming answer");
  assert.match(SURFACE, /<BoardInner \/>\s*<BoardStudio \/>\s*[\s\S]{0,200}?<BoardThread \/>/, "the thread is not the top layer, or is outside the board's provider");
  assert.match(THREAD, /className="board-thread-in absolute inset-0 z-30/, "the layer does not cover the board");
  // 🔴 AND THE PANEL FLOATS OVER IT: the sidebar half of the ask. Drawn the other way round it is in
  // the DOM, answering, and invisible, which is how this first shipped.
  assert.match(STUDIO, /right-\[16px\] top-\[72px\] z-40/, "the Sources and Create panel is buried under an entered thread");
  assert.match(STUDIO, /right-\[16px\] top-\[16px\] z-40/, "the toolbar is buried under an entered thread");
});

test("🔴 one way out, in one place, and it is never the only one", () => {
  assert.match(THREAD, /data-testid="board-thread-back"/);
  assert.match(THREAD, /aria-label="Back to the canvas"/);
  assert.match(THREAD, /event\.key !== "Escape"/, "Escape does not leave");
  assert.match(THREAD, /if \(target && \(target\.tagName === "TEXTAREA" \|\| target\.tagName === "INPUT"\) && text\.trim\(\)\) return;/, "Escape leaves while the learner is mid-sentence");
  assert.match(PROVIDER, /if \(enteredCardId && !cards\.some\(\(card\) => card\.id === enteredCardId\)\) setEnteredCardId\(null\);/, "deleting the card you are standing in leaves the layer over nothing");
});

test("🔴 it is the SAME thread, read wider: the card's own messages and the card's own send", () => {
  assert.match(THREAD, /card\.messages\.map\(/, "the layer renders a copy of the thread rather than the thread");
  assert.match(THREAD, /sendCardMessage\(card\.id, text\)/, "a question asked inside does not reach the card");
  assert.match(THREAD, /const COLUMN = 768;/, "the reading column is not the chat's");
  assert.match(CARD, /onClick=\{\(\) => enterCard\(card\.id\)\}/, "there is no way in from the card");
  assert.match(PAGE, /if \(enteredCardId\) return null;/, "the board's own composer stays up inside a thread, so two composers are on screen");
});

test("🔴🔴 the makers follow you in, and the SCOPE is what changes (the owner's question, answered)", () => {
  // On the board: from the ticked sources, which is what a tick is for. Inside a thread: from that
  // conversation. Same six buttons, same makers, and the panel says which it will read.
  // Since 2026-09-06 a tile asks its questions first (board-studio.tsx), so the scope rides on the
  // call that Generate makes rather than on the tile press. What must not change is the RULE.
  assert.match(STUDIO, /entered \? \{ cardId: entered\.id, topic: instruction \} : \{ cardId: null, sourceIds: selectedSourceIds, topic: instruction \}/, "Create no longer follows the learner into a thread");
  assert.match(STUDIO, /const entered = cards\.find\(\(card\) => card\.id === enteredCardId\) \?\? null;/);
  assert.match(STUDIO, /data-create-scope=""/, "the panel no longer says what a press will read from");
  assert.match(STUDIO, /From this chat: \$\{entered\.title\}/);
});

test("🔴 it comes forward rather than sliding in, and it stands still under reduced motion", () => {
  assert.match(CSS, /@keyframes board-thread-in \{\s*from \{ opacity: 0; transform: scale\(0\.98\); \}/);
  // 🔴 IN THE CANVAS BLOCK'S OWN LIST, NOT A BLOCK OF ITS OWN. `canvas-motion.test.ts` reads the
  // LAST reduced-motion query in the stylesheet, so a fresh block appended here becomes that last
  // one and every rule in the real block reads as unguarded. It failed exactly that way once.
  const reduced = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reduced.slice(0, reduced.indexOf("animation: none;")).includes(".board-thread-in,"), "the layer still animates for someone who asked the system to stop moving, or it was guarded in a block of its own");
});

test("🔴🔴 a full-size chat owns the whole window, rail included, and the claim dies with the layer", () => {
  // Owner, 2026-09-06: "the left rail sidebar still shows in full size view".
  assert.match(THREAD, /function FullBleed\(\) \{\s*useDeclareFullBleedSurface\(\);/, "nothing claims the window");
  assert.match(THREAD, /<FullBleed \/>/, "the claim is never mounted");
  // 🔴 INSIDE THE LAYER'S OWN JSX, so leaving releases it. Mounted beside the layer instead, it
  // would outlive the exit and strand the learner on a board with no navigation.
  const layer = THREAD.slice(THREAD.indexOf("data-board-thread={card.id}"));
  assert.ok(layer.indexOf("<FullBleed />") >= 0 && layer.indexOf("<FullBleed />") < layer.indexOf("</div>"), "the claim is outside the layer it belongs to");
  // The exit it is allowed to remove the rail on account of.
  assert.match(THREAD, /data-testid="board-thread-back"/);
});

test("🔴🔴 what a chat made is shown IN the chat, and it opens beside it rather than over it", () => {
  // Owner, 2026-09-06, of the Gemini thread he linked: "you basically have a chat and you prompt it
  // to create flashcard ... i like that functionality". Asking in words already made the thing
  // (`sendCardMessage` reads a make-ask); what was missing is that it landed on the board behind
  // this layer, so from inside a full-size chat nothing appeared to happen.
  assert.match(THREAD, /data-thread-made=""/, "a full-size chat does not show what it has made");
  assert.match(THREAD, /outputs\.filter\(\(output\) => output\.cardId === enteredCardId\)/, "the rows are not this thread's own");
  assert.match(THREAD, /openOutput\(output\.id\)/, "Open does not open it");
  // 🔴 A TEST HAS NO PANEL VIEW, SO ITS BUTTON SAYS SOMETHING ELSE. A check carries a `run` in its
  // own card, not a `CanvasOutput`, so "Open" on one was a button that did nothing.
  assert.match(THREAD, /output\.kind === "check" \? "Show on canvas" : "Open"/, "a test offers an Open that cannot work");
  assert.match(THREAD, /if \(output\.kind === "check"\) leaveCard\(\);/);
  // Beside the chat, over the board: both are the owner's, for different surfaces.
  assert.match(PAGE, /initialMode=\{enteredCardId \? "docked" : "full"\}/, "a made thing covers the chat that made it, or a panel narrows the board");
});

