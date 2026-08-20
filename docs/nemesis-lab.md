# Nemesis Lab

A localhost-only place to look directly at the two hidden halves of Nemesis:

1. **Did Nemesis understand the source correctly?**
2. **Given that understanding, does Nemesis actually teach correctly?**

It is not a learner-facing feature and never appears in the product. It does not exist in a
deployed build at all: every page and every one of its API routes goes through one shared check
(`apps/web/lib/lab/gate.ts`) that returns "not found" whenever the code is running in production.

## The one rule this is built on

**The Lab may have special observability. It must not have special parsing or special teaching.**

Every parse on these pages is `parseDocument` — the same function the upload route and the
background worker call. Every teaching decision is `controllerFor`, every verdict is
`evaluateLearningResponse`, every evidence row is `recordEvidence`. What the Lab adds is
*reporting*: the whole document model instead of the text, the whole turn instead of the question.

If a page here ever needed its own parser or its own tutor to work, the page would be wrong. That
is why the Tutor Lab mounts the real `LearningCanvas` component rather than re-sequencing the
cognition in a harness of its own.

## Running it

**On the owner's machine it is already set up.** Start the `lab` server (`.claude/launch.json`) and
open **http://localhost:3220/dev/lab**.

That entry runs from `.nemesis-lab/`, a second checkout of `main` sitting inside the repo folder,
rather than from the working copy. The reason is practical: the working copy sits on a feature
branch with unfinished work on it, and switching that branch to reach the Lab would put that work at
risk. A separate checkout means the Lab is always on `main` and the working copy is never disturbed.
It costs almost no disk (its `node_modules` are hard links) and it is excluded from git locally, so
it never shows up in `git status`.

To refresh it after new work lands on `main`:

```bash
cd .nemesis-lab && git fetch origin main && git checkout --detach origin/main
```

**From any ordinary checkout that is on `main`**, the Lab is just the app:

```bash
cd apps/web && pnpm dev     # then http://localhost:3000/dev/lab
```

**One key is needed for the Tutor tab**, because the Lab creates its own throwaway test learner:
`SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local`, the same value already in the repo root
`.env`. It is already in place on this machine. That file is gitignored and the key never reaches
the browser. Without it the Parser tab still works completely, and the Tutor tab says exactly what
is missing rather than failing vaguely.

## Where the data goes

The Lab runs against the hosted Supabase project, and that is forced rather than chosen. Real
cognition needs the model door, and the model door (`supabase/functions/nemesis-llm`) resolves the
caller against *its own* project — so a JWT minted by a local Supabase stack can never be verified
there. "Local database, production model" is impossible, not merely awkward.

So isolation comes from **identity** instead. Everything the Lab writes belongs to one dedicated
account, `nemesis-lab@nemesis.test`, which owns nothing else, ever. Your Library, your learner
history, your evidence and your experiment assignments are untouched.

**Reset** (in the Tutor tab header) deletes everything that account owns, by user id. No timestamp
window, no name matching, no guessing about who made what — the account exists only because the Lab
created it, so identity is the strongest possible proof of ownership.

## Parser

Drop in a real PDF, PowerPoint, Word file, spreadsheet, CSV, text file or image.

- **Original | Extracted**, page by page. The left side is the actual file rendered; the right side
  is what Nemesis believes it contains. For formats the browser cannot render (PowerPoint, Word) the
  left side says so plainly rather than showing you the extraction twice.
- **Rendered / Markdown / Structure.** Rendered draws the model — tables as real grids with their
  merges, pictures as their actual extracted pixels. Markdown is the exact string that travels
  downstream to knowledge extraction. Structure is the model itself: block kind, reading order,
  headings, bounding boxes, spans.
- **Tables** show rows, columns, cell count, merged cells, header rows, the page, the bounding box,
  and every cell's own coordinates on hover. This is what catches "all the right words, the wrong
  columns" — which a character count never can.
- **Pictures** are listed whether or not anyone looked at them. Three states, and they are not the
  same: *described* (vision looked and had something to say), *skipped* (something decided not to
  look, and named the reason), *never examined* (nobody looked and nobody decided — the only one
  that is a gap in the pipeline).
- **Speaker notes** appear separately for PowerPoint, with a note saying they are recovered from a
  text marker rather than from document structure — because that is the truth about how the parser
  represents them.
