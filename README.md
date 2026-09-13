# Nemesis

**The AI lecture memory for students.**

Nemesis records or imports a class, turns it into a trustworthy transcript and structured notes, and then turns the material worth remembering into flashcards that can be reviewed in Nemesis or synced to Anki.

The product loop is deliberately simple:

```text
record / upload class
      ↓
transcript + timestamps + speakers
      ↓
structured lecture notes
      ↓
ask / search across the class and course
      ↓
flashcard drafts
      ↓
approve / edit
      ↓
Nemesis review or Anki sync
      ↓
return for the next class
```

Nemesis is field-agnostic. The same capture → understand → remember loop must work for law, engineering, history, nursing, computer science, pharmacy, art history and trades.

> **Primary product test:** does this help a student capture a real class, find what mattered later, and remember it with less manual work?

---

## The product

### 1. Lecture capture is the wedge

Students should be able to start a recording from phone, desktop or web without thinking about transcription minutes during normal academic use. Uploaded recordings and device-provided transcripts use the same downstream pipeline.

The server owns provider selection. The existing transcription function is xAI-first with AssemblyAI fallback, so provider changes can be made without shipping a new client. Provider choice is an implementation detail; transcript quality, latency and cost are the product constraints.

### 2. The transcript becomes durable course memory

A recording is not the end product. Nemesis keeps the useful derivative artifacts:

- timestamped transcript
- structured notes
- source links back to the moment in the lecture
- extracted concepts and relationships
- questions and answers grounded in the source
- flashcard drafts

The student should be able to search or ask across one lecture, a course, or the semester without reconstructing context manually.

### 3. Flashcards close the learning loop

Nemesis generates **drafts**, not an uncontrolled pile of cards. A student can approve, edit, reject or regenerate before cards enter review.

Cards follow minimal-information principles: one retrievable fact or relationship per card where practical, with Basic and Cloze as the first supported note types. Every generated card keeps provenance back to the lecture/document section that produced it.

Nemesis can review cards itself, but **Anki sync is a first-class exit path** for students who already use Anki. See [`docs/anki-sync.md`](docs/anki-sync.md).

### 4. Existing document intelligence makes lecture memory better

Slides, PDFs, syllabi, readings and pasted notes remain important. They are context for the lecture rather than the headline product.

For example, a lecture recording plus its slide deck should let Nemesis recover structure that audio alone cannot: section boundaries, spellings, formulas, tables and references. The existing `DocumentModel`, `SourceContext`, knowledge objects and learner-evidence systems remain valuable infrastructure for this.

### 5. Canvas is an optional deep-study surface

Canvas remains the adaptive cognitive runtime for students who want to explore relationships, diagnose gaps and work spatially. It is no longer the definition of Nemesis or a prerequisite for understanding the product.

The default path should remain understandable without Canvas:

**Classes → lecture → transcript/notes → cards → review.**

Calendar remains the schedule/deadline surface.

---

## Product principles

1. **Capture first.** Starting a class recording should take fewer decisions than opening a blank note.
2. **Preserve provenance.** Notes, answers and cards should link back to the transcript/document evidence that produced them.
3. **Draft before review.** AI-generated flashcards are editable drafts until the learner approves them.
4. **Do not trap the learner.** Export and Anki sync are product features, not grudging escape hatches.
5. **Provider-agnostic infrastructure.** Speech and language model vendors can change; product contracts should not.
6. **Normal use should feel unlimited.** Cost controls belong behind fair-use, abuse prevention, priority tiers and provider routing rather than brittle daily class limits.
7. **Refusing beats guessing.** A missed extraction costs coverage. A fabricated fact teaches somebody something false and may later become a flashcard.
8. **Field-agnostic by construction.** Prefer structural signals over subject-specific keyword rules.

The detailed product definition is in [`docs/product-north-star.md`](docs/product-north-star.md).

---

## Architecture, in the order data moves

```text
 recording / device transcript / file / paste
      ↓
 transcription + parsing
      ↓
 DocumentModel / timestamped transcript
      ↓
 SourceContext
      ↓
 KnowledgeObject             what the source teaches
      ↓
 LearningObjective           a capability over that knowledge
      ↓
 notes / search / Q&A / flashcard drafts
      ↓
 learner approval + review evidence
      ↓
 Nemesis review / Anki sync / Canvas interaction
```

Four existing architectural rules continue to apply:

1. **Structure computed upstream must survive every boundary.** Every structural field needs a round-trip test through the path the app actually uses.
2. **Absence of evidence is never negative evidence.** "We have not asked" and "they cannot do it" are different facts.
3. **Degraded is not complete.** A pipeline that half-worked must say so.
4. **Refusing beats guessing.** Source-grounded learning artifacts are more important than maximum generation coverage.

---

## Monorepo layout

```text
apps/web/                Next.js — classes, lectures, notes, cards, Canvas, Calendar
apps/mobile/             React Native + Expo — capture and study on the phone
apps/nemesis-desktop/    desktop capture shell + marketing
packages/shared/         document/transcript contracts shared by clients
packages/db/             generated Supabase types
supabase/migrations/     schema — sources, knowledge, evidence, recordings, usage
supabase/functions/      edge functions — transcribe, llm, search, indexing, media
docs/                    product and architecture references
```

## Documents that govern the build

| Document | What it decides |
|---|---|
| [`docs/product-north-star.md`](docs/product-north-star.md) | **The product north star.** Lecture memory, default user loop, scope and sequencing. |
| [`docs/anki-sync.md`](docs/anki-sync.md) | **Anki integration contract.** Stable card identity, one-way MVP sync, reconciliation and fallback export. |
| [`docs/canvas-cognitive-runtime.md`](docs/canvas-cognitive-runtime.md) | The deep-study Canvas runtime and its implementation matrix. |
| [`docs/minimap-knowledge-territory.md`](docs/minimap-knowledge-territory.md) | How learners navigate knowledge territory. |
| [`docs/causal-cognition-contract.md`](docs/causal-cognition-contract.md) | What responses demonstrate about causal mechanisms. |
| [`docs/document-intelligence.md`](docs/document-intelligence.md) | What Nemesis can read, and how well. |
| [`docs/document-graph.md`](docs/document-graph.md) | The canonical document model. |
| [`docs/parsing-architecture.md`](docs/parsing-architecture.md) | How files become that model. |

`canvas-cognitive-runtime.md` describes a target; its implementation matrix is still authoritative for claims about what Canvas currently supports.

---

## Working on this repository

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Web tests are `node:test` + `tsx` and run from `apps/web`. Mobile tests run under Deno.

**Conventions that are not optional:**

- Every structural field gets a round-trip test against a real file or recording path.
- Every guard is calibrated by reintroducing the defect it exists for.
- A boundary change is verified through the API the app actually uses, not raw SQL.
- Generated learning artifacts preserve source provenance.
- Measure real transcription hours, cost per active user, card acceptance rate and retention before loosening or tightening plan limits.

---

## Naming

Earlier names in this repository's history — *PharmaBro*, *PharmaOrb* — are dead. Domain-specific data sources that remain are optional capabilities, not the product identity.
