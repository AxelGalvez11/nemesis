# How Nemesis currently decides what you see next — and what would have to change

*Read of the shipped code on `main` at `1e3964dc`, plus the live production database,
2026-08-15. Written for the owner: plain English, no engineering decisions handed back.
**Nothing was implemented.** This answers the eight questions and stops.*

---

## The short version

The architecture you described — *"Nemesis owns the objective and environment, the model owns
much of the policy"* — **already exists as a seam in the code**, with two things plugged into
it. One is the hand-written policy (the product). The other is the same model, given a strong
teaching brief, choosing for itself. It was built deliberately, in July and August, as an
experiment to test exactly the bet you are now questioning.

So this is not a rewrite. It is three specific gaps in something already standing:

1. **"Move on" and "come back later" are not moves either controller can make.** They are the
   *absence* of a move. This is the single biggest mismatch with what you asked for.
2. **Nothing in the system knows how much time the learner has, or how much material is left.**
   There is no budget of any kind. Without one, "is this worth another minute?" is not a
   question the system can even ask.
3. **The model is deliberately starved.** Nemesis computes prerequisites, forgetting curves,
   friction and effort — and then withholds all of it from the model, on purpose, to keep the
   experiment fair.

And one uncomfortable fact that shapes everything below: **the entire production database holds
five pieces of learner evidence.** Not five thousand. Five. Every evaluation plan in this
document is a plan, not a measurement.

---

## 1. How the Canvas decides what appears next

There are **two** decision points, on different axes. They are often confused.

### The main one: what to work on next

Live at `use-policy-runtime.ts:565`. Every time the learner's evidence changes, the runtime asks
a **teaching controller** for one move. Today that is always the hand-written one
(`strategy-nemesis.ts` → `decideNext` in `policy-runtime.ts`). The chain:

1. **Narrow to what the runtime can actually stage.** `runtime-support.ts` holds a list of four
   pairs it can handle end to end — a fact-pair asked for recall, a cause asked for a
   prediction, a category asked for a discrimination, a procedure asked for its sequence.
   Anything else is dropped before the policy sees it.
2. **Narrow again to what the learner has focused on**, if they picked a topic.
3. **For each surviving objective, replay its whole evidence history** into a status —
   never established / attempted-and-fell-short / a specific wrong belief / demonstrated.
4. **Ask a pure function what is owed** (`teaching-policy.ts`). Five possible answers: *ask them
   to produce it*, *state the answer plainly*, *put the confusable pair side by side*, *hold this
   one for now*, *nothing is owed here*.
5. **Throw away "hold" and "nothing owed"**, then **score everything left** and take the highest
   (`next-action-value.ts`).

The scoring is four bands with a hard ceiling on adjustments, so nothing can jump a band:

| Band | Worth | What it is |
|---|---|---|
| 10,000 (+500 for a wrong belief) | most | An answer the learner is standing there waiting for |
| 8,000 | | Not yet demonstrated — never asked, *or asked and missed* |
| 4,000 | | Passed, but only by recognising it, never by producing it |
| 2,000 | least | Demonstrated, and due for another look |

Inside a band, small adjustments discriminate: each failed attempt adds 120 (up to five),
each other thing stuck behind this one adds 100, looking a word up adds 90, having just
worked it subtracts 700.

### The other one: what to do about the answer just given

Live at `use-canvas-session.ts:1002` (`canvas-policy.ts`). This is the older document-canvas
path — it reads the marked answer and decides whether to correct, clarify, re-teach or move on.
It is where the **only give-up rule in the entire system** lives: `MAX_CORRECTIVE_ATTEMPTS = 2`.

It matters that these are separate. That give-up rule **does not reach the main loop at all** —
it counts in browser-session memory, dies on reload, and never influences which objective comes
next.

---

## 2. What is decided by rules versus by the model

**Decided by hand-written rules, with no model involved:**

- which objective is worked on next, and which of the five moves is made;
- when something is allowed to come back (10 minutes after a pass, or once one other objective
  has intervened after a miss);
- whether a question gets narrowed for someone who keeps missing it;
- whether a correction flashes past or holds still and waits;
- which objective is a prerequisite for which;
- how much a memory is predicted to have decayed.

**Decided by the model (DeepSeek, on the same metered path as chat):**

- what the source material actually says — the knowledge objects themselves;
- the wording of every question;
- the marking of every answer, and what it establishes;
- the text of every correction and re-explanation.

The rule the codebase states repeatedly is: **the model writes and marks; it does not choose.**
It is written into the files as a design commitment (`canvas-policy.ts:8`,
`teaching-policy.ts:15`) and into your product contract as §34.

