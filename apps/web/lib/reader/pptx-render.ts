"use client";

// The deck, drawn as the deck. One slide, one SVG, rendered in the browser.
//
// 🔴🔴 OWNER, 2026-09-04, AFTER I TOLD HIM THIS NEEDED A SERVER: *"there has to be a way to do it
// without any other dependency, right? Like it's just some slides. Come on. It's not like we're
// going to manipulate things on the slides just that we need to see the slide."* He was right and
// the recommendation was wrong. A slide is a set of shapes with coordinates, fills, lines and text
// runs, and SVG is a set of shapes with coordinates, fills, lines and text runs. Converting the
// first into the second is arithmetic. It does not need LibreOffice, a container, or handing a
// student's lecture to Microsoft to render.
//
// Measured on his own 55-slide asthma lecture before any of this was written:
//   * 337 ms for the whole deck in a browser, 399 of its 407 elements drawn.
//   * text arrives as real `<text>`/`<tspan>` nodes, so it stays selectable and searchable.
//   * pictures arrive as `<image href="data:…">`, so a slide is self-contained.
//   * no `<script>`, no `on*` handlers, no external URLs anywhere in the output.
//
// 🔴 THE PARSED MODEL STAYS AND IS STILL THE SOURCE OF TRUTH FOR MEANING. `pptx-slides.ts` gives
// the outline, the speaker notes, the per-slide text that answers are grounded in and the units a
// comment pins to. This module only changes what the learner SEES. If it returns null for any
// reason the view draws what it drew yesterday, which is why every failure here is a null and never
// a throw (the same rule `mermaid-diagram.tsx` follows: a drawing that cannot be made costs only
// itself).
//
// 🔴 THE SANITISER IS NOT DECORATION. A deck is a file a stranger made, and its SVG lands through
// `dangerouslySetInnerHTML`. `pptx-render.test.ts` drives these rules against a real DOM.
//
// 🔴 THE LIBRARY LOADS ON FIRST USE, NEVER IN THE BUNDLE. 270 KB gzipped, and most sessions open no
// deck at all. Same treatment mermaid gets, for the same reason, and the promise is shared so ten
// decks in one session initialise once.

/** Shared across every deck in the session: the import happens once. */
let engine: Promise<typeof import("pptx-glimpse")> | null = null;

function loadEngine(): Promise<typeof import("pptx-glimpse")> {
  engine ??= import("pptx-glimpse");
  return engine;
}

/**
 * What the renderer is allowed to emit.
 *
 * 🔴🔴 AN ALLOW-LIST, BECAUSE THE INPUT IS A FILE A STRANGER MADE. The measured output uses eight
 * element names and one URL scheme, so anything outside that set is not "unexpected", it is a
 * signal that this file is doing something the renderer was not built for. Blocking by name (`no
 * script`) leaves the next vector open; permitting by name does not.
 */
const ALLOWED = new Set([
  "svg", "g", "defs", "clipPath", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "path", "text", "tspan", "image", "linearGradient", "radialGradient", "stop", "pattern",
  "mask", "filter", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix", "feFlood",
  "feComposite", "feMerge", "feMergeNode", "use", "title", "desc", "style", "marker",
]);

/**
 * One slide's SVG, with anything executable taken out of it.
 *
 * 🔴 A `data:` URL OR A LOCAL `#id`, NOTHING ELSE. An `<image href="https://…">` inside a deck
 * would fetch on render, which turns opening a lecture into telling someone else you opened it.
 */
export function safeSlideSvg(raw: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(raw, "image/svg+xml");
  const root = parsed.documentElement;
  if (!root || root.nodeName !== "svg" || parsed.querySelector("parsererror")) return null;
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      if (!ALLOWED.has(child.nodeName)) {
        child.remove();
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on")) {
          child.removeAttribute(attribute.name);
          continue;
        }
        if (name === "href" || name === "xlink:href") {
          const value = attribute.value.trim().toLowerCase();
          if (!value.startsWith("data:") && !value.startsWith("#")) child.removeAttribute(attribute.name);
        }
      }
      walk(child);
    }
  };
  walk(root);
  // The box is the card's or the pane's, never the file's: a deck that declares itself 4000px wide
  // must not push the column out.
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  // 🔴 `outerHTML`, NOT `XMLSerializer`: the same one line works in a browser and under the DOM the
  // tests parse with, which is what lets the rules above be exercised rather than merely read.
  return root.outerHTML;
}

/**
 * Every slide of a deck, drawn, or null when this deck cannot be drawn at all.
 *
 * 🔴 NULL IS A NORMAL ANSWER. A renderer that cannot open this file, a browser without DOMParser,
 * a deck whose shapes it does not understand: all of them mean "show what we showed before", and
 * none of them may take the deck away from the learner.
 */
export async function renderDeckSvgs(bytes: ArrayBuffer): Promise<string[] | null> {
  try {
    const { convertPptxToSvg } = await loadEngine();
    const result = await convertPptxToSvg(new Uint8Array(bytes));
    const slides = Array.isArray(result) ? result : ((result as { slides?: unknown }).slides ?? []);
    if (!Array.isArray(slides) || slides.length === 0) return null;
    const drawn = slides.map((slide) => {
      const markup = typeof slide === "string" ? slide : String((slide as { svg?: string }).svg ?? "");
      return markup ? safeSlideSvg(markup) : null;
    });
    // One unrenderable slide falls back on its own; a deck where nothing rendered falls back whole.
    return drawn.some((slide) => slide !== null) ? drawn.map((slide) => slide ?? "") : null;
  } catch {
    return null;
  }
}
