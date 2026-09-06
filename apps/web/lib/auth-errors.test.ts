import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlySignInError } from "./auth-errors";

test("known GoTrue strings become sentences a learner can act on", () => {
  assert.match(friendlySignInError("Invalid login credentials"), /don't match/);
  assert.match(friendlySignInError("Email not confirmed"), /confirm your email/);
  assert.match(friendlySignInError("Email rate limit exceeded"), /Wait a minute/);
  assert.match(friendlySignInError("Password should be at least 6 characters"), /at least 8/);
});

test("unknown strings pass through so new errors stay visible", () => {
  assert.equal(friendlySignInError("Something specific from GoTrue"), "Something specific from GoTrue");
  assert.equal(friendlySignInError(""), "Something went wrong. Try again.");
});
