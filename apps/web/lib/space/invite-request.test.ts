import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_INVITES, parseInviteRequest, splitEmails } from "./invite-request";

const PAGE = "0d6f5c1e-8f0a-4c52-9d2e-1b7a4c3e2f10";

test("addresses typed with commas, semicolons, spaces or new lines become one clean list", () => {
  assert.deepEqual(splitEmails(" Ana@School.edu, ben@school.edu;\nana@school.edu  cy@uni.ac.uk "), [
    "ana@school.edu",
    "ben@school.edu",
    "cy@uni.ac.uk",
  ]);
});

test("🔴 a good request passes, with edit as the role nobody chose", () => {
  assert.deepEqual(parseInviteRequest({ page: PAGE, emails: ["Ana@School.edu", "ben@school.edu, ana@school.edu"] }), {
    ok: true,
    request: { page: PAGE, emails: ["ana@school.edu", "ben@school.edu"], role: "edit" },
  });
  assert.deepEqual(parseInviteRequest({ page: PAGE, emails: "cy@uni.ac.uk", role: "comment" }), {
    ok: true,
    request: { page: PAGE, emails: ["cy@uni.ac.uk"], role: "comment" },
  });
});

test("🔴 what the database would refuse is refused first, with a sentence to show", () => {
  assert.deepEqual(parseInviteRequest(null), { ok: false, error: "Send the page and the email addresses." });
  assert.deepEqual(parseInviteRequest({ page: "not-a-page", emails: ["a@b.co"] }), { ok: false, error: "That page could not be found." });
  assert.deepEqual(parseInviteRequest({ page: PAGE, emails: [" , "] }), { ok: false, error: "Add at least one email address." });
  assert.deepEqual(parseInviteRequest({ page: PAGE, emails: ["ana@school.edu", "ben-at-school"] }), {
    ok: false,
    error: "ben-at-school is not an email address.",
  });
  assert.deepEqual(parseInviteRequest({ page: PAGE, emails: ["a@b.co"], role: "owner" }), { ok: false, error: "Choose what they can do." });
  const many = Array.from({ length: MAX_INVITES + 1 }, (_, i) => `p${i}@school.edu`);
  assert.deepEqual(parseInviteRequest({ page: PAGE, emails: many }), { ok: false, error: `Invite up to ${MAX_INVITES} people at a time.` });
});
