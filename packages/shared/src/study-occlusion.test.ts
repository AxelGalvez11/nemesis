// Deno unit tests (repo convention) for image-occlusion geometry and payload
// validation. Run from the REPO ROOT:
//   deno test --no-check --allow-env apps/mobile/src/
//
// These mirror apps/web/lib/workspace/study-occlusion.test.ts case for case, on
// purpose. The two clients read and write the same `study_cards.payload`, so if
// the phone's copy of this module ever drifts from the web's, a card made on one
// device renders its boxes somewhere else on the other — or fails to parse at
// all and silently disappears from review.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clampOcclusionShape,
  normalizeOcclusionRect,
  occlusionCardFront,
  occlusionMaskState,
  parseOcclusionPayload,
} from "./study-occlusion.ts";

Deno.test("drawing: any drag direction yields the same rect; bounds clamp; a tap is not a box", () => {
  assertEquals(normalizeOcclusionRect({ x: 10, y: 20 }, { x: 110, y: 60 }, 480, 300), { x: 10, y: 20, w: 100, h: 40 });
  assertEquals(normalizeOcclusionRect({ x: 110, y: 60 }, { x: 10, y: 20 }, 480, 300), { x: 10, y: 20, w: 100, h: 40 });
  assertEquals(normalizeOcclusionRect({ x: -30, y: -5 }, { x: 50, y: 40 }, 480, 300), { x: 0, y: 0, w: 50, h: 40 });
  assertEquals(normalizeOcclusionRect({ x: 400, y: 250 }, { x: 900, y: 900 }, 480, 300), { x: 400, y: 250, w: 80, h: 50 });
  // A stray tap, and a sliver too thin to cover anything, both produce nothing.
  assertEquals(normalizeOcclusionRect({ x: 10, y: 10 }, { x: 12, y: 40 }, 480, 300), null);
  assertEquals(normalizeOcclusionRect({ x: 10, y: 10 }, { x: 10, y: 10 }, 480, 300), null);
});

Deno.test("moving and resizing keeps a box inside the picture at a usable size", () => {
  const shape = { id: "s1", x: 470, y: 290, w: 40, h: 40, label: "" };
  assertEquals(clampOcclusionShape(shape, 480, 300), { id: "s1", x: 440, y: 260, w: 40, h: 40, label: "" });
  assertEquals(clampOcclusionShape({ ...shape, x: -20, y: -20 }, 480, 300), { id: "s1", x: 0, y: 0, w: 40, h: 40, label: "" });
  assertEquals(clampOcclusionShape({ ...shape, w: 1, h: 1 }, 480, 300).w, 6);
  assertEquals(clampOcclusionShape({ ...shape, w: 999, h: 999 }, 480, 300).w, 480);
});

Deno.test("hide-all: the target uncovers, every other box stays put", () => {
  const payload = { mode: "hide-all" as const, targetId: "a" };
  assertEquals(occlusionMaskState("a", payload, false), "target-covered");
  assertEquals(occlusionMaskState("a", payload, true), "target-revealed");
  assertEquals(occlusionMaskState("b", payload, false), "covered");
  assertEquals(occlusionMaskState("b", payload, true), "covered");
});

Deno.test("hide-one: only the target is ever covered, so the context stays readable", () => {
  const payload = { mode: "hide-one" as const, targetId: "a" };
  assertEquals(occlusionMaskState("a", payload, false), "target-covered");
  assertEquals(occlusionMaskState("a", payload, true), "target-revealed");
  assertEquals(occlusionMaskState("b", payload, false), "clear");
  assertEquals(occlusionMaskState("b", payload, true), "clear");
});

Deno.test("card fronts: a label wins, an unlabelled box gets a stable fallback", () => {
  assertEquals(occlusionCardFront("SA node", 0), "SA node");
  assertEquals(occlusionCardFront("   ", 2), "Mask 3");
  assertEquals(occlusionCardFront("", 0), "Mask 1");
});

Deno.test("payload validation: good data round-trips, unreviewable data is rejected", () => {
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
  assertEquals(parseOcclusionPayload(good), good);
  assertEquals(parseOcclusionPayload(null), null);
  assertEquals(parseOcclusionPayload("occlusion"), null);
  assertEquals(parseOcclusionPayload({ ...good, kind: "other" }), null);
  assertEquals(parseOcclusionPayload({ ...good, image: "" }), null);
  assertEquals(parseOcclusionPayload({ ...good, width: 0 }), null);
  assertEquals(parseOcclusionPayload({ ...good, targetId: "missing" }), null);
  assertEquals(parseOcclusionPayload({ ...good, shapes: [] }), null);
  // An unknown mode falls back to hide-all rather than dropping a real card.
  assertEquals(parseOcclusionPayload({ ...good, mode: "??" })?.mode, "hide-all");
  // One corrupt box is dropped; the card survives while its own target remains.
  const mixed = parseOcclusionPayload({ ...good, shapes: [...good.shapes, { id: "bad", x: "nope" }] });
  assertEquals(mixed?.shapes.length, 2);
  // …but losing the target box kills it: there is nothing left to ask about.
  assertEquals(parseOcclusionPayload({ ...good, shapes: [{ id: "bad", x: "nope" }], targetId: "bad" }), null);
});
