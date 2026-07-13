// npx tsx lib/auth-signup.test.ts
import assert from "node:assert/strict";
import { isAlreadyRegisteredSignUp } from "./auth-signup";

// Confirmations OFF: Supabase returns an explicit error.
assert.equal(isAlreadyRegisteredSignUp(null, "User already registered"), true);
assert.equal(isAlreadyRegisteredSignUp(null, "A user with this email address has already been registered"), true);
assert.equal(isAlreadyRegisteredSignUp(null, "Email address already exists"), true);

// Other errors are NOT the already-registered case.
assert.equal(isAlreadyRegisteredSignUp(null, "Password should be at least 8 characters"), false);
assert.equal(isAlreadyRegisteredSignUp(null, "captcha verification process failed"), false);

// Confirmations ON: obfuscated success — user object with an EMPTY identities array.
assert.equal(isAlreadyRegisteredSignUp({ identities: [] }, null), true);

// Genuine new signup carries at least one identity.
assert.equal(isAlreadyRegisteredSignUp({ identities: [{ provider: "email" }] }, null), false);

// Missing/odd shapes fail safe (treat as a normal signup).
assert.equal(isAlreadyRegisteredSignUp({ identities: undefined }, null), false);
assert.equal(isAlreadyRegisteredSignUp({ identities: null }, null), false);
assert.equal(isAlreadyRegisteredSignUp(null, null), false);
assert.equal(isAlreadyRegisteredSignUp(undefined, undefined), false);

// An error takes precedence over the user shape.
assert.equal(isAlreadyRegisteredSignUp({ identities: [] }, "Signups not allowed for this instance"), false);

console.log("auth-signup.test.ts OK");
