// Deno unit tests (repo convention) for the edit-time image tokenizer.
// Run from the REPO ROOT: deno test --no-check --allow-env apps/mobile/src/
//
// The case that matters most is the ROUND TRIP. This text is written straight
// back into study_cards, so anything lossy here silently destroys the pictures
// on cards the student can no longer recover them for.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fromEditText, hasCardImage, toEditText } from "./card-image-tokens.ts";

const URL_A = "https://qyjmivntajbigjswhahb.supabase.co/storage/v1/object/public/starter-deck-media/captain-hook/m307.png";
const URL_B = "https://qyjmivntajbigjswhahb.supabase.co/storage/v1/object/public/starter-deck-media/captain-hook/m412.png";

Deno.test("a markdown image becomes a short token, and the URL never reaches the field", () => {
  const raw = `What does this show? ![](${URL_A})`;
  const { text, images } = toEditText(raw);
  assertEquals(text, "What does this show? [image 1]");
  assertEquals(images, [`![](${URL_A})`]);
  assertEquals(text.includes("supabase"), false, "the whole point of the change");
});

Deno.test("a bare <img> tag is tokenised too — that is the Anki import shape", () => {
  const raw = `The mitral valve <img src="${URL_A}" width="300">`;
  const { text, images } = toEditText(raw);
  assertEquals(text, "The mitral valve [image 1]");
  assertEquals(images, [`<img src="${URL_A}" width="300">`]);
});

Deno.test("mixed forms are numbered in the order they appear, not grouped by kind", () => {
  const raw = `a <img src="${URL_A}"> b ![alt](${URL_B}) c`;
  const { text, images } = toEditText(raw);
  assertEquals(text, "a [image 1] b [image 2] c");
  assertEquals(images[0], `<img src="${URL_A}">`);
  assertEquals(images[1], `![alt](${URL_B})`);
});

Deno.test("round trip is byte-exact, and restores each form as itself", () => {
  for (
    const raw of [
      `Front ![](${URL_A}) back`,
      `<img src="${URL_A}">`,
      `a <img src="${URL_A}"> b ![alt text](${URL_B}) c`,
      "no images at all",
      "",
    ]
  ) {
    const { text, images } = toEditText(raw);
    assertEquals(fromEditText(text, images), raw, `round trip failed for: ${raw}`);
  }
});

Deno.test("edits around a token are preserved and the image stays put", () => {
  const raw = `Old question ![](${URL_A})`;
  const { images } = toEditText(raw);
  // The student rewrites the prose but leaves the token alone.
  assertEquals(fromEditText("New question [image 1]", images), `New question ![](${URL_A})`);
  // …or moves it to the front.
  assertEquals(fromEditText("[image 1] New question", images), `![](${URL_A}) New question`);
});

Deno.test("deleting the token drops that image — deliberate, it is how you remove one", () => {
  const raw = `Question ![](${URL_A})`;
  const { images } = toEditText(raw);
  assertEquals(fromEditText("Question", images), "Question");
});

Deno.test("a token with no image behind it survives as literal text", () => {
  // Someone writing a card ABOUT this app, or who duplicated a token by hand.
  assertEquals(fromEditText("see [image 7]", []), "see [image 7]");
  assertEquals(fromEditText("[image 2] only", [`![](${URL_A})`]), "[image 2] only");
  // …and a duplicated token restores the same image twice rather than eating one.
  assertEquals(fromEditText("[image 1] [image 1]", [`![](${URL_A})`]), `![](${URL_A}) ![](${URL_A})`);
});

Deno.test("token matching tolerates the spacing a person would actually type", () => {
  const images = [`![](${URL_A})`];
  assertEquals(fromEditText("[ image 1 ]", images), `![](${URL_A})`);
  assertEquals(fromEditText("[IMAGE 1]", images), `![](${URL_A})`);
});

Deno.test("hasCardImage is not confused by a stale regex cursor", () => {
  // IMAGE_RE is a module-level /g regex; a naive .test() would alternate
  // true/false on repeated calls with the same input.
  const raw = `![](${URL_A})`;
  assertEquals(hasCardImage(raw), true);
  assertEquals(hasCardImage(raw), true);
  assertEquals(hasCardImage("plain text"), false);
});
