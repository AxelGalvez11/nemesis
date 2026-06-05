// Deno tests for the sign-up outcome mapping. Run: deno test --no-check apps/mobile/src/auth/signup.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveSignUpResult } from "./signup.ts";

Deno.test("error result is surfaced, no confirmation", () => {
  assertEquals(deriveSignUpResult(null, { message: "Password should be at least 6 characters" }), {
    error: "Password should be at least 6 characters",
    needsConfirmation: false,
  });
});

Deno.test("'User already registered' error collapses to needsConfirmation (no enumeration, conf-OFF)", () => {
  // With confirmation OFF, Supabase returns this for an existing email. Must look
  // identical to a new signup — never reveal that the address is registered.
  assertEquals(deriveSignUpResult(null, { message: "User already registered" }), {
    error: null,
    needsConfirmation: true,
  });
  assertEquals(deriveSignUpResult(null, { message: "Email address already in use" }), {
    error: null,
    needsConfirmation: true,
  });
});

Deno.test("session present (confirmation OFF) → signed in, no confirmation step", () => {
  assertEquals(deriveSignUpResult({ session: { access_token: "x" } }, null), {
    error: null,
    needsConfirmation: false,
  });
});

Deno.test("no session, no error (confirmation ON) → needs confirmation", () => {
  assertEquals(deriveSignUpResult({ session: null }, null), { error: null, needsConfirmation: true });
});

Deno.test("already-registered (no session, no error) is indistinguishable → needs confirmation (no enumeration)", () => {
  // Supabase returns an obfuscated user + null session for an existing email.
  assertEquals(deriveSignUpResult({ session: null }, null), { error: null, needsConfirmation: true });
});

Deno.test("null data, no error → treated as confirmation pending (fail-safe)", () => {
  assertEquals(deriveSignUpResult(null, null), { error: null, needsConfirmation: true });
});
