# Icons

## One library: Lucide

We currently ship **two** libraries: `lucide-react` in 28 files and `@tabler/icons-react` in 22.
They have different stroke weights, different corner treatments and different metrics, and mixing
them is visible.

**Decision: Lucide.** It is already the larger half, it has the widest coverage, and its geometry is
closest to the references. `@tabler/icons-react` is removed.

## Stroke weight: 1.5

| reference | measured stroke |
| --- | --- |
| Figma | 1.25 |
| x.ai | 1.75 |
| Lucide default | **2.0** |
| **ours** | **1.5** |

Lucide's default of 2.0 reads noticeably heavier than any reference beside 14px text (14px since the
2026-09-11 ruling, which replaced 12px chrome). 1.5 sits between the two measured values and is set
once, in the shared `<Icon />`, so it cannot drift.

## Sizes

```
12  14  16  20  24
```

Five sizes. Measured across references: Sana renders 14/15/16/18/20/24, x.ai 10 to 32, Figma 16 to 36.
We drop 18 (too close to 16 to justify) and cap at 24.

| size | use |
| --- | --- |
| 12 | inline with `meta` text, dense chips |
| **16** | **the default**: chrome buttons, sidebar rows, menu items |
| 14 | inside 24px compact controls |
| 20 | content-level actions, 36px buttons |
| 24 | empty states, feature affordances |

## Icon inside a button

The glyph occupies **50 to 60%** of its button box. Measured on Sana and Figma; it is the ratio, not
the pixel value, that is the rule.

| control height | icon |
| --- | --- |
| 24px | 14 |
| 28px | 16 |
| 32px | 16 |
| 36px | 20 |

## Colour

Icons use the **`--icon-*` namespace**, never `--text-*`. An icon at the same alpha as its label
reads heavier than the label, because a glyph is a solid mass and text is not.

```
--icon-primary    80% ink   (label at 100%)
--icon-secondary  50%
--icon-muted      35%
```

This is why our icons currently look slightly too loud next to their text: they share the text
colour.

## Icon-to-label gap

`6px` at chrome density, `8px` at content density. Nothing else.

## Filled versus outline

**Outline everywhere**, one weight. Filled glyphs are reserved for a single purpose: indicating a
**selected or active** state where the outline version is the unselected state (a bookmark, a
favourite, a completed step). Never mix filled and outline for decoration.

## Prohibited

- a second icon library
- arbitrary inline SVG for something Lucide covers
- emoji as an interface icon (currently compliant, keep it)
- sparkles on AI affordances
- any stroke weight other than 1.5
- setting an icon's colour from `--text-*`

## The abstraction

All icons go through one component so size, stroke and colour cannot drift:

```tsx
<Icon name="search" size={16} tone="secondary" />
```

It maps `size` to the five allowed values, sets `strokeWidth={1.5}`, and resolves `tone` to the
`--icon-*` tokens. Direct imports from `lucide-react` in feature code are a lint error.
