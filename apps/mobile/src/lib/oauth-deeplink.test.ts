import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildProviderSignInUrl,
  isValidAuthState,
  parseAuthCallback,
} from "./oauth-deeplink.ts";

const STATE = "8f14e45f-ceea-467a-9f4c-2b1a3c4d5e6f";
const BASE = "https://app.enternemesis.com";

Deno.test("buildProviderSignInUrl: points at the web bounce page with provider and state", () => {
  assertEquals(
    buildProviderSignInUrl(BASE, "google", STATE),
    `${BASE}/auth/desktop?provider=google&state=${STATE}&client=phone`,
  );
});

Deno.test("buildProviderSignInUrl: a trailing slash on the base never doubles up", () => {
  assertEquals(
    buildProviderSignInUrl("https://app.enternemesis.com///", "apple", STATE),
    `${BASE}/auth/desktop?provider=apple&state=${STATE}&client=phone`,
  );
});

Deno.test("buildProviderSignInUrl: refuses a state the web page would reject", () => {
  // The web page's STATE_PATTERN demands 8-64 chars of [A-Za-z0-9-]. Building a
  // URL it will bounce would strand the student on an error screen two app
  // switches away from the tap, so fail loudly here instead.
  assertThrows(() => buildProviderSignInUrl(BASE, "google", "short"));
  assertThrows(() => buildProviderSignInUrl(BASE, "google", "has spaces in it"));
  assertThrows(() => buildProviderSignInUrl(BASE, "google", ""));
});

Deno.test("isValidAuthState: mirrors the web page's pattern", () => {
  assertEquals(isValidAuthState(STATE), true);
  assertEquals(isValidAuthState("abcdefgh"), true); // exactly 8
  assertEquals(isValidAuthState("abcdefg"), false); // 7
  assertEquals(isValidAuthState("a".repeat(65)), false);
  assertEquals(isValidAuthState("under_score"), false);
  assertEquals(isValidAuthState(null), false);
  assertEquals(isValidAuthState(42), false);
});

Deno.test("parseAuthCallback: reads the refresh token and the nonce", () => {
  const parsed = parseAuthCallback(`nemesis://auth/callback?refresh_token=abc123&state=${STATE}`);
  assertEquals(parsed, { refreshToken: "abc123", state: STATE });
});

Deno.test("parseAuthCallback: order of the parameters doesn't matter", () => {
  const parsed = parseAuthCallback(`nemesis://auth/callback?state=${STATE}&refresh_token=abc123`);
  assertEquals(parsed?.refreshToken, "abc123");
});

Deno.test("parseAuthCallback: percent-encoded token values are decoded", () => {
  const parsed = parseAuthCallback(`nemesis://auth/callback?refresh_token=a%2Fb%2Bc%3D&state=${STATE}`);
  assertEquals(parsed?.refreshToken, "a/b+c=");
});

Deno.test("parseAuthCallback: the scheme and host may arrive in any case", () => {
  // iOS makes no promise about preserving the case of either.
  const parsed = parseAuthCallback(`NEMESIS://Auth/Callback?refresh_token=abc123&state=${STATE}`);
  assertEquals(parsed?.refreshToken, "abc123");
});

Deno.test("parseAuthCallback: rejects a different path on our own scheme", () => {
  // nemesis:// opens this app for every route it owns. Only the auth callback
  // may hand us a session.
  assertEquals(parseAuthCallback(`nemesis://note?refresh_token=abc123&state=${STATE}`), null);
  assertEquals(parseAuthCallback(`nemesis://auth/callback/extra?refresh_token=abc&state=${STATE}`), null);
});

Deno.test("parseAuthCallback: rejects another app's scheme", () => {
  assertEquals(parseAuthCallback(`evil://auth/callback?refresh_token=abc123&state=${STATE}`), null);
  assertEquals(parseAuthCallback(`https://auth/callback?refresh_token=abc123&state=${STATE}`), null);
});

Deno.test("parseAuthCallback: rejects a callback with no state at all", () => {
  // The nonce is the only thing distinguishing a real return trip from any app
  // on the phone firing this URL at us.
  assertEquals(parseAuthCallback("nemesis://auth/callback?refresh_token=abc123"), null);
});

Deno.test("parseAuthCallback: rejects a malformed state even when a token is present", () => {
  assertEquals(parseAuthCallback("nemesis://auth/callback?refresh_token=abc123&state=x"), null);
});

Deno.test("parseAuthCallback: rejects a missing or empty token", () => {
  assertEquals(parseAuthCallback(`nemesis://auth/callback?state=${STATE}`), null);
  assertEquals(parseAuthCallback(`nemesis://auth/callback?refresh_token=&state=${STATE}`), null);
});

Deno.test("parseAuthCallback: rejects undecodable percent-escapes", () => {
  assertEquals(parseAuthCallback(`nemesis://auth/callback?refresh_token=%E0%A4%A&state=${STATE}`), null);
});

Deno.test("parseAuthCallback: survives junk in the query without throwing", () => {
  const parsed = parseAuthCallback(`nemesis://auth/callback?&flag&=x&refresh_token=abc123&state=${STATE}&`);
  assertEquals(parsed?.refreshToken, "abc123");
});

Deno.test("parseAuthCallback: rejects a URL with no query at all", () => {
  assertEquals(parseAuthCallback("nemesis://auth/callback"), null);
  assertEquals(parseAuthCallback(""), null);
});
