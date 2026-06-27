// npx tsx lib/auth-redirect.test.ts
import assert from "node:assert/strict";
import { resolveAuthRedirectUrl } from "./auth-redirect";

assert.equal(
  resolveAuthRedirectUrl("/app", {
    envAppUrl: "http://localhost:3000",
    origin: "https://app.pharmaorb.app",
  }),
  "https://app.pharmaorb.app/app",
);

assert.equal(
  resolveAuthRedirectUrl("/app", { envAppUrl: "", origin: undefined }),
  "https://app.pharmaorb.app/app",
);

assert.equal(
  resolveAuthRedirectUrl("/app", {
    envAppUrl: "https://app.pharmaorb.app",
    origin: "http://localhost:3100",
  }),
  "http://localhost:3100/app",
);

console.log("auth-redirect.test.ts OK");
