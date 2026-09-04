"use client";

// A Word file, drawn as its pages. In the browser, with no service.
//
// 🔴🔴 THE SAME MOVE `pptx-render.ts` MADE FOR A DECK, FOR THE SAME REASON. Owner, 2026-09-04,
// after the deck: *"make sure any documents can be viewed too"*, and a day earlier of the old Word
// view: *"it doesn't really render like a docx, it just looks weird … it's not rendering like a
// document."* That view was OUR reflow of the file's paragraphs: right headings, right lists, and
// none of the author's page. A Word file is a page size, margins, the author's fonts, sizes and
// colours, tables with their borders, pictures where they were put, headers, footers and footnotes.
// `docx-preview` (Apache-2.0) lays all of that out from the file's own XML, so what the learner
// sees is the document and not an account of it.
//
// 🔴 THE PARSED MODEL STAYS AND IS STILL THE SOURCE OF TRUTH FOR MEANING. `docx-blocks.ts` still
// reads the headings for the outline and the text for search and grounding. This module only
// changes what the learner SEES, and if it returns null the view draws what it drew yesterday.
// Every failure here is a null and never a throw.
//
// 🔴🔴 SCRUBBED BEFORE IT TOUCHES THE PAGE. The renderer builds real DOM nodes from a file a
// stranger made. It never emits script, but a hyperlink's target comes straight from the file's
// relationships and could say `javascript:`, a style could name a remote `url(…)` that fetches on
// render, and an HTML chunk (`altChunk`) is a whole page inside the document. So: no HTML chunks
// rendered at all, an allow-list of element names, no `on*` attributes, and every URL either local
// to the render (`blob:`, `data:`, `#`) or, for a link the learner can choose to follow, a plain
// web address. `docx-render.test.ts` drives these rules against a real DOM.
//
// 🔴 THE LIBRARY LOADS ON FIRST USE, NEVER IN THE BUNDLE. Same treatment the deck renderer and
// mermaid get, and the promise is shared so ten documents in one session initialise once.

/** Shared across every document in the session: the import happens once. */
let engine: Promise<typeof import("docx-preview")> | null = null;

function loadEngine(): Promise<typeof import("docx-preview")> {
  engine ??= import("docx-preview");
  return engine;
}

/** The class the renderer stamps on every page and prefixes every style rule with. */
export const DOCX_CLASS = "nemesis-docx";

/**
 * What the renderer is allowed to emit.
 *
 * 🔴 AN ALLOW-LIST, NOT A BLOCK-LIST, for the reason `pptx-render.ts` gives: blocking `script`
 * leaves the next vector open, permitting by name does not. Measured over the renderer's own
 * source: pages are `section > article`, text is `p`/`span` with `b`/`i`/`u`, lists are `ol`/`li`,
 * tables are the usual family, pictures are `img` and VML drawings are a small SVG.
 */
const ALLOWED = new Set([
  "style", "section", "article", "header", "footer", "div", "p", "span", "a", "br", "hr", "img",
  "b", "i", "u", "s", "sub", "sup", "small", "strong", "em",
  "ol", "ul", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "caption",
  "svg", "g", "defs", "clipPath", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan", "image", "linearGradient", "radialGradient", "stop", "pattern", "mask", "use", "title", "desc",
]);

/** Attributes that carry a URL, in any element. */
const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src", "srcset", "data", "action", "formaction", "poster", "background"]);

function safeUrl(name: string, value: string): boolean {
  const url = value.trim().toLowerCase();
  if (url === "" || url.startsWith("#") || url.startsWith("blob:")) return true;
  // A picture the renderer inlined, and nothing else `data:` can be: a `data:text/html` link is a page.
  if (url.startsWith("data:image/") || url.startsWith("data:font/") || url.startsWith("data:application/")) return name !== "href";
  // A link the learner may follow, on a hyperlink only; a picture must never fetch from the web.
  if (name === "href" && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:"))) return true;
  return false;
}

/**
 * A stylesheet the renderer wrote, with every remote reference taken out.
 *
 * 🔴 `url(` IS THE WHOLE RISK IN CSS. A style cannot run, but a background that points at a web
 * address fetches the moment the page paints, which tells that address the document was opened.
 * The renderer's own `url(` are the document's embedded fonts as `blob:`, which stay.
 */
export function safeDocxStyle(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _quote: string, target: string) => {
      const url = target.trim().toLowerCase();
      return url.startsWith("blob:") || url.startsWith("data:font/") || url.startsWith("data:application/") ? whole : "none";
    });
}

/**
 * The rendered nodes with anything executable or remote taken out of them, in place.
 *
 * Returns the nodes that survived, in order: a node whose name is not allowed is dropped whole.
 */
