# How Nemesis reads what somebody said

Nemesis used to work out what you meant by matching your words against lists somebody
had written down. That is gone. A model reads the message now, and the code decides what
Nemesis is allowed to do about it.

This document says where the line sits, so the next person adding a feature knows which
side of it they are on.

## The rule

> **If the question is "what did they mean?" — the model answers it.**
> **If the question is "what is actually true, and what are we allowed to do?" — the code answers it.**

Neither half is optional. A model that decides what a sentence meant but also decides
whether it has permission to write to somebody's calendar is a model making a promise it
cannot keep. Code that decides both is what this refactor removed.

## What was there before

Roughly 700 lines of pattern matching, in four places that could and did disagree with
each other:

| Where | What it matched | What it decided |
|---|---|---|
| `chat-routing.ts` | 13 patterns — research, current, web, learning, casual, save verbs, save nouns, offers, acceptances | which model, whether to search, whether tools ride |
| `workspace-intent.ts` | a vocabulary of workspace nouns + 6 patterns built on it | whether the turn touches your calendar, Library or decks |
| `chat-skills.ts` | one pattern per expertise packet | which teaching instructions the model was given |
| `chat-web-search.ts` | 6 word lists | whether to spend money on a live search |

Plus a second complete copy of the first one on the phone, and smaller ones in the canvas,
the composer, and the learning loop.

### The failures were all the same failure

Every one of these files carried comments explaining why a particular rule was added. Read
together they describe one loop: a real phrasing fails, a rule is added, a neighbouring
phrasing collides, an exception is added.

- `classes?` means "classe" plus an optional "s", so **"my class on Tuesday is cancelled"
  carried no workspace intent at all**. Found in production.
- `SAVE_ARTIFACT` knew "practice test" and nobody types that, so **"create a test on brand
  generic of top 100 drugs" wrote the whole test into the chat** instead of saving it.
- Every workspace rule matched a request to *read*, none matched a request to *create*, so
  **"Add an exam called … on 2026-09-15" answered "I can't add events to your calendar
  from this environment."**
- A one-word "flashcards" answering Nemesis's own offer went out without tools, and the
  model **wrote `[Calling tool: add_flashcards …]` as prose and reported 14 cards saved to
  a deck that does not exist.**
- The schedule list had to have "exam", "test" and "quiz" **removed** from it, because
  "make me a practice test" then read as a question about your timetable.
- "quiz me" had to be checked *before* the word "test", because "test" is both a thing you
  sit and a thing you ask for.

And the ones nobody found, because a word list cannot see them: **"I have no clue, bruh"**
was not a request to be taught. **"¿qué tengo pendiente esta semana?"** was not a question
about your calendar. **"no sé"** was recorded as a wrong answer.

## What it is now

One model call per turn, before anything acts, returning:

```
{ mode, workspace, needsWeb, webQuery, skills, topic }
```

- **`mode`** — conversation, learning, current, research. Decides how hard to think.
- **`workspace`** — none, read, write. The most important field: it is what gives the turn
  the tools that touch your data.
- **`needsWeb` / `webQuery`** — whether to search, and what to type into the search box.
- **`skills`** — which expertise to attach, chosen from a list of conditions.
- **`topic`** — the subject, or nothing.

It costs no extra call. There was already a separate yes/no pre-flight asking "does this
need the web?" on most turns; that one is gone, absorbed into this. One call now answers
four questions where before it answered one and three word lists guessed the rest.

**Failure is a working turn.** A timeout, a refusal, a network error, or prose where JSON
was asked for all fall back to an ordinary conversational turn on the model that carries
tools. You get an answer. You never get a spinner, and you never get "I can't see your
calendar".

It lives in `packages/shared`, so the phone and the browser read a sentence the same way.
They did not before: the browser had learnt not to web-search "who are you" and the phone
had not, so the same question behaved differently on the two devices and nothing could have
caught it.

## What is still code, and why

These are not compromises. They are things a model reading one message genuinely cannot
know, or must not be trusted to decide.

