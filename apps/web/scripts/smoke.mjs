#!/usr/bin/env node

const baseUrl = (process.env.WEB_SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3100")
  .replace(/\/$/, "");

const checks = [];

function addCheck(name, fn) {
  checks.push({ name, fn });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path, init) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      "cache-control": "no-cache",
      ...(init?.headers || {}),
    },
  });
  const body = await res.text();
  return { res, body };
}

function htmlCheck(path, markers) {
  addCheck(`GET ${path}`, async () => {
    const { res, body } = await read(path);
    expect(res.status === 200, `expected 200, got ${res.status}`);
    for (const marker of markers) {
      expect(body.includes(marker), `missing marker: ${marker}`);
    }
  });
}

function postStatusCheck(path, expectedStatus, body = "{}") {
  addCheck(`POST ${path}`, async () => {
    const { res, body: responseBody } = await read(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(
      res.status === expectedStatus,
      `expected ${expectedStatus}, got ${res.status}; body: ${responseBody.slice(0, 240)}`,
    );
  });
}

function getStatusCheck(path, expectedStatus) {
  addCheck(`GET ${path}`, async () => {
    const { res, body } = await read(path);
    expect(
      res.status === expectedStatus,
      `expected ${expectedStatus}, got ${res.status}; body: ${body.slice(0, 240)}`,
    );
  });
}

function redirectCheck(path, destination) {
  addCheck(`GET ${path} redirects to ${destination}`, async () => {
    const { res } = await read(path);
    expect(res.status === 307, `expected 307, got ${res.status}`);
    expect(res.headers.get("location") === destination, `expected Location ${destination}, got ${res.headers.get("location")}`);
  });
}

// Markers refreshed 2026-08-01. All three asserted copy that no longer exists:
// "Re-enter the perimeter" and "Bring Nemesis online" were the auth pages' eyebrow
// and description, removed when those pages were reshaped, and "Restoring account
// perimeter" had already gone from AccountPortal. A smoke check pinned to decorative
// copy fails on every wording change, so these now assert the headings, which are
// the actual contract: if the h1 is missing the page did not render.
htmlCheck("/sign-in", ["NEMESIS", "Sign in to Nemesis"]);
htmlCheck("/sign-up", ["NEMESIS", "Create your account"]);
// Signed out, /account is only its loading shell — there is no stable copy beyond it.
htmlCheck("/account", ["Loading"]);
// /account/billing was retired 2026-08-01 and 307s to /pricing, so it has no HTML of
// its own. /pricing took over as the one subscription surface, and it had no smoke
// check at all, so it gets one here rather than losing coverage in the swap.
//
// The title is the only stable marker: the page is a client component behind a
// Suspense boundary with a null fallback (it reads ?checkout=), so the server HTML
// carries none of the plan names or prices.
htmlCheck("/pricing", ["Nemesis — Pricing"]);
// The legacy /app shell was retired and next.config.ts intentionally sends every
// old /app/* entry point to the workspace root. Pin the redirect itself so the
// smoke suite catches either a broken legacy link or an accidental route revival.
redirectCheck("/app/ask", "/");
redirectCheck("/app/explore", "/");
redirectCheck("/app/monitor", "/");
redirectCheck("/app/profile", "/");
redirectCheck("/app/billing", "/");
htmlCheck("/legal/privacy", ["Privacy Policy", "Service providers"]);
htmlCheck("/legal/terms", ["Terms of Use", "Subscriptions and billing"]);
htmlCheck("/legal/disclaimer", ["Medical Disclaimer", "Not medical advice"]);

postStatusCheck("/api/stripe/checkout", 401);
postStatusCheck("/api/stripe/portal", 401);
getStatusCheck("/api/stripe/catalog", 401);
postStatusCheck("/api/stripe/webhook", 400);

let failed = 0;
console.log(`Web smoke target: ${baseUrl}`);

for (const check of checks) {
  try {
    await check.fn();
    console.log(`ok  ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok  ${check.name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} smoke checks passed.`);
