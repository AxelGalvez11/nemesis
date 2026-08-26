import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { searchedDomains } from "./canvas-chat";

// ── the sites a turn is reading, on their way to the dock's favicon chips ────────────────────
//
// Owner 2026-08-24: *"if it's searching the web, can it also show the favicons as thumbnails when
// searching… when they're thinking preview?"* The chips are the dock's to draw (nemesis-5e's
// lane); the data is this lane's, and the contract between the two is `domains?: readonly
// string[]` — bare hostnames, deduped, in the order the search ranked them, NOT truncated.
//
// 🔴🔴 THE RULE THESE TESTS DEFEND IS `thinking-phases.ts`'s, APPLIED TO A PICTURE. That file's
// standing rule is that a caption must name a step GENUINELY RUNNING — no timers, no guessed
// progress, because a caption that describes work which is not happening has been lying the whole
// time. A favicon is the same claim in a smaller space: a chip for a site we merely might hit, or
// one still showing after the answer arrived, is that failure with a logo on it.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CHAT = strip(readFileSync(new URL("./canvas-chat.ts", import.meta.url), "utf8"));
const SESSION = strip(readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8"));
const CANVAS = strip(readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8"));
const DOCK = strip(readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8"));

test("hosts come back deduped, in the order the results arrived", () => {
  assert.deepEqual(
    searchedDomains([
      { url: "https://en.wikipedia.org/wiki/Heart" },
      { url: "https://www.nhs.uk/conditions/arrhythmia/" },
      { url: "https://en.wikipedia.org/wiki/Sinoatrial_node" },
    ]),
    ["en.wikipedia.org", "www.nhs.uk"],
  );
});

test("🔴 four pages from one site is ONE chip", () => {
  // Four identical favicons would say the answer stands on four places when it stands on one.
  const many = Array.from({ length: 4 }, (_, i) => ({ url: `https://example.com/page-${i}` }));
  assert.deepEqual(searchedDomains(many), ["example.com"]);
});

test("a URL that cannot be parsed contributes nothing, not a placeholder", () => {
  assert.deepEqual(searchedDomains([{ url: "not a url" }, { url: "https://ok.org/x" }]), ["ok.org"]);
  assert.deepEqual(searchedDomains([]), []);
});

test("🔴 the caller never truncates — the renderer wants the real count for its +N", () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ url: `https://site-${i}.org/a` }));
  assert.equal(searchedDomains(nine).length, 9, "the data half started deciding how many chips to draw");
  assert.ok(!/slice\(0, ?\d+\)/.test(CHAT.slice(CHAT.indexOf("export function searchedDomains"), CHAT.indexOf("export async function askCanvasChat"))));
});

test("🔴🔴 the outgoing request clears the previous round's hosts", () => {
  // `onSearching(null)` means a fresh request just went out, so last round's sites are already
  // wrong. Leaving them up shows chips for pages this answer does not stand on.
  assert.match(CHAT, /onSearching\?\.\(null, \[\]\);/, "a new search no longer clears the old hosts");
  assert.match(SESSION, /setSearchedDomains\(domains\);/, "the session stopped tracking the beat it was given");
});

test("🔴🔴 the hosts are the ACCUMULATED, deduped sources — not one round's haul", () => {
  // `found.sources` is this round's results; `sources` is what the answer actually stands on.
  // Using the former would make the chips flicker between rounds of a single turn.
  assert.match(CHAT, /onSearching\?\.\(sources\.length, searchedDomains\(sources\)\);/);
  assert.ok(!/searchedDomains\(found\.sources\)/.test(CHAT), "the chips describe one round instead of the turn");
});

test("🔴🔴🔴 a stale chip is unrepresentable, because the gate is computed at render", () => {
  // Calibration: drop the `turnInFlight ?` and this reddens. Between turns there IS no turn in
  // flight, so there are no chips whatever the session happens to still be holding — no cleanup
  // path has to be remembered on any of converse's exits.
  assert.match(
    CANVAS,
    /domains=\{turnInFlight \? session\.searchedDomains : undefined\}/,
    "the dock can now show hosts after the turn has finished",
  );
});

test("🔴 one host parser, shared with the pills and the sources panel", () => {
  // A host that renders one way in the panel must not render another way on the dock.
  assert.match(CHAT, /hostnameOf\(source\.url\)/, "the domains stopped using the shared host parser");
});

test("🔴 the dock takes the prop, defaults undefined to empty, and now DRAWS it", () => {
  // 🔴 THIS GUARD PINNED A HALF-STEP, AND THE HALF-STEP IS OVER. It asserted `domains: _domains = []`
  // — the deliberately-ignored destructure from the agreed hand-off, when the data landed here
  // before anyone drew it. That literal was the right thing to pin for exactly as long as "accepted
  // and not drawn" was the intended state; keeping it would have meant a test actively forbidding
  // the feature from being finished. So it moves forward to the same invariant in the new world:
  // the prop exists, undefined still means empty so no caller special-cases a search that found
  // nothing, and the chips are actually rendered.
  assert.match(DOCK, /domains\?: readonly string\[\];/, "the agreed prop is gone from the dock");
  assert.match(DOCK, /domains = \[\],/, "the dock stopped defaulting undefined to empty");
  assert.match(DOCK, /<DomainChips domains=\{domains\} \/>/, "the dock accepts the list and draws nothing with it again");
});
