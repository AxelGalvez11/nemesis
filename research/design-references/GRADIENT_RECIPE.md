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
aspect_ratio 1:1, resolution 2k, model_type utility      # ~2 credits an image
colors: three hex values from ONE colour family, weighted to the saturated end
prompt:
  One single continuous colour flowing gradually across the whole frame, imperceptible
  transition, no distinct regions, no visible boundary anywhere, no edge, no line, no shape,
  the colour shifts so slowly you cannot tell where one tone ends and the next begins,
  extremely soft and diffuse, saturated <colour> throughout
```

The negatives carry most of the weight. Without "no bokeh circles, no streaks, no detail" the
model produces busy macro photography, which is the *genre* but not the *composition*.

### Three corrections found by looking at the output

**🔴 The prompt was asking for the edge.** The first working prompt said *"two large smooth
colour regions meeting along one gentle curved edge"*, and the owner kept saying the results looked
sharp, like two colours. They did — because that is literally what the prompt requested. No blur or
dither afterwards removed it; blurring an explicit boundary only makes a soft boundary. The fix was
at generation: describe ONE colour whose tone changes too slowly to locate, and forbid regions,
lines and edges outright.

Measured with a Sobel edge-energy pass on a 400px greyscale copy
(`magick <f> -resize 400x400! -colorspace gray -define convolve:scale='!' -morphology Convolve
Sobel -format '%[fx:100*mean]' info:`). openai.com's cards read **-0.06 to 0.09**. The
"meeting along an edge" prompt produced up to 0.195; the no-boundary prompt produced -0.075 to
0.021. That number ends the argument about whether a gradient is "too sharp".

The tradeoff, which is a taste call: removing the edge also removes some form, and two of six went
nearly flat. The owner approved the no-edge set on 2026-09-10.

**Dither is not the fix for a boundary.** It was tried first, calibrated per image to openai.com's
fine-detail figure (a 3x3 standard-deviation pass, theirs averaging 1.87). It matched the number and
changed almost nothing visible, because the problem was the boundary and not the texture.

**Do not put a near-white stop in the palette.** Giving `#FFE6B8` / `#EEF9A8` / `#FFDCE4` as the
lightest colour made the model fill half the frame with it, and three of six came back washed out.
Weight every palette toward the saturated end and add the negatives *"no white areas, no pale
washed out regions, colour edge to edge"*.

**One colour family per image, and vary the family across the set.** Not one fixed hue (flat) and
not several families in one image (cheap). openai.com ships a blue one, an orange one, a green one
and a pink one — each internally coherent. Ours: orange, lime, emerald, azure, coral, violet.

Then: `magick <in> -resize 1400x1400 -quality 82 -define webp:method=6 <out>.webp` — 2MB PNG down
to roughly 15KB, which is what makes them shippable in a public repo.

## What the shader is still for

`components/design/gradient-field.tsx` stays. Rendered assets are right for hero-scale artwork;
the shader is right where being live, themeable and zero-download matters more than being
photographic — panel grounds, empty states, per-project colour. It is not a worse version of the
images, it is a different tool.
