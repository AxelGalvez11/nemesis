# Real usage pass — 2026-08-06

Owner ran a full pass over the product and reported 28 problems. This file tracks every
one of them from report to verified fix.

## Ground rules for this pass (set by the owner)

1. **Every item is unverified until reproduced in the running app.** A report is a
   symptom, not a diagnosis. Nothing gets a root cause from reading code alone.
2. **No single large PR.** Work lands in small PRs, one issue or one tightly related
   group at a time.
3. **Typecheck, unit tests and code inspection do not count as "fixed."** Every fix
   needs the narrowest relevant automated regression test *and* a real browser
   acceptance test.
4. **Persistence bugs must be tested three ways**: refresh, leave the page and come
   back, and a fresh session.
5. **No quiet reinterpretation.** Where the current data model makes an acceptance
   criterion unsafe or unusually expensive, the tradeoff gets written down and raised
   before behaviour changes.

## Order of work

| Order | Group | Issues |
|---|---|---|
| 1 | Study correctness and lost progress | S1–S7 |
| 2 | Document ingestion and agent routing | D1–D3 |
| 3 | Library provenance and organization | L1–L5 |
| 4 | Chat and recording experience | C1–C4 |
| 5 | Remaining Library polish and Chill | U1–U6 |

Note on grouping: the owner listed the chat and recording items under the heading
"Upload and agent behavior", but the stated order of work puts chat/recording fifth.
They are tracked as group 4 (C1–C4) so the sequence matches the instruction. Likewise
"Sources folder looks different" was listed with the Library generation issues but is
pure presentation, so it is tracked in group 5 as U5.

## Reporting template

Every PR out of this pass reports, in this order:

1. Exact reproduction before the fix
2. Root cause
3. Files and components changed
4. Automated regression tests added
5. Browser acceptance result
6. Production deployment status
7. Anything still unverified or blocked

---

## Status board

Status values: `not started` · `reproducing` · `root cause found` · `in PR` · `merged`
· `verified live` · `blocked` · `needs owner decision`

