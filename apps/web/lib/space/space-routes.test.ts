import assert from "node:assert/strict";
import test from "node:test";

import { pathFor, routeFromPath } from "../../space/app/runtime.js";

const ID = "3d77f2d7-9611-4147-9b03-eba683704706";

test("Space routes are the Space frontend's; everything else stays the React app's", () => {
  assert.equal(routeFromPath(`/p/${ID}`), ID);
  assert.equal(routeFromPath(`/p/Weekly-plan-${ID}`), ID, "a readable slug in front of the id still opens the page");
  assert.equal(routeFromPath("/home"), "home");
  assert.equal(routeFromPath("/library"), "library");
  assert.equal(routeFromPath("/library/shared"), "library/shared");
  assert.equal(routeFromPath("/templates"), "marketplace");
  for (const react of ["/canvas", "/study", "/calendar", "/settings", "/pricing", "/library/classic", "/library/source/abc", "/p/not-an-id"]) {
    assert.equal(routeFromPath(react), null, `${react} belongs to the React app`);
  }
});

test("every Space route round-trips through its path", () => {
  for (const r of [ID, "ai", "tasks", "library", "library/private", "marketplace"]) {
    assert.equal(routeFromPath(pathFor(r)), r);
  }
  assert.equal(pathFor("anything else"), "/home");
});
