# Learning Canvas — pilot report and build plan

Written 2026-08-06. This is the §26 "before coding" report: what already exists that we can
reuse, what genuinely has to be new, whether the database has to change, and what the
smallest version is that actually proves the idea.

Plain English throughout, as the working agreement requires.

---

## 1. The one-sentence answer

We can build the whole Learning Canvas — drop a lecture, get a lesson, highlight and rewrite a
paragraph, ask where a claim came from, do recall, take a test, see what's weak, relearn only
that, retest, finish — **almost entirely out of parts Nemesis already has.** The new code is
the canvas itself: the block model, the safety check on what the AI is allowed to change, and
the idea of a "concept" that the whole thing hangs on.

---

## 2. What we can reuse (and it's most of it)

**Reading a lecture, slide deck, PDF or Word file.**
Nemesis already has one place that turns a file into text — `extractFile()` in
`apps/web/lib/workspace/chat-attachments.ts`, which posts to `/api/notebooks/extract/file`.
That is the same door chat attachments, Library import and syllabus import all walk through.
The canvas uses it unchanged. No second pipeline.

A useful thing we found: that endpoint already accepts *"just give me the text of the file I
uploaded last week, here's its id"* — but **nothing in the product has ever asked it that.**
Every caller today hands it a fresh file. The canvas will be the first surface to use the
by-id door, which is how you can attach something already sitting in your Library.

**Talking to the AI.** `postChatCompletion()` in `apps/web/lib/workspace/chat-api.ts`. Same
call chat makes, same billing header (`X-Nemesis-Client: web`), same device key, same
"you've hit your limit" handling and upgrade prompt. Because we go through the existing door,
canvas usage is metered exactly like chat usage. It does **not** repeat the mistake the
unit-economics audit found, where one lane had no meter on it at all.

**Flashcards.** This one is a clean win. The reveal-then-grade loop the pilot describes —
Space to reveal, then Again/Hard/Good/Easy on keys 1–4 — is *already exactly what Nemesis
does* in `review-session.tsx`. The scheduling maths lives in the database
(`grade_study_card`), the cards live in `study_cards`, and the store hook `useCloudStudy()`
already exposes `gradeCard`. The canvas reuses all of it, keeps the same key bindings so
nothing competes, and cards made in a canvas show up in the normal Study page afterwards.

**Tests.** The multiple-choice format, the question generator prompt, the exam-writing rules,
the "don't put the right answer in slot B every time" shuffler, and the scorer all exist in
`study-artifact-content.ts`, `item-writing.ts` and `test-answer-balance.ts`. Reused as-is.

**The page frame.** `/learn` sits inside the existing workspace routes, which means sign-in,
two-factor, and the upgrade dialog all come for free. Adding it to the shell's
`IMMERSIVE_ROUTES` list hides the sidebar so the canvas gets the whole screen. That is a
**one-line addition to one existing file** — the only existing file this work touches.
Deliberately not added to the sidebar menu, exactly like `/slides` and `/notebooks`, so it is
reachable but not advertised.

**Highlight-to-act.** The document reader already has a little floating toolbar that appears
when you select text (`selection-actions.tsx`). Same idea, same visual language.

**Analytics.** `phCapture()` already exists and is wired to PostHog.

---

## 3. What genuinely has to be new

Four things. Everything else is glue.

**(a) The canvas itself — a document made of addressable blocks.**
Nemesis has no concept of a living document whose paragraphs have stable identities. Notes are
markdown text. For the AI to rewrite *one paragraph* without touching the rest, every block
needs an id. That's the core new idea and it has to be built.

**(b) A safety check on what the AI is allowed to change.**
This matters more than it sounds. We verified that **nothing in Nemesis currently checks the
AI's structured output against the shape it was asked for.** The existing tool system takes
whatever the model sends and quietly patches over the gaps — a missing required title becomes
an empty string, and a note gets silently saved as "Untitled note". That is fine for chat; it
is not fine for a page that rewrites itself. So the canvas brings its own validator: every
edit the model proposes is checked (is this a real block id? is this a permitted operation
right now?) and rejected if not. **The page only ever changes in ways we allow.**

