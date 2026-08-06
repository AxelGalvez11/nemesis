import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { libraryChrome, type LibraryChromeInput } from "./library-sidebar-layout";

const base: LibraryChromeInput = {
  autoHide: false,
  narrowViewport: false,
  navHeld: false,
  peek: false,
  sidebarLocked: false,
};

describe("libraryChrome", () => {
  // The reported bug: auto-hide on, pointer over the left edge. The panel slid
  // out with its own "Library" heading while the floating marker was still
  // painting 2px away, so the word rendered doubled and smeared.
  it("never paints the marker and the panel at the same time", () => {
    const hovered = libraryChrome({ ...base, autoHide: true, peek: true });
    assert.equal(hovered.panelVisible, true);
    assert.equal(hovered.markerVisible, false);
  });

  // Exhaustive: whatever the state, the word "Library" is on screen at most
  // once. This is the invariant, not the single case above.
  it("shows the word Library at most once in every reachable state", () => {
    const bools = [false, true];
    let checked = 0;
    for (const autoHide of bools)
      for (const narrowViewport of bools)
        for (const navHeld of bools)
          for (const peek of bools)
            for (const sidebarLocked of bools) {
              const chrome = libraryChrome({ autoHide, narrowViewport, navHeld, peek, sidebarLocked });
              assert.ok(
                !(chrome.panelVisible && chrome.markerVisible),
                `doubled at ${JSON.stringify({ autoHide, narrowViewport, navHeld, peek, sidebarLocked })}`,
              );
              checked += 1;
            }
    assert.equal(checked, 32);
  });

  // The marker has to stay in the tree while the panel is out, or unmounting it
  // under the pointer fires mouseleave and the panel closes right back.
  it("keeps the marker mounted while the panel is peeked open", () => {
    const hovered = libraryChrome({ ...base, autoHide: true, peek: true });
    assert.equal(hovered.markerMounted, true);
  });

  it("paints the marker when auto-hide is on and nothing is hovered", () => {
    const idle = libraryChrome({ ...base, autoHide: true });
    assert.equal(idle.panelVisible, false);
    assert.equal(idle.markerVisible, true);
  });

  // Auto-hide off means the panel is simply docked; there is no marker at all.
  it("has no marker when the sidebar is locked open", () => {
    const locked = libraryChrome({ ...base, autoHide: true, sidebarLocked: true });
    assert.equal(locked.panelVisible, true);
    assert.equal(locked.markerMounted, false);
    assert.equal(locked.markerVisible, false);
  });

  // A menu open inside the panel holds it out even once the pointer has left.
  it("holds the panel open while a menu inside it is open", () => {
    const held = libraryChrome({ ...base, autoHide: true, navHeld: true });
    assert.equal(held.panelVisible, true);
    assert.equal(held.markerVisible, false);
  });

  // Narrow viewports use the drawer + icon opener, so neither the hover marker
  // nor the pushed panel applies.
  it("suppresses both on a narrow viewport", () => {
    const narrow = libraryChrome({ ...base, autoHide: true, narrowViewport: true, peek: true });
    assert.equal(narrow.panelVisible, false);
    assert.equal(narrow.markerMounted, false);
  });
});
