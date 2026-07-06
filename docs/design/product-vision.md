# PharmaOrb — Product Vision

> **Status:** NORTH STAR (2026-07-04). The doc every build checks itself against.
> Companions: `manus-parity-spec.md` (UI/UX), `research-action-layer-spec.md` (agent-that-acts),
> `manus-journal-club-run.md` / `manus-design-tokens.md` (run anatomy + tokens).

---

## 1. North star (one line)

**An automation platform with a research-grade brain** — it opens like a chatbot, connects to your
apps, and hands back finished work, and you trust it because it stands on real academic sources.

**Automation is the feature.** A user first meets it as a chatbot; the moment they connect an account
or point it at a task, it becomes an agent that operates their apps and returns finished deliverables.
Cloud-first — **nothing to install but the mobile app.**

The reframe: not "a research chatbot that also automates" → **"an automation platform that happens to
be world-class at health/research."** The evidence brain is the moat *under* the automation.

---

## 2. Who it's for (personas, in their words)

- **Chatbot user:** "I can just ask it things."
- **Automation user:** "openclaw, but cloud — I get the same as my friends' automation tools without
  downloading anything but the app."
- **Researcher:** "Better research, real citations, non-generic slides — it caught papers I'd never
  have found and it doesn't output generic decks."
- **Student:** "It records my lectures and meetings, logs into my LMS to pull and do the work, so I can
  focus on learning — and I trust it because it's always academic sources."

**Beachhead** (first market, not final): researchers + students drowning in papers, lectures,
deadlines, and decks. Expand outward from there.

---

## 3. The brain — intelligence + sourcing

Behaves as intelligently as a frontier model (Fable-5-class), not a narrow medical bot.

1. **Frontier-level reasoning.** Heavy reasoning routes to a frontier model (Claude 5 / Fable class);
   cheap models handle the easy stuff to keep cost sane.
2. **Stays current — learns terms not in its training.** When it hits something past its cutoff (a new
   drug, a 2026 tool, unfamiliar jargon) it **looks it up live and grounds the answer in what it found**
   instead of guessing. This is the trust pillar pointed at currency: don't hallucinate — find it and cite it.
3. **Domain-aware sourcing (a router in front of the engine):**
   - **health/medical** → the frozen safety layer + trusted clinical/medical sources (the moat, untouched);
   - **research in any field** → scholarly sources (OpenAlex already spans every discipline, not just medicine);
   - **everyday/general** → general web + reasoning (no forcing PubMed onto "write me a cover letter").

**Engine impact:** the medical path stays exactly as it is — frozen, safe, trusted sources. What's new
is the router: medical goes down the safe path, everything else gets general intelligence + the right
non-medical sources. Raising the *medical* path's raw model to frontier-class is doable but a **careful,
538-test-guardrail-gated change**, not a casual flip. The general path can use a frontier model freely.

**Honest trust claim (keep it scoped):** the moment it uses non-medical sources for non-medical
questions, "it *always* uses academic sources" is no longer literally true. Truthful version, still a
killer claim: **"for anything research or health, it always stands on trusted academic/medical sources;
for everyday stuff, it's a sharp general assistant."**

---

## 4. What it takes in (inputs)

- **Mobile records any meeting or lecture** — general meetings, not just class — transcribes it, and
  feeds it to the engine as material. (New capability: mobile audio capture + transcription.)
- Uploaded documents, connected sources, and the live web.

## 5. What it hands back (deliverables)

Research with **real citations** and papers a person would've missed; **decks that aren't generic**;
plus reports, notes, flashcards, study plans, and drafts. **Finished work, not a wall of text.**
(These are the "produce-actions" in `research-action-layer-spec.md`.)

---

## 6. How it connects (automation) — two tracks

- **API track** — apps with an API (Gmail, Google, Outlook/Microsoft Graph, Notion, Canvas-with-API):
  clean OAuth connections.
- **Playwright / cloud-browser track** — apps *without* a usable API (many LMS, school/work portals):
  a **cloud browser that logs in and drives the site like a person.** Realistically:
  **you log in once in the session** (including the MFA the school forces) → it **saves that session**
  and reuses it until it expires → then it navigates, reads, extracts, and operates the site. This is
  **genuine new infrastructure** (a browser running in the cloud, beyond today's edge functions), and
  it's the right tool for the no-API sites.

**Action model** (from `research-action-layer-spec.md`): **read → produce → push**, **approval-gated by
default** — *draft, don't send; propose, don't submit; fill, don't finalize.* Nothing external happens
until the user approves.

---

## 7. Guardrails — what keeps the product alive

1. **Academic integrity (positioning, not a feature cut).** It does the research, extracts the material,
   and **drafts** the work; **the student reviews it, learns from it, and owns the submission.** Never
   positioned as "does your graded homework and turns it in as you." That framing = academic misconduct
   under every university policy, likely App-Store rejection, and blacklisting by the LMS providers we
   need. "Focus on learning" only happens if the student stays in the loop.
2. **Human-in-the-loop for consequential writes.** Extract + draft = full send. **Auto-submitting work
   through a school portal — or any consequential external action — stays a you-click-approve step.**
3. **Research tool, not "Dr GPT."** No patient-care instructions, no clinical actions. The frozen
   `supabase/functions/ask/**` safety layer is never edited or bypassed; safety-routed content can never
   be turned into a deliverable or pushed anywhere.
4. **Honesty.** Real data and real sources only — no fabricated citations, no fake "watch it work" theater.

---

## 8. What we are NOT building

- A **general-compute operator** (runs arbitrary code/commands, operates any app to take any action) —
  off-moat, a fight with the giants, and a safety liability.
- A **clinical decision tool.**
- An **academic-cheating tool.**

---

## 9. Build sequencing

**Now / on-moat / low-risk**
- Manus-style UI reskin (makes it *feel* like an agent) — in progress on `feat/manus-skin`.
- Produce-actions: real decks / reports / flashcards / study plans from cited reports.
- Lecture/meeting record → notes (mobile audio + transcription).
- First read-connector: Zotero (paste-a-key, no OAuth).

**Next**
- Domain router + general-source + frontier-model reasoning for non-medical prompts.
- OAuth spine + Google Drive / Canvas read.

**Later / heavier**
- Playwright LMS track (attended login, read/extract; submit stays human-in-the-loop).
- Push-actions (Drive / Calendar / Notion), approval-gated.
- Mobile app + the audio-capture/transcription infra at scale.

**Always true:** merges to production, engine deploys, and DB migrations are owner-gated.
