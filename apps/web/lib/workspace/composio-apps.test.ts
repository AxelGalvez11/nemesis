import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APP_GROUPS,
  CONNECTABLE_APPS,
  groupApps,
  hasCalendar,
  isOffered,
  labelFor,
  ONBOARDING_SUGGESTED,
  suggestedForOnboarding,
} from "./composio-apps";

// ── the list of apps a learner may hand Nemesis their accounts for ────────────────────────────
//
// 🔴 THE KEYS HERE ARE NOT NAMES, THEY ARE ADDRESSES. Each one is matched against a slug returned
// by Composio and is uppercased into an environment variable holding an auth config id. A typo in
// one is not a cosmetic bug: the learner completes a real OAuth consent screen, comes back, and
// the row still says "Connect" because nothing recognises what they just connected.

test("🔴🔴 every key is Composio's toolkit slug, verbatim", () => {
  // Verified against the live catalogue on 2026-08-30 (GET /api/v3/toolkits). The trap this pins
  // is `one_drive`: the toolkit's slug carries an underscore and "onedrive" would connect
  // successfully and then never be recognised as connected, because `statusFor` matches the slug
  // it gets back against these keys exactly.
  const keys = CONNECTABLE_APPS.map((app) => app.key);
  assert.deepEqual(
    keys,
    [
      "canvas",
      "google_classroom",
      "googledrive",
      "one_drive",
      "gmail",
      "googlecalendar",
      "outlook",
      "googledocs",
      "googlesheets",
      "notion",
      "zoom",
    ],
    "an app key changed; re-check it against Composio's toolkit slug before editing this",
  );
  // A slug is lowercase with underscores. An uppercase or hyphenated key never matches.
  for (const key of keys) assert.match(key, /^[a-z0-9_]+$/, `${key} is not shaped like a toolkit slug`);
});

test("🔴🔴 every offered app has an auth config id under a derived env name", () => {
  // `connectTo` reads `COMPOSIO_AUTH_${key.toUpperCase()}`. This asserts the derivation is what
  // deployment is told to set, so a new app cannot ship with its variable named by guesswork.
  const expected = [
    "COMPOSIO_AUTH_CANVAS",
    "COMPOSIO_AUTH_GOOGLE_CLASSROOM",
    "COMPOSIO_AUTH_GOOGLEDRIVE",
    "COMPOSIO_AUTH_ONE_DRIVE",
    "COMPOSIO_AUTH_GMAIL",
    "COMPOSIO_AUTH_GOOGLECALENDAR",
    "COMPOSIO_AUTH_OUTLOOK",
    "COMPOSIO_AUTH_GOOGLEDOCS",
    "COMPOSIO_AUTH_GOOGLESHEETS",
    "COMPOSIO_AUTH_NOTION",
    "COMPOSIO_AUTH_ZOOM",
  ];
  assert.deepEqual(CONNECTABLE_APPS.map((app) => `COMPOSIO_AUTH_${app.key.toUpperCase()}`), expected);
});

test("🔴 Outlook carries a calendar and Google splits it in two", () => {
  // The defect this replaces: `slug.includes("calendar")` answered false for Outlook, whose
  // toolkit carries nine event actions, so a Microsoft student never saw the Calendar row.
  assert.ok(hasCalendar(["outlook"]), "Outlook stopped counting as a calendar");
  assert.ok(hasCalendar(["googlecalendar"]), "Google Calendar stopped counting as a calendar");
  assert.ok(!hasCalendar(["gmail"]), "Gmail is not a calendar");
  assert.ok(!hasCalendar(["googledrive", "notion", "zoom"]), "a file store is not a calendar");
  // 🔴 AND AN LMS IS NOT ONE EITHER, however many due dates it knows about. The Calendar row is a
  // destination showing a calendar; coursework dates reach the learner through the canvas.
  assert.ok(!hasCalendar(["canvas", "google_classroom"]), "an LMS now claims to be a calendar");
  assert.ok(!hasCalendar([]), "nothing connected cannot be a calendar");
});

test("🔴 the calendar answer is forgiving about casing, because the slug comes from elsewhere", () => {
  assert.ok(hasCalendar(["OUTLOOK"]));
  assert.ok(hasCalendar(["GoogleCalendar"]));
});

test("🔴🔴 the offered list is closed", () => {
  // Composio brokers 1,431 toolkits. `connectTo` refuses anything this returns false for, so an
  // arbitrary slug cannot be turned into an OAuth redirect.
  assert.ok(isOffered("gmail"));
  assert.ok(isOffered("one_drive"));
  assert.ok(isOffered("canvas") && isOffered("google_classroom"));
  assert.ok(!isOffered("stripe"), "an unoffered app can now be connected");
  assert.ok(!isOffered(""), "an empty slug is offered");
  // 🔴 STRICT ABOUT CASE, DELIBERATELY, AND UNLIKE `hasCalendar`. This one authorises; the other
  // describes. See the note on `hasCalendar`.
  assert.ok(!isOffered("GMAIL"), "the authorising gate went case-insensitive");
});

