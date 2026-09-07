// A mechanism, drawn by the model as SVG.
//
// Owner, 2026-09-07: *"go into wondering because our mermaid diagrams and visuals arent as good as
// theres one for one"*. Driven in his own Wondering account the same day, and the finding is that
// their mechanism diagrams are NOT mermaid and NOT a typed spec rendered by a component. They are
// raw SVG, written into the lesson, on one fixed canvas with an art-directed house style. Pulled
// out of their page (docs/canvas-workspace-reference.md §10):
//
//     viewBox="0 0 800 600"                         one canvas, always
//     <rect width="800" height="600" fill=…>        a ground filling it
//     <rect rx="8" stroke="#3C2A28" stroke-width="3">   heavy ink outline on every box
//     <line stroke="#3C2A28" stroke-width="3" marker-end="url(#a)">   flow
//     <line stroke="#879A39" stroke-width="4" marker-end="url(#b)">   a "blocks" relation
//     <text text-anchor="middle" font-size="32|28|26">
//
// 🔴🔴 WHY A FOURTH LANE AND NOT A BETTER MERMAID THEME. Nemesis already draws three ways: typed
// figures for a comparison, a sequence or a set (`visual-block.ts`); real charts and typeset
// equations (`semantic-visual.tsx`); and mermaid for graphs. The RAAS diagram they draw is none of
// those. It is a bespoke ARRANGEMENT — two branches converging on an outcome, with two blockers
// arrowing back up into it from below — and its meaning is carried by where things sit. A graph
// engine given those nodes lays them out its own way and the arrangement is lost, which is exactly
// why theirs reads as designed and a mermaid flowchart of the same content does not. No theme fixes
// that, because the difference is not colour.
//
// 🔴🔴🔴 AND THIS IS WHY THE SANITISER IS THE POINT OF THIS FILE. Everything above is a way of
// saying "render markup a language model wrote", which is a script-injection surface with a
// friendly name. SVG can carry `<script>`, `<foreignObject>` holding arbitrary HTML, `on*`
// handlers, `href`/`xlink:href` to `javascript:`, `<use>` pointing at another document, `<image>`
// and `<style>` fetching from anywhere, and `<animate>` writing into attributes after load.
//
// The rule here is an ALLOW-LIST of elements and of attributes, everything else dropped. Not a
// blocklist: a blocklist is a list of the attacks somebody thought of, and SVG has a large surface
// and a long history. Anything not named below does not render.
//
// PURE. A parser and a string; no DOM, no React, no I/O. It runs the same on the server, in a test,
// and in the browser, which is the only way this can be tested properly.

/** The only elements a figure may contain. Shapes, text, arrows and the defs an arrow needs. */
const ELEMENTS = new Set([
  "svg", "g", "defs", "marker", "title", "desc",
  "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan",
]);

/**
 * The only attributes any element may carry.
 *
 * 🔴 NO `href`, NO `xlink:href`, NO `style`, NO `class`, NO `id` EXCEPT ON A MARKER. An `id` is the
 * one thing a marker genuinely needs (`marker-end="url(#a)"`), and ids leak out of an SVG into the
 * whole document — two figures in one answer both calling their arrow `a` would fight, so ids are
 * rewritten per figure rather than trusted (see `sanitizeSvgFigure`). `style` is excluded because
 * a CSS string is a second grammar to sanitise and everything it could say is available as an
 * attribute here.
 */
const ATTRIBUTES = new Set([
  "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "transform", "opacity",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray",
  "font-size", "font-weight", "font-family", "font-style", "text-anchor", "dominant-baseline",
  "letter-spacing", "dy", "dx",
  "marker-end", "marker-start", "marker-width", "markerwidth", "markerheight", "markerunits",
  "refx", "refy", "orient", "xmlns",
]);

/** How big a figure may be, in characters. A drawing this size is already unreadable. */
export const MAX_FIGURE_CHARS = 12_000;
/** How many drawable elements. Past this it is not a diagram, it is a picture. */
export const MAX_FIGURE_NODES = 200;

/**
 * A value an attribute is allowed to hold.
 *
 * 🔴 `url(#…)` IS THE ONLY FUNCTION FORM ALLOWED, and only pointing INSIDE this figure. `url(http…)`
 * reaches the network; `url("data:…")` can carry a document. Everything else is plain: numbers,
 * lengths, hex or named colours, transform lists, path data.
 */
