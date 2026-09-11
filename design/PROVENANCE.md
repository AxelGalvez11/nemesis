# Provenance

**Are these values one-to-one reverse engineered? No, and they were never meant to be.**

The brief was explicit: infer the system, do not copy the screenshots, and produce something that is
our own product rather than a clone. So this file exists to make the line auditable. Every value in
`/design/TOKENS.md` falls into one of four buckets, and pretending otherwise would make the whole
system untrustworthy.

| bucket | meaning |
| --- | --- |
| **MEASURED** | a literal reading from a live browser. Reproducible. |
| **SYNTHESISED** | read in two references, then resolved into one value. New on 2026-09-11. |
| **INTERPOLATED** | sits between two measured values. Defensible, but observed in no product. |
| **INVENTED** | my judgement. No reference basis. |
| **VERIFIED** | proven to render as specified, with the measurement. |

---

## MEASURED: read from a live browser

These are reproducible readings, not impressions.

### Sana (signed-in app)
```
ink                 #0a1217, neutrals as 25 alpha steps over it
accent              #cdfe00 (decorative), foreground-accent-alt #fd2d55
primary button      background rgb(10,18,23) + white text      <- the accent is NOT the action
bold                500 (redefined down from 700); book 450
type                12/1.3  14/1.4  16/1.5  18/1.6  20/1.6  24/1.4  34/1.15
optical size        14, 15.1, 16.2, 17.3, 18.4, 20.5, 26
controls            36px and 28px. Nothing else on the surface
radius              pill (text buttons, rows), 8px (small icon buttons), 32px (composer)
composer            56px tall, radius 32, padding 16/56, background 5% ink, no border
borders             1px at 10% ink
icons               14, 15, 16, 18, 20, 24
motion              0.02s hover · 0.1s colour · 0.15s default · 0.2s shape
easing              cubic-bezier(.25,.5,.25,1)  (Sana-authored)
focus               box-shadow: inset 0 0 0 2px
```

### Figma (signed-in app, and marketing)
```
app type            11/450/16/+0.055  ·  11/550  ·  13/400/22/-0.032  ·  13/500/24/-0.003
                    13/550/22/-0.032  ·  18/550/25/-0.075
app controls        32px and 24px
app radius          4px and 5px
app neutrals        text-tertiary #0000004d (30% black), hover #0000001a (10% black)
token grammar       --color-{role}-{context}-{prominence}-{state}; bg/text/icon/border namespaces
marketing type      16/400/23.2 · 16/320/-0.12 · 24/400/31.2 · 44/400/-0.66 · 56/400/-1.25 · 88/400/-1.25
marketing mono      14/+0.5 · 16/+0.48 · 12/+0.6      <- mono takes POSITIVE tracking
nav                 18px at weight 330
spacing             4, 6, 8, 12, 16, 24, 32, 40, 56, 64, 80, 120   (no 20, no 48)
radius              2, 4, 8, 12, 16, 24, 28, full
elevation           0 4px 32px rgba(0,0,0,.10)  ·  0 24px 70px rgba(0,0,0,.10)
icon stroke         1.25
```

### x.ai / x.ai/bot (marketing)
```
display             60px/500/lh 1.0/-1.5px   and   36px/400/40px/-0.72px
body / UI           13/400/21.125 · 13/500/19.5 · 14/400/20/-0.15
mono                11/400/-0.11 · 12/400/-0.12
radius              6, 12, 24, full
controls            38px, 32px
reading column      672px  (also 1280, 1024, 576, 540, 448)
icon stroke         1.75
chips               rgba(10,10,10,0.04) and 0.055
```

### champ.ai (marketing)
```
ground              #f8f5f1 (warm)      ink #1a1a1a      accent #da7007      border #4a3e34
display             32/600/-0.8         body 16/400/19.2     labels 14/600
controls            40px pills          bold 700 (the only reference that keeps it)
```

---

## SYNTHESISED: measured Sana and Notion components, synthesised 2026-09-11

**This is where the app's current values in `/design/TOKENS.md` come from.** The owner asked for the
design philosophies of Sana and Notion as one system, picked the result as "our new design", and
approved it on a mockup of the rebuilt app.

🔴 **The comparison sheet is not in git**, so this section is the only record inside the repo. The
sheet is `~/Desktop/design-synthesis/sana-notion-synthesis.html`, built from the two component
teardowns at `~/Desktop/sana-teardown` and `~/Desktop/notion-chat-teardown`. Every raw number lives
in each teardown's `live/measurements.md`. Those folders hold Sana and Notion frames, which is why
they were kept out of the repo, and it means **a reader here cannot reproduce the readings**. Treat
the lines below as the audit trail, not as proof.

