/**
 * Which of pdf.js's two object stores a figure's pixels are actually in.
 *
 * 🔴🔴 THE 89 `unsupported` FIGURES, MEASURED ON PRODUCTION 2026-09-03. Across five lectures, 89
 * figures are recorded as "routed, but its pixels were never captured" — a reason that reads like
 * a verdict about the picture. Every one of them has a ref beginning `g_` (`g_d0_img_p12_3`), and
 * they are not decoration: they average a quarter to a half of the page they sit on. One
 * immunology lecture loses 72 of its 132 this way.
 *
 * pdf.js 6.2.108 routes on that exact prefix, in its own source, in two places:
 *
 *     return data.startsWith("g_") ? this.commonObjs.get(data) : this.objs.get(data);
 *     const objsPool = depObjId.startsWith("g_") ? commonObjs : objs;
 *
 * `g_` means document-scoped — an image cached once and drawn on several pages — so it lives in
 * `commonObjs`. The reader only ever asked `page.objs`, so the callback could never fire, the
 * three-second wait expired, and the figure was filed under a stated reason that was true of the
 * lookup and false of the picture.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { objectStore, readImageObject } from "./structure";

function twoStores() {
  const asked: { store: string; ref: string }[] = [];
  const store = (name: string, holds: Record<string, unknown>) => ({
    get(ref: string, callback: (value: unknown) => void) {
      asked.push({ ref, store: name });
      // Only answers for what it actually holds — the other store never calls back, which is
      // exactly how this failed in production.
      if (ref in holds) callback(holds[ref]);
    },
  });
  const page = {
    commonObjs: store("commonObjs", { g_d0_img_p12_3: { data: new Uint8Array(3), height: 1, kind: 2, width: 1 } }),
    objs: store("objs", { img_p5_1: { data: new Uint8Array(3), height: 1, kind: 2, width: 1 } }),
  };
  return { asked, page };
}

test("🔴 a `g_` ref is document-scoped and is asked of commonObjs", () => {
  const { page } = twoStores();
  assert.equal(objectStore(page, "g_d0_img_p12_3"), page.commonObjs);
});

test("an ordinary page-scoped ref still goes to page.objs", () => {
  const { page } = twoStores();
  assert.equal(objectStore(page, "img_p5_1"), page.objs);
});

test("🔴 the prefix is the router, not a fallback chain", () => {
  // Asking both and taking whichever answers would pay the full three-second wait on every
  // ordinary figure, to learn what the name already says.
  const { asked, page } = twoStores();
  void readImageObject(page, "img_p5_1");
  assert.deepEqual(asked, [{ ref: "img_p5_1", store: "objs" }], "exactly one store is asked");
});

test("🔴🔴 the pixels behind a `g_` figure actually arrive", async () => {
  const { asked, page } = twoStores();
  const image = await readImageObject(page, "g_d0_img_p12_3");
  assert.ok(image, "the object resolved instead of timing out into `unsupported`");
  assert.deepEqual(asked, [{ ref: "g_d0_img_p12_3", store: "commonObjs" }]);
});

test("a build with no commonObjs degrades to what it did before, never to a throw", () => {
  const objs = { get() {} };
  assert.equal(objectStore({ objs }, "g_d0_img_p12_3"), objs);
});
