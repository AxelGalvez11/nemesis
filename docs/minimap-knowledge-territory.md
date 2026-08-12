# The Minimap — the learner's map of the territory

> **Target architecture. Nothing in this document is built.**
>
> Companion to [`canvas-cognitive-runtime.md`](./canvas-cognitive-runtime.md), which owns the
> execution surface and holds the dated capability matrix. This one owns navigation. Consult both
> before changing the knowledge model, the learner model, or either surface.

Owner-authored, 2026-08-12.

---

## The division of labour

> **The Minimap is Nemesis's current model of the journey. Canvas is the next step of the journey.**

| | Minimap answers | Canvas answers |
|---|---|---|
| | *Where am I, what exists, and what matters?* | *What should I do right now?* |

**The learner chooses the territory. Nemesis chooses the strategy within it.**

That split is the whole design. It gives the learner agency without making them the curriculum
planner — which is the thing beginners cannot do, because they do not know which concepts exist.

Neither surface is static. Every Canvas interaction can change the Minimap; every change of focus in
the Minimap can change what Canvas does next.

```
                  SOURCES
        PDF / lecture / web / textbook
                    ↓
             KNOWLEDGE MODEL
      concepts, edges, rules, procedures
                    ↓
        ┌───────────────────────┐
        │        MINIMAP        │
        │ What exists?          │
        │ How is it connected?  │
        │ What matters?         │
        │ What do I know?       │
        │ Where are my gaps?    │
        └───────────┬───────────┘
                    │  selects territory
                    ↓
        ┌───────────────────────┐
        │        CANVAS         │
        │ recall · explain      │
        │ reconstruct · compare │
        │ calculate · apply     │
        │ transfer              │
        └───────────┬───────────┘
                    │  learner response
                    ↓
            OBSERVATIONS / EVIDENCE
   correctness · latency · language ·
   scaffolding · misconceptions · transfer
                    ↓
             LEARNER MODEL
                    ↓
           update Minimap + Canvas
                    ↺
```

---

## It is a panel, not a permanent map

During a session the screen stays minimal. A control sits top-right; clicking it opens a floating
panel (~320–380px) over the surface; on mobile the same thing is a bottom sheet.

```
←                                      [ minimap ]

                 Current interaction

                    composer
```

```
┌─────────────────────────────────────────┐
│ Cardiovascular Pharmacology         ×   │
│                                         │
│ ▾ RAAS                                  │
│    ● Foundations              Solid     │
│    ◐ ACE inhibitors        Learning     │
│    ◐ ARBs                   Fragile     │
│    ○ Aldosterone            Unknown     │
│                                         │
│ ▸ Diuretics                   Solid     │
│ ▸ Beta blockers            Learning     │
│ ▸ Heart failure             Unknown     │
│                                         │
│ ★ Suggested next: RAAS mechanisms       │
└─────────────────────────────────────────┘
```

**Clicking a node means "focus here", never "give me flashcards".** It constrains the adaptive
policy to a region until the learner leaves or broadens it. Nemesis still decides whether the right
interaction is rapid recall, explanation, comparison, causal reasoning, calculation or application.

Focus is clearable and hierarchical — `Cardiovascular → Heart Failure → RAAS`, or back to
*Entire Canvas*. A learner who says "I only want Chapter 6 today" gets exactly that, and Nemesis
stays adaptive inside it.

---

## Three layers, reconciled — and never confused

| Layer | Example |
|---|---|
| **Source structure** | Chapter 1, Chapter 2, Chapter 3 |
| **Knowledge structure** | A is prerequisite for C · B is low yield · C is a bottleneck · D is an exception to A |
| **Learner model** | A solid · C unknown · D misconception |

The Minimap is where those are reconciled, and the learner may view any of them. A chapter list
alone tells you where the *source* is organised; the Minimap must tell you where the *learner* is
within the territory.

### Semantic zoom

The same architecture holds at every scale — one lecture, a course, a subject, a discipline. Only
the granularity changes.

```
Medicine → Cardiovascular → Heart Failure → physiology · mechanisms · diagnosis · drugs · application
```

Canvas then works at the selected resolution.

### It summarises; it does not expose the graph

Nemesis may hold hundreds of knowledge objects under one branch. The learner never inspects
database-level causal edges.

---

## Learner state on the map

Internally rich and probabilistic; on screen, restrained. No XP, no streaks, no hearts, no large
percentages.

| Internal state | Meaning |
|---|---|
| **Unmapped** | Nemesis has not reliably inspected this material |
| **Unknown** | no learner demonstration yet |
| **Learning** | exposed, partial, or scaffold-dependent |
| **Fragile** | demonstrated, but slow, inconsistent or decaying |
| **Solid** | independently demonstrated |
| **Integrated** | demonstrated across relationships and applications |
| **Transferable** | succeeds in unfamiliar contexts |

