import assert from "node:assert/strict";
import { test } from "node:test";

import { VISION_MAX_BYTES } from "@/lib/vision/gemini";

import { checkImageUpload } from "./upload";

function imageOf(name: string, type: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

test("a real image passes and reports the mime the vision client will send", () => {
  const check = checkImageUpload(imageOf("capture.png", "image/png"));
  assert.equal(check.ok, true);
  assert.equal(check.ok ? check.mime : null, "image/png");
});

test("a phone photo passes", () => {
  assert.equal(checkImageUpload(imageOf("IMG_0042.HEIC", "image/heic")).ok, true);
  assert.equal(checkImageUpload(imageOf("scan.jpg", "image/jpeg")).ok, true);
});

test("🔴 nothing attached is 400, not a silent success", () => {
  const check = checkImageUpload(null);
  assert.equal(check.ok, false);
  assert.equal(check.ok ? 0 : check.status, 400);
});

test("a plain form field that is not a file is 400", () => {
  const check = checkImageUpload("not a file");
  assert.equal(check.ok, false);
  assert.equal(check.ok ? 0 : check.status, 400);
});

test("🔴 a non-image is 415 and an oversized image is 413 — different problems, different advice", () => {
  const wrongKind = checkImageUpload(imageOf("notes.pdf", "application/pdf"));
  assert.equal(wrongKind.ok, false);
  assert.equal(wrongKind.ok ? 0 : wrongKind.status, 415);

  const tooBig = checkImageUpload(imageOf("huge.png", "image/png", VISION_MAX_BYTES + 1));
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.ok ? 0 : tooBig.status, 413);
  assert.match(tooBig.ok ? "" : tooBig.error, /too large/i);
});

test("an image exactly at the ceiling is accepted", () => {
  assert.equal(checkImageUpload(imageOf("edge.png", "image/png", VISION_MAX_BYTES)).ok, true);
});

test("🔴 both handwriting routes share this check AND pass its status through unflattened", async () => {
  // 🔴 FOUND BY CALIBRATION, NOT BY DESIGN. Replacing `status: upload.status` with a literal 400 in
  // the work route reddened nothing at all: every assertion above tests this function, and nothing
  // tested that a caller honours what it returns. A route answering 400 for a photo that is merely
  // too large tells the learner "that did not work" instead of "try a smaller one", and the whole
  // reason there are three status codes is gone.
  //
  // Driving the routes for real needs auth, a vision key and a network round trip, none of which
  // belong in a unit test, so this reads the call sites. A source assertion is a blunt instrument
  // and is used deliberately for one narrow property, exactly as canvas-prompts.test.ts does for
  // `generateLesson`: the refusal travels from here to the response UNCHANGED.
  const { readFile } = await import("node:fs/promises");
  for (const route of ["../../app/api/handwriting/work/route.ts", "../../app/api/handwriting/analyze/route.ts"]) {
    const source = await readFile(new URL(route, import.meta.url), "utf8");
    assert.match(source, /checkImageUpload\(form\.get\("file"\)\)/, `${route} declares its own upload rules`);
    assert.match(
      source,
      /if \(!upload\.ok\) return NextResponse\.json\(\{ error: upload\.error \}, \{ status: upload\.status \}\);/,
      `${route} does not hand back the status this check chose`,
    );
  }
});

test("🔴 no refusal message carries an em dash — these are shown to the learner verbatim", () => {
  const messages = [
    checkImageUpload(null),
    checkImageUpload(imageOf("notes.pdf", "application/pdf")),
    checkImageUpload(imageOf("huge.png", "image/png", VISION_MAX_BYTES + 1)),
  ].map((check) => (check.ok ? "" : check.error));
  for (const message of messages) {
    assert.doesNotMatch(message, /—|–/, `"${message}" carries a dash the owner's copy rule bans`);
    assert.ok(message.length > 0);
  }
});
