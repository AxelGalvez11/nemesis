import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_SLIDE, type DeckPlan } from "./deck-plan";
import { buildDeckPptx } from "./deck-pptx";
import { DECK_THEMES, DEFAULT_DECK_THEME, deckTheme, SAFE_FONTS } from "./deck-themes";

// Twenty looks, owner-commissioned 2026-08-25 ("I need twenty themes"). What must hold for
// every one of them: it is legible, it uses fonts that exist on the learner's machine, and it
// actually builds a PowerPoint. A theme that only looks right in a preview is not a theme.

const HEX = /^[0-9a-f]{6}$/;

/** Rough perceived brightness, 0..1 — enough to catch text that vanishes into its background. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("there are twenty distinct themes and the house look is one of them", () => {
  assert.equal(DECK_THEMES.length, 20, "the owner asked for twenty");
  assert.equal(new Set(DECK_THEMES.map((t) => t.id)).size, 20, "two themes share an id");
  assert.equal(new Set(DECK_THEMES.map((t) => t.name)).size, 20, "two themes share a name");
  assert.ok(DECK_THEMES.some((t) => t.id === DEFAULT_DECK_THEME), "the default names a theme that does not exist");
});

test("every colour is a real hex and every font is one a stock machine has", () => {
  for (const theme of DECK_THEMES) {
    const colours = [
      theme.accent,
      theme.body.bg,
      theme.body.title,
      theme.body.text,
      theme.body.muted,
      theme.cover.title,
      theme.cover.subtitle,
      theme.cover.art.base,
      theme.section.title,
      theme.section.art.base,
      theme.closing.title,
      theme.closing.text,
      theme.closing.art.base,
      ...(theme.cover.art.glows ?? []).map((g) => g.color),
      ...(theme.section.art.glows ?? []).map((g) => g.color),
      ...(theme.closing.art.glows ?? []).map((g) => g.color),
    ];
    for (const colour of colours) {
      assert.match(colour, HEX, `${theme.id}: "${colour}" is not a bare 6-digit hex`);
    }
    // Nothing is embedded in a .pptx, so a font the machine lacks is a design that silently
    // becomes a different design.
    assert.ok(SAFE_FONTS.includes(theme.fonts.display as never), `${theme.id}: display font is not in SAFE_FONTS`);
    assert.ok(SAFE_FONTS.includes(theme.fonts.body as never), `${theme.id}: body font is not in SAFE_FONTS`);
  }
});

test("text is legible against its own background in every theme", () => {
  for (const theme of DECK_THEMES) {
    const bodyGap = Math.abs(luminance(theme.body.title) - luminance(theme.body.bg));
    assert.ok(bodyGap > 0.4, `${theme.id}: body titles nearly match the page (${bodyGap.toFixed(2)})`);
    const textGap = Math.abs(luminance(theme.body.text) - luminance(theme.body.bg));
    assert.ok(textGap > 0.3, `${theme.id}: body text nearly matches the page (${textGap.toFixed(2)})`);
    const coverGap = Math.abs(luminance(theme.cover.title) - luminance(theme.cover.art.base));
    assert.ok(coverGap > 0.35, `${theme.id}: the cover title sinks into its art (${coverGap.toFixed(2)})`);
    // Dark pages need light ink; the flag drives the icon variant, so a wrong one is visible.
    assert.equal(theme.body.dark, luminance(theme.body.bg) < 0.5, `${theme.id}: body.dark disagrees with body.bg`);
  }
});

test("an unknown or missing theme id falls back instead of throwing", () => {
  assert.equal(deckTheme("no-such-theme").id, DEFAULT_DECK_THEME);
  assert.equal(deckTheme(null).id, DEFAULT_DECK_THEME);
  assert.equal(deckTheme(undefined).id, DEFAULT_DECK_THEME);
  assert.equal(deckTheme("neon").id, "neon");
});

test("all twenty build a genuine .pptx", async () => {
  const plan: DeckPlan = {
    references: [],
    slides: [
      { ...EMPTY_SLIDE, layout: "cover", subtitle: "sub", title: "Deck" },
      { ...EMPTY_SLIDE, icon: "lightbulb", layout: "bullets", points: ["one", "two"], title: "Points" },
      { ...EMPTY_SLIDE, layout: "closing", title: "End" },
    ],
    subtitle: "sub",
    title: "Deck",
  };
  for (const theme of DECK_THEMES) {
    const built = (await buildDeckPptx(plan, { credit: "Made with Nemesis", themeId: theme.id })) as Buffer;
    assert.equal(built.subarray(0, 2).toString(), "PK", `${theme.id}: not a zip`);
    assert.ok(built.length > 20_000, `${theme.id}: too small to contain its art`);
    const text = built.toString("latin1");
    assert.ok(text.includes(`ppt/slides/slide3.xml`), `${theme.id}: lost a slide`);
    assert.ok(text.includes(theme.fonts.display), `${theme.id}: the display font is not named in the XML`);
  }
});
