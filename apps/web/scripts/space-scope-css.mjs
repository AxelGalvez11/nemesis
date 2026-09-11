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
  const src = readFileSync(path.join(web, "space/styles/space.src.css"), "utf8");
  const out = `/* GENERATED by apps/web/scripts/space-scope-css.mjs from space.src.css. Do not edit. */\n${scopeCss(src)}`;
  writeFileSync(path.join(web, "space/styles/space.css"), out);
  console.log(`space.css: ${(out.length / 1024).toFixed(1)} KB`);
}
