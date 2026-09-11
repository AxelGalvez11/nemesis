# Design

> **Read [README.md](README.md) first.** It holds the owner's rulings since this file was written on 2026-09-08, and
> they outrank it: the marketing site, sign-in and pricing follow Sana one for one ([SURFACES.md](SURFACES.md)), and the
> mark is three dots ([BRAND.md](BRAND.md)). This file governs the app.

The constitution. When this file and a screen disagree, the screen is wrong.

---

## What the product is

Nemesis is a **field-agnostic academic OS**: a canvas where a learner brings material, thinks with
it, and makes things from it. It serves a law student and a mechanical engineering student equally.

That shapes every rule below. It is a **reading and thinking surface with a dense workspace around
it**, which is an unusual combination and the reason no single reference answered every question.

---

## What it should feel like

Focused, calm, contemporary, precise. Like a well-made instrument that has been used for years.

## What it must never feel like

- a generic SaaS admin dashboard
- ChatGPT with a sidebar
- a collection of floating cards
- an AI landing page that someone bolted an app onto
- a Tailwind template

The measurable difference between the first list and the second is almost entirely **restraint**:
fewer type sizes, fewer radii, fewer colours, fewer containers, less motion. Every reference we
measured is *more* restrained than our current app, without exception.

---

## 1. Content outranks chrome

The learner's material is the most important thing on screen. Chrome recedes.

This is enforced structurally, not by taste:

- Chrome is built from the low end of the neutral ramp. It is **incapable** of out-shouting content.
- Chrome type is 12px. Content type is 16 to 18px.
- Chrome is square (radius 6). Content containers are soft.
- The accent never appears on chrome except to mark what the learner is doing now.

**Test:** squint at any screen. The things that survive should be the learner's words, not our
toolbar.

## 2. Two densities, never mixed

**Chrome density**: 12px type, 24 to 28px controls, radius 6, spacing 4 to 12.
**Content density**: 16 to 18px type, 32 to 36px controls, radius 8 to pill, spacing 16 to 32.

A region is one or the other. A 14px label inside a 12px toolbar is a bug. A 12px paragraph inside a
lesson is a bug.

This is the single rule that most separates a designed application from a generated one, and it is
the rule Figma proves inside its own brand: their marketing site and their product use genuinely
different systems.

## 3. Hierarchy before containers

Reach for these in order, and stop as soon as it works:

1. **whitespace**
2. **typography** (size, then colour, then weight)
3. **a hairline** (`--border-subtle`)
4. **a background step** (`--bg-sunken` or `--bg-surface`)
5. **a container with a radius**
6. **a shadow**

Most of our current screens start at step 5. **A card is an admission that steps 1 to 4 failed.**

Cards inside cards are forbidden. If you have nested a card, one of them should have been a section
with a heading and some space.

## 4. Colour is nearly absent, and that is the point

The interface is ink on paper. One accent, doing one job: **marking what the learner is doing now**.

The primary button is ink, not accent. This is Sana's rule and it is the largest single contributor
to a product reading as calm. A user never has to hunt for the coloured thing to proceed.

Status colour (danger, warning, success) appears only when something has actually happened.
Decorative colour does not exist.

Our accent belongs to the character. The interface does not compete with the mascot.

## 5. Type carries the hierarchy, not weight

Nine type steps. Nothing outside them.

**Nothing is ever set at 700.** Display type is 450 at 32px with tight negative tracking, which is
how all three of the strongest references handle it. `text-4xl font-bold` is the signature of a
generated interface.

Tracking is optical: positive below 12px, negative and increasing above. Baked into the tokens.

## 6. Motion is feedback, never decoration

Four durations, chosen by **how close the change is to the pointer**. Hover is effectively instant
(40ms). Colour is quick. Shape and position are fast. Overlays are merely quick.

Nothing animates on entry. There are no scroll reveals, no staggers, no springs on ordinary UI. The
one place motion is allowed personality is the character, which has its own vocabulary.

If an animation does not tell the user something, delete it.

## 7. Chrome disappears until needed, but never surprises

Secondary actions may be revealed on hover **only when a keyboard and touch path also exists**. A
hover-only control is inaccessible on a phone and invisible to a keyboard.

Hidden means unclickable. An `opacity: 0` control that still takes presses is a bug we have
shipped before.

## 8. The learner's objects have a visual language

A paragraph, a quiz, a poll, a source, an annotation and something Nemesis made must each be
recognisable at a glance, **without turning the page into a carnival**. They are distinguished by
one structural signal each (a rule, an indent, a mark, a background step), not by six competing
colours.

Detailed in `/design/COMPONENTS.md`.

## 9. AI is embedded, not bolted on

Nemesis is present in the workflow: in the composer, in a selection, at a source. Not as a floating
chat bubble in the corner of every screen. Chat is a *surface*, used where conversation is genuinely
the right interaction, and it is not the answer to every problem.

No sparkles. No "AI" badges. No purple gradients.

## 10. Mobile is a different arrangement, not a narrower one

Panels become sheets, sidebars become drawers, split views stack, toolbars collapse to a menu, and
touch targets grow to 44px. What we never do is scale the desktop layout down and call it responsive.

Detailed in `/design/RESPONSIVE.md`.

---

## The authority chain

```
reference applications
  -> research and comparison
    -> conflict resolution
      -> THIS FILE and /design/TOKENS.md
        -> reusable components
          -> screens
```

Once a decision is recorded here, the references stop being relevant. We do not go back and copy
Sana again for the next feature. **A new screen is built by composing existing primitives; if it
cannot be, the missing primitive is the work.**
