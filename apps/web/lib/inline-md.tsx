import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free inline-markdown renderer for answer text. The generation model
// spontaneously emits emphasis (**bold**, *italic* / _italic_, `code`); without this those markers
// reached the screen as literal asterisks/backticks. We split the string on a token regex and map
// each captured token to a React element — everything else stays plain text.
//
// SAFETY: this returns React nodes, never an HTML string, so there is no dangerouslySetInnerHTML and
// no XSS surface. The only input is model output already rendered as text elsewhere; we are purely
// re-expressing a few inline markers as <strong>/<em>/<code>.
//
// Scope is deliberately narrow: inline only (no block markdown, links, or nesting). `**bold**` is
// matched before `*italic*` so double-stars never get mis-parsed as italic.
const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;

export function renderInline(text: string): ReactNode {
  // Fast path: nothing to do if there are no emphasis markers at all.
  if (!text || (!text.includes("*") && !text.includes("_") && !text.includes("`"))) return text;

  // String.split with a capturing group keeps the delimiters, so `parts` interleaves
  // plain text and matched tokens. (split is not stateful, so the /g regex is safe to reuse.)
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.length >= 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.length >= 2 && part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.length >= 2 && part.startsWith("_") && part.endsWith("_")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