const SAFE_VALUE = /^[\w\s.,%#()+\-/:*]*$/;
const URL_REF = /url\(\s*#([A-Za-z][\w-]*)\s*\)/g;

function safeValue(name: string, raw: string): string | null {
  const value = raw.trim();
  if (value.length > 900) return null;
  const lowered = value.toLowerCase();
  // Any scheme at all is out: this is a drawing, it never reaches for anything.
  if (/(javascript|data|blob|file|vbscript|http):/i.test(lowered)) return null;
  if (lowered.includes("<") || lowered.includes(">")) return null;
  if (!SAFE_VALUE.test(value)) return null;
  // `url(` is allowed only in the `url(#local)` form the marker attributes need.
  if (lowered.includes("url(") && !/^url\(\s*#[A-Za-z][\w-]*\s*\)$/.test(value)) return null;
  if (name === "font-family" && value.length > 120) return null;
  return value;
}

/** djb2, base 36. Not a checksum: this only has to differ for different drawings. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

const TAG = /<\s*(\/?)\s*([A-Za-z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>/g;
const ATTR = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/g;

export interface SvgFigure {
  /** The cleaned markup, ready to be set as innerHTML. */
  readonly svg: string;
  /** What the drawing shows, for a reader who cannot see it. */
  readonly title: string;
}

/**
 * Clean one model-written SVG, or refuse it.
 *
 * 🔴 REFUSES RATHER THAN REPAIRS, at the level of the whole figure. An `<svg>` with no viewBox, or
 * one whose root is not `<svg>`, is not a drawing this understood — and a half-cleaned diagram that
 * renders wrong is worse than a code block, because the learner reads it as a fact. Individual
 * offending ATTRIBUTES are dropped silently; a missing frame is a refusal.
 *
 * 🔴 IDS ARE REWRITTEN, NOT TRUSTED. Two figures in one answer both naming their arrow marker `a`
 * would have the second one's arrows pointing at the first one's marker, which is a rendering bug
 * that only appears when an answer happens to draw twice. `nonce` makes every id in a figure unique
 * to it, and `url(#…)` references are rewritten to match.
 */
export function sanitizeSvgFigure(source: string, id?: string): SvgFigure | null {
  const raw = source.trim();
  /**
   * 🔴 THE DEFAULT NONCE IS A HASH OF THE DRAWING, NOT A COUNTER. A counter is unique but changes
   * on every re-render, so React would tear down and re-set the markup of every figure on screen
   * each time an answer streamed a word. A content hash is stable across renders, different for
   * different drawings, and its one collision case — the same figure drawn twice in one answer — is
   * harmless, because both would point at markers that are identical anyway.
   */
  const nonce = id ?? `f${hash(raw)}`;
  if (!raw || raw.length > MAX_FIGURE_CHARS) return null;
  if (!/^<\s*svg[\s>]/i.test(raw)) return null;

  let out = "";
  let nodes = 0;
  let depth = 0;
  let title = "";
  let takingTitle = false;
  let cursor = 0;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;

  while ((match = TAG.exec(raw)) !== null) {
    const whole = match[0];
    const closing = match[1] ?? "";
    const attrText = match[3] ?? "";
    const selfClose = match[4] ?? "";
    const name = (match[2] ?? "").toLowerCase();

    // Text between the previous tag and this one. Only kept inside <text>/<tspan>/<title>.
    const between = raw.slice(cursor, match.index);
    cursor = match.index + whole.length;
    if (between && depth > 0) {
      const text = between.replace(/[<>]/g, "").replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, "&amp;");
      if (takingTitle) title += text;
      out += text;
    }

    if (!ELEMENTS.has(name)) {
      // 🔴 AN UNKNOWN ELEMENT TAKES ITS CONTENTS WITH IT. Dropping only the `<script>` tag and
      // keeping what is between it would print the script's source as text, and dropping only
      // `<foreignObject>` would leave its HTML behind for the browser to interpret.
      if (!closing && !selfClose) {
        const end = new RegExp(`<\\s*/\\s*${name}\\s*>`, "i");
        end.lastIndex = cursor;
        const rest = raw.slice(cursor);
        const at = rest.search(end);
        if (at >= 0) {
          cursor += at + rest.slice(at).match(end)![0].length;
          TAG.lastIndex = cursor;
        }
      }
      continue;
    }

    if (closing) {
      if (name === "title") takingTitle = false;
      depth = Math.max(0, depth - 1);
      out += `</${name}>`;
      continue;
    }

    if (++nodes > MAX_FIGURE_NODES) return null;
    if (name === "title") takingTitle = true;

    let attrs = "";
    ATTR.lastIndex = 0;
    let attr: RegExpExecArray | null;
    while ((attr = ATTR.exec(attrText)) !== null) {
      const key = attr[1]!.toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4] ?? "";
      if (key === "id") {
        if (name !== "marker") continue;
        const clean = value.trim();
        if (!/^[A-Za-z][\w-]*$/.test(clean)) continue;
        attrs += ` id="${nonce}-${clean}"`;
        continue;
      }
      if (!ATTRIBUTES.has(key)) continue;
      const safe = safeValue(key, value ?? "");
      if (safe === null) continue;
      const rewritten = safe.replace(URL_REF, (_all, id: string) => `url(#${nonce}-${id})`);
      attrs += ` ${key}="${rewritten.replace(/"/g, "&quot;")}"`;
    }

    if (selfClose) {
      out += `<${name}${attrs}/>`;
      if (name === "title") takingTitle = false;
    } else {
      depth += 1;
      out += `<${name}${attrs}>`;
    }
  }

  if (nodes === 0 || !out.startsWith("<svg")) return null;
  // 🔴 A viewBox IS REQUIRED, because without one the figure has no intrinsic aspect ratio and
  // scaling it to the column either crops it or leaves it 150px tall. The house style names one.
  if (!/^<svg[^>]*\sviewbox=/i.test(out)) return null;
  return { svg: out, title: title.trim().slice(0, 200) };
}

/**
 * The house style, given to the model.
 *
 * 🔴🔴 A DIAGRAM LOOKS DESIGNED BECAUSE SOMEBODY SPECIFIED IT, WHICH IS THE WHOLE FINDING. Measured
 * in Wondering, 2026-09-07: one canvas size for every figure, one stroke weight, one corner radius,
 * three type sizes, four fills. Nothing in their drawings is chosen per-diagram except the
 * ARRANGEMENT, which is the only thing that should be. Ours were mermaid's defaults with our
 * colours poured in, and no amount of theming closes that gap because the difference is not colour.
 *
 * 🔴 `currentColor` FOR EVERY LINE AND EVERY WORD, so one drawing suits both themes — see
 * components/workspace/svg-figure.tsx. Their cream paper is not copied.
 *
 * 🔴 THE PALETTE IS FOUR FILLS AND THEY MEAN SOMETHING. Colour on a mechanism is not decoration:
 * the reader learns "green blocks, amber is the outcome" from the picture, and a model choosing
 * freely per diagram would teach a different code every time.
 */
export const SVG_FIGURE_INSTRUCTION =
  "For a MECHANISM, where the point is how things act on each other and WHERE they sit relative to each other, "
  + "draw it yourself as SVG in a fenced ```figure block. Use this house style exactly, every time:\\n"
  + '- One canvas: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">`. No width or height.\\n'
  + "- No background rectangle. The page supplies the paper.\\n"
  + '- A `<title>` first, one plain sentence saying what the drawing shows. It is read aloud to anyone who cannot see it.\\n'
  + '- Boxes: `<rect rx="8" stroke="currentColor" stroke-width="3">`, at least 160 wide and 60 tall.\\n'
  + "- Fills, and each one MEANS something, so keep them consistent inside one drawing:\\n"
  + '  `#7BCAFF` what starts it, `#5ABDAC` what it does, `#DFB431` the outcome, `#879A39` anything that blocks or reverses it.\\n'
  + '- Arrows: `<line stroke="currentColor" stroke-width="3" marker-end="url(#arrow)">` for flow, and `stroke="#879A39" stroke-width="4"` with its own marker for a blocking relation. '
  + 'Define both in `<defs>` as `<marker id="arrow" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><polygon points="0,0 12,5 0,10" fill="currentColor"/></marker>`.\\n'
  + '- Words: `<text text-anchor="middle" fill="currentColor">`, 32 bold for the drawing\'s title, 28 bold inside a box that starts things, 26 otherwise. '
  + "One `<text>` per line; do not try to wrap.\\n"
  + "- Label an arrow when the relation is not obvious, in six words or fewer.\\n"
  + "Lay it out so the arrangement carries the meaning: what causes what above what it causes, things that block it coming in from the side or below. "
  + "Eight boxes at most. Nothing else is allowed inside the figure: no images, no links, no styles, no scripts, and anything else is dropped before it is drawn. "
  + "Reach for this only for a real mechanism. A comparison, a set of stages or the parts of a whole are a ```visual block, and a plain graph of relationships is a ```mermaid block.";
