// npx tsx lib/auth-redirect.test.ts
import assert from "node:assert/strict";
import { resolveAuthRedirectUrl, sanitizeNextPath } from "./auth-redirect";

assert.equal(
  resolveAuthRedirectUrl("/app", {
    envAppUrl: "http://localhost:3000",
    origin: "https://app.enternemesis.com",
  }),
  "https://app.enternemesis.com/app",
);

assert.equal(
  resolveAuthRedirectUrl("/app", { envAppUrl: "", origin: undefined }),
  "https://app.enternemesis.com/app",
);

assert.equal(
  resolveAuthRedirectUrl("/app", {
    envAppUrl: "https://app.enternemesis.com",
    origin: "http://localhost:3100",
  }),
  "http://localhost:3100/app",
);

assert.equal(sanitizeNextPath("/app/ask?c=123"), "/app/ask?c=123");
assert.equal(sanitizeNextPath("https://evil.example"), "/account");
assert.equal(sanitizeNextPath("//evil.example"), "/account");
assert.equal(sanitizeNextPath("/%2f%2fevil.example"), "/account");
assert.equal(sanitizeNextPath("/%252f%252fevil.example"), "/account");
assert.equal(sanitizeNextPath("/%2e//evil.example"), "/account");
assert.equal(sanitizeNextPath("/\\evil.example"), "/account");
assert.equal(sanitizeNextPath("/app\nhttps://evil.example"), "/account");
assert.equal(sanitizeNextPath("/%E0%A4%A"), "/account");
assert.equal(sanitizeNextPath(null, "/account"), "/account");
assert.equal(sanitizeNextPath("https://evil.example", "/account"), "/account");
assert.equal(sanitizeNextPath("/account/billing", "/account"), "/account/billing");

console.log("auth-redirect.test.ts OK");
