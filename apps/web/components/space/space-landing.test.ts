import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LANDING_PATH } from "@/lib/auth-redirect";

import { spaceLanding } from "./space-landing";

test("🔴 the first workspace page a tab opens at the default landing goes to Home", () => {
  assert.equal(spaceLanding({ firstInTab: true, pathname: DEFAULT_LANDING_PATH, search: "" }), "/home");
});

test("🔴 Canvas opened later from the sidebar stays Canvas", () => {
  assert.equal(spaceLanding({ firstInTab: false, pathname: DEFAULT_LANDING_PATH, search: "" }), null);
});

test("a canvas address with a query is kept, and so is any other first page", () => {
  assert.equal(spaceLanding({ firstInTab: true, pathname: DEFAULT_LANDING_PATH, search: "?canvas=4f1c" }), null);
  assert.equal(spaceLanding({ firstInTab: true, pathname: "/p/0d6f5c1e-8f0a-4c52-9d2e-1b7a4c3e2f10", search: "" }), null);
  assert.equal(spaceLanding({ firstInTab: true, pathname: "/study", search: "" }), null);
});
