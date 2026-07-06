# Safety & emergency triggers — how the app decides to escalate, refuse, or caution

_Plain-English map of every safety trigger in the answer engine. Written 2026-06-25._

## The one big idea

Safety is built in **layers**, and the strongest layers are **hard-coded rules, not AI**. That
matters: a hard-coded rule can't be talked around by clever wording, because it isn't "thinking" —
it's matching patterns. The AI adds an *extra* cautious net on top, and a final hard-coded scan
checks the finished answer and **throws it away** if it contains anything unsafe. So a dangerous
sentence has to get past three independent gates to reach you, and two of them aren't AI.

The trade-off baked in everywhere: **when in doubt, be over-cautious.** That's why "is celsius
lethal" got the emergency wall — the system would rather wrongly escalate than wrongly reassure.

Here's every trigger, grouped by what it does.

---

## A. Emergency escalation — the "call Poison Control" wall

The most serious response. It **stops everything**, never runs the AI answer-writer, and shows:

> _"This could be urgent. If you may be experiencing a medical emergency, call emergency services
> now. For possible poisoning or overdose in the U.S., contact Poison Control at 1-800-222-1222…"_

Three things trigger it, caught in **two independent places**:

**1. Hard-coded patterns (before any AI runs)** — instant, can't be bypassed:
- **Acute emergency symptoms:** chest pain, can't breathe / shortness of breath, unconscious,
  passing out, seizure, anaphylaxis, severe bleeding, blue lips, blacking out.
- **Overdose wording:** "overdose", "took too many", "too many pills", "swallowed a bottle",
  "how much … to die".
- **Self-harm wording:** "suicide", "kill myself", "end my life", "want to die", "hurt myself".

  _One built-in exception:_ a clearly third-person **research** question that merely names a symptom
  ("is there a study on chest pain") is **not** treated as an emergency — unless it's phrased in the
  first person ("I have chest pain"), which always wins.

**2. The AI triage step (a fast AI read of your question)** — a second net that catches wording the
patterns miss. It's deliberately told to **"flag aggressively, err toward flagging"** anything that
hints at an emergency, too-much-taken, or self-harm. **This is the step that over-reacted to the
word "lethal" in "is celsius lethal."**

**The fix I just built (not yet deployed):** a new hard-coded rule that runs right after the AI
triage and **removes a false emergency label** when the question is a general, third-person
"is X lethal / toxic / dangerous?" — but keeps the full emergency response whenever it's
first-person, an overdose question, a self-harm question, or asks for a *lethal amount* ("lethal
dose of X", "how much X is fatal"). It only ever cancels a lone false alarm, never a real one.

---

## B. Refusals — when the app declines (politely) instead of answering

Each of these shows a fixed, helpful message and never runs the AI answer-writer.

- **Drug sourcing.** Triggers on "where can I buy", "without a prescription", "black market",
  "research chems", etc. → _"I can't help with finding, buying, or sourcing… I can share educational
  information about what a compound is and what the evidence says."_ (Caught both by hard-coded
  patterns and the AI triage.)

- **Made-up / unrecognized drug.** If a drug you named appears in **none** of the real sources we
  pull, the app refuses to invent anything about it and shows the most relevant sources it did find
  instead. (It has one smart exception: an obvious **typo** of a real drug we *do* have evidence for
  is recovered — "Assuming you mean tesamorelin…" — while a genuine fake still gets refused.)

- **No reliable source.** If nothing solid comes back for a specific claim, the app says so plainly
  rather than guessing: _"I couldn't find a reliable public source… please ask your doctor or
  pharmacist."_

- **Hazardous lab-design scope** (Deep Research "lab draft" mode only). If the *purpose* is making
  or extracting a dangerous/controlled substance, building a weapon, or making a pathogen more
  dangerous, it refuses the scope and redirects to legitimate study design.

---

## C. The post-answer safety net — scanning the finished answer

After the AI writes an answer, a **hard-coded scanner** reads it and **discards the whole thing**
(replacing it with a careful fallback + the real sources) if it finds any of these. This is the
"teeth" — it's what makes these phrases genuinely impossible to show you, even if the AI slips:

- **Unsafe reassurance** — "yes, you can take them together", "it's fine to combine".
- **Telling you to change your meds** — "stop taking your medication", "you can stop taking…".
- **Dosing or injection instructions with an amount** — "take two tablets", "inject 250 mcg",
  "start at 0.25 mg and increase to…".
- **Bare safety claims** — "X is safe", "the safest option", "excellent safety profile".
- **Cure claims** — "this will cure your…".
- **"You don't need a doctor."**

It's smart about **negations and questions** — "do **not** stop taking", "**whether** it's safe" pass
fine — and it strips text formatting first so bold/italics can't smuggle a banned phrase past it.

If only one line of an otherwise-good answer trips it, the app **drops just that line** and keeps the
rest (unless it's a high-risk topic like peptides or dosing, where one bad line refuses the whole
answer).

---

## D. Always-on protections (on every normal answer)

- **Talk-to-a-professional pointer.** For anything that's a personal decision, the app always appends
  a "talk to your pharmacist/prescriber" line — even if the AI forgot to.
- **Medical disclaimer** rides on every answer ("educational information… not medical advice").
- **Evidence-grade ceiling.** The confidence badge on an answer can be **lowered** by an auditable,
  pre-computed evidence tier, never inflated.
- **News wall.** "In the news" headlines are kept in a separate, walled-off panel — they're never
  treated as evidence, never cited, never mixed into the answer.

---

## E. The friendly short-circuit (not safety, but related)

A pure greeting / "thanks" / "what can you do" message gets a short conversational reply instead of
being force-fed through clinical search. **Deliberate exception:** a bare "**help**" is *not* treated
as small talk — in a medical app it could be a distress signal, so it goes to the full pipeline where
the AI can pick up on context.

---

## F. Drug-class awareness labels

The AI triage also tags the *kind* of drug involved — **anticoagulant** (blood thinner), **insulin**,
**psychiatric medication**, **controlled substance**, **research-use peptide**, **pregnancy**,
**pediatric**, **chemotherapy**, **immunosuppressant**. These don't refuse anything; they raise the
caution level and make sure the answer routes you to a professional and gets the strictest version of
the post-answer scan.

---

## The order it all happens in (one request)

1. **Hard-coded pre-screen** → emergency / sourcing? Stop here.
2. **Small-talk?** → friendly reply, stop here.
3. Usage limit check.
4. **AI triage** → adds emergency / class labels.
5. **[new] toxicity carve-out** → cancels a false "is X lethal" emergency.
6. Emergency / sourcing labels present? → stop here.
7. Find the real sources (refuse if a named drug is missing / nothing found).
8. AI writes the answer.
9. **Hard-coded scan** of the finished answer → discard if it contains a forbidden phrase.
10. Salvage one bad line, or fall back.
11. Add the professional-routing pointer + disclaimer; lower the grade if warranted.

Layers 1, 9, and 10 are hard-coded and can't be argued with. Layer 4 is the cautious AI net. The
"is celsius lethal" issue lived entirely in layer 4 — and the fix adds a hard-coded correction at
layer 5, the safest place to put it.
