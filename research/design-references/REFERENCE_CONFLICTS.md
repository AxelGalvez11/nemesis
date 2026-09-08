# Where the references disagree, and what we decided

Each conflict below is real: two measured systems giving different answers to the same question.
Averaging them would produce mush, so each one gets an explicit decision and a reason.

---

## 1. Radius: Figma's 4px against Sana's pill

**Figma (app):** 4px on sidebar rows and chips, 5px on icon buttons. Nearly square.
**Sana (app):** every text button, nav row and chip is a full pill. 8px only on small icon buttons.
**x.ai / champ:** pill for everything pressable.

Three to one for pills, but the outlier is the densest application in the set, and density is what
we need on a canvas.

### Decision: split by role, not by size

- **Chrome controls** (toolbar buttons, sidebar rows, inspector fields, tabs, menu items):
  **radius 6px.** Between Figma's 4 and Sana's 8. Square enough to sit in a dense rail, soft enough
  not to look like a 2015 admin panel.
- **Content-level actions** (the primary action in a lesson, a quiz answer, a chip the learner
  chooses): **pill.** Sana's rule, kept where it belongs: the learner-facing surface.
- **Containers** (cards, panels, dialogs): **8px**, **12px** for large panels.
- **Nothing gets 16px or more** except the composer, which keeps its pill.

The rule in one line: **the closer a control is to the learner's content, the rounder it gets.**
Chrome is square, learning is soft.

---

## 2. Type size: Figma's 11px against Sana's 14px

**Figma:** 11px / 450 is the entire application.
**Sana:** 14px / 500 for controls, 16px body.

Figma's 11px works because Figma's users are professionals inside a tool for hours and the canvas is
the content. Sana's 14px works because Sana is a *reading* product where UI text sits near prose.

We are both: a dense canvas **and** a reading surface.

### Decision: two densities, explicitly named

- **Chrome density** (canvas toolbar, sidebar, inspector, menus, status): **12px / 500**, rows 28px.
  A step up from Figma's 11 because we are not a professional daily-driver tool, and a step down
  from Sana's 14 because our canvas has more chrome than theirs.
- **Content density** (chat, lessons, notes, documents, anything read): **16px / 400 at 1.6**, and
  **18px** for long-form reading. Sana's numbers, which are the best reading numbers in the set.

Never mix them in one region. A toolbar is 12; a lesson body is 16 or 18. There is no 14px chrome
and no 12px prose.

---

## 3. Accent: Sana's decorative lime against Figma's functional blue

**Sana:** the accent is decorative. The primary button is ink. You never hunt for the lime.
**Figma:** blue is functional and everywhere: selection, focus, links, active tool.
**x.ai:** no accent at all.
**champ:** one orange, one job.

### Decision: Sana's model, with one exception carved out

- **The primary button is ink**, not accent. Our brand colour never becomes the "click here" colour.
- **The accent is reserved for one job: marking what the learner is doing now.** Current lesson,
  selected answer, active tool, progress fill. That is a functional job, but a narrow one.
- **Selection and focus use the accent**, following Figma, because a selection that is merely a grey
  outline is genuinely harder to see on a busy canvas.

This keeps our existing character constraint intact: the mascot is the accent
(`docs/` and the standing rule from 2026-09-05), and the interface does not compete with it.

---

## 4. Colour naming: Sana's numbers against Figma's roles against x.ai's poetry

**Sana:** `--color-foreground-60`. Systematic, but the component has to know that 60 means secondary.
**Figma:** `--color-text-tertiary`, `--color-icon-danger-secondary`. Self-documenting.
**x.ai:** `--color-evenfall`. Requires a decoder ring.

### Decision: Figma's grammar over Sana's construction

Build the values Sana's way (alpha over one ink) and name them Figma's way (role first). Components
reference **only** the semantic name; the numeric ramp exists underneath as the raw material and is
not referenced directly outside the token file.

```
role      bg | text | icon | border
prominence primary | secondary | tertiary | muted
context   -on-accent | -on-selected | -on-disabled
state     -hover | -active | -selected | -disabled
```

x.ai's naming is rejected outright.

---

## 5. Ground: champ's warm off-white against everyone else's white

**champ:** `#f8f5f1`, warm.
**Sana:** `#fff` with `#fafafa` paper.
**Figma / x.ai:** `#fff`.

### Decision: a tinted ground, cool rather than warm

Pure `#ffffff` under long-form reading is harsh, and we are a reading product. But a warm ground
fights our ink, which is cool, and would make the mascot's colour read differently.

**Light ground: `#fcfcfd`.** Off-white, very slightly cool, matching our ink's hue. Elevated
surfaces go to `#ffffff`, so *elevation moves toward white* rather than away from it. champ's
insight, our hue.

---

## 6. Motion: Sana's 0.02s against everyone's 0.15s

**Sana:** 0.02s hover, 0.1s colour, 0.2s shape. Three speeds, chosen by what is changing.
**Figma / x.ai / champ:** one 0.15s for everything.

### Decision: Sana's tiered model

One duration for everything is simpler but wrong: a hover that takes as long as a panel slide feels
laggy, and a panel that moves as fast as a hover feels broken. Sana's rule generalises cleanly:

> **The closer a change is to the pointer, the faster it resolves.**

Four durations, in `/design/MOTION.md`. Hover feedback is effectively instant, colour is quick,
shape and position are merely fast, and overlays get the longest.

---

## 7. Weight: champ's 700 against everyone else

Four references cap display at 600 or below. Measured: Figma sets 44, 56 and 88px all at **400**;
x.ai sets 36px at **400** and its 60px hero at **500**; Sana caps at **500** and redefines `bold`
to it; champ sets 32px at **600** and is the only one keeping `bold: 700`.

### Decision: cap at 600, and make it structural

`--font-weight-bold` is defined as **600**, not 700, so a careless `font-bold` cannot shout. Display
type is set at **400 to 500** and gets its presence from size and negative tracking. Sana's guardrail
plus x.ai and Figma's display treatment.

---

## 8. Icon stroke: 1.25 (Figma) against 1.75 (x.ai) against Lucide's default 2

### Decision: **1.5**

Between the two measured references, and a deliberate step down from Lucide's default, which reads
heavy beside 12px text. Set once in the shared `<Icon />` so it cannot drift.

---

## Summary of decisions

| question | decision | source |
| --- | --- | --- |
| chrome radius | 6px | between Figma and Sana |
| content radius | pill, 8px containers | Sana |
| chrome type | 12px / 500, 28px rows | between Figma and Sana |
| content type | 16 and 18px at 1.6 | Sana |
| primary button | ink, never accent | Sana |
| accent job | "what you are doing now", plus selection and focus | Sana + Figma |
| token naming | role first, semantic | Figma |
| neutral construction | alpha over one ink | Sana, Figma, x.ai |
| ground | `#fcfcfd`, cool off-white | champ's idea, our hue |
| motion | four durations by proximity to pointer | Sana |
| max weight | 600; display at 400 to 500 | Figma (400), x.ai (400 to 500), Sana (500) |
| icon stroke | 1.5 | between Figma and x.ai |
| letter spacing | crosses zero at 12px, scales with size | Figma |
