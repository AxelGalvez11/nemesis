# Agent Mode — research and recommendation

_Plain-English memo for the owner. Written 2026-06-25._

You asked: can we rename "Monitoring" to an **"Agent Mode"** that watches topics, shows the
current evidence, separates real evidence from news, and notifies people when something new
appears — borrowing ideas from Scite, Elicit, Semantic Scholar, Litmaps, Research Rabbit, and
Consensus?

## Bottom line first

**The agent you're describing is already built — and it's live in production right now.** The
feature we call "Monitoring" is, under the hood, exactly a topic-monitoring agent. I verified it's
not just deployed but actively running:

- A scheduler (a clock inside the database) runs every hour and re-checks each watch on its
  cadence. A second scheduled job emails the daily digest. Both are switched on.
- There are 2 live watches today, both fully set up, both checked today (most recent check:
  today at 14:00 UTC), with 28 recorded events between them.

All three things you named already exist:

| What you asked for | Status today |
|---|---|
| Monitors topics for you | ✅ Live — you "watch" a drug or condition; a scheduler re-checks it on a cadence |
| Shows the current evidence | ✅ Live — each watch has a "Show the current evidence" button (grade + plain-English bottom line + cited sources) |
| Separates evidence from news | ✅ Live — three visually distinct lanes: **Alerts**, **What's new**, and a **walled-off "In the news"** marked "not verified evidence, never cited" |
| Notifies on new information | ✅ Live — a plan-gated email digest; loud in-app alerts only for conclusion-movers |

So the real question isn't "can we build this." It's **"should we rename/reframe it, and which of
the competitors' smarter ideas are worth adding?"** Both have good answers below.

One thing worth saying plainly: the **evidence-vs-news separation** — which you listed as a goal —
is something **none of the six tools do**. They're all peer-reviewed-papers-only. We already built
the wall. That's genuinely ours, not a copy.

---

## What the live agent already does (the part that's done)

