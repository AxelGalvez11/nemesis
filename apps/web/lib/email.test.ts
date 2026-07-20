// npx tsx lib/email.test.ts
import assert from "node:assert/strict";
import { buildWelcomeEmail, escapeHtml } from "./email";

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

console.log("email.test.ts OK");
