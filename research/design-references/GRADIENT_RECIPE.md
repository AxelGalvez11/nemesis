# How to make gradients that look like openai.com's

Measured 2026-09-09 by downloading their actual art cards from `images.ctfassets.net`.

## The finding that ended five failed attempts

**OpenAI's "gradients" are defocused macro photography.** Look closely at their cards and one is a
shot of glass with real specular highlights and bokeh; another has genuine depth of field. They are
not CSS, not SVG, and not procedural. Neither is x.ai's hero art, which is four rendered 1920x1280
landscape abstractions.

That is why five procedural attempts failed in a row:

| attempt | what it was | why it failed |
|---|---|---|
| v1 | stacked radial gradients + noise | "a bunch of blobs" — radials alpha-over into mud |
| v2 | + SVG displacement warp + blend modes | better form, but multi-hue and gloomy |
| v3 | retuned ranges per variant | still clouds, no structure |
| v4 | single-hue neon, 3-stage bloom | reached its dark end by falling to **black**, which secretly makes one hue into two colours |
| v5 | WebGL shader, domain-warped, OKLCH | closest, but reads as marble or clouds, never as satin |

No amount of shader work closes the gap, because the gap is the medium.

## Their measured numbers

Sampled across nine of their cards:

- **Hue span 7-70 degrees** on the tight ones (up to 144 on the loose). An analogous
  *neighbourhood*, never one fixed hue and never a rainbow.
- **Saturation 0.73-1.00.** Much higher than instinct suggests.
- **Lightness 0.37-0.95.** High key. Nothing goes near black.
- Square, 1080x1080 or 1920x1920.
- Compositionally: **two or three large smooth regions meeting along ONE gentle curved edge.**
  Simplicity is the quality that is hardest to hit and easiest to lose.

## The recipe that works

Higgsfield, model `recraft_v4_1`, **`model_type: "utility"`** — the standard type produces bokeh
circles and streaks; utility is flatter and calmer, which is what the reference actually is.

```
aspect_ratio 1:1, resolution 2k, count 4        # 8 credits for four
colors: 3-4 hex values from the brand palette   # forces our hues rather than the model's taste
prompt:
  Minimalist soft gradient, only two or three large smooth colour regions meeting along one
  gentle curved edge, extremely simple, completely smooth, no texture, no bokeh circles, no
  streaks, no detail, no grain, calm and clean, like a single soft fold of light,
  <colour words>, high key
```

The negatives carry most of the weight. Without "no bokeh circles, no streaks, no detail" the
model produces busy macro photography, which is the *genre* but not the *composition*.

Then: `magick <in> -resize 1400x1400 -quality 82 -define webp:method=6 <out>.webp` — 2MB PNG down
to roughly 15KB, which is what makes them shippable in a public repo.

## What the shader is still for

`components/design/gradient-field.tsx` stays. Rendered assets are right for hero-scale artwork;
the shader is right where being live, themeable and zero-download matters more than being
photographic — panel grounds, empty states, per-project colour. It is not a worse version of the
images, it is a different tool.
