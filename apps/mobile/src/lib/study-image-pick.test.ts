import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { imageExtensionFor, pickedImageMime, STUDY_IMAGE_PICKER_TYPES } from "./study-image-pick.ts";

Deno.test("pickedImageMime: trusts the picker's own type when it gives one", () => {
  assertEquals(pickedImageMime("slide.png", "image/png"), "image/png");
  assertEquals(pickedImageMime("slide.png", "image/jpeg"), "image/jpeg");
});

Deno.test("pickedImageMime: falls back to the extension when the picker says nothing", () => {
  // Some Files providers leave mimeType empty; the name is all there is.
  assertEquals(pickedImageMime("Lecture 4.PNG", null), "image/png");
  assertEquals(pickedImageMime("scan.jpeg", undefined), "image/jpeg");
  assertEquals(pickedImageMime("scan.JPG", ""), "image/jpeg");
});

Deno.test("pickedImageMime: image/jpg is the same thing as image/jpeg", () => {
  assertEquals(pickedImageMime("x.bin", "image/jpg"), "image/jpeg");
});

Deno.test("pickedImageMime: anything else is refused rather than guessed at", () => {
  // A HEIC uploaded as a JPEG is a card whose picture may or may not draw
  // depending on which app opens it — worse than not offering it.
  assertEquals(pickedImageMime("IMG_0021.heic", "image/heic"), null);
  assertEquals(pickedImageMime("notes.pdf", "application/pdf"), null);
  assertEquals(pickedImageMime("nameless", null), null);
});

Deno.test("imageExtensionFor: the stored file is named for what is in it", () => {
  assertEquals(imageExtensionFor("image/png"), "png");
  assertEquals(imageExtensionFor("image/jpeg"), "jpg");
});

Deno.test("the picker offers exactly the types we can handle", () => {
  // If these ever drift apart, the picker lets through a file pickedImageMime
  // then refuses — an offer the app takes back.
  for (const type of STUDY_IMAGE_PICKER_TYPES) {
    assertEquals(pickedImageMime(`file.bin`, type) !== null, true);
  }
});