| ID | Issue | Group | Status |
|---|---|---|---|
| S1 | Flashcard session position is not saved | 1 | in PR ([#441](https://github.com/AxelGalvez11/nemesis/pull/441)) |
| S2 | Again/Hard do not affect review order | 1 | **verified live** (ordering half) |
| S3 | Deck not filed into its course folder | 1 | in PR (#446) |
| S4 | Test position is not saved | 1 | not started |
| S5 | Undo only works once | 1 | in PR ([#441](https://github.com/AxelGalvez11/nemesis/pull/441)) |
| S6 | Cloze cards treated as basic cards | 1 | not started |
| S7 | Talk to Nemesis about the current deck (new) | 1 | not started |
| D1 | Some pages were not readable | 2 | reproducing |
| D4 | Slide deck truncated (owner reported slide 46; really 57) | 2 | in PR ([#443](https://github.com/AxelGalvez11/nemesis/pull/443)) |
| D5 | Private reasoning leaks into the visible answer | 2 | in PR, behaviour unverified ([#444](https://github.com/AxelGalvez11/nemesis/pull/444)) |
| D2 | "Add cards" did not target the deck being discussed | 2 | not started |
| D3 | Web search fired on a deck-editing request | 2 | not started |
| L1 | Generated notes not cited at the claim | 3 | not started |
| L2 | Notes and sources not organized into a course | 3 | not started |
| L3 | Rewrite a note with Nemesis (new) | 3 | not started |
| L4 | Important generated points not bolded | 3 | not started |
| L5 | Generated notes omit lecture images | 3 | not started |
| L6 | Only one source citation appeared | 3 | not started |
| C1 | Recording missing from the chat sidebar | 4 | not started |
| C2 | User message bubble off ChatGPT parity | 4 | not started |
| C3 | Attachments serialized into visible prompt text | 4 | not started |
| C4 | Chat scrolls down on its own | 4 | not started |
| U1 | Library breadcrumb not clickable | 5 | not started |
| U2 | Underline and highlight missing | 5 | not started |
| U3 | Link-to-note needs search and new-note | 5 | not started |
| U4 | "On this page" should collapse | 5 | not started |
| U5 | Sources folder styled unlike other folders | 5 | not started |
| U6 | Chill Groups serves no fresh puzzle | 5 | not started |
| U7 | The word "Library" renders twice, overlapping (reported mid-pass) | 5 | in PR ([#440](https://github.com/AxelGalvez11/nemesis/pull/440)) |

---

## Group 1 — Study correctness and lost progress

### S1 · Flashcard session position is not saved

- **Reported**: start a deck, answer several cards, leave or refresh, reopen — the
  session restarts or jumps unpredictably.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: _pending_
- **Browser/production acceptance**: real Chrome, owner's session, on a real deck.
  Must cover refresh, route navigation away and back, sign out and back in, and a
  second client if the state ends up server-backed.
- **Status**: not started

Acceptance criteria carried from the report: resume the same unfinished session rather
than restarting; persist logical session state, not just a visible card index;
scheduling already written during the session stays intact; a *completed* session
starts a fresh appropriate review session instead of reopening the last card.

### S2 · "Again" and "Hard" do not affect review order properly

- **Reported**: grading does not appear to change what comes back or when.
- **Reproduction result**: **REPRODUCED — from the owner's own production review log,
  not a fixture.** 129 real grades across real decks:

  | Grade pressed | Times | Average interval scheduled |
  |---|---|---|
  | Again | 19 | 1.00 days |
  | Good | 77 | 1.26 days |
  | Hard | 33 | 1.55 days |

  Hard sent cards **further away** than Good. Confirmed against the deployed
  `grade_study_card`: on a new card it returned again → 1 day, hard → 2, good → 1,
  easy → 4. Replaying the old rules over 330 reachable card states shows **90 of them
  (27%) violate strict ordering**.
- **Root cause**: fixed-multiplier scheduling with three defects. (1) The
  `repetitions = 0` branch returned 1 day for Good, identical to Again, while Hard's
  formula ignored `repetitions` and returned 2 — an inversion, not a weakness. (2)
  `lapses` was written on every failure and read by nothing. (3) The smallest
  expressible interval was one day, because the function always called
  `make_interval(days => …)`.
- **Proposed change**: replace the rule set. Ordering is enforced by construction —
  good is built as "at least a day beyond hard", easy as "beyond good" — so no
  combination of interval, ease and lapses can tie. Lapses now damp growth (2.5×
  falling to a 1.3× floor). **No schema change**: `due_at` is already a timestamp, so
  scheduling in minutes needed only `make_interval(mins => …)`, with `interval_days`
  retained as the days-scale memory that future growth multiplies. Failed cards return
  in 10 minutes and survive a refresh.
- **Automated test**: `study-scheduler.test.ts` — 14 tests including a 330-state sweep
  asserting strict ordering and no ties, a controlled-clock test turning offsets into
  real due dates, per-state coverage of new/learning/review/relearning, lapse damping,
  and a contract test asserting the Postgres function still carries the same constants
  as the TypeScript mirror.
- **Browser/production acceptance**: verified in a real browser on a review card —
  Again → "this session", Hard → "2 days", Good → "3 days", Easy → "4 days", strictly
  increasing. The four buttons previously carried hard-coded hints ("1 · soon",
  "2 · slower", "3 · normal", "4 · longer") which were keyboard shortcut numbers dressed
  up as scheduling information; they now show the real predicted interval per card.
- **Production acceptance — DONE 2026-08-06.** Owner approved applying the replacement
  function; it is live. The deployed `grade_study_card` was then exercised directly on
  all four card states, as the owner's own user, and every value matches the TypeScript
  mirror exactly:

  | Card state | Again | Hard | Good | Easy |
  |---|---|---|---|---|
  | New (interval 0, 0 reps) | 10 min | 60 min | 1 day | 4 days |
  | Short interval, 6 lapses | 10 min | 2 days | 3 days | 4 days |
  | Review, no lapses | 10 min | 12 days | **25 days** | 35 days |
  | Review, same interval, 6 lapses | 10 min | 12 days | **16 days** | 26 days |

  Strictly increasing in every row. The last two rows are the proof that `lapses` stopped
  being dead data: identical interval, six failures, and Good drops from 25 days to 16.
  A lapse is recorded against the graduated cards and not against the new one, as
  intended.

  Test data used a scratch deck created for this run
  (`b6ec9624-4ce3-4116-928a-f436ff8f2289`, four cards, all ids recorded before use) and
  was removed afterwards **by id** — never by name, date or `updated_at`. Verified after
  cleanup: review-log count back to exactly 129, zero scratch rows, no real deck or card
  touched.

  Rollback kept at `docs/rollback/20260806160000_study_scheduler_ordering_ROLLBACK.sql`
  (the previous definition verbatim, md5 `095aa19a4f90a8924cde9a4965392ad0`).
- **Status**: verified live — ordering half complete. Note the database half is live now
  while the button labels ship with the PR; the old labels are merely stale, and grading
  itself is already correct.

**Pre-reproduction finding (code and database inspection only — not yet reproduced in
the app, and not being treated as confirmed).** The report asks for an audit of "the
complete FSRS path". There is no FSRS path to audit. Grading is a single Postgres
function, `grade_study_card`, and it is a fixed-multiplier scheme:

| Grade | Next interval |
|---|---|
| Again | 1 day, always |
| Hard | `max(1, ceil(max(interval, 1) × 1.2))` |
| Good | new card → 1 day; otherwise `max(2, ceil(interval × 2.5))` |
| Easy | new card → 4 days; otherwise `max(4, ceil(interval × 3.5))` |

Three consequences fall straight out of that table, all of which need reproducing:

- On a **new card** (the state a student spends their first session in), Again and Good
  both schedule exactly 1 day and both set repetitions to 1 — pressing Again is
  indistinguishable from pressing Good. Hard schedules 2 days, which is *later* than
  Good. That is the reported symptom, and it is inverted rather than merely weak.
- `lapses` is incremented and then never read by anything. The failure signal is
  recorded and discarded.
- The smallest expressible interval is **one day** — `interval_days` is an integer and
  the function calls `make_interval(days => …)`. Nothing sub-day can be scheduled, so
  "Again brings the card back soon" cannot currently be true across sessions. The
  in-session retry list papers over this while the dialog stays open.

`apps/mobile/src/lib/study-session.ts` carries a comment reading "the Mac owns real
FSRS". No such implementation exists in this repository; the comment is wrong and
should go with the fix.

**Scope split — needs an owner decision before group 1 finishes.** Sorting the reported
acceptance criteria by what they actually cost:

*Satisfiable in the current day-granularity model, no migration:*
- Again sooner than Hard, Hard sooner than Good under equivalent conditions
- The interface shows accurate next-review intervals
- Lapses influence future scheduling instead of being dead data

*Requires a schema change:*
- "Learning and relearning cards return when their scheduled step becomes due"
- "Due learning/relearning cards must not be dropped when the queue is regenerated"

Those last two need a persisted learning state and sub-day due times. `due_at` is
already a timestamp, so the smaller move is a `state` plus `step_index` column and
minute-granularity intervals — not a full FSRS port. The ordering half will be fixed
first, so the migration can be proposed with evidence rather than as a guess. The
report explicitly rules out solving this by re-inserting failed cards more often, so
the existing in-session retry list is not an acceptable answer.

### S3 · Deck was not automatically placed in its course folder

- **Reported**: a deck generated from lecture material did not land in the right
  Study folder for that course.
- **Reproduction result**: reproduced, and sharper than reported. **One turn, one file,
  three different folders.** 08-06 15:01:51, "make notes, flashcards and test" over
  `Pharmacogenomics PHCY 2109 2026 - Lectures 1 and 2 .pptx`. At 15:01:55 the upload
  lane filed the file under the student's own `Pharmacy`. The note lane wrote to
  `Pharmacy/Lectures` ✅. At 15:03:43 the deck lane created
  `Pharmacology::Pharmacogenomics (Lectures 1-2)` and the test went to the same
  `Pharmacology` ❌ — a folder the student never made, invented 108 seconds after the
  right answer was already in the database. The second real deck that day
  (`Physiology and Pathophysiology of Diabetes Mellitus`, 13:17) got no folder at all.
- **Root cause**: **not the course matcher** — it was asked an impossible question. The
  study lanes had only the material's own words, and a lecture about pharmacogenomics
  does not contain the word "pharmacy". Courses are known by code (`PHCY 2105`) or by a
  folder the student made (`Pharmacy`); lectures are titled by topic, so there is no
  overlap to match on. Two mechanisms: (a) nothing asked where the document lives —
  `add_flashcards` gets a name and cards, never the source, so `library_sources
  .folder_path` was never read; (b) `deckNameForNewDeck` returned early on any name
  containing `::` ("never double-prefix"), and the invented `Pharmacology::` arrived as
  part of the name, so that rule is exactly what waved it through.
- **Proposed change**: shipped in PR #446. A study item built from an attached document
  goes where that document already lives. Where a document lives is a *fact* about the
  workspace, not an inference from prose — which is why it beats everything else here
  and stays field-agnostic (a contracts PDF under "Contracts" makes a "Contracts" deck
  with nothing knowing what a contract is). `sourceCourseFolder` takes the top segment
  (`Pharmacy/Lectures` → the course is Pharmacy); Inbox and Nemesis are not courses;
  disagreeing attachments are a tie and a tie is a refusal. The folder is resolved once
  per turn, before the model runs, and outranks a folder the model wrote into the name
  — leaf kept, invented parent dropped, never nested.
- **Automated test**: 13 new — 7 filing rules incl. both real shapes, 3 wire round trips
  *through* `fitAttachmentBlocks` (a hand-typed header would keep passing after the
  wording changed while the real reader found nothing), 2 guards that filing without a
  source is byte-identical to before, 1 that both lanes still receive the source folder.
  Web 1256 pass, shared 33 pass under node and Deno, tsc clean.
- **Browser/production acceptance**: every deterministic link verified three ways.
  Replay on real production values: Pharmacogenomics deck `Pharmacology::…` →
  `Pharmacy::Pharmacogenomics (Lectures 1-2)`, test `Pharmacology` → `Pharmacy`.
  Real browser: ids read back out of the wire, the lookup issues exactly
  `library_sources?select=folder_path&id=in.(9a3360d1-…)&deleted=eq.false`, and that
  row's value produces the right deck name. Production: that query returns `Pharmacy`.
  **Not proven by a live model turn** — nothing fires until the model calls
  `add_flashcards`, which is already observed in production because it is how the bug
  happened, but I did not run one end to end.
- **Status**: in PR (#446)

Carried criteria: inherit the course from material already associated with one; resolve
on stable course and folder IDs rather than fuzzy title matching; file automatically
when there is one confident match; when ambiguous, use an explicit unfiled state or ask
— never guess silently. Shares its resolution path with L2 and must use the same logic.

Against those criteria: "inherit from material already associated with one" and "stable
IDs, not fuzzy title matching" are now met **for the attachment path** — a source id
resolves to a stored folder, no titles compared. A deck made with no attachment still
falls back to the word matcher, because there is no id to follow. Two things the fix
does **not** do, both deliberate: it never moves decks that already exist (scope rule at
the top of `course-filing.ts` — a bulk reorganise of hand-arranged material is
indistinguishable from data loss), and it does not **ask** when ambiguous; it leaves the
deck at the top level, honestly unfiled, which is the existing convention. The diabetes
deck is the ambiguous case and stays unfiled correctly: its source is in `Inbox` and no
course in the system teaches diabetes physiology — the assistant said so itself at 13:08
that day. **Open question for the owner**: `Pharmacy` (Library) and `Pharmacology`
(Study) are now consistent but neither is a course. If Study should be organised by
course code, that is a naming decision, not a filing one.

### S4 · Test position is not saved

- **Reported**: partially complete a generated test, leave, reopen — progress is gone.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: _pending_
- **Browser/production acceptance**: refresh, navigate away and back, reopen later.
- **Status**: not started

Carried criteria: restore question position, existing answers, submitted state, score
state and remaining questions; **do not reveal correct answers for questions that were
never submitted**; restart stays a separate deliberate action.

### S5 · Undo only works once

- **Reported**: only the most recent rating can be undone.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: _pending_
- **Browser/production acceptance**: undo several consecutive ratings in a real session.
- **Status**: not started

Carried criteria: session-scoped undo history rather than a single previous action; each
undo restores scheduling values, card state, queue position and the visible card; undo
must not corrupt review history or create duplicate review records; behaviour across a
refresh mid-session must be defined and tested.

### S6 · Cloze cards are treated as basic cards

- **Reported**: cloze cards behave like front/back cards.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: round trip through generation, storage, serialization and render.
- **Browser/production acceptance**: review a real cloze deck.
- **Status**: not started

Carried criteria: cloze type survives; `{{c1::answer}}`, multiple deletions, hints and
multiple ordinals all render; only the active deletion is hidden during review; no
destructive conversion of existing valid cloze cards.

### S7 · Talk to Nemesis about the current deck (new capability)

- **Reported**: missing. Owner wants a deck-scoped action on the Study page.
- **Reproduction result**: n/a — new feature
- **Root cause**: n/a
- **Proposed change**: _pending, and dependent on D2's context plumbing_
- **Automated test**: _pending_
- **Browser/production acceptance**: run each named instruction against a real deck.
- **Status**: not started

Carried criteria: opens chat carrying a stable deck ID, course context and source IDs as
structured context; supports simplify / more clinical examples / remove duplicates /
harder / custom; modifies **the current deck**, never a new or unrelated one; keeps
scheduling history for unchanged cards; states a policy for rewritten cards rather than
silently resetting a mature deck; reports what was added, changed, merged and removed.

---

## Group 2 — Document ingestion and agent routing

### D1 · Some pages were not readable

- **Reported**: pages of an uploaded document did not come through.
- **Reproduction result**: _not started — needs the original affected document_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: retrieval must prove content from the previously missing pages can
  be found and cited — not merely that parsing completed.
- **Browser/production acceptance**: upload the real document and cite from a page that
  previously failed.
- **Status**: not started

Carried criteria: compare expected page count against pages successfully processed;
track status per page; never mark a document fully processed when pages were skipped;
tell the user exactly which pages failed.

**Known adjacent state**: PR #436 shipped scanned-page *detection* only. Optical
character recognition is not built, and is blocked on an owner decision — the candidate
library downloads its engine and per-language data from a third-party CDN, which would
be this product's first such request, at tens of megabytes, with no reliable way to
infer which language to fetch. If D1 turns out to need OCR, that decision surfaces
rather than getting made quietly.

### D4 · A slide deck was silently truncated at slide 46

- **Reported**: owner screenshot, 2026-08-06 10:02, live in production. Attaching
  `Pharmacogenomics PHCY 2109 2026…` (slides) and asking for notes produced an answer
  that opens *"The file is truncated at slide 46 (the discussion of poor vs ultrarapid
  metabolizers and prodrugs), but I have all the substantive lecture content up to that
  point"* and later *"ending mid-sentence on the prodrug/active drug concept"*.
- **Reproduction result**: _in progress — the owner's own file is the fixture_
- **Root cause**: _not started. The extracted text ends mid-sentence, which points at a
  character or token ceiling on the extraction or the attachment payload rather than a
  parse failure — nothing reported an error, and the model could see exactly where it
  stopped._
- **Proposed change**: _pending reproduction_
- **Automated test**: the owner's real deck, asserting every slide is represented.
- **Browser/production acceptance**: re-attach the same file and generate notes that
  cite content from beyond slide 46.
- **Status**: reproducing

This is the same failure family as D1 and is being worked with it. It is materially
worse than "some pages were not readable": the truncation was silent, the student was
told about it only because the model happened to notice, and the notes, flashcards and
test generated from it are all missing the end of the lecture.

### D5 · Private reasoning is printed to the student as the answer

- **Reported**: same screenshot. The visible reply contains *"I do need to note the
  truncation honestly"*, *"Let me check what's in the transcript"*, *"Actually, the
  source material I was given is…"* and — addressed to nobody the student can see —
  ***"I'll note this to the student."*** The student IS the reader.
- **Reproduction result**: _in progress_
- **Root cause**: _not started. Candidates: reasoning content being concatenated into
  the visible message rather than kept in the thinking channel; or a prompt that invites
  the model to deliberate in the open. The phrase "I'll note this to the student" is
  second-person-absent, so it reads as planning text, not as prose written for a reader._
- **Proposed change**: _pending reproduction_
- **Automated test**: assert visible assistant text never contains planning phrases that
  refer to the reader in the third person.
- **Browser/production acceptance**: same prompt, same file, clean answer.
- **Status**: reproducing

### D2 · "Add cards" did not target the deck being discussed

- **Reported**: the request modified the wrong deck.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: follow-ups — "add five more", "make those harder", "put them in
  the same deck".
- **Browser/production acceptance**: real deck, real conversation.
- **Status**: not started

Carried criteria: conversation and page context carry stable deck, note, source and
course IDs; an unambiguous active deck wins; an explicitly named deck resolves; genuine
ambiguity asks instead of guessing; confirm the count added and link the deck.

### D3 · Nemesis ran a web search when asked to add cards

- **Reported**: a deck-editing request triggered outside search.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: assert zero web-search calls for ordinary deck-editing requests.
- **Browser/production acceptance**: watch the network and tool calls on a real request.
- **Status**: not started

Carried criteria: deck/note/lecture/upload requests use internal retrieval and deck
tools; web search only on an explicit ask for outside or current information, or when
internal material is genuinely insufficient — and if outside information would
materially change the deck, ask first.

---

## Group 3 — Library provenance, generation and organization

### L1 · Generated notes are not adequately cited to their source

- **Reported**: citation appears once for a whole note rather than at each claim.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending reproduction_
- **Automated test**: a multi-page source where facts from different pages produce
  distinct citations.
- **Browser/production acceptance**: generate from a real lecture, click through
  citations to the right page.
- **Status**: not started

Carried criteria: citations attach at the claim, bullet, paragraph or section; stable
provenance to source documents; precise page/slide/section/timestamp where available; the
same source cited repeatedly where different claims rely on it; clicking opens the source
at the right place; rewriting or simplifying preserves valid citations; **never fabricate
a precise locator that extraction did not provide**.

**Known adjacent state**: the citation *writer* was deferred in #437, and recording
transcripts carry no timestamps, so transcript-locator citations may be unavailable
rather than merely missing.

### L2 · Notes and sources were not automatically organized into a course

- **Reported**: generated material did not land under its course.
- **Reproduction result**: _not started_
- **Root cause**: _not started_
- **Proposed change**: _pending — must share one resolution path with S3_
- **Automated test**: _pending_
- **Browser/production acceptance**: real upload, real course.
- **Status**: not started

Carried criteria: one centralized course resolution used by uploads, notes, decks and
chat actions; stable course ID; generated note stays linked to its source even when
displayed in different subfolders; existing context and structured metadata outrank
filename similarity; ambiguous material never silently lands in the wrong course; the
reason a course was chosen is inspectable so routing failures can be diagnosed.

### L3 · Rewrite a note with Nemesis (new capability)

- **Reported**: missing. Note-scoped action wanted.
- **Reproduction result**: n/a — new feature
- **Status**: not started

Carried criteria: simplify / shorter / more detailed / reorganize around learning
objectives / custom; sends stable note ID and provenance; edits the current note rather
than creating an unrelated one; preserves citations, images, links and course placement
unless asked otherwise; uses existing version history so the prior version is
recoverable; summarizes what changed.

### L4 · Important generated points were not bolded

- **Reported**: emphasis missing from generated notes.
- **Reproduction result**: _not started_
- **Root cause**: _not started — could be generation, sanitization, storage or render_
- **Automated test**: round-trip render test.
- **Status**: not started

Carried criteria: consistent semantic emphasis on key terms and conclusions; valid bold
survives generation, sanitization, persistence, reload and render; no whole-paragraph
bolding.

### L5 · Generated notes did not include lecture images

- **Reported**: image-heavy lecture produced a text-only note.
- **Reproduction result**: _not started_
- **Automated test**: an image-heavy lecture, not a text-first document.
- **Status**: not started

Carried criteria: extract usable images with slide/page provenance; place near the
section derived from that slide when it helps; keep captions or generate a clearly
labelled description; link back to the source slide; skip logos, icons and slide chrome;
never leave a broken placeholder.

### L6 · Only one source citation appeared

- **Reported**: repeated citations collapse to one.
- **Reproduction result**: _not started_
- **Root cause**: _not started — must distinguish four candidates: the model emitted one
  citation; metadata was deduplicated wrongly; the renderer collapsed repeats; storage
  keeps one locator per source_
- **Status**: not started

Tracked separately from L1 on purpose: L1 is whether citations are *written* per claim,
L6 is whether repeated ones *survive*. Same symptom, different failure points.

---

## Group 4 — Chat and recording experience

### C1 · A recording should appear in the chat sidebar

- **Reported**: no sidebar entry while recording.
- **Status**: not started

Carried criteria: one entry once a recording passes five seconds; states for recording
(animated, with elapsed time), processing, complete, and a recoverable failure; never
duplicated; survives navigation and refresh; updates without a reload; a defined discard
behaviour under five seconds; tested with a long recording, not a five-second fixture.

**Known adjacent state**: PR #438 (yesterday) fixed a recording card that falsely
reported a finished lecture as lost, and fixed recorded conversations being stranded on
their dated placeholder title. Reproduction must establish whether the sidebar entry is
genuinely absent or was present and unrecognizable.

### C2 · Chat message bubble should match the intended ChatGPT-like behaviour

- **Status**: not started

Carried criteria: right-aligned compact user bubble with a sensible maximum width;
consistent radius, padding, typography, spacing; attachments as separate compact chips;
assistant replies stay visually distinct; verified in light and dark, with long messages,
code, attachments and mobile widths.

### C3 · Sending notes or files to chat creates a malformed-looking prompt

- **Status**: not started

Carried criteria: typed text shows normally; attachments render as labelled chips; no
internal IDs or context metadata in visible text; multiple attachments wrap cleanly;
removing an attachment before sending also removes its structured context; reloading the
conversation reproduces the same clean presentation.

### C4 · Chat scrolls downward on its own

- **Status**: not started

Carried criteria: pinned to bottom only when the reader was already near the bottom;
reading position preserved when scrolled up; a "jump to latest" control when new content
arrives below; sending a message deliberately moves to the latest; layout shifts, tool
results, image loading and sidebar updates must not yank a reader back down. Browser
tests for both pinned and unpinned states.

---

## Group 5 — Remaining Library polish and Chill

### U1 · Library breadcrumb is not clickable

- **Status**: not started

**Known adjacent state**: PR #437 shipped navigable breadcrumbs and was verified live on
2026-08-06. Reproduction must determine whether this is a regression, a surface #437 did
not cover (folder-note page rather than the reader), or the owner hitting a stale
deployment.

### U2 · Underline and highlight are missing

- **Status**: not started

Carried criteria: apply and remove both; highlight uses the design system's accessible
default; formatting survives save, reload, copy/paste and note rewriting; existing notes
render without migration damage; resulting markup is sanitized safely.

### U3 · Link-to-note needs search and new-note behaviour

- **Status**: not started

Carried criteria: searchable picker over title, course and path; insertion uses a stable
note ID rather than a path; an unmatched title can become a link to a new or placeholder
note; opening an unresolved link offers to create it; duplicate titles disambiguated by
folder and course.

### U4 · "On this page" should be collapsible

- **Status**: not started

Carried criteria: explicit collapse control; collapsing gives the space to the note;
preference persists across navigation within the session, ideally per user; keyboard
accessible and labelled; verified on long and short notes at desktop and mobile widths.

### U5 · Sources folder looks visually different from normal folders

- **Status**: not started

Carried criteria: same folder row component, typography, icon sizing, indentation,
spacing and hit target as every other folder; anything special is a secondary badge, not
a smaller row. Verified expanded, collapsed, selected, hovered, light and dark.

### U6 · Chill "Groups" does not serve a fresh puzzle after the first

- **Status**: not started

Carried criteria: a clear next-puzzle action or an intentional automatic transition; new
puzzle ID and new content; no repeat until the pool is exhausted; every generated puzzle
validated as solvable with exactly one canonical solution unless ambiguity is deliberate;
completion persists so a refresh does not re-serve a finished puzzle; puzzles original,
not copied from another publisher. Tested across three consecutive puzzles, with a
refresh between, and on returning later.

---

## Open decisions for the owner

| # | Decision | Blocks | Raised |
|---|---|---|---|
| 1 | Learning-state migration (a `state` + `step_index` column and sub-day due times) so failed cards can genuinely return sooner, versus keeping day-granularity scheduling | the second half of S2 | 2026-08-06 |
| 2 | Optical character recognition for scanned pages — the candidate library fetches its engine and language data from a third-party CDN, tens of megabytes, language not inferable | D1, only if reproduction shows scanned pages are the cause | carried from #436 |
| 3 | Apply the replacement `grade_study_card` to the live database. It is a function replacement, not a table change — no rows are touched and the previous definition is kept for rollback. Until it is applied the fix is in the code but not in the owner's account | production acceptance for S2 | 2026-08-06 |

**Scope note on S2, raised rather than decided.** The reported criteria "learning and
relearning cards return when their scheduled step becomes due" and "due learning cards
must not be dropped when the queue is regenerated" were originally expected to need a
migration. They do not need one for the *scheduling* half — that is solved. What remains
is client-side: the review queue is rebuilt by a memo with no clock dependency, so a card
that becomes due mid-session does not reappear until something unrelated changes. That is
the same root cause as S1 and S5 and is handled in the next PR, which is why those three
are grouped.

## Operational notes for this pass

- Merges get batched. Vercel caps daily builds at 69 and blocks production for roughly a
  day once hit; one deployment per fix would spend that budget fast.
- The working tree on `main` carries unrelated untracked marketing files. Every commit
  uses explicit paths — never a blanket add — so none of it lands in a PR.

---

## U7 — The word "Library" renders twice, overlapping (reported 2026-08-06, mid-pass)

- **Reproduction result**: **REPRODUCED.** Turn on "Hide sidebar automatically" in the
  Library "…" menu, then hover the left edge. Measured in the live DOM: two elements
  carrying the text "Library", 3px apart on the same baseline (x=279 and x=282), both
  fully opaque. That is the smear in the owner's screenshot.
- **Root cause**: auto-hide mode draws a floating "Library" word to mark where the hidden
  panel lives. When the pointer opens the peek, the panel slides out carrying *its own*
  `<h1>Library</h1>` — and the marker's render condition never accounted for the panel
  being open, so both painted at once. Replaying the old conditions across all 32
  reachable states shows **3 of them render the word twice**: hover-peek, menu-held, and
  both together — all in auto-hide mode.
- **Change**: `apps/web/lib/workspace/library-sidebar-layout.ts` (new) decides what the
  left chrome shows; `library-docs-page.tsx` consumes it. The marker is hidden with
  **opacity, not by unmounting it** — it is one of the hover targets holding the panel
  open, so removing it under the pointer fires mouseleave, closes the panel, remounts the
  marker and reopens it, flickering forever. `visibility: hidden` has the same defect
  because a hidden element stops receiving the pointer.
- **Automated test**: `library-sidebar-layout.test.ts`, 7 tests, including a sweep of all
  32 states asserting the word is never rendered twice, plus a test that the marker stays
  *mounted* while the panel is open (the flicker guard).
- **Browser acceptance**: auto-hide on, peek opened by hover — 2 elements in the DOM,
  **exactly 1 visible**; the panel heading at opacity 1, the marker at opacity 0. Panel
  still slides out and still pushes the page.
- **Status**: in PR
