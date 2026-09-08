import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── The design system's ratchet ────────────────────────────────────────────────────────────────
//
// Canonical source: /design/TOKENS.md, /design/ANTI_PATTERNS.md.
//
// 🔴🔴 THESE ARE CEILINGS THAT ONLY EVER GO DOWN. Every number below is the measured count on
// `main` at 3e40f59a, the day the design system was written. A change that ADDS an arbitrary value
// fails this file; a change that removes some lets you lower the ceiling in the same commit.
//
// This exists because review does not survive a deadline and a style guide nobody runs is a wish.
// The counts are the actual yardstick for whether the migration in /design/MIGRATION.md worked:
// every one of them is on its way to zero.

const appDir = new URL("../../", import.meta.url).pathname;
const count = (pattern: string, distinct: boolean) =>
  Number(
    execFileSync("bash", [
      "-lc",
      `grep -rhoE '${pattern}' '${appDir}' --include='*.tsx' 2>/dev/null | ${distinct ? "sort -u | " : ""}wc -l`,
    ])
      .toString()
      .trim(),
  );

test("🔴🔴 arbitrary typography, radius and spacing are capped and shrinking", () => {
  // /design/TOKENS.md §2 gives nine type steps. The app carried TWENTY-FOUR distinct hard-coded
  // sizes across 401 uses, including `text-[12.5px]` and `text-[13.5px]` — the clearest possible
  // evidence that sizes were chosen per component by eye. Sana ships seven and renders five;
  // Figma's application uses three.
  assert.ok(count("text-\\[[0-9.]+px\\]", true) <= 24, "a new hard-coded font size was added: use <Text variant>");

  // §4 gives six radii. The app carried TWENTY-SIX, including 7px, 9px, 11px, 14px and 26px.
  assert.ok(count("rounded-\\[[0-9.]+px\\]", true) <= 26, "a new hard-coded radius was added: use the radius tokens");

  // §3 gives twelve spacing steps. The app carried 210 distinct arbitrary values across 1,142 uses,
  // the single largest source of visual noise in the product.
  assert.ok(
    count("(p|px|py|pt|pb|pl|pr|gap|m|mt|mb|mx|my)-\\[[0-9.]+px\\]", true) <= 210,
    "a new arbitrary spacing value was added: use the spacing scale",
  );
});

test("🔴🔴 one icon library, and weight never reaches 700", () => {
  // /design/ICONS.md: Lucide only, at stroke 1.5. We shipped TWO libraries with different stroke
  // weights and different metrics (lucide in 28 files, tabler in 22), which is visible on screen.
  assert.ok(count('from "@tabler/icons-react"', false) <= 22, "a new @tabler/icons-react import was added: Lucide is the only icon library");

  // /design/TOKENS.md §2.3: the ceiling is 600. Not one of the five measured references sets a
  // heading at 700, and three set DISPLAY type at 400. `text-4xl font-bold` is the signature of a
  // generated interface, so the guardrail lives at the token level.
  assert.ok(count("font-bold", false) <= 160, "a new weight-700 style was added: the ceiling is 600");
});

