# x.ai: measured design analysis

Measured 2026-09-08 against `x.ai` and `x.ai/bot`. Both are marketing surfaces; there is no
signed-in application to inspect. Cloudflare blocks direct fetches, so everything here was read from
the live DOM.

---

## What this product does especially well

**Restraint at display size.** x.ai's hero is 60px at **weight 500** with `-1.5px` tracking, and its
section display is 36px at **weight 400**. It
is large, quiet and expensive looking. Almost every AI product ships 48px at weight 700, and that
single difference is most of why one looks designed and the other looks generated.

**A monochrome interface with no accent at all.** There is no brand colour doing work anywhere in
the chrome. Hierarchy is entirely size, weight and alpha. It proves the accent is optional.

**Monospace as a labelling device.** Small mono labels at 11px with positive tracking mark technical
metadata (languages, model names, code affordances) and separate them from prose without a colour, a
border or an icon.

---

## Design philosophy, inferred

1. **Type carries everything.** With no accent and near-zero chrome, the only tools left are size,
   weight and tracking, and they are used precisely.
2. **Display type is defined by size and tightness, never by weight.** 60px/400/-1.5px and
   36px/400/-0.72px. Weight stays at regular; the impression of scale comes from the tightening.
3. **Everything pressable is a pill; everything containing is a rounded rectangle.** A hard binary,
   with radius 6 / 12 / 24 for containers by size.
4. **Neutral surfaces are alpha over ink**, matching Sana and Figma: chips at `rgba(10,10,10,0.04)`
   and `rgba(10,10,10,0.055)`, hairlines at 20% alpha.
5. **One transition for the entire site**: `0.15s cubic-bezier(.4,0,.2,1)` on colour, background,
   border and fill together. No per-component motion design.

---

## Measured values

### Typography

```
60px / 500 / 60px  / -1.5px    hero display (lh exactly 1.0)
36px / 400 / 40px  / -0.72px   section display
14px / 400 / 20px  / -0.15px   body
13px / 400 / 21.1px            dominant UI text (51 nodes)
13px / 500 / 19.5px            labels
12px / 400 / 19px  / -0.12px   mono metadata
11px / 400 / 17.9px / -0.11px  mono labels
```

Fonts: `universalSans`, `universalSansDisplay` (both proprietary), `GeistMono` (open, MIT).

Note the separate **display cut** of the typeface. Display and text are different optical designs,
not the same font scaled up.

### Colour

An atmospheric named palette stored as bare HSL triplets:

```
ash breeze charcoal codeblock dawn dove dusk evenfall fog ink
ivory jet midnight nimbus pewter steel sunset twilight umbra white
```

`--color-ink: 213 11% 16%`, `--color-fog: 216 4% 51%`, `--color-dove: 222 19% 86%`.

**We should decline this convention.** It is memorable for a brand team and hostile to everyone
else: `--color-evenfall` does not tell a developer whether it is a border or a body colour. Compare
Figma's `--color-text-tertiary`, which is self-documenting.

### Geometry

| element | value |
| --- | --- |
| nav pill button | 38px tall, `6px 6px 6px 10px`, radius full, 1px border at 8% ink |
| chip / segmented item | 32px tall, `6px 12px`, radius full |
| container radius | 6, 12, 24 |
| content max widths | 1280, 1024, 672, 576, 540, 448 |
| icon stroke | **1.75** |
| icon sizes | 10, 12, 14, 16, 18, 32 |

**672px is the reading column.** It recurs across references and is Tailwind's `max-w-2xl`.