test("🔴 every app says what it is for, and belongs to a heading that exists", () => {
  // A row with no detail is a brand name and a button, which is what the grouping exists to stop
  // the screen becoming. A group nothing renders would drop the app off the screen entirely.
  const groups = new Set(APP_GROUPS.map((group) => group.id));
  for (const app of CONNECTABLE_APPS) {
    assert.ok(app.label.trim().length > 0, `${app.key} has no label`);
    assert.ok(app.detail.trim().length > 10, `${app.key} does not say what it is for`);
    assert.ok(groups.has(app.group), `${app.key} is in the unknown group "${app.group}"`);
  }
  // And no heading is empty, which would render as a label with nothing under it.
  for (const group of APP_GROUPS) {
    assert.ok(
      CONNECTABLE_APPS.some((app) => app.group === group.id),
      `the "${group.label}" heading has no apps`,
    );
  }
});

test("🔴 keys are unique, since one duplicate silently shadows the other", () => {
  assert.equal(new Set(CONNECTABLE_APPS.map((app) => app.key)).size, CONNECTABLE_APPS.length);
});

test("a label falls back to the slug rather than to nothing", () => {
  // This names the app on a confirmation card. An empty string there is a card that does not say
  // where it is about to send something.
  assert.equal(labelFor("outlook"), "Outlook");
  assert.equal(labelFor("something_new"), "something_new");
});

test("🔴🔴 grouping never loses an app, even one from a group this build has not heard of", () => {
  // The settings screen is handed these over the wire, so a page held open across a deploy can
  // receive a group name this build does not know. Filtering it away would take an app off the
  // screen and with it the only button that disconnects it.
  const odd = { detail: "From a newer server.", group: "podcasts" as never, key: "future_app", label: "Future App" };
  const grouped = groupApps([...CONNECTABLE_APPS, odd]);
  const shown = grouped.flatMap((section) => section.apps.map((app) => app.key));
  assert.equal(shown.length, CONNECTABLE_APPS.length + 1, "an app was dropped by grouping");
  assert.ok(shown.includes("future_app"), "an unknown group took its app off the screen");
  assert.equal(grouped.at(-1)?.label, "Other", "the unmatched app is not under a final heading");
});

test("🔴 every app appears exactly once, under its own heading", () => {
  const grouped = groupApps(CONNECTABLE_APPS);
  const shown = grouped.flatMap((section) => section.apps.map((app) => app.key));
  assert.equal(shown.length, CONNECTABLE_APPS.length);
  assert.equal(new Set(shown).size, shown.length, "an app is listed under two headings");
  assert.deepEqual(
    grouped.map((section) => section.label),
    ["Coursework", "Files", "Mail and dates", "Notes and documents", "Lectures"],
    "the headings or their order changed",
  );
});

test("🔴 a heading with nothing under it is not rendered", () => {
  // Removing an app must not leave its heading behind as a label over empty space.
  const onlyFiles = CONNECTABLE_APPS.filter((app) => app.group === "files");
  assert.deepEqual(groupApps(onlyFiles).map((section) => section.label), ["Files"]);
  assert.deepEqual(groupApps([]), [], "an empty list produced headings");
});

test("🔴 first run offers a handful, not the whole list", () => {
  // A first-run screen listing every connector is a permissions wall, and a
  // student asked for eleven things on day one grants none of them.
  assert.ok(ONBOARDING_SUGGESTED.length <= 5, `first run offers ${ONBOARDING_SUGGESTED.length} apps; that is a wall`);
  assert.ok(ONBOARDING_SUGGESTED.length < CONNECTABLE_APPS.length, "first run offers everything");
  // Every suggestion must be a real offered app, or the step renders a row whose
  // Connect button cannot work.
  for (const key of ONBOARDING_SUGGESTED) {
    assert.ok(isOffered(key), `"${key}" is suggested during onboarding but is not an offered app`);
  }
});

test("🔴 what is suggested answers the work the student just did", () => {
  // The three steps before this one collect courses and pull dates out of a
  // syllabus. The suggestions are where that material actually lives, which is
  // what makes the ask land as a sentence about their own work.
  const groups = new Set(
    ONBOARDING_SUGGESTED.map((key) => CONNECTABLE_APPS.find((app) => app.key === key)?.group),
  );
  assert.deepEqual([...groups].sort(), ["coursework", "mail"], "first run started asking for things it has no reason to ask for");
  // And at least one of them can actually hold the dates the flow just produced.
  assert.ok(ONBOARDING_SUGGESTED.some((key) => hasCalendar([key])), "nothing suggested can carry a deadline");
});

test("suggested rows survive a server that offers fewer apps", () => {
  // The apps arrive over the wire. A row for an app the server never sent would
  // render a Connect button that cannot work.
  const only = CONNECTABLE_APPS.filter((app) => app.key === "googlecalendar");
  assert.deepEqual(suggestedForOnboarding(only).map((app) => app.key), ["googlecalendar"]);
  assert.deepEqual(suggestedForOnboarding([]), []);
  // In declared order, not the order the server happened to send.
  const shuffled = [...CONNECTABLE_APPS].reverse();
  assert.deepEqual(suggestedForOnboarding(shuffled).map((app) => app.key), [...ONBOARDING_SUGGESTED]);
});