test("🔴 the token layer exists, is imported, and keeps its measured decisions", () => {
  const raw = readFileSync(new URL("../../app/styles/design-tokens.css", import.meta.url), "utf8");
  // 🔴 STRIP COMMENTS BEFORE ASSERTING ON THE DECLARATIONS. This guard caught its own explanatory
  // note on the first run: the file says "there is no `0 1px 2px` tight shadow" in prose, and a
  // naive scan read the prose as a declaration. A guard that greps a file it also documents has to
  // read only the code.
  const tokens = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /@import "\.\/styles\/design-tokens\.css"/, "the token layer is not imported, so none of it applies");

  // 🔴 NEUTRALS ARE ALPHA OVER ONE INK. Three of five references arrived at this independently and
  // we already had it. A hex grey palette creeping back in is the regression this catches.
  for (const step of ["--n-2", "--n-10", "--n-45", "--n-100"]) assert.ok(tokens.includes(step), `the neutral ramp lost ${step}`);
  assert.match(tokens, /--n-45: color-mix\(in srgb, var\(--ui-base\) 45%, transparent\)/, "a neutral stopped being alpha over the ink");

  // 🔴 ICONS HAVE THEIR OWN NAMESPACE because a glyph is a solid mass and text is not: an icon at
  // the label's alpha reads heavier than the label.
  assert.match(tokens, /--icon-primary: var\(--n-80\)/, "icons went back to sharing the text colour");

  // 🔴 TRACKING CROSSES ZERO AT 12px. Positive below, increasingly negative above. Measured across
  // all five references; the point is that no call site sets letter-spacing by hand.
  assert.match(tokens, /type-meta[^}]*letter-spacing:\s*0\.06px/, "small type lost its positive tracking");
  assert.match(tokens, /type-display[^}]*letter-spacing:\s*-0\.7px/, "display type lost its negative tracking");
  assert.match(tokens, /type-display[^}]*font-weight:\s*450/, "display type went bold: presence comes from size and tracking");
  assert.match(tokens, /--font-weight-bold:\s*600/, "the weight ceiling moved off 600");

  // 🔴 THERE IS NO TIGHT SHADOW. Two elevations, both wide and faint. A `0 1px 2px` is the clearest
  // signature of a generated interface; if something must look raised, it gets a border.
  assert.match(tokens, /--elev-raised: inset 0 0 0 1px/, "raised stopped being a border and became a shadow");
  assert.ok(!/0 1px 2px/.test(tokens), "a tight shadow was added to the token layer");

  // 🔴 FOCUS IS AN INSET RING so it cannot shift a row by a pixel when it appears.
  assert.match(tokens, /--focus-ring: inset 0 0 0 2px/, "focus went back to an outline, which shifts layout");

  assert.match(tokens, /prefers-reduced-motion: reduce/, "the durations no longer collapse under reduced motion");
});

test("🔴 the design system is documented where the docs say it is", () => {
  // The authority chain in /design/DESIGN.md ends at these files. If they vanish it is folklore.
  for (const doc of ["DESIGN", "TOKENS", "COMPONENTS", "ICONS", "INTERACTIONS", "MOTION", "RESPONSIVE", "ANTI_PATTERNS", "MIGRATION", "PROVENANCE"]) {
    assert.ok(readFileSync(new URL(`../../../../design/${doc}.md`, import.meta.url), "utf8").length > 500, `/design/${doc}.md is missing or a stub`);
  }
});

// ── The primitives ────────────────────────────────────────────────────────────────────────────

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (f: string) => strip(readFileSync(new URL(`../../components/design/${f}`, import.meta.url), "utf8"));

test("🔴🔴 no primitive paints with `--ui-bg-primary`: it is a FILL, not a ground", () => {
  // This one mistake shipped THREE invisible controls before it was caught, and it was caught by
  // measuring the rendered gallery rather than by reading the file. `--ui-bg-primary` resolves to
  // `color-mix(accent <n>%, ink 10%)` — a translucent CONTROL FILL — so:
  //   the primary button drew `srgb 0.182 / 0.244` text on its own `rgb(13,13,13)` background,
  //   the checkbox tick was invisible inside its filled box,
  //   the toggle knob was invisible on its filled track.
  // The page ground in this codebase is `--ui-bg-editor`; the foreground for anything sitting ON
  // the ink is `--text-on-inverse`. Both flip correctly in dark mode.
  for (const file of ["button.tsx", "controls.tsx", "layout.tsx", "text.tsx", "icon.tsx"]) {
    assert.ok(!src(file).includes("--ui-bg-primary"), `${file} paints with --ui-bg-primary, which is a fill and will render invisible`);
  }
  const tokens = strip(readFileSync(new URL("../../app/styles/design-tokens.css", import.meta.url), "utf8"));
  assert.match(tokens, /--bg-page: var\(--ui-bg-editor\)/, "the page ground was remapped onto a fill again");
  assert.match(tokens, /--text-on-inverse: var\(--ui-bg-elevated\)/, "inverse text lost its ground and will vanish on the ink");
});

