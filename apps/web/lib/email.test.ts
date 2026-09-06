// npx tsx lib/email.test.ts
import assert from "node:assert/strict";
import { buildCancellationEmail, buildPaymentFailedEmail, buildWelcomeEmail, escapeHtml } from "./email";

assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");

const trial = buildWelcomeEmail({ planName: "Nemesis Student", trialing: true, trialDays: 7 });
assert.equal(trial.subject, "Your Nemesis Student trial is live");
// Desktop is deferred (2026-07-20): the email points at the browser app, never the Mac download.
assert.ok(trial.text.includes("Open Nemesis in your browser"), "text points to the web app");
assert.ok(!trial.text.includes("/api/download/mac"), "text has no download link");
assert.ok(!trial.html.includes("/api/download/mac"), "html has no download link");
assert.match(trial.text, /7-day free trial has started/);
assert.match(trial.text, /Cancel anytime before then and you pay nothing/);
assert.match(trial.html, /Nemesis Student/);
assert.match(trial.html, /account/);

const active = buildWelcomeEmail({ planName: "Nemesis Max", trialing: false, trialDays: 7 });
assert.equal(active.subject, "Your Nemesis Max subscription is active");
assert.doesNotMatch(active.text, /trial/i);
assert.doesNotMatch(active.html, /trial/i);

// Plan names are escaped into the HTML body.
const weird = buildWelcomeEmail({ planName: "<script>", trialing: true, trialDays: 7 });
assert.doesNotMatch(weird.html, /<script>/);

// A bounced renewal: nothing changes today, fix the card at the link, access pauses if it keeps failing.
const failed = buildPaymentFailedEmail({ planName: "Nemesis", portalUrl: "https://example.test/settings" });
assert.equal(failed.subject, "Your Nemesis payment did not go through");
assert.match(failed.text, /card was declined/i);
assert.match(failed.text, /Nothing changes today/);
assert.ok(failed.text.includes("https://example.test/settings"), "text carries the settings link");
assert.ok(failed.html.includes('href="https://example.test/settings"'), "html links to settings");
assert.match(failed.text, /access to your plan will pause/i);
assert.doesNotMatch(failed.text, /credit|token/i, "never says credits or tokens to a user");

// The plan ended: names the date when there is one, and says free plan when there is not.
const ended = buildCancellationEmail({ planName: "Nemesis", accessUntil: "2026-10-01T00:00:00.000Z" });
assert.equal(ended.subject, "Your Nemesis subscription has ended");
assert.match(ended.text, /keep access until October 1, 2026/);
assert.match(ended.html, /October 1, 2026/);
const endedNow = buildCancellationEmail({ planName: "Nemesis", accessUntil: null });
assert.match(endedNow.text, /now on the free plan/);
assert.doesNotMatch(buildCancellationEmail({ planName: "<script>", accessUntil: null }).html, /<script>/);

console.log("email.test.ts OK");
