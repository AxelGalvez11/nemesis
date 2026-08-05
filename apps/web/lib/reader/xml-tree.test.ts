import assert from "node:assert/strict";
import { test } from "node:test";

import { allNamed, childrenNamed, decodeEntities, firstNamed, parseXml, textOf } from "./xml-tree";

test("a simple document parses into a tree", () => {
  const root = parseXml('<w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body>');
  assert.equal(root?.name, "w:body");
  assert.equal(textOf(root!), "hello");
});

test("attributes are read, single or double quoted", () => {
  const root = parseXml(`<a b="1" c='two' d:e="three"/>`);
  assert.deepEqual(root?.attrs, { b: "1", c: "two", "d:e": "three" });
});

test("an attribute value containing > does not end the tag early", () => {
  const root = parseXml('<a title="x > y"><b/></a>');
  assert.equal(root?.attrs.title, "x > y");
  assert.equal(childrenNamed(root!, "b").length, 1);
});

test("self-closing tags do not swallow their siblings", () => {
  const root = parseXml("<r><a/><b/><c/></r>");
  assert.deepEqual(root?.children.filter((node) => "name" in node).map((node) => (node as { name: string }).name), ["a", "b", "c"]);
});

test("entities are decoded in text and in attributes", () => {
  assert.equal(decodeEntities("a &amp; b &lt; c &#65; &#x42;"), "a & b < c A B");
  const root = parseXml('<a t="x &amp; y">p &lt; q</a>');
  assert.equal(root?.attrs.t, "x & y");
  assert.equal(textOf(root!), "p < q");
});

test("comments, declarations and doctypes are skipped", () => {
  const root = parseXml('<?xml version="1.0"?><!-- note --><r><!-- inner --><a>x</a></r>');
  assert.equal(root?.name, "r");
  assert.equal(textOf(root!), "x");
});

test("CDATA keeps its contents verbatim", () => {
  const root = parseXml("<r><![CDATA[a < b & c]]></r>");
  assert.equal(textOf(root!), "a < b & c");
});

test("whitespace inside text is preserved", () => {
  const root = parseXml("<r><t>a  b</t><t> c</t></r>");
  assert.equal(textOf(root!), "a  b c");
});

test("firstNamed searches at any depth; childrenNamed only direct children", () => {
  const root = parseXml("<r><x><target>deep</target></x><target>shallow</target></r>")!;
  assert.equal(textOf(firstNamed(root, "target")!), "deep");
  assert.deepEqual(childrenNamed(root, "target").map(textOf), ["shallow"]);
});

test("allNamed returns every match in document order", () => {
  const root = parseXml("<r><a>1</a><x><a>2</a></x><a>3</a></r>")!;
  assert.deepEqual(allNamed(root, "a").map(textOf), ["1", "2", "3"]);
});

test("an unmatched closing tag does not throw away the rest of the document", () => {
  const root = parseXml("<r><a>one</a></zz><b>two</b></r>");
  assert.equal(textOf(root!), "onetwo");
});

test("empty or non-XML input returns null instead of throwing", () => {
  assert.equal(parseXml(""), null);
  assert.equal(parseXml("   "), null);
  assert.equal(parseXml("just text"), null);
});
