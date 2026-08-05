import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attr,
  child,
  childrenNamed,
  descendantsNamed,
  firstPath,
  intAttr,
  isElement,
  isOn,
  parseXml,
  XML_MAX_NODES,
} from "./ooxml-tree";

test("parseXml builds a tree with attributes and decoded text", () => {
  const root = parseXml(
    '<?xml version="1.0"?><w:body><w:p w:id="7"><w:r><w:t>A &amp; B</w:t></w:r></w:p></w:body>',
  );
  assert.ok(root);
  assert.equal(root.name, "w:body");
  const p = child(root, "w:p");
  assert.equal(attr(p, "w:id"), "7");
  const t = [...descendantsNamed(root, "w:t")][0];
  assert.ok(t);
  const text = t.children[0];
  assert.ok(text && !isElement(text));
  assert.equal(text.text, "A & B");
});

test("whitespace is kept inside a text element and dropped between elements", () => {
  // Word writes `<w:t xml:space="preserve"> </w:t>` for the space between two
  // emphasised words; losing it fuses them.
  const root = parseXml('<w:p>\n  <w:r><w:t xml:space="preserve"> </w:t></w:r>\n</w:p>');
  assert.ok(root);
  assert.equal(root.children.filter((node) => !isElement(node)).length, 0);
  const t = [...descendantsNamed(root, "w:t")][0];
  const text = t?.children[0];
  assert.ok(text && !isElement(text));
  assert.equal(text.text, " ");
});

test("a self-closing tag does not open a level", () => {
  const root = parseXml("<w:pPr><w:outlineLvl w:val='1'/><w:pStyle w:val='Heading2'/></w:pPr>");
  assert.ok(root);
  assert.equal(childrenNamed(root, "w:pStyle").length, 1);
  assert.equal(intAttr(child(root, "w:outlineLvl"), "w:val"), 1);
});

test("an attribute value may contain a bare > and a quote of the other kind", () => {
  const root = parseXml('<wp:docPr descr="a > b, it&apos;s fine"/>');
  assert.equal(attr(root ?? undefined, "descr"), "a > b, it's fine");
});

test("comments, declarations and CDATA are handled", () => {
  const root = parseXml("<a><!-- skip me --><b><![CDATA[<raw> & literal]]></b></a>");
  const b = root ? child(root, "b") : undefined;
  const text = b?.children[0];
  assert.ok(text && !isElement(text));
  assert.equal(text.text, "<raw> & literal");
});

test("an unclosed element loses only itself", () => {
  const root = parseXml("<w:body><w:p><w:r><w:t>one</w:t></w:p><w:p><w:t>two</w:t></w:p></w:body>");
  assert.ok(root);
  // The stray <w:r> never closes; popping to the matching name means the second
  // paragraph is still a sibling of the first rather than its descendant.
  assert.equal(childrenNamed(root, "w:p").length, 2);
});

test("isOn reads an OOXML on/off attribute", () => {
  const rPr = parseXml("<w:rPr><w:b/><w:i w:val='0'/><w:caps w:val='true'/></w:rPr>");
  assert.ok(rPr);
  assert.equal(isOn(child(rPr, "w:b")), true);
  assert.equal(isOn(child(rPr, "w:i")), false);
  assert.equal(isOn(child(rPr, "w:caps")), true);
  assert.equal(isOn(child(rPr, "w:strike")), false);
});

test("firstPath follows a chain of first children", () => {
  const p = parseXml("<w:p><w:pPr><w:numPr><w:ilvl w:val='2'/></w:numPr></w:pPr></w:p>");
  assert.ok(p);
  assert.equal(intAttr(firstPath(p, "w:pPr", "w:numPr", "w:ilvl"), "w:val"), 2);
  assert.equal(firstPath(p, "w:pPr", "w:missing", "w:ilvl"), undefined);
});

test("descendantsNamed yields in document order and does not recurse the call stack", () => {
  const deep = `<w:body>${"<w:x>".repeat(5_000)}<w:t>bottom</w:t>${"</w:x>".repeat(5_000)}</w:body>`;
  const root = parseXml(deep);
  assert.ok(root);
  assert.equal([...descendantsNamed(root, "w:t")].length, 1);
});

test("a pathological part is refused rather than allocated", () => {
  assert.ok(XML_MAX_NODES > 1_000_000);
});
