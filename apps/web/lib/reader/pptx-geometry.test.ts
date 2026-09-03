import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_DECK_SIZE, deckSize, parseSlide, slideIsPlaced } from "./pptx-slides";
import { at } from "./test-helpers";

// A slide is drawn where its author put things.
//
// 🔴🔴 THE DEFECT THESE GUARD. Every shape in a .pptx carries its own position and size in
// `a:xfrm`, and the reader read the TEXT out of each shape and threw the box away. Every deck was
// then laid out identically — title on top, bullets down the left, pictures in a column on the
// right — so a slide built around one full-width diagram and a slide holding four bullets came out
// looking like the same slide. Owner, 2026-09-03: *"with the PowerPoint too, any slide in the
// document should be able to be viewed."*
//
// The two hard parts are both here, and each one silently ruins the feature on its own:
// inheritance (most placeholders have no box of their own) and group frames (a child's coordinates
// are in the group's space, not the slide's).

const EMU_W = 12192000;
const EMU_H = 6858000;

const xfrm = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;

const shape = (text: string, body: { ph?: string; box?: string } = {}) =>
  `<p:sp><p:nvSpPr><p:nvPr>${body.ph ?? ""}</p:nvPr></p:nvSpPr><p:spPr>${body.box ?? ""}</p:spPr>` +
  `<p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

const slide = (inner: string) => `<p:sld><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
const layout = (inner: string) => `<p:sldLayout><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sldLayout>`;

const parse = (inner: string, ancestors: (string | null)[] = []) =>
  parseSlide(1, slide(inner), null, "ppt/slides/slide1.xml", null, ancestors, { cx: EMU_W, cy: EMU_H });

test("the deck's own slide size is read, and a missing one falls back to 16:9", () => {
  assert.deepEqual(deckSize('<p:presentation><p:sldSz cx="9144000" cy="6858000"/></p:presentation>'), {
    cx: 9144000,
    cy: 6858000,
  });
  // 🔴 4:3 IS NOT A HYPOTHETICAL. Teaching decks are full of them, and a 4:3 deck drawn in a 16:9
  // box is stretched by a third — with every fractional position landing in the wrong place too.
  assert.deepEqual(deckSize(null), DEFAULT_DECK_SIZE);
  assert.deepEqual(deckSize("<p:presentation/>"), DEFAULT_DECK_SIZE);
});

test("a shape's own box becomes a fraction of the slide", () => {
  const parsed = parse(shape("Half way across", { box: xfrm(EMU_W / 2, EMU_H / 4, EMU_W / 4, EMU_H / 2) }));
  const box = at(parsed.shapes, 0).box;
  assert.ok(box);
  assert.equal(box.x, 0.5);
  assert.equal(box.y, 0.25);
  assert.equal(box.w, 0.25);
  assert.equal(box.h, 0.5);
});

test("🔴🔴 a placeholder with no box of its own inherits the layout's", () => {
  // Calibration: drop the `ancestors` argument and this reddens with `box === null`. PowerPoint
  // omits `a:xfrm` on any placeholder the author never moved, which on a template-built deck is
  // nearly every shape on every slide — so without inheritance the reader finds geometry on almost
  // nothing and falls back to the template it is replacing.
  const parsed = parse(shape("Inherited title", { ph: '<p:ph type="title"/>' }), [
    layout(shape("", { ph: '<p:ph type="title"/>', box: xfrm(0, 0, EMU_W, EMU_H / 5) })),
  ]);
  const box = at(parsed.shapes, 0).box;
  assert.ok(box, "a placeholder with no box of its own found none in the layout");
  assert.equal(box.h, 0.2);
});

test("🔴 `idx` beats `type`, because two body placeholders differ only by index", () => {
  // A two-column layout has two body placeholders. Matching on type first puts the right column's
  // text in the left column's box — the failure is silent and looks like a layout bug.
  const parsed = parse(shape("Right column", { ph: '<p:ph idx="2" type="body"/>' }), [
    layout(
      shape("", { ph: '<p:ph idx="1" type="body"/>', box: xfrm(0, 0, EMU_W / 2, EMU_H) }) +
        shape("", { ph: '<p:ph idx="2" type="body"/>', box: xfrm(EMU_W / 2, 0, EMU_W / 2, EMU_H) }),
    ),
  ]);
  assert.equal(at(parsed.shapes, 0).box?.x, 0.5);
});

