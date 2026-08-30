// What the reading pane must never do: duplicate a source, empty itself mid-read, or evict the
// tab the learner is looking at.

import assert from "node:assert/strict";
import { test } from "node:test";


import {
  type DocumentPill,
  MAX_TABS,
  NO_TABS,
  activateTab,
  activeTab,
  closeTab,
  openTab,
  tabKey,
} from "./source-tabs";

const doc = (
  label: string,
  excerpt = "passage",
  librarySourceId: string | null = null,
): DocumentPill => ({ kind: "document", label, title: label, section: null, excerpt, librarySourceId });

test("one pill never opens two tabs, because the key is the pill's own identity", () => {
  assert.equal(tabKey(doc("Lecture 12")), tabKey(doc("lecture 12")));
  assert.notEqual(tabKey(doc("Lecture 12")), tabKey(doc("Lecture 13")));
});

test("opening focuses the new tab", () => {
  const state = openTab(NO_TABS, doc("Lehninger"));
  assert.equal(state.tabs.length, 1);
  assert.equal(activeTab(state)?.label, "Lehninger");
});

test("pressing the same pill twice focuses rather than duplicates", () => {
  let state = openTab(NO_TABS, doc("Lehninger"));
  state = openTab(state, doc("Lecture 12"));
  state = openTab(state, doc("Lehninger"));
  assert.equal(state.tabs.length, 2);
  assert.equal(activeTab(state)?.label, "Lehninger");
});

test("a second citation into the same document refreshes the passage shown", () => {
  let state = openTab(NO_TABS, doc("Lehninger", "first passage"));
  state = openTab(state, doc("Lehninger", "second passage"));
  const tab = activeTab(state);
  assert.equal(tab?.kind === "document" ? tab.excerpt : null, "second passage");
});

test("librarySourceId rides along, and null is a real value rather than a missing one", () => {
  const filed = activeTab(openTab(NO_TABS, doc("Filed", "passage", "lib-1")));
  const loose = activeTab(openTab(NO_TABS, doc("Loose")));
  assert.equal(filed?.kind === "document" ? filed.librarySourceId : "wrong", "lib-1");
  assert.equal(loose?.kind === "document" ? loose.librarySourceId : "wrong", null);
});

test("the strip is capped, and the tab being read is never the one evicted", () => {
  let state = NO_TABS;
  for (let i = 0; i < MAX_TABS; i += 1) state = openTab(state, doc(`Doc ${i}`));
  state = activateTab(state, tabKey(doc("Doc 0")));
  state = openTab(state, doc("One too many"));

  assert.equal(state.tabs.length, MAX_TABS);
  assert.ok(state.tabs.some((t) => t.label === "Doc 0"), "the tab being read survived");
  assert.ok(!state.tabs.some((t) => t.label === "Doc 1"), "the oldest evictable tab went");
  assert.equal(activeTab(state)?.label, "One too many");
});

test("closing an inactive tab leaves the read undisturbed", () => {
  let state = openTab(openTab(NO_TABS, doc("A")), doc("B"));
  state = closeTab(state, tabKey(doc("A")));
  assert.equal(activeTab(state)?.label, "B");
});

test("closing the active tab lands on the right-hand neighbour", () => {
  let state = openTab(openTab(openTab(NO_TABS, doc("A")), doc("B")), doc("C"));
  state = activateTab(state, tabKey(doc("B")));
  state = closeTab(state, tabKey(doc("B")));
  assert.equal(activeTab(state)?.label, "C");
});

test("closing the last tab falls back to the left rather than emptying the pane", () => {
  let state = openTab(openTab(NO_TABS, doc("A")), doc("B"));
  state = closeTab(state, tabKey(doc("B")));
  assert.equal(activeTab(state)?.label, "A");
});

test("the pane empties only when the final tab goes", () => {
  const state = closeTab(openTab(NO_TABS, doc("A")), tabKey(doc("A")));
  assert.equal(state.tabs.length, 0);
  assert.equal(activeTab(state), null);
});

test("unknown keys are ignored rather than blanking the pane", () => {
  const open = openTab(NO_TABS, doc("A"));
  assert.equal(closeTab(open, "doc:nope"), open);
  assert.equal(activateTab(open, "doc:nope"), open);
  assert.equal(activeTab(activateTab(open, "doc:nope"))?.label, "A");
});
