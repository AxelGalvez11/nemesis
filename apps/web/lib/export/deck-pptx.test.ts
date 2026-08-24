import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_SLIDE, type DeckPlan } from "./deck-plan";
import { buildDeckPptx } from "./deck-pptx";

// One real build, opened up. Geometry and colour are the design's own business; what this
// pins is the contract: a plan in, a genuine PowerPoint out — every slide present, the
// references slide appended, the fonts the design promises actually named in the XML.

const PLAN: DeckPlan = {
  figures: [],
  references: [{ title: "OpenStax Biology 2e", url: "https://openstax.org/books/biology-2e" }],
  slides: [
    { ...EMPTY_SLIDE, layout: "cover", subtitle: "sub", title: "Deck" },
    { ...EMPTY_SLIDE, layout: "section", title: "Part one" },
    { ...EMPTY_SLIDE, layout: "bullets", points: ["one", "two"], title: "Points" },
    { ...EMPTY_SLIDE, layout: "stat", statLabel: "of something", statValue: "42%" },
    { ...EMPTY_SLIDE, layout: "closing", title: "End" },
  ],
  subtitle: "sub",
  title: "Deck",
};

test("a plan becomes a real .pptx: zip magic, one XML per slide, the design's fonts", async () => {
  const built = (await buildDeckPptx(PLAN, { credit: "Made with Nemesis" })) as Buffer;
  assert.ok(Buffer.isBuffer(built), "under Node the builder returns a Buffer");
  assert.ok(built.length > 50_000, "a deck with backgrounds cannot be this small");
  assert.equal(built.subarray(0, 2).toString(), "PK", "not a zip, so not a pptx");
  const text = built.toString("latin1");
  for (let i = 1; i <= 6; i += 1) {
    assert.ok(text.includes(`ppt/slides/slide${i}.xml`), `slide ${i} missing — 5 planned + references`);
  }
  assert.ok(!text.includes("ppt/slides/slide7.xml"), "more slides than the plan holds");
});

test("no references, no references slide", async () => {
  const built = (await buildDeckPptx({ ...PLAN, references: [] }, { credit: "x" })) as Buffer;
  const text = built.toString("latin1");
  assert.ok(text.includes("ppt/slides/slide5.xml"));
  assert.ok(!text.includes("ppt/slides/slide6.xml"), "a references slide appeared from nowhere");
});

test("the design, not the plan, decides how the deck looks", async () => {
  // Owner 2026-08-25 asked for twenty designs. The same plan must come out composed
  // differently — different fonts, different furniture — with no change to the content.
  const house = ((await buildDeckPptx(PLAN, { credit: "x" })) as Buffer).toString("latin1");
  const onyx = ((await buildDeckPptx(PLAN, { credit: "x", designId: "onyx" })) as Buffer).toString("latin1");
  assert.ok(house.includes("Georgia"), "the house design lost its display font");
  assert.ok(onyx.includes("Trebuchet MS"), "the onyx design is not wearing its own display font");
  assert.ok(!onyx.includes("Georgia"), "the onyx design leaked the house font");
  for (let i = 1; i <= 6; i += 1) {
    assert.ok(onyx.includes(`ppt/slides/slide${i}.xml`), `the design dropped slide ${i}`);
  }
});

test("a design id nobody recognises still produces a deck", async () => {
  // Stored ids outlive code. A design that was renamed or removed must degrade to the house
  // design, never to a failed download.
  const built = (await buildDeckPptx(PLAN, { credit: "x", designId: "design-from-a-future-release" })) as Buffer;
  assert.equal(built.subarray(0, 2).toString(), "PK");
  assert.ok(built.toString("latin1").includes("Georgia"), "the fallback is not the house design");
});

test("🔴 a learner's figure becomes BYTES, and its signed link does not travel", async () => {
  // A .pptx is a file a student hands to a professor or a classmate. The figure bucket is
  // private and a signed URL is a live, bearer-style key to one object in it — so the picture
  // has to be inlined, and the link must not survive into the file. (It also could not work if
  // it did: PowerPoint cannot reference anything outside the package, and the signature expires
  // within the hour anyway.)
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url));
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return {
      arrayBuffer: async () => bytes.buffer,
      headers: { get: () => "image/png" },
      ok: true,
    };
  }) as unknown as typeof globalThis.fetch;
  try {
    const link = "https://project.supabase.co/storage/v1/object/sign/library-images/uid/figures/z.png?token=SECRET";
    const plan: DeckPlan = {
      ...PLAN,
      figures: [{ caption: "Figure 3. The Z-scheme", path: "uid/figures/z.png", source: "Lecture 4.pdf", url: link }],
      slides: PLAN.slides.map((slide) => (slide.layout === "bullets" ? { ...slide, figure: 1 } : slide)),
    };
    const built = (await buildDeckPptx(plan, { credit: "Made with Nemesis", designId: "studio" })) as Buffer;
    assert.ok(asked.some((url) => url.includes("SECRET")), "the figure was never fetched, so it cannot be in the file");
    const text = built.toString("latin1");
    assert.ok(!text.includes("SECRET"), "🔴 a signed link into the learner's private bucket shipped inside the .pptx");
    assert.ok(!text.includes("supabase.co"), "🔴 the storage host shipped inside the .pptx");
    assert.ok(text.includes("ppt/media/"), "the figure never became embedded media");
  } finally {
    globalThis.fetch = realFetch;
  }
});
