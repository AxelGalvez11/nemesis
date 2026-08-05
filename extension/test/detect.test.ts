import assert from "node:assert/strict";
import { test } from "node:test";

import { detectLms, factsFromUrl } from "../src/lms/detect.ts";

function detect(url: string, markers: readonly string[] = []): string {
  const facts = factsFromUrl(url, markers);
  return facts ? detectLms(facts) : "unparseable";
}

test("vendor-hosted portals are recognised by hostname", () => {
  assert.equal(detect("https://university.instructure.com/"), "canvas");
  assert.equal(detect("https://school.blackboard.com/"), "blackboard");
  assert.equal(detect("https://x.moodlecloud.com/"), "moodle");
  assert.equal(detect("https://x.brightspace.com/"), "brightspace");
  assert.equal(detect("https://x.desire2learn.com/"), "brightspace");
});

test("SELF-HOSTED PORTALS ARE RECOGNISED BY ROUTE, not by markup", () => {
  // The important case: a university on its own domain, themed beyond
  // recognition. The routing is what does not change.
  assert.equal(detect("https://canvas.university.edu/courses/12345"), "canvas");
  assert.equal(detect("https://lms.university.edu/ultra/courses/_9876_1/outline"), "blackboard");
  assert.equal(detect("https://learn.university.edu/course/view.php?id=42"), "moodle");
  assert.equal(detect("https://elearn.university.edu/d2l/home/778"), "brightspace");
});

test("Canvas dashboards and course lists count", () => {
  assert.equal(detect("https://canvas.university.edu/courses"), "canvas");
  assert.equal(detect("https://canvas.university.edu/dashboard"), "canvas");
});

test("Blackboard's course-id shape is distinctive enough on its own", () => {
  assert.equal(
    detect("https://lms.university.edu/webapps/blackboard/execute/launcher?course_id=_9876_1"),
    "blackboard",
  );
});

test("Moodle module and dashboard routes count", () => {
  assert.equal(detect("https://learn.university.edu/mod/assign/view.php?id=99"), "moodle");
  assert.equal(detect("https://learn.university.edu/my/"), "moodle");
});

test("markup is a fallback when routing says nothing", () => {
  assert.equal(detect("https://portal.university.edu/welcome"), "unknown");
  assert.equal(detect("https://portal.university.edu/welcome", ["Moodle 4.3"]), "moodle");
  assert.equal(detect("https://portal.university.edu/welcome", ["canvas-lms"]), "canvas");
});

test("AN UNRELATED SITE SCANS TO NOTHING", () => {
  // The safety property. Being wrong here means reading a page we have no
  // business reading, so the default has to be "not a portal".
  assert.equal(detect("https://mail.google.com/mail/u/0/#inbox"), "unknown");
  assert.equal(detect("https://www.mybank.com/accounts/summary"), "unknown");
  assert.equal(detect("https://news.example.com/2026/07/31/story"), "unknown");
});

test("a marketing page that merely says courses is not a portal", () => {
  // /about/courses must not read as Canvas's /courses.
  assert.equal(detect("https://university.edu/about/courses"), "unknown");
  assert.equal(detect("https://university.edu/admissions/courses/undergraduate"), "unknown");
});

test("non-http URLs are refused outright", () => {
  assert.equal(factsFromUrl("javascript:alert(1)"), null);
  assert.equal(factsFromUrl("file:///Users/someone/notes.txt"), null);
  assert.equal(factsFromUrl("chrome://extensions"), null);
  assert.equal(factsFromUrl("not a url"), null);
});

test("hostname matching is anchored so a lookalike domain does not pass", () => {
  // "notinstructure.com" and "instructure.com.evil.test" must not read as Canvas.
  assert.equal(detect("https://notinstructure.com/x"), "unknown");
  assert.equal(detect("https://instructure.com.evil.test/x"), "unknown");
});

test("facts come back lowercased and normalised", () => {
  const facts = factsFromUrl("https://Canvas.University.EDU/Courses/12345?Foo=Bar");
  assert.equal(facts?.host, "canvas.university.edu");
  assert.equal(facts?.path, "/courses/12345?foo=bar");
});

test("🔴 THE VENDOR'S OWN MARKETING SITE IS NOT A PORTAL", () => {
  // Found by pointing the real detector at the real web, not by a fixture:
  // both of these came back as portals, so a student reading a product page
  // was told "Canvas detected" and offered a scan of a brochure.
  assert.equal(detect("https://www.instructure.com/canvas"), "unknown");
  assert.equal(detect("https://instructure.com/"), "unknown");
  assert.equal(detect("https://www.blackboard.com/"), "unknown");
  // The application itself is untouched: a subdomain is still the product.
  assert.equal(detect("https://canvas.instructure.com/courses/838884/modules"), "canvas");
  assert.equal(detect("https://school.blackboard.com/ultra/course"), "blackboard");
});

test("a Canvas-shaped URL with nothing on it yields no courses, not a guess", () => {
  // canvas.instructure.com discontinued Free-for-Teacher, so every public
  // course URL now serves a notice page while KEEPING its /courses/:id route.
  // Captured live: zero links, zero markers. Detection must still say Canvas
  // (the route is real) and the parse must come back empty rather than naming a
  // course after whatever text is on the page.
  assert.equal(detect("https://canvas.instructure.com/courses/838884/modules"), "canvas");
});
