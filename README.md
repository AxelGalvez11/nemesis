# Nemesis

**A field-agnostic academic OS.** It serves students and learners in *any* discipline — law,
engineering, history, nursing, computer science, art history, trades.

Nemesis is not a study-material generator. It reads what a learner actually has, works out what the
material *teaches*, and continuously decides what that learner should think about next.

> **Design test for any feature:** would this work for a law student *and* a mechanical engineering
> student? A rule, prompt or heuristic that only makes sense in one field is the wrong abstraction.
> Prefer structural signals — headings, emphasis, position, document shape — over subject-matter
> keyword lists, which never generalise.

---

## The two surfaces

**Canvas** — the adaptive cognitive runtime, and the primary surface. It maps what a source teaches,
models what the learner has demonstrated, and chooses the next interaction from both.

**Calendar** — dates, deadlines and schedules recovered from real coursework, each carrying the
passage it came from.

Everything else in this repository is upstream of those two.

---

## Architecture, in the order data moves

```
 file / paste / recording
      ↓  parsing
 DocumentModel            blocks, tables as CELLS, headings, page anchors
      ↓  one boundary
 SourceContext            the ONE shape every semantic extractor reads
      ↓  extraction
 KnowledgeObject          what the source teaches, typed by KIND of knowledge
      ↓
 LearningObjective        a capability OVER that knowledge
      ↓
 learner evidence         append-only; state is a projection, never a stored row
      ↓
 teaching policy          one decision, from current state, then stop
      ↓
 Canvas interaction
```

Four rules hold this together, and most of the hard-won lessons in the codebase are restatements
of one of them:

1. **Structure computed upstream must survive every boundary.** It has been discarded at one
   boundary six separate times, each failure silent and each passing the tests on both sides. Every
   structural field now needs a round-trip test: real file → parser → model → JSON → reader →
   consumer.
2. **Absence of evidence is never negative evidence.** "We have not asked" and "they cannot do it"
   are different facts, and a type that cannot express the first will quietly assert the second.
3. **Degraded is not complete.** A pipeline that half-worked must say so; silent degradation is the
   most expensive recurring defect in this project.
4. **Refusing beats guessing.** A missed extraction costs coverage. A fabricated one teaches
   somebody something false and then tests them on it.

---

## Monorepo layout

```
apps/web/                Next.js — Canvas, Calendar, the workspace shell. The main app.
apps/mobile/             React Native + Expo
apps/nemesis-desktop/    desktop shell + marketing
packages/shared/         the document model, and the contracts both apps read
packages/db/             generated Supabase types
supabase/migrations/     schema — knowledge objects, objectives, learner evidence, canvases
supabase/functions/      edge functions — llm, search, transcribe, ics, indexing, media
docs/                    the design references below
```

## The documents that govern the build

| Document | What it decides |
|---|---|
| [`docs/canvas-cognitive-runtime.md`](docs/canvas-cognitive-runtime.md) | **The north star for Canvas.** Target architecture, and §12 is a dated matrix of what is actually built. Read before changing the runtime, extraction, policy, evidence or presentation. |
| [`docs/document-intelligence.md`](docs/document-intelligence.md) | What Nemesis can read, and how well |
| [`docs/document-graph.md`](docs/document-graph.md) | The canonical document model |
| [`docs/parsing-architecture.md`](docs/parsing-architecture.md) | How files become that model |

🔴 **`canvas-cognitive-runtime.md` describes a target, not the present.** Only §12 describes what
exists, and a test fails the build if the code gains a capability the matrix does not declare.

---

## Knowledge, and why it is typed

The unit is the **knowledge object**, not the document. One paragraph about one drug yields an
association (its brand name), a classification (its class), a rule (avoid in pregnancy), a causal
chain (how it lowers blood pressure) and a procedure (how to counsel someone starting it).
Classifying the *document* as "pharmacology" and picking one interaction for all of it throws away
the entire point.

Two dimensions, kept strictly separate:

- **Knowledge type** — association, causal, classification, procedure, conditional rule, …
- **Cognitive operation** — recall, explain, predict, reconstruct, apply, …

Compare-and-contrast is an *operation over* knowledge, never a type of it. Collapsing the two
produces a combinatorial explosion of near-duplicate types and loses the ability to ask the same
knowledge a harder question.

**Identity is derived from content**, so a canvas built on Tuesday's lecture and one built on
Friday's revision sheet recognise the same fact without any table joining them. Convergence is a
property of the identity function rather than of a lookup.

---

## Learner evidence

The log is the truth; learner state is a projection of it, and there is no state table.

Recorded per demonstration: what was asked, what was produced, the verdict, the cognitive operation,
how long it took, and how much assistance was on offer. **Observations only** — no thresholds, no
bands, no scores. An interpretation written into the log cannot be revised afterwards, because rows
recorded under the old rule mean something different from rows recorded under the new one and
nothing can tell them apart.

Three kinds of not-knowing stay distinct, and must never collapse into a generic "unknown":

| | |
|---|---|
| **Learner uncertainty** | we do not know whether they understand this |
| **Extraction uncertainty** | we do not know whether this passage asserts that |
| **Source-capability uncertainty** | we cannot know, because the parse lost the structure |

---

## Working on this repository

```bash
pnpm install
pnpm typecheck        # turbo, all packages — the only thing that catches cross-app orphans
pnpm test
pnpm build            # what Vercel runs; NOT the same as `next build`
```

Web tests are `node:test` + `tsx` and run from `apps/web`. Mobile tests run under Deno.

**Conventions that are not optional here:**

- Every structural field gets a round-trip test against a real file, not a fixture.
- Every guard is calibrated by reintroducing the specific defect it exists for. A test that has
  never been seen to fail is not yet a test.
- A boundary change is verified through the API the app actually uses, not through raw SQL.
- Measure before designing. Several features in this repository were cancelled by a measurement,
  and the measurements are kept in the tests as permanent benchmarks.

---

## Naming

Earlier names in this repository's history — *PharmaBro*, *PharmaOrb* — are dead. Domain-specific
data sources that still exist in the codebase are *features some students use*, not the product's
identity.
