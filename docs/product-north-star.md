# Nemesis product north star — AI lecture memory + existing study library

**Status:** product direction
**Owner direction:** 2026-09-13

## One sentence

Nemesis is the AI lecture memory and study workspace for students: record or import a class, recover a trustworthy transcript and structured notes, then connect that material to both Nemesis-generated study artifacts and the student's existing Anki decks.

A useful shorthand is **"Granola for students, extended into a study workspace."** This is a product analogy, not a requirement to copy Granola's interface or architecture.

## The problem

Students generate hours of valuable spoken information every week, but the information is temporary. A recording by itself is difficult to revisit; a raw transcript is long; manually written notes are incomplete; AI summaries can hide provenance; and serious students may already have hundreds or thousands of flashcards living separately in Anki.

Nemesis should collapse those disconnected systems into one searchable learning workspace without asking the student to abandon the study history they already built.

## Default user loop

1. **Capture** — start a class recording on phone, desktop or web, or import existing audio/transcript.
2. **Transcribe** — create a timestamped transcript with speaker information when available.
3. **Structure** — combine transcript evidence with slides/readings when present to produce navigable lecture notes.
4. **Retrieve** — search or ask questions across the lecture, course or semester with links back to source evidence.
5. **Connect existing study material** — import/sync selected Anki decks into the Nemesis card library.
6. **Generate where useful** — propose new Basic/Cloze drafts from lecture material instead of forcing all cards to originate in Anki or Nemesis.
7. **Organize and study** — attach cards to courses/lectures, explain them, relate them to notes, and optionally review them in Nemesis.
8. **Return** — the next lecture and the student's existing card history remain part of the same workspace.

The product should make this path obvious without requiring Canvas.

## What is core

### Lecture capture

Recording must be a first-class object with lifecycle, status, duration, course association and provenance. The UI should make starting a class recording lower-friction than creating a blank note.

The server chooses transcription providers. Clients send recordings/transcripts against a stable Nemesis contract and should not care whether xAI, AssemblyAI or another provider handles a job.

### Durable lecture memory

A lecture should resolve into a durable object with:

- audio metadata and retention state
- timestamped transcript
- speaker segments when available
- structured notes
- source attachments such as slides/PDFs
- extracted concepts/knowledge objects
- searchable chunks/embeddings
- generated questions/cards and their source anchors

Audio retention policy can be shorter than transcript/note retention. The important durable asset is the student's searchable course memory.

### Existing card-library ingestion

Anki is an important source of pre-existing learner material.

Nemesis should support:

- `.apkg` deck import
- `.colpkg` collection import where appropriate
- desktop-connected Anki → Nemesis sync for selected decks
- preservation of custom note fields, note/card identity, tags and deck hierarchy
- scheduling/review metadata ingestion when the source supplies it
- Nemesis-only enrichment that survives future Anki refreshes

For Anki-originated cards, Anki remains the source of truth for original content and scheduling in the MVP. Connected sync is read-only against Anki until explicit bidirectional conflict handling exists.

See `docs/anki-sync.md`.

### Grounded notes and answers

Every generated claim that matters for learning should be recoverable to evidence: transcript timestamps, slide/page anchors or other attached source locations. When grounding is uncertain, the product should say so rather than invent a clean answer.

### Flashcards

Cards can come from two places:

1. **Nemesis-native cards** generated or written inside Nemesis.
2. **External Anki-originated cards** imported/synced into Nemesis.

Nemesis-native AI cards are drafts until approved. Imported Anki cards should not be treated as AI drafts; they are existing learner artifacts.

Initial Nemesis-native types:

- **Basic** — one prompt and one answer
- **Cloze** — one or more deletions in a minimal statement

External Anki cards may use arbitrary custom note types, so preserve their source fields and rendered forms rather than reducing everything to Basic/Cloze.

### Review interoperability

Nemesis should have its own review surface so the product is complete without Anki. But importing Anki does not imply that Nemesis immediately replaces Anki scheduling.

Anki scheduling state and Nemesis mastery/evidence are separate systems and must not be conflated.