- **The watch loop.** You watch a topic; on a schedule the system asks the live medical sources
  (PubMed, Europe PMC, ClinicalTrials.gov, FDA labels, FAERS) "what's new since last time," and
  compares the answer to a running list of everything it has already seen. Only genuinely new items
  surface. (It detects "new" by stable source IDs, not by re-reading its own answers — which is why
  it doesn't spam false "new evidence!" alerts.)
- **Loud alerts, only for things that matter.** Two triggers fire an alert: a **new high-tier
  study** (meta-analysis, systematic review, randomized trial, or late-phase trial) or a
  **retraction**. Everything else goes in the quiet "What's new" feed. It even re-checks papers it
  already surfaced in case one gets retracted later — a blind spot most tools miss.
- **Quiet first run.** The first check silently records the back catalogue, so you're not buried in
  "new!" alerts for old papers. You only hear about things that appear afterward.
- **Current evidence on demand.** Inside a watch, one button pulls the current cited answer for that
  topic — grade, plain-English summary, top sources — without leaving the page.
- **Notifications, tiered by plan.** Free = 1 watch, weekly, no email. Plus = 10 watches, daily,
  email. Pro = 50 watches, daily, email. The digest ranks what to show.

In competitor terms: we've already built **Litmaps' "Monitor"** loop, **Scite's retraction alert**,
and **Research Rabbit's collection digest** — plus the evidence/news wall none of them have.

---

## The six tools — what to borrow, what we already have, what to skip

**Scite.ai** (known for "smart citations": does a later paper support or contradict an earlier one)
- *Already have:* the retraction alert — and we go further by re-checking already-seen papers for
  later retractions, which Scite's index doesn't do per-watch.
- *Borrow (but carefully — see the R&D item below):* the "a new study may bear on your topic"
  signal.
- *Skip:* rebuilding their licensed 1.6-billion-citation index. We can't, and don't need to.

**Consensus** (known for a yes/no "consensus meter" over papers)
- *Borrow:* the **evidence-quality snapshot** — a small panel showing the makeup of the evidence
  (how recent, how many are meta-analyses/randomized trials, etc.).
- *Skip:* the yes/no "consensus meter" verdict itself. It's vote-counting — blind to study size,
  effect size, and publication bias. It's the opposite of our honesty-first positioning.
- *Note:* Consensus has **no monitoring at all**. Nothing to borrow there; it's our advantage.

**Elicit** (known for turning a research question into a table of papers with extracted data)
- *Borrow (highest-value new idea):* let people watch a **plain-English question** instead of only
  a drug/condition chip, and **score each new paper for how relevant it is** so the digest stays
  high-signal. Also their grounded extraction **table** (already on our roadmap as a separate item).
- *Already have (the guard):* a published study measured Elicit inventing ~4% of its extracted
  numbers. Our faithfulness checker — which verifies every claim against its real source — is
  exactly the protection against that. Lead with it.
- *Skip:* presenting a relevance score as if it were truth.

**Semantic Scholar** (a free academic data platform with an open API)
- *Borrow (optional, later):* their **free** data — an "influential citation" count, one-line paper
  summaries, and a "related papers" endpoint — to rank and enrich what a watch surfaces.
- *Skip:* using it as the "what's new" trigger. Its data lags; our live PubMed feed is fresher, and
  we already use it. Use Semantic Scholar for ranking/discovery, run nightly in the background.

**Litmaps** (citation maps + a "Monitor" alert feature)
- *Already have:* the Monitor loop is the thing we built.
- *Borrow:* their paid tier's extra alert controls (filter by study type/date; faster cadence) — we
  already tier free-weekly vs paid-daily, so this is a small extension.
- *Our edge:* our relevance is based on meaning (text embeddings), so we can flag a relevant paper
  **the day it's published**. Citation-map tools can't — a brand-new paper has no citations yet, so
  it ranks low exactly when it's most urgent (a safety signal).

**Research Rabbit** (citation-network discovery + collection email alerts)
- *Already have:* the collection-style watch + email digest.
- *Borrow:* semantic (meaning-based) matching for "is this new paper relevant" — folds into the
  Elicit idea above.
- *Skip:* using the citation network as the trigger (same cold-start lag as Litmaps).

**Cross-cutting "do not copy":** relatedness isn't quality (we gate alerts by evidence grade +
safety; they don't), newly-*indexed* isn't newly-*published* (we sort on publication date), and an
instant-email firehose trains people to ignore alerts (we batch into a ranked digest).

---

## What's genuinely new and worth adding (in the order I'd build it)

Everything below is additive. The first three keep our safety guarantees untouched. The fourth is a
real research project, flagged as such.

**1. Watch a plain-English question + score new papers for relevance. _(Build first.)_**
Today you can only watch a resolved drug or condition (a chip you pick). Borrowing from Elicit: let
someone watch a question like *"new evidence on semaglutide and heart safety,"* and score each new
result for how well it matches, so the digest surfaces the signal and mutes the noise. This reuses
the text-embeddings we already have, doesn't touch the safety path, and is the single biggest
visible upgrade. Low risk, high differentiation.

**2. An evidence-quality snapshot on each watch. _(Polish.)_**
Borrowing the *useful* half of Consensus: when we show the current evidence, add a small panel —
how recent the evidence is, how many high-tier studies back it, the spread of study types. We
already capture study type and an evidence grade, so this is mostly presentation. (We do **not**
copy their yes/no verdict.)

**3. Background enrichment from Semantic Scholar. _(Optional, later.)_**
Pull their free "influential citation" count and one-line summaries to rank and label what a watch
surfaces ("influential" vs "early"). Runs nightly in the background; never the freshness trigger.

**4. A "this new study may bear on your topic" signal. _(Research bet — build last, validate
carefully.)_**
This is the tempting Scite-style idea: alert when a new study seems to **contradict** the current
evidence. I'm flagging it honestly because it's **not** a quick win and it changes our architecture:

- Today, alerts are decided by deterministic facts (a stable ID is new; a paper is tagged
  retracted) — **no AI judgment in the alert path**. That's a deliberate safety design.
- Judging whether study B *contradicts* study A is an AI judgment, and a different task from what our
  faithfulness checker does (that one checks whether a claim matches *its own* cited source). So this
  is a **new capability with its own accuracy burden**, not a quick redirect of something we have.
- The safe v1 is conservative: **surface** the new study with neutral framing ("this recent study
  may bear on your topic — review it"), rather than the system *asserting* a contradiction it might
  get wrong. Earning the right to say "this contradicts" needs real validation first.

---

## The naming question

The substance is already agentic, and "Monitoring" undersells it — so reframing is reasonable. One
caveat to weigh: in a **medical** context, the word "Agent" can imply the tool is making clinical
decisions or taking actions for the user, which we explicitly don't do. If you like the agent
framing, a grounded name like **"Research Agent"** or **"Evidence Agent"** keeps the energy without
implying medical autonomy. This is a brand call — your decision; the engineering doesn't depend on it.

---

## Recommended next step

1. **Reframe the existing feature** (name + copy) so people see it's an agent working for them. Cheap,
   immediate, no engine risk.
2. **Build item 1** (plain-English question watches + relevance scoring) as the first real upgrade.
3. Then items 2 and 3 as polish; treat item 4 as a separate, validated research project.

Nothing here is blocking the beta — the agent is already live. This is about making what we built
**legible** and then **smarter**, without trading away the safety and honesty that are the moat.
