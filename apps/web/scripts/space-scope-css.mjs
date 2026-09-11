// Scopes the Space stylesheet so it and the rest of the app cannot restyle each other.
//
// In:  apps/web/space/styles/space.src.css  (written as if it owned the page: :root, html, body, bare classes)
// Out: apps/web/space/styles/space.css      (every rule under .nsp, the element the Space frontend mounts into)
//
// 🔴 THREE THINGS THIS DOES BESIDES PREFIXING, AND EACH ONE IS A BUG IF DROPPED:
// 1. `:root`, `html` and `body` become `.nsp` itself, so the theme tokens and the dark and high-contrast variants
//    (`body.nsp-dark-theme`, `body[data-contrast]`) live on the mount element, not on the app's <body>.
// 2. Zero-weight resets sit in front of everything. The app's globals (Tailwind's preflight, `* { box-sizing }`,
//    `a { color: inherit }`, body's letter-spacing) would otherwise reach into every property the Space styles never
//    set, and the layout was measured against browser defaults, not against the app's reset.
// 3. Every `fill:` also publishes `--nsp-fill`, because containers colour their icons through `fill` and the
//    Lucide glyphs draw with strokes (scripts/space-icons.mjs).
// Keyframes are renamed with an `nsp-` prefix so they cannot collide with the app's.
//
// Run: node apps/web/scripts/space-scope-css.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
export const SCOPE = "nsp";

// ── The measured layout, repainted in our own ink ────────────────────────────────────────────────────────────────
// 🔴 THE COPY WAS MEASURED FROM A PRODUCT WHOSE NEUTRALS ARE WARM AND WHOSE ACCENT IS BLUE, AND OUR SYSTEM IS
// NEITHER (design/TOKENS.md §1, owner's ruling 2026-09-11). There is ONE ink and every neutral is that ink at an
// alpha, and the accent belongs to the character: it marks the send button and the learner's own bubble, never a
// control. Rather than hand-edit 3,178 colour values and lose the measurement, every colour is mapped here and keeps
// the lightness it was measured at:
//   * a warm grey becomes the neutral of the same lightness
//   * a warm translucent tint becomes the ink at the alpha that darkens the ground by the same amount
//   * the reference's accent blue becomes the ink (`--k-ink`), and the two places the accent does belong are put
//     back by hand in synthesis.src.css
// Anything with real hue (tag colours, status, artwork) is left exactly as measured. `--k-ink` flips with the theme,
// so a control that was blue in both themes is now dark on light and light on dark, like every other neutral.
const INK = { r: 16, g: 16, b: 18 };
const REFERENCE_ACCENT = { r: 35, g: 131, b: 226 };
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const INK_LUMINANCE = luminance(INK.r, INK.g, INK.b);

function readColor(text) {
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1];
    if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) return null;
    const wide = digits.length > 4;
    const channel = (i) => (wide ? parseInt(digits.slice(i * 2, i * 2 + 2), 16) : parseInt(digits[i] + digits[i], 16));
    const alpha = digits.length === 4 ? channel(3) / 255 : digits.length === 8 ? channel(3) / 255 : 1;
    return { r: channel(0), g: channel(1), b: channel(2), a: alpha };
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (!fn) return null;
  const parts = fn[1]
    .split(/[,/\s]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
}

/** The ink form of one measured colour, or null to leave it exactly as it was. */
function inkForm(color) {
  const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  const fromAccent = Math.hypot(color.r - REFERENCE_ACCENT.r, color.g - REFERENCE_ACCENT.g, color.b - REFERENCE_ACCENT.b);
  if (fromAccent <= 26) {
    return color.a === 1 ? "var(--k-ink)" : `color-mix(in srgb, var(--k-ink) ${Number((color.a * 100).toFixed(1))}%, transparent)`;
  }
  if (spread === 0) return null; // already neutral: the measurement stands
  const light = luminance(color.r, color.g, color.b);
  if (color.a === 1) {
    if (spread > 16) return null; // a real colour
    const step = Math.round(light);
    return `rgb(${step},${step},${step})`;
  }
  if (spread > 50 || light > 140) return null; // a tag wash, or a light veil that is already neutral enough
  const alpha = Math.min(1, Number(((color.a * (255 - light)) / (255 - INK_LUMINANCE)).toFixed(3)));
  return `rgba(${INK.r},${INK.g},${INK.b},${alpha})`;
}

const COLOR_IN_VALUE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^()]*\)/g;
// The reference's own colour palette (`--c-pal…`, `--cl-pal…`) is raw material for tag colours; it is not repainted.
const PALETTE_PROP = /^--c[ald]?-pal/;

export function inkColors(source) {
  const root = postcss.parse(source);
  root.walkDecls((decl) => {
    if (PALETTE_PROP.test(decl.prop)) return;
    decl.value = decl.value.replace(COLOR_IN_VALUE, (text) => {
      const color = readColor(text);
      const mapped = color ? inkForm(color) : null;
      return mapped ?? text;
    });
  });
  return root.toString();
}

