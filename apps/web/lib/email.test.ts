// npx tsx lib/email.test.ts
import assert from "node:assert/strict";
import { buildWelcomeEmail, escapeHtml } from "./email";

assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");

const trial = buildWelcomeEmail({ planName: "Nemesis Student", trialing: true, trialDays: 7 });
assert.equal(trial.subject, "Your Nemesis Student trial is live");
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
