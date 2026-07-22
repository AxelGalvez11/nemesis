import assert from "node:assert/strict";
import test from "node:test";

import { cardListPreview } from "./study-card-preview";

test("card list preview collapses markdown, images, and inline HTML", () => {
  assert.equal(cardListPreview("**Bold** and *it* H<sub>2</sub>O ![](https://x/y.png) [link](https://z)"), "Bold and it H2O [picture] link");
  assert.equal(cardListPreview("{{c1::renin}} rises with volume loss"), "renin rises with volume loss");
});