export function scopeCss(source) {
  const root = postcss.parse(source);
  const frames = new Map();
  root.walkAtRules("keyframes", (at) => {
    const renamed = `${SCOPE}-${at.params.trim()}`;
    frames.set(at.params.trim(), renamed);
    at.params = renamed;
  });

  const scopeSelector = (selector) =>
    selectorParser((selectors) => {
      selectors.each((sel) => {
        const first = [];
        for (const node of sel.nodes) {
          if (node.type === "combinator") break;
          first.push(node);
        }
        const owner = first.filter(
          (n) => (n.type === "tag" && (n.value === "html" || n.value === "body")) || (n.type === "pseudo" && n.value === ":root"),
        );
        if (owner.length) {
          owner.forEach((n) => n.remove());
          sel.prepend(selectorParser.className({ value: SCOPE }));
        } else {
          sel.prepend(selectorParser.combinator({ value: " " }));
          sel.prepend(selectorParser.className({ value: SCOPE }));
        }
      });
    }).processSync(selector);

  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    rule.selectors = [...new Set(rule.selectors.map(scopeSelector))];
  });

  root.walkDecls((decl) => {
    if (decl.prop === "fill" && !/^(none|transparent)$/i.test(decl.value.trim())) {
      decl.cloneAfter({ prop: "--nsp-fill", value: decl.value });
    }
    if ((decl.prop === "animation" || decl.prop === "animation-name") && frames.size) {
      decl.value = decl.value.replace(/[A-Za-z_][\w-]*/g, (word) => frames.get(word) ?? word);
    }
    if (/\brem\b/.test(decl.value) && !decl.prop.startsWith("--")) {
      decl.value = decl.value.replace(/(-?\d*\.?\d+)rem\b/g, (_m, n) => `${+(Number(n) * 16).toFixed(3)}px`);
    }
  });

  const S = SCOPE;
  // 🔴 NOT `all: revert`. That was the first version, and it wipes SVG geometry: `d`, `r`, `cx` and `cy` are CSS
  // properties now, so every Lucide path lost its shape. Only the properties the app's globals actually touch come back.
  const reset = `/* The Space layout was measured against browser defaults. These restore, at zero weight, what the app's globals take
   away (Tailwind's preflight, * { box-sizing }, a { color: inherit }, body's letter-spacing and font smoothing). */
.${S} { letter-spacing: normal; word-spacing: normal; -webkit-font-smoothing: auto; -moz-osx-font-smoothing: auto; text-rendering: auto; tab-size: 8; font-feature-settings: normal; font-variation-settings: normal; }
.${S} :where(*), .${S} :where(*)::before, .${S} :where(*)::after { box-sizing: revert; margin: revert; padding: revert; border-width: revert; border-style: revert; border-color: revert; }
.${S} :where(h1, h2, h3, h4, h5, h6) { font-size: revert; font-weight: revert; }
.${S} :where(a) { color: revert; text-decoration: revert; }
.${S} :where(b, strong) { font-weight: revert; }
.${S} :where(code, kbd, samp, pre) { font-family: revert; font-size: revert; font-feature-settings: revert; font-variation-settings: revert; }
.${S} :where(small) { font-size: revert; }
.${S} :where(sub, sup) { font-size: revert; line-height: revert; position: revert; vertical-align: revert; }
.${S} :where(table) { text-indent: revert; border-color: revert; border-collapse: revert; }
.${S} :where(hr) { height: revert; color: revert; border-top-width: revert; }
.${S} :where(summary) { display: revert; }
.${S} :where(ol, ul, menu) { list-style: revert; }
.${S} :where(img, svg, video, canvas, audio, iframe, embed, object) { display: revert; vertical-align: revert; }
.${S} :where(img, video) { max-width: revert; height: revert; }
.${S} :where(button, input, select, optgroup, textarea) { font: revert; font-feature-settings: revert; font-variation-settings: revert; letter-spacing: revert; color: revert; border-radius: revert; background-color: revert; opacity: revert; appearance: revert; }
.${S} :where(textarea) { resize: revert; }
.${S} :where(input, textarea)::placeholder { opacity: revert; color: revert; }
.${S} ::selection { background: revert; color: revert; }
`;
  return reset + root.toString();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const measured = readFileSync(path.join(web, "space/styles/space.src.css"), "utf8");
  // The design layer is written in our own system and is NOT repainted: it is where the accent, the radii, the
  // elevation, the type and the motion come from (design/TOKENS.md). It is concatenated last so it wins on order.
  const design = readFileSync(path.join(web, "space/styles/synthesis.src.css"), "utf8");
  const out = `/* GENERATED by apps/web/scripts/space-scope-css.mjs from space.src.css and synthesis.src.css. Do not edit. */\n${scopeCss(`${inkColors(measured)}\n${design}`)}`;
  writeFileSync(path.join(web, "space/styles/space.css"), out);
  console.log(`space.css: ${(out.length / 1024).toFixed(1)} KB`);
}