export function scrubDocxNodes(nodes: readonly Node[]): Node[] {
  const kept: Node[] = [];
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      if (!ALLOWED.has(child.nodeName.toLowerCase()) && !ALLOWED.has(child.nodeName)) {
        child.remove();
        continue;
      }
      if (child.nodeName.toLowerCase() === "style") {
        child.textContent = safeDocxStyle(child.textContent ?? "");
        continue;
      }
      scrubAttributes(child);
      walk(child);
    }
  };
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    const name = element.nodeName.toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (name === "style") {
      element.textContent = safeDocxStyle(element.textContent ?? "");
      kept.push(element);
      continue;
    }
    scrubAttributes(element);
    walk(element);
    kept.push(element);
  }
  return kept;
}

function scrubAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    // An inline style may only reference what the render itself minted.
    const remoteStyle = name === "style" && /url\(|expression\(/i.test(attribute.value) && !/url\(\s*['"]?(blob:|data:font\/)/i.test(attribute.value);
    if (name.startsWith("on") || remoteStyle) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (URL_ATTRIBUTES.has(name) && !safeUrl(name, attribute.value)) element.removeAttribute(attribute.name);
    // A hyperlink opens elsewhere and never inherits this window.
    if (name === "href" && element.nodeName.toLowerCase() === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
}

/** A CSS length the renderer wrote on a page (`612pt`, `8.5in`, `210mm`), in CSS pixels. */
export function cssLengthToPx(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(pt|px|in|cm|mm|pc)?\s*$/i.exec(value);
  if (!match || !match[1]) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "pt":
      return (amount * 96) / 72;
    case "in":
      return amount * 96;
    case "cm":
      return (amount * 96) / 2.54;
    case "mm":
      return (amount * 96) / 25.4;
    case "pc":
      return amount * 16;
    default:
      return amount;
  }
}

/** A Letter page, for a document that names no size. */
const DEFAULT_PAGE_WIDTH = 816;
const DEFAULT_PAGE_HEIGHT = 1056;

export interface RenderedDocx {
  /** The stylesheets the renderer wrote for this document, scrubbed. Mount them beside the pages. */
  readonly styles: readonly HTMLStyleElement[];
  /** One element per page, scrubbed, in order. */
  readonly pages: readonly HTMLElement[];
  /** The first page's size at 1:1, in CSS pixels. What fit-width divides the window by. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** Every `blob:` URL the render minted, for revoking when the view goes. */
  readonly blobUrls: readonly string[];
}

/**
 * The pages of a Word file, drawn, or null when this file cannot be drawn at all.
 *
 * 🔴 NULL IS A NORMAL ANSWER. A file the renderer cannot open, a browser with no DOM, a document
 * with no pages: all of them mean "show what we showed before", and none of them may take the
 * document away from the learner.
 */
export async function renderDocxPages(bytes: ArrayBuffer): Promise<RenderedDocx | null> {
  if (typeof document === "undefined") return null;
  try {
    const { parseAsync, renderDocument } = await loadEngine();
    const options = {
      className: DOCX_CLASS,
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderChanges: false,
      renderComments: false,
      // 🔴 NEVER. An altChunk is HTML (or another whole document) embedded in the file, rendered as
      // it is. It is the one place a .docx can carry a web page.
      renderAltChunks: false,
      useBase64URL: false,
      experimental: false,
      trimXmlDeclaration: true,
      debug: false,
    };
    const parsed = await parseAsync(bytes, options);
    const nodes = scrubDocxNodes(await renderDocument(parsed, options));
    const styles = nodes.filter((node): node is HTMLStyleElement => node.nodeName.toLowerCase() === "style");
    const pages = nodes.filter((node): node is HTMLElement => node.nodeName.toLowerCase() === "section");
    if (pages.length === 0) return null;
    const first = pages[0] as HTMLElement;
    const pageWidth = cssLengthToPx(first.style.width) ?? DEFAULT_PAGE_WIDTH;
    const pageHeight = cssLengthToPx(first.style.minHeight) ?? DEFAULT_PAGE_HEIGHT;
    const blobUrls = collectBlobUrls(nodes);
    return { blobUrls, pageHeight, pageWidth, pages, styles };
  } catch {
    return null;
  }
}

/** Every `blob:` the render minted: pictures, VML images, and the fonts inside the stylesheets. */
function collectBlobUrls(nodes: readonly Node[]): string[] {
  const found = new Set<string>();
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    const text = element.nodeName.toLowerCase() === "style" ? (element.textContent ?? "") : "";
    for (const match of text.matchAll(/blob:[^'")\s]+/g)) found.add(match[0]);
    const carriers = [element, ...element.querySelectorAll("[src], [href], [xlink\\:href]")];
    for (const carrier of carriers) {
      for (const name of ["src", "href", "xlink:href"]) {
        const value = carrier.getAttribute(name);
        if (value && value.startsWith("blob:")) found.add(value);
      }
    }
  }
  return [...found];
}

/** Lets the browser forget every picture and font a render minted. Idempotent. */
export function releaseDocxRender(rendered: RenderedDocx | null): void {
  if (!rendered || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  for (const url of rendered.blobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Already gone, or never ours: nothing to release.
    }
  }
}
