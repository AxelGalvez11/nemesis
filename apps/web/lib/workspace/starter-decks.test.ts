import assert from "node:assert/strict";
import test from "node:test";

import { parseStarterDeckPayload, starterDeckOwned, STARTER_DECKS } from "./starter-decks";

test("valid payloads become importable decks", () => {
  const decks = parseStarterDeckPayload({
    id: "x",
    decks: [
      {
        name: " Physics ",
        cards: [
          { front: "F = ?", back: "ma ![](https://cdn/m1.png)", cardType: "basic", tags: ["physics"] },
          { front: "{{c1::Work}} = Fd", back: "", cardType: "cloze", tags: [] },
        ],
      },
      { name: "Empty", cards: [] },
    ],
  });
  assert.equal(decks.length, 1);
  assert.equal(decks[0]?.name, "Physics");
  assert.equal(decks[0]?.cards.length, 2);
  assert.equal(decks[0]?.cards[0]?.tags[0], "physics");
});

test("malformed payloads throw a readable error", () => {
  assert.throws(() => parseStarterDeckPayload(null));
  assert.throws(() => parseStarterDeckPayload({ decks: [] }));
  assert.throws(() => parseStarterDeckPayload({ decks: [{ name: "A", cards: [{ front: "", back: "", cardType: "basic", tags: [] }] }] }));
  assert.throws(() => parseStarterDeckPayload({ decks: [{ name: "A", cards: [{ front: "x", back: "", cardType: "image_occlusion", tags: [] }] }] }));
  // Every deck empty = nothing to import.
  assert.throws(() => parseStarterDeckPayload({ decks: [{ name: "A", cards: [] }] }));
});

test("non-string tags are dropped instead of failing the whole deck", () => {
  const decks = parseStarterDeckPayload({ decks: [{ name: "A", cards: [{ front: "x", back: "y", cardType: "basic", tags: ["ok", 3, null] }] }] });
  assert.deepEqual(decks[0]?.cards[0]?.tags, ["ok"]);
});

test("owned detection matches the marker deck name case-insensitively", () => {
  const meta = STARTER_DECKS[0];
  assert.ok(meta);
  assert.equal(starterDeckOwned(meta, ["captain hook mcat::0 - essential equations", "My deck"]), true);
  assert.equal(starterDeckOwned(meta, ["Captain Hook MCAT::0 - Essential Equations (imported)"]), false);
  assert.equal(starterDeckOwned(meta, []), false);
});

test("catalog entries point at bundled payload files", () => {
  for (const meta of STARTER_DECKS) {
    assert.ok(meta.file.startsWith("/starter-decks/"));
    assert.ok(meta.cardCount > 0);
    assert.ok(meta.ownedMarker.length > 0);
  }
});