**The one exception already exists.** `strategy-llm-teacher.ts` is the same model given a strong
adaptive-teaching brief, choosing the objective and the move for itself. It is built, tested,
and quarantined: default off, random assignment off, reachable only by typing a special URL.
I checked production — **every evidence row has no arm recorded, so it has never decided
anything for a real learner.** The bet has never been measured.

---

## 3. Where the system can get trapped drilling a weakness

This is the sharpest finding, and it is structural rather than a bug. **I measured it rather
than reasoning about it** — the decision functions are pure, so I ran a learner who keeps missing
one objective through the real code, with normal other work in between, and printed what Nemesis
offered:

| Round | Misses so far | What Nemesis does | Score |
|---|---|---|---|
| 1 | 0 | ask | 8,000 |
| 2 | 1 | ask | 8,000 |
| 3 | 2 | ask (narrower) | 8,240 |
| 4 | 3 | ask (narrower) | 8,360 |
| 5 | 4 | ask (narrower) | 8,480 |
| 6 | 5 | ask (narrower) | 8,600 |
| 7 | 6 | ask (narrower) | 8,600 |
| 8 | 7 | ask (narrower) | 8,600 |

Beside it, at the same moment, **a piece of material the learner has never opened is worth
8,000** — so it loses, every single round, for as long as the miss stands.

What the measurement shows:

- **It never stops.** Eight consecutive misses and the answer is still "ask again". There is no
  branch anywhere that says "enough" — "nothing is owed here" is only reachable from
  *demonstrated*. Answering correctly is the only exit.
- **Missing something makes Nemesis want it more.** The first miss changes nothing; from the
  second the score climbs, and it saturates at a hard ceiling. It never decays. There is no point
  at which it crosses into "not worth it".
- **The one thing that does adapt is the shape of the question**, not the decision to ask it.
  From the third attempt Nemesis narrows the question rather than repeating it — that part works.
  Narrowing is not moving on.
- **Nothing represents cost.** I searched the whole learning layer for any notion of available
  time, session length, remaining material, or an exam date. There is none. So no term could ever
  say "they do not know this perfectly, but moving on is worth more."

That is precisely the behaviour your message describes as brittle, and it is currently the
system's *design*, not an accident: it was built to guarantee that a learner who gets something
wrong is never quietly abandoned. The guarantee is real. The cost is that it cannot judge when
abandoning is right.

---

## 4. Where hand-written rules are piling up

134 named constants in the learning layer. Raw count is not the story; **direction** is. Three
clusters:

**Selection** — `next-action-value.ts` introduced eight tuned numbers in a single file: four
band values, a per-failure amount, a per-blocked-thing amount, a friction amount, a
just-worked penalty, plus a ceiling to stop them interacting badly. Every one is a judgement
about how much a signal should matter, written by hand.

**Spacing — the cluster to watch.** *Four* modules answer one question, "when does this come
back?": a 10-minute eligibility rule, a 60-minute churn guard, a one-intervening-item working
memory rule, and a forgetting curve whose two constants are declared **twice**, in two files.
This cluster has already produced a live defect: the 60-minute guard silently overrode your own
10-minute tempo ruling, so a learner who *failed* something became **less** likely to be asked
it again than one who passed. That is documented in the code itself at `teaching-policy.ts:441`.
Four modules answering one question is exactly the shape that produces that class of error.

**Exposition** — a table deciding, from the type of knowledge and the demand, whether a
correction flashes past or waits for the learner.

---

## 5. What the model currently receives about the learner

**In production: nothing.** The model-driven teacher has never run. When DeepSeek is used today
it is writing a question or marking an answer, and it is given the material and the single
objective in front of it — not the learner's history.

If that teacher were switched on, it would receive, per objective: the identity, what it asks
about, what the material says, the projected status, how many times it has been met, how many of
those produced a demonstration, the last verdict, how many minutes ago, and any specific wrong
belief the learner actually showed. Plus a note of what has already been worked and corrected in
this sitting.

**And here is the crux.** Everything the hand-written policy computes is *deliberately withheld*
from it: the prerequisite graph, how many things are stuck behind this one, predicted
retrievability, terminology friction, and the scaffolding level. The rule is written into the
file — *"exactly what the policy reads, and nothing more… a description, not a recommendation."*

That rule is what makes the comparison fair. **It is also what makes the model arm weak.** You
cannot have both.

---

## 6. What it would need to decide well

In order of how much each would change the decision:

1. **A budget.** How many minutes this sitting has, and how much material has not been touched.
   Nothing of the kind exists anywhere. Without it, "move on" has nothing to be weighed against
   — which is why it is not currently a move at all.