**Which model can carry tools.** Our stream does not retain the reasoning content a
thinking model has to echo back on a tool round, so a turn that touches your data is forced
onto the non-thinking model whatever mode the model picked. A research turn that also needs
your calendar cannot have both, and the calendar wins — an answer that reasons beautifully
about data it could not read is worse than a plainer answer that read it.

**Whether Nemesis itself asked a question.** `studyCreationKindFromPreferencePrompt` matches
the exact opening of a question Nemesis wrote. That is the software remembering what it
said, not a reading of what you said. The model is *told* about it as a fact and decides for
itself whether your reply answers it.

**A visible question on screen plus a submission is an answer to it.** `composer-intent.ts`.
Application state.

**Which passage "this" refers to.** §11's rule: exactly one active reading region, derived
from Continue presses you made yourself — or a visible refusal. Never a guess about which
block is newest or nearest the top of the screen.

**Whether a demonstration is owed.** If a question is live, "make this simpler" is a request
for scaffolding, not an edit — and rewriting the material under a live question would hand
you the answer. This overrides the model outright.

**A URL in the message.** The address is literally there. Checked *in addition to* the
model's answer, so it can only ever add a search, never suppress one.

**Auth, plan eligibility, rate limits, budgets, tool availability, confirmation before
anything destructive.** Obviously.

## The one place a model could not do the job

Asked *"what is the brand name for losartan?"*, a learner who answers `losartan` has given
back the word they were handed and asserted nothing. Measured against the real judge, that
came back `partial` at confidence 0.30 — and the judge was not being stupid: the answer has
maximum overlap with the question, because the token is inside it. Every string, substring
and embedding comparison scores it highly.

So `isEchoOfTheCue` stays. It is not a word list: it compares the response against the cue
the canvas already holds. The judge is asked *how good is this answer*; nobody was asking
whether an answer had been attempted at all.

## Where the phrasings went

The unit tests could not keep them. An assertion that "make me flashcards on beta blockers"
is a save was pinning a regex; against a model it needs the network, costs money, and can
reasonably disagree.

They are all still exercised, against the real model:

- `apps/web/scripts/chat-intent-acceptance.mts` — 47 cases, each one from a real incident.
  Run with `pnpm --filter @nemesis/web chat-intent`. It exits non-zero **only** when
  `workspace` is wrong, because that is the difference between saving your deck and lying
  about having saved it. A wrong `mode` is reported and counted.
- `apps/web/scripts/conversation-acceptance.ts` — the canvas turns, including the rewrite
  phrasings and the questions that must *not* rewrite.

Both skip cleanly with no credential.

## The guard

`apps/web/lib/workspace/no-scripted-intent.test.ts` fails the build if a regex is tested
against text a person typed, inside any module whose job is to decide what a turn means.

It exists because deleting the lists does not stop the next one being added under exactly
the same pressure, at 2am, by somebody fixing a real bug. There is one exception, `carriesUrl`,
and it is written down with its argument.

It does not touch — and these are used freely everywhere else — parsing a document,
validating a format, matching a marker Nemesis itself wrote, linting Nemesis's own output,
or reading a filename. Those are facts about a string, not readings of somebody's intent.

## Known, and deliberately not changed

The `supabase/functions/ask` edge function is a medical-evidence pipeline with several
keyword layers of its own: lane routing, emergency and self-harm screening, hazardous-request
refusal, and query rewriting. Two things about it:

1. **It appears to be unreachable from the product.** Nothing in the web app or the phone
   app calls it. Its only caller, `WatchCurrentEvidence`, is mounted in `WatchDetail`,
   which is not routed anywhere. Its usage counter's newest row is from 2026-07-19.
2. **Its safety screens should stay deterministic anyway.** A keyword floor for "I took 40
   pills" fires instantly, offline, and cheaply, and its false positives cost somebody
   seeing a Poison Control number they did not need. Replacing that with a model call means
   the screen can time out, and a safety screen that fails silent is worse than a crude one.

Whether that function should still exist at all is the owner's call, not a refactor.