The panel need not show seven labels. `● Solid · ◐ Developing · ○ Unknown · ! needs attention`, with
detail on click:

```
ARB mechanisms — Developing

You can:      identify the class · recall major drugs · predict potassium increase
Needs work:   explain the aldosterone mechanism · apply it to combined therapy
Last demonstrated: today
```

That is **interpreting evidence**, not printing "73% mastery".

---

## 🔴 Source gaps are not learner gaps

The causal-extraction benchmark measured that **62% of candidate passages in the current corpus come
from degraded parses** where no relationship can be trusted. That must never render as *"you don't
know this"*.

```
○  Unknown to learner          no demonstration yet
◇  Not fully mapped            Nemesis could not reliably read the source
```

> *Drug mechanisms — source partially mapped.*
> *74% of this source has reliable structure. Some tables could not be interpreted.*

**Canvas must never infer learner weakness because the parser failed.** These are two of the three
kinds of not-knowing that must stay distinct — see `canvas-cognitive-runtime.md` §5.

The Minimap is the right surface for this, because it can say so without cluttering Canvas.

---

## Causal knowledge appears in both places, differently

Take one extracted mechanism:

```
AT1 blockade → ↓ aldosterone → ↓ potassium excretion → ↑ serum potassium
```

**In the Minimap** it is one node — *ARB electrolyte effects* — or a small mechanism branch. Nemesis
knows internally that it is three causal edges. If the learner holds the first and third but not the
middle, the node reads **partially resolved**.

**In Canvas** the same edges become cognition:

> *Why can ARBs cause hyperkalemia?*
> — "They lower potassium excretion."

Endpoint understood; intermediate missing. Canvas expands **only** the missing link —

```
AT1 blockade
      ↓
     ???
      ↓
↓ potassium excretion
```

— and asks them to fill it. It does not restart the topic. Once demonstrated, the node updates.

> **Canvas generates evidence. The Minimap visualises the model built from that evidence.**

This is why one causal object is one *directed edge* rather than a mechanism blob: a node can only
be partially resolved if the parts are individually addressable.

---

## Unknown unknowns

A beginner cannot choose an adequate curriculum, because they do not know which prerequisites exist.

The learner selects *Heart failure treatment*. Nemesis detects they have never demonstrated *RAAS
physiology*.

```
Heart Failure Treatment
        ↑ requires
RAAS physiology
```

Canvas routes backward temporarily. **The learner chose the destination; the system discovered the
missing bridge** — which should not feel like going backwards.

---

## Triage changes the map, not just the order

Under time pressure the Minimap becomes a prioritised map rather than a mastery map.

```
Exam tomorrow · 90 min remaining

★ RAAS mechanisms          High yield · Weak
★ Heart failure therapy    High yield · Fragile
  Beta blockers            High yield · Solid
  Rare ARB interactions    Low yield · Unknown
```

Canvas consumes that prioritisation; the learner can override by selecting elsewhere. Nemesis's
prioritisation is **shown rather than hidden** — the learner gets metacognitive visibility without
having to do the metacognitive work.

---

## Compression is visible here

If Nemesis reads 30 drug facts and finds that 18 follow from 3 class rules, the Minimap must not show
30 equal nodes:

```
ACE inhibitors
├─ class mechanism
├─ common effects
├─ common adverse effects
└─ exceptions
```

Canvas teaches the rule, then tests only the exceptions individually. **The map reflects the
compressed structure Nemesis believes is most useful, not the source page-for-page.**

---

## What this demands of the substrate

Written here so the layers below know what they are eventually for. None of it is built.

1. **Clusters, not raw objects.** Knowledge objects must roll up into named regions the learner can
   select. Nothing groups them today.
2. **Prerequisite edges.** "A is required for C" is a relation the knowledge model does not yet have.
   Causal edges are adjacent but not the same thing.
3. **Per-source mapping coverage, exposed.** The extraction layer already distinguishes *complete*
   from *degraded* from *failed*; the Minimap needs that per region, as a first-class fact.
4. **A learner-state projection above the objective level.** State exists per objective; the Minimap
   needs it per region, and the roll-up rule is a real design decision — not an average.
5. **Yield estimates.** Nothing computes exam, structural, dependency, transfer or compression yield.
6. **Compression detection.** Nothing finds "these 18 facts follow from 3 rules".

Items 1, 2, 3 and 6 are knowledge-layer work. Items 4 and 5 sit between the learner model and the
policy. None of it is presentation.
