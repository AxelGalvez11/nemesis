import assert from "node:assert/strict";

import {
  clampOcclusionShape,
  normalizeOcclusionRect,
  occlusionCardFront,
  occlusionMaskState,
  parseOcclusionPayload,
} from "./study-occlusion";

// Drawing: any drag direction yields the same rect; bounds clamp; stray clicks die.
{
  assert.deepEqual(normalizeOcclusionRect({ x: 10, y: 20 }, { x: 110, y: 60 }, 480, 300), { x: 10, y: 20, w: 100, h: 40 });
  assert.deepEqual(normalizeOcclusionRect({ x: 110, y: 60 }, { x: 10, y: 20 }, 480, 300), { x: 10, y: 20, w: 100, h: 40 });
  assert.deepEqual(normalizeOcclusionRect({ x: -30, y: -5 }, { x: 50, y: 40 }, 480, 300), { x: 0, y: 0, w: 50, h: 40 });
  assert.deepEqual(normalizeOcclusionRect({ x: 400, y: 250 }, { x: 900, y: 900 }, 480, 300), { x: 400, y: 250, w: 80, h: 50 });
  assert.equal(normalizeOcclusionRect({ x: 10, y: 10 }, { x: 12, y: 40 }, 480, 300), null);
  assert.equal(normalizeOcclusionRect({ x: 10, y: 10 }, { x: 10, y: 10 }, 480, 300), null);
}

// Moving and resizing keeps shapes inside the image at a usable size.
{
  const shape = { id: "s1", x: 470, y: 290, w: 40, h: 40, label: "" };
  assert.deepEqual(clampOcclusionShape(shape, 480, 300), { id: "s1", x: 440, y: 260, w: 40, h: 40, label: "" });
  assert.deepEqual(clampOcclusionShape({ ...shape, x: -20, y: -20 }, 480, 300), { id: "s1", x: 0, y: 0, w: 40, h: 40, label: "" });
  assert.equal(clampOcclusionShape({ ...shape, w: 1, h: 1 }, 480, 300).w, 6);
  assert.equal(clampOcclusionShape({ ...shape, w: 999, h: 999 }, 480, 300).w, 480);
}

// Hide-all: target covered then revealed; the other masks never uncover.
{
  const payload = { mode: "hide-all" as const, targetId: "a" };
  assert.equal(occlusionMaskState("a", payload, false), "target-covered");
  assert.equal(occlusionMaskState("a", payload, true), "target-revealed");
  assert.equal(occlusionMaskState("b", payload, false), "covered");
  assert.equal(occlusionMaskState("b", payload, true), "covered");
}

// Hide-one: only the target is ever covered; context stays visible.
{
  const payload = { mode: "hide-one" as const, targetId: "a" };
  assert.equal(occlusionMaskState("a", payload, false), "target-covered");
  assert.equal(occlusionMaskState("a", payload, true), "target-revealed");
  assert.equal(occlusionMaskState("b", payload, false), "clear");
  assert.equal(occlusionMaskState("b", payload, true), "clear");
}

// Card fronts: labels win, unlabeled masks get a stable fallback.
{
  assert.equal(occlusionCardFront("SA node", 0), "SA node");
  assert.equal(occlusionCardFront("   ", 2), "Mask 3");
  assert.equal(occlusionCardFront("", 0), "Mask 1");
}

// Payload validation: round-trips good data, rejects anything unreviewable.
{
  const good = {
    kind: "occlusion",
    image: "user-1/pic.png",
    width: 480,
    height: 300,
    mode: "hide-all",
    shapes: [
      { id: "a", x: 10, y: 10, w: 50, h: 20, label: "SA node" },
      { id: "b", x: 10, y: 40, w: 50, h: 20, label: "" },
    ],
    targetId: "a",
  };
  assert.deepEqual(parseOcclusionPayload(good), good);
  assert.equal(parseOcclusionPayload(null), null);
  assert.equal(parseOcclusionPayload("occlusion"), null);
  assert.equal(parseOcclusionPayload({ ...good, kind: "other" }), null);
  assert.equal(parseOcclusionPayload({ ...good, image: "" }), null);
  assert.equal(parseOcclusionPayload({ ...good, width: 0 }), null);
  assert.equal(parseOcclusionPayload({ ...good, targetId: "missing" }), null);
  assert.equal(parseOcclusionPayload({ ...good, shapes: [] }), null);
  // Unknown mode falls back to hide-all rather than dropping the card.
  assert.equal(parseOcclusionPayload({ ...good, mode: "??" })?.mode, "hide-all");
  // A corrupt shape is dropped; the payload survives while the target remains.
  const mixed = parseOcclusionPayload({ ...good, shapes: [...good.shapes, { id: "bad", x: "nope" }] });
  assert.equal(mixed?.shapes.length, 2);
  // …but losing the target mask kills the payload.
  assert.equal(parseOcclusionPayload({ ...good, shapes: [{ id: "bad", x: "nope" }], targetId: "bad" }), null);
}
