import assert from "node:assert/strict";
import { test } from "node:test";
import React, { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConceptPill } from "@/components/workspace/concept-pill";

import { AssistantMarkdown, markdownComponents } from "./chat-markdown";
import { CONCEPT_INSTRUCTION, diveDeeperMessage } from "./concept-terms";

// `tsx` compiles .tsx with the classic JSX runtime, so the rendered modules read `React` from the global.
(globalThis as unknown as { React: typeof React }).React = React;

// Owner 2026-09-03: the board's key-term pills, in the chat, "but remove the wondering icon".

type Anchor = (props: { href?: string; title?: string; children?: React.ReactNode }) => ReactElement | null;

test("a key term the model marks becomes the pill, with its meaning, on the chat's own renderer", () => {
  const components = markdownComponents(undefined, undefined, true, undefined, false, undefined, undefined);
  const anchor = components.a as unknown as Anchor;
  const pill = anchor({ href: "#concept", title: "Each side gives something for the other's promise", children: "bargained-for exchange" });
  assert.ok(isValidElement(pill) && pill.type === ConceptPill, "the link form did not become the shared pill");
  assert.equal((pill as ReactElement<{ meaning: string }>).props.meaning, "Each side gives something for the other's promise");
  // The pill draws no icon: the reference's sparkle is gone by owner order, on both surfaces.
  const source = String(ConceptPill);
  assert.ok(!/Sparkles|<svg|lucide/.test(source), "the pill must not carry an icon");
});

test("an ordinary link is still a link", () => {
  const html = renderToStaticMarkup(createElement(AssistantMarkdown, { text: "See [the act](https://example.org/act)." }));
  assert.match(html, /href="https:\/\/example\.org\/act"/);
  assert.ok(!/data-concept-pill/.test(html));
});

test("the shared rule names the link form, and the follow-up speaks in the learner's voice", () => {
  assert.match(CONCEPT_INSTRUCTION, /\[term\]\(#concept "one plain sentence explaining the term"\)/);
  assert.ok(!/—/.test(CONCEPT_INSTRUCTION), "no em dash in a prompt");
  assert.match(diveDeeperMessage("estoppel"), /^Dive deeper into "estoppel"/);
});