### What each reference supplied

```
Sana (signed-in Agents workspace, measured live, LIGHT ONLY)
  sidebar ground      #f9f9f9                 -> our sunken ground
  answer text         16/24.8 at ink 90%      -> the t1 body job, and the 16px reading step
  composer            868x56, radius 32, ink 5% fill
  menus               radius 24, 1px ink 8% ring, 0 7px 16px at 4%   -> ring inside a soft shadow
  rows                radius 18               switch #34c759
  chrome text         14px                    -> with Notion, the 14px chrome ruling

Notion Chat (signed-in thread, measured live, BOTH THEMES)
  menus               radius 10, rows 28px at radius 6, padding 0 8  -> the 6-inside-10 nesting rule
  hover fill          rgba(33,27,23,.05) over .02s                   -> the 5% hover and the 20ms step
  message bubble      radius 16, padding 6 14                        -> the 16 radius step
  answers             16/24
  menu open           .2s ease from scale .96                        -> the menu step, ours from .98
  keyboard focus      2px #f8f8f7 then 4px #2383e2                   -> the 2px gap then 2px ring shape
  dark                Notion's own dark token block, 587 overrides   -> every dark alpha below
```

### What the synthesis decided, which is judgement

| our value | why, and what it is not |
| --- | --- |
| **ink rgb(16,16,18) light, rgb(237,237,238) dark** | one ink for both references' neutrals. Neither ships this exact value; Sana's is `#0a1217` and Notion's warm `rgba(33,27,23,…)`. Ours is neutral on purpose |
| **the fifteen job alphas as one ramp** | Sana's construction (alpha over one ink) carrying Notion's job names (text, icon, fill, line). Neither product publishes this table |
| **six radii 4, 6, 10, 16, 24, pill** | Notion's 10 and 16 plus Sana's 24. Sana's 18, 22, 32 and 40 were dropped to keep the ladder nesting |
| **30px sidebar row** | between Notion's 28px menu row and Sana's 36px control. **Measured in neither** |
| **focus as a 2px INK ring** | Notion's shape with its blue replaced by ink, because the accent belongs to the character. Sana's focus colour was never captured |
| **the three elevation recipes** | Sana's ring-inside-shadow idea, rebuilt at app scale. The exact blurs and offsets are mine |
| **150ms menu step** | Notion opens menus in 200ms; 150ms is ours, so a menu resolves before a panel |
| **every dark alpha** | Sana was never measured in dark, so dark leans on Notion's token block plus our own judgement |

### What this replaced

The 2026-09-09 ruling that Figma led the app's system, and with it three values in the INTERPOLATED
table below: **chrome type 12px** (now 14px, measured in both references), **chrome radius 6px** (still
6 for rows, now nested inside menus of 10) and the positive tracking below 12px. Those rows stay in
this file because they are the history of how the values got here, not because they are still in
force. **Nothing in this section has been rendered and measured yet.**

---

## INTERPOLATED: between measured values, observed nowhere

**These are the ones to challenge.** Each is a reasoned midpoint, not a reading. This table is the
2026-09-08 position; the rows marked replaced were overturned by the synthesis above and are kept as
history.

| our value | measured on either side | why |
| --- | --- | --- |
| **chrome type 12px** **(REPLACED 2026-09-11: 14px, measured in both references)** | Figma 11, Sana 14 | we are denser than Sana, less professional-daily-driver than Figma |
| **chrome radius 6px** **(still 6 for rows, now nested inside menus of 10)** | Figma app 4 to 5, Sana 8 | square enough for a rail, soft enough not to look like an admin panel |
| **icon stroke 1.5** | Figma 1.25, x.ai 1.75 | midpoint, and a deliberate step down from Lucide's default 2.0 |
| **control ladder 24/28/32/36** | Figma 24/32, Sana 28/36 | the union of two sets. **No product uses this ladder** |
| **tracking at 16px (-0.1) and 24px (-0.35)** | Figma 13px/-0.03, 18px/-0.075, champ 32px/-0.8 | fitted to the curve between measured points. Those two sizes were never observed |
| **ground #fcfcfd** | champ #f8f5f1 (warm), Sana #fff/#fafafa | champ's off-white idea at our cool hue. **This exact value is mine** |
| **elevation 0 4px 24px @8%, 0 16px 48px @12%** | Figma 0 4px 32px @10%, 0 24px 70px @10% | tightened for an app rather than a marketing page |
| **motion 40/120/200/320ms** | Sana 20/100/200 | 20ms doubled (below one frame at 60Hz), and a fourth step added for overlays |
| **neutral ramp, 11 steps** | Sana's 25 steps | a reduction. Unused steps invite arbitrary choices |
| **type scale 11/12/13/16/18/20/24/32** | Sana 12/14/16/18/20/24/34 | **matches no reference's scale.** Built from our two densities |
| **spacing scale** | Figma's, plus 20 and 48 | Figma deliberately omits both; I kept them for content rhythm |