- **Which parser ran, and why** is shown at the top: native or vendor, the routing reason, the
  parser version, the time, and everything the parse knew it could not recover.
- **The page strip** marks the pages worth looking at — table, picture, equation, lost text, or a
  disagreement between two lanes — so a 100-page lecture does not have to be read by hand.

Nothing on this page is repaired, reordered or beautified, and nothing is saved. If the parser got
something wrong, the wrong result is what you see.

### Comparing parsers

"Native only" re-reads the file with the paid parser forbidden. "Paid reference ($)" calls the paid
parser — **only when you press it**, never because the page is open.

Disagreements are reported per page, ordered by how much teaching they can destroy: table structure
first, then merges, figures and equations, then headings and reading order, and **text last**. A
character count is the one number that reliably ranks a worse read higher, so it is never the
headline.

A lane that did not run — no vendor key, a format no vendor reads — says so. An empty list of
differences from a comparison that never happened would look exactly like two parsers agreeing.

## Tutor

Press **Open in Tutor Lab** on a source you just inspected. That button is the one moment the Lab
writes anything: it files the parse as a lab source, through the production write path, under the
lab learner.

The middle of the page is the real Canvas. Beside it, a panel shows every turn as a chain:

- what it decided to do, and about which objective
- what it asked
- how the answer was marked, and what kind of mistake
- what was written down

Each link says plainly whether it happened, so a missing link is visible rather than inferred. That
is what separates *bad extraction* from *bad retrieval* from *bad learner model* from *bad policy*
from *bad model response* from *bad judge* from *bad evidence write* — without reading a log or a
database row.

Numbers are never invented. "tokens not reported" and "0" are different words because they are
different facts: a streamed call reports no usage, which is not a free call. "no write was
attempted" and "0 rows written" are different too.

### Starting learner conditions

Unknown, partially known, established, known misconception. These are not flags — each one writes
real evidence rows through the real evidence writer, because that is what those states *are* in this
system. Seeded rows are marked `lab-seed:` so they can always be told apart from a demonstration a
person actually made.

### Comparing the two teaching controllers

Nemesis policy and the LLM teacher, on identical inputs taken from the last real decision. **Freeze
inputs** holds them, so repeated runs cannot differ because the learner state moved underneath them.

Running the same arm several times over unchanged inputs answers a question nothing else can: if the
runs disagree with each other, the instability is the model. If they agree and the product still
wanders, the instability is upstream.

## Replays

Save any bad parse or bad teaching moment as a regression case. A case holds the file itself (not a
reference to one) or the whole frozen turn, so it reproduces without the session that found it.

Reruns report **drift**, never pass or fail. You saved these because they were wrong; treating the
recorded behaviour as the expected result would build a guard that goes red the day someone fixes
the defect.

Parser cases also run from the command line, which is how they reach a merge gate:

```bash
cd apps/web && ../../node_modules/.bin/tsx scripts/lab-replay.ts --strict
```

Teaching cases rerun in the browser, because a teaching turn needs a real learner session to reach
the model and to write evidence under row-level security. The command line lists them as skipped
rather than counting a skip as a pass.

## Known limits, stated rather than left to be discovered

**Two of the seven diagnostic links have never fired.** The debug panel's *how the answer was
marked* and *what was written down* rows are wired at the exact points where the judge returns and
where evidence is written — but no turn has ever reached them, because the product currently cannot:
a typed answer to a Canvas question is routed away from the teaching runtime before it gets there
(learning-canvas.tsx:1079, gated on `sink.kind === "policy"`). So those two rows are wired and
uncalibrated. An instrument that has never fired has no demonstrated link to the thing it measures,
and that is worth saying out loud rather than discovering later.

That is also the Lab's first real finding, and it came with something new: the evidence WRITER is
fine. Seeding learner conditions wrote 256 rows through the same production function under the same
learner's session. So the failure is upstream of the writer, not in it.

The same gap means the judge half of a teaching replay has never executed either — it only runs for
a case that recorded a judge input, and no judge has yet run.

## What the Lab is not

It is the first verification layer, not the last. Localhost success is not evidence that production
works: that still needs a preview deploy and a small production smoke. What the Lab buys is finding
the problem in minutes instead of hours, and being able to prove the fix later.
