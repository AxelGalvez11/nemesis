# Nemesis

**The AI lecture memory and study workspace for students.**

Nemesis records or imports a class, turns it into a trustworthy transcript and structured notes, and connects that material to the student's existing study system — including Anki decks imported or synced into Nemesis.

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
flashcards + existing imported Anki cards
      ↓
organize / connect / review in Nemesis
      ↓
return for the next class
```

Nemesis is field-agnostic. The same capture → understand → remember loop must work for law, engineering, history, nursing, computer science, pharmacy, art history and trades.

> **Primary product test:** does this help a student capture a real class, recover what mattered later, and connect it to what they are already studying?

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

### 3. Cards are part of the workspace, not an export-only feature

Nemesis can generate editable Basic/Cloze card drafts from lecture material, but it should also respect the large study library many students already have in Anki.

**Anki integration is primarily inbound:** a student can import or connect existing Anki decks so those cards appear inside Nemesis alongside lectures, notes and other study artifacts. Nemesis can then search them, organize them, attach them to courses/lectures, explain them and optionally review them.

For Anki-originated cards, Anki remains the source of truth for original card content and scheduling in the MVP. Nemesis adds its own metadata and relationships without silently rewriting the Anki collection.

See [`docs/anki-sync.md`](docs/anki-sync.md).

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
2. **Preserve provenance.** Notes, answers and generated cards should link back to the transcript/document evidence that produced them.
3. **Meet students where their study history already lives.** Existing Anki decks should be importable/syncable into Nemesis rather than forcing a reset.
4. **Do not destructively rewrite external systems.** Inbound Anki sync is read-only against Anki for the MVP.
5. **Draft before review.** AI-generated flashcards are editable drafts until the learner approves them.
6. **Provider-agnostic infrastructure.** Speech and language model vendors can change; product contracts should not.
7. **Normal use should feel unlimited.** Cost controls belong behind fair-use, abuse prevention, priority tiers and provider routing rather than brittle daily class limits.
8. **Refusing beats guessing.** A missed extraction costs coverage. A fabricated fact teaches somebody something false and may later become a flashcard.
9. **Field-agnostic by construction.** Prefer structural signals over subject-specific keyword rules.

The detailed product definition is in [`docs/product-north-star.md`](docs/product-north-star.md).

---

## Architecture, in the order data moves

```text
 recording / device transcript / file / paste / Anki import
      ↓
 transcription + parsing + external-card ingestion
      ↓
 DocumentModel / timestamped transcript / card source model
      ↓
 SourceContext + course/card relationships
      ↓
 KnowledgeObject             what the source teaches
      ↓
 notes / search / Q&A / card library
      ↓
 learner evidence + Nemesis-only enrichment
      ↓
 review / Canvas interaction / cross-source retrieval
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
apps/nemesis-desktop/    desktop capture shell + local Anki bridge
packages/shared/         document/transcript/card contracts shared by clients
packages/db/             generated Supabase types
supabase/migrations/     schema — sources, knowledge, evidence, recordings, usage
supabase/functions/      edge functions — transcribe, llm, search, indexing, media
docs/                    product and architecture references
```

## Documents that govern the build

| Document | What it decides |
|---|---|
| [`docs/product-north-star.md`](docs/product-north-star.md) | **The product north star.** Lecture memory, existing study-library ingestion, default user loop, scope and sequencing. |
| [`docs/anki-sync.md`](docs/anki-sync.md) | **Anki integration contract.** Anki → Nemesis import/sync, identity, reconciliation and source-of-truth rules. |
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
- Imported external cards preserve source identity and original fields.
- Measure real transcription hours, cost per active user, Anki-import activation and retention before loosening or tightening plan limits.

---

## Naming

Earlier names in this repository's history — *PharmaBro*, *PharmaOrb* — are dead. Domain-specific data sources that remain are optional capabilities, not the product identity.