**(c) Concepts.**
There is no such thing as a "concept" anywhere in Nemesis today — no table, no field, no id.
We checked thoroughly. Every "weak spot" number in the product today is really just "this one
card has been failed twice". And a wrong test answer records only *which question number* you
got wrong — not what it was about. So "you're weak on nodal phase 4 depolarisation" is
literally not expressible with what exists.

The canvas fixes this in the smallest honest way: **each canvas keeps its own short list of
concepts** (an id and a plain-English label), generated alongside the lesson. Blocks say which
concepts they teach; questions say which concept they test. Get a question wrong, and the
concept it belongs to is what shows up as weak. No new global mastery system, no new algorithm
— just enough structure for the diagnosis to be real rather than decorative.

**(d) Honest citations.**
Nemesis cannot currently cite *inside* a document — the deepest it goes is the filename. Page
numbers for PDFs exist in the reader but no AI path ever produces one, and Word documents have
no internal structure at all right now.

So rather than invent page numbers (which would be making things up), the canvas splits the
extracted text into numbered excerpts with stable ids before showing it to the model, and
requires every generated block to say **which excerpts it used**. "Where did this come from?"
then shows you the source, the excerpt's own heading if it had one, and the actual sentences.
That is true provenance, and nothing is fabricated.

---

## 4. Does the database have to change?

**Only if we want a canvas to survive a page refresh — and it's one new table, nothing else.**

Nothing existing is modified, renamed, or dropped. The one nearby table we *could* have reused,
`study_artifacts`, only permits two kinds of row (`test` and `mindmap`) and widening that would
mean touching a table the Study page reads. A brand-new table can't affect anything that
already works, so that is the safer choice.

The migration is written and sitting in the repo at
`supabase/migrations/20260806T01_learning_canvases.sql`. **It has not been applied.** It is
additive and reversible, but applying anything to the live database is your call, so it waits
for a yes.

In the meantime the canvas is built to notice the table isn't there and keep a canvas in the
browser instead, so the whole flow can be used and judged today without touching production.

---

## 5. The smallest thing that proves the idea

The full §23 path with one real lecture:

drop a file → pick a starting level → a lesson appears, grounded in the file → highlight a
paragraph and say "simpler", and **only that paragraph changes** → ask where something came
from and get the actual source text back → "I've read this" → recall cards, space to reveal,
1–4 to grade → a short test → a diagnosis naming weak concepts, not a percentage → "fix my
weak spots" rewrites the page down to just those → retest → done.

Everything else the brief mentions — calendar links, an inferred starting level, a global
mastery model, mobile — is deliberately out. The point is to find out whether the interaction
feels better, and this is the shortest path to knowing that.

---

## 6. Risks worth naming up front

- **Nothing that exists validates AI output.** Handled by (b) above; called out because it is a
  repo-wide gap the canvas is only fixing for itself.
- **Re-reading a document costs real money.** A partly-readable file (a scan, say) is
  re-processed from scratch every time because only complete parses are cached — and that path
  runs Gemini vision, which the unit-economics audit flagged as the one unmetered lane. The
  canvas therefore extracts a source **once** and keeps the text on the canvas.
- **The repo's migration files are not a reliable picture of the live database.** A note in
  `20260806190000_parsed_documents_reconcile.sql` says as much. The canvas depends on nothing
  uncertain — only `extractFile`, `grade_study_card` and `study_cards`, all long-established.
- **`/learn` ships its code to anyone who guesses the URL.** There is no way to hide a route at
  the edge in this app — no middleware exists. Keeping it out of the sidebar is the same
  protection `/slides` and `/notebooks` already rely on.