test("🔴 the primitives keep their measured decisions", () => {
  const icon = src("icon.tsx");
  const button = src("button.tsx");
  const text = src("text.tsx");

  // /design/ICONS.md: Lucide's default stroke of 2.0 reads heavier than every reference beside
  // 12px text (Figma draws 1.25, x.ai 1.75). Set once so it cannot drift across call sites.
  assert.match(icon, /strokeWidth=\{1\.5\}/, "the icon stroke moved off 1.5");
  assert.match(icon, /ICON_SIZES = \[12, 14, 16, 20, 24\]/, "the icon size scale changed");
  // Icons use their own tones: a glyph is a solid mass and reads heavier than text at equal alpha.
  assert.ok(!/tone-primary|tone-secondary|tone-muted/.test(icon.replace(/itone-\w+/g, "")), "an icon used a TEXT tone");

  // 🔴 THE PRIMARY BUTTON IS INK, NEVER THE ACCENT. Measured on Sana's own primary control. This is
  // the single biggest reason their product reads as calm, and the accent belongs to the character.
  assert.match(button, /primary: \{[^}]*background: "var\(--text-primary\)"/, "the primary button stopped being ink");
  assert.ok(!/primary: \{[^}]*var\(--ui-accent\)/.test(button), "the primary button became the accent");

  // Four sizes, and `content` is the only pill: the closer a control is to the learner's content,
  // the rounder it gets (/design/REFERENCE_CONFLICTS.md §1).
  assert.match(button, /content: \{[^}]*radius: "var\(--radius-full\)"/, "the learner-facing size lost its pill");
  assert.match(button, /md: \{[^}]*radius: "var\(--radius-6\)"/, "chrome buttons stopped being radius 6");

  // A loading button keeps its width: the spinner replaces the ICON slot, never the label.
  assert.match(button, /loading \? <Spinner/, "the spinner stopped replacing the icon slot, so the button will reflow");

  // Nine type variants, and tracking is never set at a call site.
  assert.match(text, /TEXT_VARIANTS = \[\s*"meta",\s*"caption",\s*"ui",\s*"ui-lg",\s*"body",\s*"body-lg",\s*"title-sm",\s*"title",\s*"display",\s*\]/, "the type scale changed");
  assert.ok(!/letterSpacing|letter-spacing|tracking-/.test(text), "a call site set letter-spacing by hand");
});

test("🔴🔴 the provenance of every value stays auditable", () => {
  // Asked directly whether the system was reverse engineered one to one, the honest answer was no:
  // a third of the values are interpolations between two measured references and some are outright
  // judgement. PROVENANCE.md is what makes that checkable instead of a matter of trust, and it is
  // the first thing to go stale, so it is guarded.
  const p = readFileSync(new URL("../../../../design/PROVENANCE.md", import.meta.url), "utf8");
  for (const bucket of ["## MEASURED", "## INTERPOLATED", "## INVENTED", "## VERIFIED", "## NOT VERIFIED"]) {
    assert.ok(p.includes(bucket), `PROVENANCE.md lost its ${bucket} section`);
  }
  // 🔴 THE INTERPOLATED VALUES ARE THE ONES TO CHALLENGE, so each must stay named. A value that
  // quietly moves from "interpolated" to unlabelled is how a guess becomes folklore.
  for (const claim of ["chrome type 12px", "chrome radius 6px", "icon stroke 1.5", "ground #fcfcfd"]) {
    assert.ok(p.includes(claim), `PROVENANCE.md stopped declaring "${claim}" as interpolated`);
  }
  // The measured display weights, after a correction: x.ai's hero is 500, not 400.
  assert.match(p, /60px\/500\/lh 1\.0\/-1\.5px/, "the x.ai display reading was altered");
  assert.ok(p.includes("## Corrections to this research"), "the corrections log was removed");
});
