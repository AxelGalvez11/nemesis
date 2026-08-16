import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareWebSourcePromotion } from "./web-source-promotion";

test("a promoted web result keeps its URL as provenance rather than source content", () => {
  const prepared = prepareWebSourcePromotion({
    requestedUrl: "https://search.example/result",
    returnedUrl: "https://publisher.example/guideline",
    text: "The actual page body.",
    title: "Current guideline",
  });

  assert.deepEqual(prepared, {
    content: "The actual page body.",
    fileName: "Current guideline.md",
    sourceUrl: "https://publisher.example/guideline",
  });
  assert.doesNotMatch(prepared.content, /https?:\/\//);
});

test("promotion falls back to the requested URL when the reader does not return one", () => {
  const prepared = prepareWebSourcePromotion({
    requestedUrl: "https://example.com/topic",
    text: "Body",
  });

  assert.equal(prepared.sourceUrl, "https://example.com/topic");
  assert.equal(prepared.fileName, "https://example.com/topic.md");
});
