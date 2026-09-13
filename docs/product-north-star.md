# Nemesis product north star — AI lecture memory

**Status:** product direction
**Owner direction:** 2026-09-12

## One sentence

Nemesis is the AI lecture memory for students: record or import a class, recover a trustworthy transcript and structured notes, then turn the material worth remembering into source-linked flashcards for review in Nemesis or Anki.

A useful shorthand is **"Granola for students, extended through the learning loop."** This is a product analogy, not a requirement to copy Granola's interface or architecture.

## The problem

Students generate hours of valuable spoken information every week, but the information is temporary. A recording by itself is difficult to revisit; a raw transcript is long; manually written notes are incomplete; AI summaries can hide provenance; and making good flashcards manually adds another workflow.

Nemesis should collapse those steps into one continuous memory pipeline.

## Default user loop

1. **Capture** — start a class recording on phone, desktop or web, or import existing audio/transcript.
2. **Transcribe** — create a timestamped transcript with speaker information when available.
3. **Structure** — combine transcript evidence with slides/readings when present to produce navigable lecture notes.
4. **Retrieve** — search or ask questions across the lecture, course or semester with links back to source evidence.
5. **Generate** — propose atomic Basic/Cloze flashcard drafts from material worth retrieving later.
6. **Approve** — learner edits, accepts or rejects cards before they enter review.
7. **Review** — study inside Nemesis or sync approved cards to Anki.
8. **Return** — the next lecture joins the same course memory instead of starting from zero.

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

### Grounded notes and answers

Every generated claim that matters for learning should be recoverable to evidence: transcript timestamps, slide/page anchors or other attached source locations. When grounding is uncertain, the product should say so rather than invent a clean answer.

### Flashcard drafts

Cards are generated as drafts. Creation does not equal approval.

Initial card types:

- **Basic** — one prompt and one answer
- **Cloze** — one or more deletions in a minimal statement

Each card stores source provenance and stable Nemesis identity. Avoid duplicate cards across repeated lectures when the underlying knowledge is effectively the same; when uncertain, surface the potential duplicate instead of silently merging.

### Review interoperability

Nemesis should have its own review surface so the product is complete without third-party software. Anki sync remains first-class because many serious students already have an established review habit there.

See `docs/anki-sync.md`.

## What becomes supporting infrastructure

### Documents

PDF, slide, document and pasted-note ingestion remain important. Their job is to improve lecture understanding and provide additional source evidence. They are no longer the easiest way to explain Nemesis to a new user.

### Canvas

Canvas remains a deep-study and diagnostic surface for relationships, active recall and spatial exploration. It is not the default landing concept or the definition of the product.

### Calendar

Calendar remains useful for deadlines and planning recovered from real coursework. It supports the learning loop but is not the acquisition wedge.

### Knowledge graph and learner evidence

The existing knowledge-object and append-only learner-evidence architecture remains strategically valuable. It can power deduplication, mastery, adaptive questions and deeper review without needing to appear in the first-run explanation.

## Product navigation target

The default information hierarchy should trend toward:

```text
Home
Classes
  Course
    Lecture
      Notes
      Transcript
      Cards
Cards / Review
Calendar
Search / Ask
Canvas             optional deep study
```

Exact navigation is a design decision, but the hierarchy should reflect the core loop rather than force every artifact through Canvas.

## Transcription product policy

The user-facing promise should make normal academic use feel unmetered. Do not use a rigid per-day recording limit as the primary control because student schedules are lumpy: one day can contain five hours of class and another none.

Use these controls instead:

- monthly usage accounting internally
- plan-level priority processing where needed
- reasonable-use protection against automated bulk transcription, account sharing and 24/7 non-academic ingestion
- separate accounting for higher-cost realtime/live transcription if economics require it
- provider routing by quality, latency and effective cost

Do not hard-code current vendor pricing into product contracts. Measure actual cohort behavior before marketing or changing a literal unlimited entitlement.

## Business-model implication

Transcription is the acquisition/input layer, not the whole value proposition. The subscription is justified by the persistent workflow created after transcription:

**capture → memory → retrieval → cards → review**.

Primary economic metrics:

- transcription hours per active user/month
- speech cost per active and paid user
- downstream LLM cost per lecture/user
- card generation acceptance rate
- percentage of lectures revisited/searched
- Anki-sync activation and retained use
- paid conversion
- D30/D90 retention
- gross margin by usage percentile, especially P90/P95/P99

Do not optimize only for average cost; extreme users determine whether an unlimited promise is safe.

## Product sequencing

### Phase 1 — Capture and memory

- reliable phone/desktop/web recording
- background-safe upload/recovery
- timestamped transcription
- lecture page with transcript + generated structured notes
- course-level search/Q&A

### Phase 2 — Cards

- generate Basic and Cloze drafts
- source timestamp/page on every card
- approve/edit/reject batch workflow
- deduplication
- Nemesis review

### Phase 3 — Anki bridge

- stable card identity and sync state
- desktop Anki integration
- deck mapping and tags
- create/update approved notes
- fallback export

### Phase 4 — Intelligence

- lecture + slide alignment
- cross-lecture concept memory
- learner evidence feeding card/question selection
- adaptive review and Canvas diagnostics

### Phase 5 — Collaboration

Only after the single-student loop is strong: shared classes, collaborative notes/decks, study rooms and instructor/community course artifacts.

## Non-goals for the core product

- becoming a generic enterprise meeting assistant
- becoming only a raw transcription utility
- generating huge flashcard sets without learner approval
- requiring Anki to use Nemesis
- replacing the product with Canvas complexity
- binding the product contract to one transcription/LLM vendor
- subject-specific product identity

## Decision rule

When choosing between two roadmap items, prefer the one that most directly improves one of these:

**capture reliability, source trust, retrieval, card quality, approval friction, review retention.**

Everything else must justify itself relative to that loop.
