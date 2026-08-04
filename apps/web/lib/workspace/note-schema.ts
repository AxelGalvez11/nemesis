// What a note is allowed to contain, as far as the editor is concerned.
//
// 🔴 NO DOM. Same rule as note-markdown.ts — a Schema is a plain data
// description, and keeping it importable without a browser is what lets the
// phone agree with the web app about the shape of a note later.
//
// SCOPED ON PURPOSE. This covers exactly what the app's renderer already
// supports (remark-gfm + remark-math) and nothing else. A note containing
// something outside it opens read-only rather than being quietly flattened —
// see isEditableNote. Growing the schema is cheap; silently eating a student's
// footnote is not.

import { Schema } from "prosemirror-model";

export const noteSchema = new Schema({
  marks: {
    // ORDER MATTERS: marks serialise in this order, so `code` last keeps
    // `**bold**` outside backticks rather than inside them.
    em: {
      parseDOM: [{ tag: "em" }, { tag: "i" }],
      toDOM: () => ["em", 0] as const,
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: "a[href]" }],
      toDOM: (mark) => ["a", { href: mark.attrs.href as string, title: mark.attrs.title as string }, 0] as const,
    },
    strike: {
      parseDOM: [{ tag: "del" }, { tag: "s" }],
      toDOM: () => ["del", 0] as const,
    },
    strong: {
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
      toDOM: () => ["strong", 0] as const,
    },
    code: {
      code: true,
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0] as const,
    },
  },
  nodes: {
    doc: { content: "block+" },

    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0] as const,
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      defining: true,
      group: "block",
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ attrs: { level }, tag: `h${level}` })),
      toDOM: (node) => [`h${node.attrs.level as number}`, 0] as const,
    },

    blockquote: {
      content: "block+",
      defining: true,
      group: "block",
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0] as const,
    },

    // `code` + `marks: ""` is what stops the editor applying bold inside a code
    // block, which markdown could not represent on the way back out.
    code_block: {
      attrs: { language: { default: "" } },
      code: true,
      content: "text*",
      defining: true,
      group: "block",
      marks: "",
      parseDOM: [{ preserveWhitespace: "full", tag: "pre" }],
      toDOM: () => ["pre", ["code", 0]] as const,
    },

    horizontal_rule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr"] as const,
    },

    // Display maths is an ATOM: the LaTeX lives in an attribute, never as
    // editable rich text, so the editor cannot bold half of an equation and
    // produce something that will not parse.
    math_block: {
      atom: true,
      attrs: { latex: { default: "" } },
      group: "block",
      parseDOM: [{ getAttrs: (dom) => ({ latex: (dom as HTMLElement).textContent ?? "" }), tag: "div[data-math-block]" }],
      toDOM: (node) => ["div", { "data-math-block": "" }, node.attrs.latex as string] as const,
    },

    bullet_list: {
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0] as const,
    },

    ordered_list: {
      attrs: { start: { default: 1 } },
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ol" }],
      toDOM: (node) => ["ol", { start: node.attrs.start as number }, 0] as const,
    },

    // `checked: null` is an ordinary bullet; true/false is a task list box.
    // Three states, not two — a plain list must not come back as "- [ ]".
    list_item: {
      attrs: { checked: { default: null } },
      content: "block+",
      defining: true,
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0] as const,
    },

    table: {
      content: "table_row+",
      group: "block",
      isolating: true,
      parseDOM: [{ tag: "table" }],
      tableRole: "table",
      toDOM: () => ["table", ["tbody", 0]] as const,
    },
    table_row: {
      content: "(table_cell | table_header)+",
      parseDOM: [{ tag: "tr" }],
      tableRole: "row",
      toDOM: () => ["tr", 0] as const,
    },
    table_cell: {
      attrs: { align: { default: null } },
      content: "inline*",
      isolating: true,
      parseDOM: [{ tag: "td" }],
      tableRole: "cell",
      toDOM: (node) => ["td", { style: node.attrs.align ? `text-align:${node.attrs.align as string}` : null }, 0] as const,
    },
    table_header: {
      attrs: { align: { default: null } },
      content: "inline*",
      isolating: true,
      parseDOM: [{ tag: "th" }],
      tableRole: "header_cell",
      toDOM: (node) => ["th", { style: node.attrs.align ? `text-align:${node.attrs.align as string}` : null }, 0] as const,
    },

    // A [[wiki link]] is an ATOM: the target lives in attributes, the visible
    // text is a rendering of it, and the editor can neither bold half of it
    // nor orphan a bracket. Double-click melts it back to raw [[...]] text
    // for editing; the input rule re-forms it when ]] closes.
    wiki_link: {
      atom: true,
      attrs: { label: { default: null }, target: {} },
      group: "inline",
      inline: true,
      parseDOM: [
        {
          getAttrs: (dom) => ({
            label: (dom as HTMLElement).getAttribute("data-label") || null,
            target: (dom as HTMLElement).getAttribute("data-target") ?? "",
          }),
          tag: "span[data-wiki-link]",
        },
      ],
      toDOM: (node) => [
        "span",
        { "data-label": (node.attrs.label as string | null) ?? "", "data-target": node.attrs.target as string, "data-wiki-link": "" },
        ((node.attrs.label as string | null) || (node.attrs.target as string)) ?? "",
      ] as const,
    },

    // A cited source, atomic like wiki_link: [1](https://…) in markdown, a
    // favicon pill in the editor (note-citations.ts owns the format). The
    // number and target are attributes, so editing the prose around a
    // citation can never corrupt it.
    citation: {
      atom: true,
      attrs: { href: {}, n: { default: 1 } },
      group: "inline",
      inline: true,
      parseDOM: [
        {
          getAttrs: (dom) => ({
            href: (dom as HTMLElement).getAttribute("data-href") ?? "",
            n: Number.parseInt((dom as HTMLElement).getAttribute("data-n") ?? "", 10) || 1,
          }),
          tag: "span[data-citation]",
        },
      ],
      toDOM: (node) => [
        "span",
        { "data-citation": "", "data-href": node.attrs.href as string, "data-n": String(node.attrs.n as number) },
        String(node.attrs.n as number),
      ] as const,
    },

    // A picture. Inline, like mdast's image node, and atomic — there is
    // nothing inside a picture a caret could edit. Clicking opens a preview
    // (note-editor.tsx); WITHOUT this node the converter silently dropped
    // images from any note a student edited.
    image: {
      atom: true,
      attrs: { alt: { default: "" }, src: {}, title: { default: null } },
      draggable: false,
      group: "inline",
      inline: true,
      parseDOM: [
        {
          getAttrs: (dom) => ({
            alt: (dom as HTMLElement).getAttribute("alt") ?? "",
            src: (dom as HTMLElement).getAttribute("src") ?? "",
            title: (dom as HTMLElement).getAttribute("title"),
          }),
          tag: "img[src]",
        },
      ],
      toDOM: (node) => [
        "img",
        { alt: node.attrs.alt as string, src: node.attrs.src as string, title: node.attrs.title as string | null },
      ] as const,
    },

    // Inline maths, atomic for the same reason as math_block.
    math_inline: {
      atom: true,
      attrs: { latex: { default: "" } },
      group: "inline",
      inline: true,
      parseDOM: [{ getAttrs: (dom) => ({ latex: (dom as HTMLElement).textContent ?? "" }), tag: "span[data-math-inline]" }],
      toDOM: (node) => ["span", { "data-math-inline": "" }, node.attrs.latex as string] as const,
    },

    hard_break: {
      group: "inline",
      inline: true,
      parseDOM: [{ tag: "br" }],
      selectable: false,
      toDOM: () => ["br"] as const,
    },

    text: { group: "inline" },
  },
});