2. **Importance in the source.** A knowledge object records what the material says and where it
   came from, but carries **no sense of how central it is**. Recoverable from structure — how
   deep the heading, whether the source returns to it, whether it is emphasised, how much space
   it gets — never from subject-matter word lists, which would break the field-agnostic rule.
3. **The structure Nemesis already computes and withholds** — prerequisites, what is stuck
   behind what, predicted decay, terminology friction.
4. **Effort.** How long the learner took. This is already recorded on **every** evidence row and
   stored in the database — and **nothing reads it**. A free signal, already collected, currently
   inert.
5. **How much help was given.** Recorded, but four of the five production rows carry nothing,
   so there is effectively no history yet.
6. **What has already been spent here** — how many turns of this sitting have gone to this one
   objective. Nothing tracks it across the loop.

---

## 7. The smallest changes that move toward this philosophy

**The seam is already built.** `teaching-strategy.ts` defines a controller that receives the
learner's state and returns one next move, with two implementations behind it and one Canvas in
front. That is your "Nemesis owns the game board, the model owns the moves", already standing.
So the work is three additions, not a rebuild.

### (a) Make "move on" and "come back later" real moves

Today the model teacher may choose from exactly three: ask, tell, contrast. The file says
`defer` and `advance` were *deliberately* excluded. And the hand-written policy discards them
too before ranking. **So "move on" is not a decision anywhere in Nemesis — it is what is left
when nothing else applies.**

A controller that cannot say "this is not worth the next minute" cannot do the thing your
message is centrally about. This is the smallest, highest-value change on the list.

### (b) Give the controller a budget

One new field on the context both controllers already receive: minutes remaining, and how much
material has not been touched. Everything else it needs is already flowing.

### (c) Give it the state Nemesis already computes

Prerequisites, decay, friction, latency, importance — computed today, withheld today.

**The consequence, stated rather than buried:** (c) ends the §34 experiment as currently
designed, because the two arms would no longer be seeing the same information, and no result
afterwards could be attributed to the reasoning rather than the inputs.

**My recommendation, applying your own ordering rule (simplest, least irreversible, avoids
duplicating a system, easiest to replace):** do (a) and (b) first, and **run the experiment on
what is already built before enriching anything.** Turning it on costs a configuration change,
not code. The reason is not caution — it is that there is nothing to lose right now: zero rows
have ever been produced under either arm, so there is no measurement that enriching would
destroy. If we enrich first, we will never learn what the hand-written structure was actually
worth, and we will be guessing about that for as long as the product exists.

### The classification you asked for

| Deterministic behaviour | What it really is |
|---|---|
| Evidence log, learner state projection, knowledge and objective identity | **Truth infrastructure** — keep, never delegate |
| Provenance, source grounding, permissions, spend limits | **Truth infrastructure** — keep |
| Viewing is not evidence; help-seeking is not mastery; recognition is weaker than production | **Hard invariant** — keep, enforce against any controller |
| Never invent a wrong belief the learner did not show; never fabricate a source claim | **Hard invariant** — keep |
| A judge that could not read an answer must not become a wrong answer | **Hard invariant** — keep |
| The four score bands and every adjustment in them | **Teaching strategy** — a model could reason about this from the same state |
| The 10-minute tempo, the 60-minute guard, the one-intervening-item rule | **Teaching strategy** — but the *floor* that stops an immediate repeat is an invariant |
| Narrowing a question after two unaided misses | **Teaching strategy** |
| Two corrective attempts then move on | **Teaching strategy** — and today it is in the wrong lane to matter |
| Which knowledge-type/capability pairs can be staged at all | **Truth infrastructure** — it is a statement about what the system can actually do |

Nothing in the last group should be deleted yet, per your instruction.

---

## 8. How to tell more learning from a faster feeling

**The right instrument already exists**, and it is the honest one. `strategy-outcomes.ts`
computes two rates from the same population, split into halves that cannot overlap:

- **immediate** — got it right shortly after being taught it;
- **delayed** — got it right at least twelve hours later.

The file states the point plainly: an arm that wins the first and loses the second **taught
worse**. Answering minutes after being told is the cheapest result in education and every method
scores well on it. That contrast is literally "real learning" versus "feels faster".

Four gaps between that instrument and an answer:

1. **The denominator is missing.** "Per minute" needs minutes actually spent. The one time
   measure in the summary is wall clock, and its own comment admits it counts the hours a
   learner spent away from the tab. Per-answer response time is recorded but never aggregated;
   active time-on-page is tracked but never reaches the outcome summary.
2. **The delayed rate reads as nothing today** — not zero, *nothing*. It needs two attempts on
   one objective more than twelve hours apart, and no session has ever produced that. A data
   gap, not a broken instrument.