test("a layout that says nothing defers to the master", () => {
  const parsed = parse(shape("From the master", { ph: '<p:ph type="body"/>' }), [
    layout(shape("", { ph: '<p:ph type="other"/>', box: xfrm(0, 0, 10, 10) })),
    layout(shape("", { ph: '<p:ph type="body"/>', box: xfrm(0, EMU_H / 2, EMU_W, EMU_H / 2) })),
  ]);
  assert.equal(at(parsed.shapes, 0).box?.y, 0.5);
});

test("🔴🔴 a shape inside a group is placed in SLIDE space, not the group's", () => {
  // A group declares where it sits (`a:off`/`a:ext`) AND the coordinate space its children are
  // written in (`a:chOff`/`a:chExt`). Reading the child's raw x as a slide coordinate puts every
  // grouped shape in the wrong place — usually piled near the origin, because child spaces are
  // often written at a much larger scale.
  //
  // The group occupies the right half of the slide; its children are written in a 1000×1000 space.
  // A child at (500,0) sized 500×1000 is therefore the right-hand quarter of the whole slide.
  const group =
    `<p:grpSp><p:grpSpPr><a:xfrm>` +
    `<a:off x="${EMU_W / 2}" y="0"/><a:ext cx="${EMU_W / 2}" cy="${EMU_H}"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/>` +
    `</a:xfrm></p:grpSpPr>${shape("In a group", { box: xfrm(500, 0, 500, 1000) })}</p:grpSp>`;
  const box = at(parse(group).shapes, 0).box;
  assert.ok(box);
  assert.equal(box.x, 0.75);
  assert.equal(box.w, 0.25);
  assert.equal(box.h, 1);
});

test("a picture keeps its box and its relationship", () => {
  const picture =
    `<p:pic><p:nvPicPr><p:cNvPr descr="A titration curve"/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId7"/></p:blipFill><p:spPr>${xfrm(0, 0, EMU_W, EMU_H)}</p:spPr></p:pic>`;
  const found = at(parse(picture).shapes, 0);
  assert.equal(found.kind, "picture");
  assert.equal(found.relId, "rId7");
  assert.equal(found.alt, "A titration curve");
  assert.deepEqual(found.box, { h: 1, w: 1, x: 0, y: 0 });
});

test("shapes come back in the deck's own paint order", () => {
  const parsed = parse(shape("first", { box: xfrm(0, 0, 10, 10) }) + shape("second", { box: xfrm(0, 0, 10, 10) }));
  assert.deepEqual(
    parsed.shapes.map((entry) => entry.paragraphs[0]?.text),
    ["first", "second"],
  );
});

test("🔴 a slide whose shapes mostly have no geometry falls back rather than piling up at the origin", () => {
  // A deck exported by a tool that omits layouts leaves nearly everything unplaced. Drawing that
  // "at its own geometry" stacks every shape in the top-left corner — visibly worse than the
  // template. The threshold is what keeps the old lane alive for exactly those files.
  const bare = parse(shape("a") + shape("b") + shape("c"));
  assert.equal(slideIsPlaced(bare), false);

  const placed = parse(
    shape("a", { box: xfrm(0, 0, 10, 10) }) + shape("b", { box: xfrm(0, 0, 10, 10) }) + shape("c", { box: xfrm(0, 0, 10, 10) }),
  );
  assert.equal(slideIsPlaced(placed), true);

  // An empty slide is not "placed" — there is nothing to place.
  assert.equal(slideIsPlaced(parse("")), false);
});

test("the deck's own type size, alignment and bullets survive the parse", () => {
  const styled =
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(0, 0, 10, 10)}</p:spPr><p:txBody>` +
    `<a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:rPr sz="2400" b="1"/><a:t>Centred, unbulleted</a:t></a:r></a:p>` +
    `<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Bulleted</a:t></a:r></a:p>` +
    `<a:p><a:r><a:t>Says nothing</a:t></a:r></a:p>` +
    `</p:txBody></p:sp>`;
  const found = at(parse(styled).shapes, 0);
  assert.equal(at(found.paragraphs, 0).sizePt, 24);
  assert.equal(at(found.paragraphs, 0).align, "ctr");
  assert.equal(at(found.paragraphs, 0).bold, true);
  assert.equal(at(found.paragraphs, 0).bullet, false);
  assert.equal(at(found.paragraphs, 1).bullet, true);
  // 🔴 THE THIRD STATE. A paragraph that says nothing inherits from the placeholder it sits in, and
  // only the renderer knows which shape that is. Collapsing this to `false` in the parser strips
  // the bullets off nearly every lecture slide; collapsing it to `true` puts one in front of every
  // caption and floating label.
  assert.equal(at(found.paragraphs, 2).bullet, null);
  assert.equal(found.placeholder, "body");
});
