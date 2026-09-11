# Landing page patterns, measured

Swept 2026-09-08 on `figma.com` and `x.ai/bot` with all animation and scroll-reveal forced off, so
what was measured is the resting composition rather than whatever had entered the viewport.

**The headline finding, and it decided the build: neither reference uses decorative gradients.**

| | gradients on the whole page |
| --- | --- |
| figma.com | **1** (a `repeating-conic-gradient` starburst in brand blue) |
| x.ai/bot | **2**, neither decorative: a fade-to-ground scrim and a dot lattice |

Their modern quality comes from four things instead: **a rigid section rhythm, a plain ground, large
quiet type, and very faint shadows on large-radius frames.**

---

## 1. Section rhythm

**Figma:** 8 sections, every one `padding: 80px 0`, every one `background: #ffffff`. No alternating
bands, no tinted sections, no dividers.

**x.ai/bot:** 10 sections, **no section backgrounds at all** (every one transparent). The inner
container is `max-width: 1280px; padding: 64px 24px`.

Section heights run 400 to 1637px. They are not uniform, and they are not trying to be: the rhythm
is carried by the constant padding, not by equal heights.

> **The rule: one ground for the entire page. Vertical padding is the only separator.**

## 2. Hero anatomy

x.ai/bot's hero, measured child by child. Note it uses **explicit margins, not a flex gap**, so each
step is tuned separately.

```
eyebrow pill   279x38, padding 6px 6px 6px 10px, gap 10px, 16/400
                     ↓ margin-bottom 20px
h1             60px / 500 / line-height 60px (exactly 1.0) / -1.2px
                     ↓ margin-top 20px
sub            18px / 400 / 29.25px (1.625) / max-width 672px
                     ↓ margin-top 28px
CTA row        height 44
```

Figma's hero: **56px / 400 / line-height 56px (exactly 1.0) / -1.25px**, set in a **336px measure**
so it wraps into short stacked lines rather than running the width of the page.

Two independent products, and both set the hero at **line-height exactly 1.0** with tracking near
`-1.2px`, at weight 400 to 500. Neither is bold. The narrow measure is the compositional trick:
a headline that wraps reads as designed; one that fills the viewport reads as a template.

Section headings (`h2`): **36px / 400 / 40px / -0.72px**.

## 3. How product UI is presented

x.ai/bot, measured:

```
main frame     976 x 660, radius 24, overflow hidden
               shadow: rgba(37,37,37,0.10) — one soft shadow at 10%
               several 976x660 layers stacked, crossfading
wide panel     1232 x 352, radius 24, background #f9f8f6 (warm off-white)
card           540 x 397, radius 16, background rgba(16,16,0,0.04)
small card     540 x 366, radius 10, shadow at 2.5%, background #ffffff
inner screen   516 x 323, radius 10, overflow hidden
```

> **Radius ladder for marketing surfaces: 10 / 16 / 24.** Shadows at **10%** for the hero frame and
> **2.5%** for cards. Nothing heavier. The frame clips its contents (`overflow: hidden`) rather than
> fading them out.

This is the one place the marketing system legitimately diverges from the application system, which
runs at radius 4 to 6 (see `figma/DESIGN_ANALYSIS.md` §2). A product frame is a *picture of* the
app, not the app.

## 4. Chrome

```
nav      64px tall, full width, no shadow, no border
footer   464px tall
container max-width 1280px, horizontal padding 24px
sub-copy measure 672px  (the same reading column as the app)
```

## 5. What we take

| take | leave |
| --- | --- |
| one ground, no section backgrounds | Figma's conic starburst (brand-specific) |
| 64 to 80px section padding as the only separator | x.ai's atmospheric colour names |
| hero at line-height 1.0, tracking -1.2px, weight 400 to 500 | bold headlines |
| a narrow hero measure so the headline wraps | full-width headlines |
| sub-copy capped at 672px | |
| product frame: radius 24, one shadow at 10%, overflow hidden | heavy shadows, device bezels |
| card radius 10 to 16, shadow at 2.5% | |
| 1280px container, 24px gutter | |

**Our own additions**, with no precedent in either reference: the mascot, and the decision to
compose the product frame from **real components** running real session data rather than from
screenshots. Neither reference has a character; both use captured or rendered screens.
