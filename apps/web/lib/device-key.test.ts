import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bearerFrom, deviceKeyHash, DEVICE_KEY_PREFIX, looksLikeDeviceKey } from "./device-key";

// deviceKeyHash MUST match nemesis-search's sha256Hex exactly. That function is
// `crypto.subtle.digest('SHA-256', utf8(text))` rendered as lowercase hex, over
// the WHOLE key including the nmk_ prefix. If this drifts, every genuine key is
// rejected and Library import, notebook sources and chat attachments all break
// at once — a silent, total outage rather than a visible error.
{
  const key = "nmk_abc123";
  assert.equal(deviceKeyHash(key), createHash("sha256").update(key, "utf8").digest("hex"));
}
{
  // Known vector, pinned literally so a refactor still has to produce it — and
  // so this can be checked against the edge function by eye.
  assert.equal(deviceKeyHash("nmk_test"), "01806f91452899e92dff32216a6981a319361c38025d500af6d9ccf049424cd3");
  assert.match(deviceKeyHash("nmk_test"), /^[0-9a-f]{64}$/, "lowercase hex, 64 chars");
}
{
  // The prefix is part of the hashed text — hashing the remainder would produce
  // a different digest and reject every real key.
  assert.notEqual(deviceKeyHash("nmk_abc"), deviceKeyHash("abc"));
}

// looksLikeDeviceKey: shape only, and a bare prefix is not a key.
{
  assert.equal(looksLikeDeviceKey("nmk_x"), true);
  assert.equal(looksLikeDeviceKey(DEVICE_KEY_PREFIX), false, "a bare prefix carries no secret");
  assert.equal(looksLikeDeviceKey(""), false);
  assert.equal(looksLikeDeviceKey("Bearer nmk_x"), false, "the header prefix must be stripped first");
  assert.equal(looksLikeDeviceKey("sk_live_123"), false);
}

// bearerFrom: tolerant of case and spacing, never returns the word "Bearer".
{
  assert.equal(bearerFrom("Bearer nmk_abc"), "nmk_abc");
  assert.equal(bearerFrom("bearer   nmk_abc"), "nmk_abc");
  assert.equal(bearerFrom("nmk_abc"), "nmk_abc");
  assert.equal(bearerFrom("  nmk_abc  "), "nmk_abc");
  assert.equal(bearerFrom(null), "");
  assert.equal(bearerFrom(""), "");
}
