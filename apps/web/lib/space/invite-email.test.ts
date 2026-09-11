import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInviteEmail } from "./invite-email";

const URL_ = "https://app.enternemesis.com/p/0d6f5c1e-8f0a-4c52-9d2e-1b7a4c3e2f10";

test("🔴 the email says who shared which page, links to it, and escapes both", () => {
  const m = buildInviteEmail({ inviter: "Sam <b>", pageTitle: "Torts & contracts", pageUrl: URL_, role: "edit" });
  assert.equal(m.subject, 'Sam <b> shared "Torts & contracts" with you');
  assert.match(m.html, /Sam &lt;b&gt; shared a page with you\./);
  assert.match(m.html, /<strong>Torts &amp; contracts<\/strong>/);
  assert.ok(m.html.includes(`href="${URL_}"`));
  assert.match(m.text, /You can edit it\./);
  assert.ok(m.text.includes(URL_));
  assert.doesNotMatch(m.html + m.text + m.subject, /—/);
});

test("a page with no title and a sharer with no name still read as sentences", () => {
  const m = buildInviteEmail({ inviter: null, pageTitle: "  ", pageUrl: URL_, role: "read" });
  assert.equal(m.subject, 'Someone shared "Untitled" with you');
  assert.match(m.text, /You can read it\./);
  assert.match(buildInviteEmail({ inviter: "Ana", pageTitle: "Lab plan", pageUrl: URL_, role: "full" }).text, /You can edit and share it\./);
});