## What becomes supporting infrastructure

### Documents

PDF, slide, document and pasted-note ingestion remain important. Their job is to improve lecture understanding and provide additional source evidence.

### Canvas

Canvas remains a deep-study and diagnostic surface for relationships, active recall and spatial exploration. It is not the default landing concept or the definition of the product.

### Calendar

Calendar remains useful for deadlines and planning recovered from real coursework. It supports the learning loop but is not the acquisition wedge.

### Knowledge graph and learner evidence

The existing knowledge-object and append-only learner-evidence architecture remains strategically valuable. It can power deduplication, mastery, adaptive questions and deeper review without needing to appear in the first-run explanation.

## Product navigation target

```text
Home
Classes
  Course
    Lecture
      Notes
      Transcript
      Cards
Cards
  Nemesis cards
  Imported Anki decks
Review
Calendar
Search / Ask
Canvas             optional deep study
```

Exact navigation is a design decision, but the hierarchy should reflect the core loop rather than force every artifact through Canvas.

## Transcription product policy

The user-facing promise should make normal academic use feel unmetered. Do not use a rigid per-day recording limit as the primary control because student schedules are lumpy.

Use these controls instead:

- monthly usage accounting internally
- plan-level priority processing where needed
- reasonable-use protection against automated bulk transcription, account sharing and 24/7 non-academic ingestion
- separate accounting for higher-cost realtime/live transcription if economics require it
- provider routing by quality, latency and effective cost

Do not hard-code current vendor pricing into product contracts. Measure actual cohort behavior before marketing or changing a literal unlimited entitlement.

## Business-model implication

Transcription is the acquisition/input layer, not the whole value proposition. Existing study-library import makes switching costs lower and time-to-value faster.

The subscription is justified by the persistent workflow:

**capture → memory → retrieval → existing cards + new cards → connected study workspace**.

Primary economic/product metrics:

- transcription hours per active user/month
- speech cost per active and paid user
- downstream LLM cost per lecture/user
- percentage of lectures revisited/searched
- Anki import/connect activation
- imported-card engagement after 7/30 days
- percent of imported cards linked to courses/lectures or enriched in Nemesis
- paid conversion
- D30/D90 retention
- gross margin by usage percentile, especially P90/P95/P99

## Product sequencing

### Phase 1 — Capture and memory

- reliable phone/desktop/web recording
- background-safe upload/recovery
- timestamped transcription
- lecture page with transcript + generated structured notes
- course-level search/Q&A

### Phase 2 — Existing card library

- generic external-card source model
- `.apkg` import
- preserve Anki deck/tag/note-type identity
- imported cards visible on web/mobile
- connect imported cards to courses/lectures

### Phase 3 — Continuous Anki sync

- desktop AnkiConnect detection
- deck picker
- Anki → Nemesis initial pull
- incremental change reconciliation
- source scheduling metadata where available
- safe handling of removed/moved cards

### Phase 4 — Native cards and review

- generate Basic and Cloze drafts from lectures
- source timestamp/page on every generated card
- approve/edit/reject batch workflow
- Nemesis review
- relationships between imported Anki cards and lecture-derived concepts

### Phase 5 — Intelligence

- lecture + slide alignment
- cross-lecture concept memory
- learner evidence feeding card/question selection
- adaptive review and Canvas diagnostics

### Phase 6 — Collaboration

Only after the single-student loop is strong: shared classes, collaborative notes/decks, study rooms and instructor/community course artifacts.

## Non-goals for the core product

- becoming a generic enterprise meeting assistant
- becoming only a raw transcription utility
- forcing students to abandon existing Anki decks
- treating Anki primarily as an export target
- writing back to Anki before conflict handling exists
- conflating Anki scheduling with Nemesis mastery
- requiring Canvas to understand the product
- binding the product contract to one transcription/LLM vendor
- subject-specific product identity

## Decision rule

When choosing between two roadmap items, prefer the one that most directly improves one of these:

**capture reliability, source trust, retrieval, Anki import friction, study-library usefulness, card quality, review retention.**

Everything else must justify itself relative to that loop.
