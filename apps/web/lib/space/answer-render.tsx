"use client";

// Answers in the workspace's Chat draw with the app's own renderer (lib/workspace/chat-markdown.tsx): the same
// markdown, maths, diagrams and source pills as every other chat in Nemesis. The workspace is Preact, so each answer
// gets a small React root of its own, made on its first draw and removed with the message.

import { createRoot, type Root } from "react-dom/client";

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";

const roots = new WeakMap<Element, Root>();

export function renderAnswer(el: Element, text: string, sources: ReadonlyArray<{ title: string; url: string }>): void {
  let root = roots.get(el);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }
  root.render(<AssistantMarkdown text={text} sources={sources.length ? sources : undefined} />);
}

export function removeAnswer(el: Element): void {
  const root = roots.get(el);
  if (!root) return;
  roots.delete(el);
  // Preact is mid-commit when a message goes; React refuses to unmount synchronously inside another renderer's pass.
  queueMicrotask(() => root.unmount());
}