---

## INVENTED: no reference basis

- **Every learning component** (Poll, Quiz, Mastery, AnswerFeedback, Flashcard, TeacherPrompt,
  StudentResponse). Sana Learn's course and lesson surfaces were **not reachable** from the account
  available. These are designed from our product requirements and are flagged in
  `/design/COMPONENTS.md §6` as the part of the system with no precedent. **They should be validated
  on screen before they are trusted.**
- **The "two densities" rule** as a formal law. Derived from a real observation (Figma runs two
  systems), but the specific 12px-chrome / 16-to-18px-content pairing is my construction.
- **"The closer a control is to the learner's content, the rounder it gets."** My resolution of a
  genuine conflict between Figma and Sana. Neither product states or follows this rule.
- **Inter Variable.** No reference uses it; all four ship proprietary faces (Sana Sans,
  figmaSans, universalSans, metroSans). Chosen because it is the only open face with the `opsz`
  axis that makes Sana's type work.
- **All responsive behaviour** in `/design/RESPONSIVE.md`. Only marketing pages were
  responsive-testable; no reference gave up usable mobile *application* behaviour.

---

## VERIFIED: proven to render, with the measurement

Measured on `/dev-preview/design` in a real headless browser, not asserted.

🔴 **These readings are from 2026-09-08 and they measured the pre-synthesis values.** The method
stands and the contrast figures stand, but the type and radius numbers below are what the system used
to say. The synthesis values have not been through this loop yet.

```
type-meta      11px / 500 / 16px   / +0.06px     as specified
type-ui        12px / 500 / 16px   / +0.02px     as specified
type-body      16px / 400 / 25.6px / -0.1px      as specified
type-display   32px / 450 / 37px   / -0.7px      as specified
button md      h28, radius 6,  padding 0 12px
button content h36, radius 9999, padding 0 16px
input          h32, radius 6
card           radius 8, padding 16
31 / 31 tokens resolve on the running app; 0 page errors
```

Contrast, computed from rendered pixels:

```
primary button    19.08:1 light   16.10:1 dark    (AA needs 4.5)
checkbox tick     10.18:1
```

🔴 **Verification found three invisible controls that reading the code did not.**
`--ui-bg-primary` is a control *fill* in this codebase, not a page ground. Mapping it to `--bg-page`
and to the inverse text tone rendered the primary button's label as `srgb 0.182 / 0.244` on
`rgb(13,13,13)`, and painted the checkbox tick and toggle knob the same invisible colour. Typecheck
was clean. Only the rendered measurement caught it.

---

## NOT VERIFIED

Stated plainly, because these are the gaps:

- **No synthesis value has been rendered and measured.** The values landed in the token layer on
  2026-09-11; nothing has been drawn with them, so the 2026-09-08 verification loop needs rerunning.
- **The ink and the grounds are not the synthesis values yet.** The ramp is built on `--ui-base`,
  which resolves to `#0d0d0d` light and `#ffffff` dark rather than rgb(16,16,18) and rgb(237,237,238),
  and the grounds still resolve through the app's theme. Moving them is a `desktop-ui.css` change in
  the shell pass, because re-pointing a theme value restyles every screen at once.
- **Sana was never measured in dark**, so every dark value leans on Notion's dark token block and on
  judgement.
- **No side-by-side comparison against any reference.** Nothing has been put next to a Sana or
  Figma screenshot and judged. The values trace to measurements; the *result* has not been compared.
- **No real screen uses any of this yet.** The primitives and the gallery exist; every application
  surface still runs the old values.
- **Responsive behaviour is specified but neither built nor tested** at any breakpoint.
- **The learning components do not exist**, and their design has no precedent behind it.
- **Inter Variable is specified but not installed.** The app still ships system fonts, so it still
  looks different on macOS, Windows and Linux.

---

## Corrections to this research

**2026-09-08, display weight.** I originally wrote that x.ai sets its display at weight 400, in six
places, and claimed "three references set display at 400". The raw reading is `60px/500/60px/-1.5px`:
the hero is **weight 500**. Their 36px section display is 400. One of my own files stated both the
wrong claim and the correct reading, and contradicted itself.

Corrected everywhere. The defensible statement is: **no reference sets display above 600, and the
largest display type measured anywhere (Figma, 88px) is weight 400.** The conclusion survives; the
supporting claim was overstated.