3. **Coverage is not measured at all.** Your philosophy makes breadth-per-minute a goal —
   how much of the material was reached. Nothing counts it.
4. **Five rows.** Everything above is a plan until a real learner uses this for real hours.

**One correction to the existing code's own commentary:** it claims transfer cannot be measured
because only one kind of demand is ever asked. That is now **out of date** — production carries
two (`recall` and `predict`), and the runtime can stage four. Transfer became measurable and
nobody noticed.

---

---

## What shipped, 2026-08-16

The owner read this audit and authorised implementation. What changed:

**The model controller is now the default.** `DEFAULT_STRATEGY` moved from `nemesis_policy` to
`llm_teacher`. The hand-written policy is not deleted and not weakened: it stays a real arm,
selectable by URL and by randomisation, and it is what a failure falls back to.

**"Move on" is a real move.** The controller's vocabulary went from three verbs to eleven — ask,
probe, teach, simplify, correct, contrast, harder, easier, advance, defer, revisit. The three
moving-on verbs are spelled out as equals in the prompt rather than buried as last resorts, and
`revisit` is genuinely different from `defer`: one sets something down for the sitting, the other
for minutes. When the controller passes over an objective, that objective is set aside and the
controller is asked again over what is left, bounded at three passes per turn — so a decision to
move on ends the objective's turn without ending the sitting.

**The starvation ended.** `teaching-snapshot.ts` derives everything Nemesis honestly knows —
prerequisites, what is stuck behind what, predicted forgetting, response latency, scaffolding
history, terminology friction, importance, attention already spent here — and hands it to *both*
arms. Every unobserved value is `null`, never `0`.

**Time is state, not a mode.** `attention-budget.ts` gives the controller how much attention this
sitting has spent and, where a real signal bounds it, how much is left. There is no cram mode and no
branch asking whether we are cramming: the same controller reads different numbers.

**The scaffolding ladder stopped lying.** It was fully built and fully dead — a `narrowed` retrieval
and an unaided one produced byte-identical text while the log recorded that one had been made
easier. `scaffold-prompt.ts` makes the rung change the question, structurally: dropping the second
clause of a two-part question, or disclosing the answer's shape or initials. It refuses loudly for
the two rungs nobody has built. Without that, `harder` and `easier` would have been verbs that moved
a label.

**A failure is loud.** A refusal used to mean a blank canvas, which was right for an experiment and
wrong for a product. The structured policy now answers in the controller's place, and the row is
stamped `nemesis_policy_fallback` — never `nemesis_policy` — carrying the refusal that caused it, so
a turn the model failed to decide can never be counted as a turn the other arm was chosen for.

## What this does not cover

The figure/vision work from the earlier directive is a separate thread and is deliberately not
mixed in here.

---

## A measurement footgun that has already produced two wrong conclusions

🔴🔴 **Run the web tests as `pnpm test` from `apps/web`, and never any other way.**

🔴 **THE CAUSE IS TWO DIFFERENT `tsx` BINARIES, AND MY FIRST EXPLANATION OF IT WAS WRONG.** I wrote
that it was about quoted versus unquoted globs and how node expands them. It is not. This repo
resolves two `tsx` versions with different module semantics:

```
apps/web/node_modules/.bin/tsx   tsx v4.22.4   <- what `pnpm test` resolves. Keeps ESM.
node_modules/.bin/tsx            tsx v4.21.0   <- the hoisted root binary. Transforms to CommonJS.
```

Under v4.21.0 `import.meta.dirname` is `undefined`, so roughly 85 source-structure test files crash at
import with `The "path" argument must be of type string`. Same tree, same files, one file at a time:

```
../../node_modules/.bin/tsx --test lib/notebooks/parse-thread-env.test.ts   ->  0 pass / 1 fail
pnpm exec tsx --test lib/notebooks/parse-thread-env.test.ts                 -> 16 pass / 0 fail
```

The root `package.json` now declares `tsx@^4.22.4` so both resolve the same version and the skew
cannot come back. Until an install picks that up, use `pnpm test`, or `pnpm exec tsx --test <file>` for
a single file — never the root binary by path.

Two separate agents drew conclusions from that artifact on 2026-08-16: one reported "85 failing tests
on main" and one reported "at least 10 test files have never run, including the test for #643". Both
were the invocation, not the code. The real baseline that day was **0 failures**.

A second, unrelated cause of the same symptom: this checkout's `node_modules` was found **partially
installed** — `react`, `@supabase/supabase-js`, `unpdf` and `fflate` all missing, most likely from an
interrupted install during a disk-space squeeze. `pnpm install` at the root repaired it. If a large
number of tests fail on `Cannot find module`, check that before believing anything else.
