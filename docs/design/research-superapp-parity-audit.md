# PharmaOrb vs ChatGPT (and friends) — full-surface parity audit + build plan

*2026-07-02 · Owner direction: "combine NotebookLM + ChatGPT UI/UX + scite + Elicit + Manus into one
research super-app (web + app) for science and medicine." This doc compares every ChatGPT product
surface to what PharmaOrb has today (verified in code, not from memory), answers the owner's open
questions, and lays out concrete plans for Monitoring, Agent mode, scheduled background research,
and deliverables.*

*Research basis: web research run 2026-07-02 against OpenAI's help center + release notes and
recent coverage (each section notes what could be stale); PharmaOrb side verified directly in this
repo. Companion docs: `docs/research/evidence-super-app-research.md` (scite / Elicit / Consensus /
OpenEvidence deep-dive), `docs/AGENT_MODE_RESEARCH.md` (agent-mode groundwork),
`docs/design/research-map-spec.md` (Obsidian-style map), `docs/design/chatgpt-ui-parity-plan.md`
(the measured chat-canvas spec — phases 1–5 shipped).*

---

## 0. The scoreboard (read this first)

| Surface | ChatGPT (mid-2026) | PharmaOrb today | Verdict |
|---|---|---|---|
| Chat canvas + composer | Measured spec | Shipped (phases 1–5) | ✅ Parity |
| "+" tools menu | Tools hub + source scoping | Tools hub shipped this branch; filters = planned | 🟡 Close |
| Deep research | Redesigned Feb 2026: plan-edit, steering, fullscreen viewer | Inline runs + scope questions + reports library + exports | 🟡 Strong core, viewer/steering gaps |
| Deep research vs meta-analysis | One tool | **Merged this branch** — one "Deep research" tool, pooled stats when possible | ✅ Done |
| Scheduled / Tasks | Dedicated "Scheduled" page, monitoring tasks, push/email | pg_cron watch checks + dormant email digest; **no user-facing scheduler** | 🔴 Gap = the big opportunity |
| Projects | Files, instructions, project memory, sharing | Workspaces grouping chats/reports/watches (built) | 🟡 Structure exists, no files/instructions |
| Agent mode | Virtual computer, narration, editable .pptx/.xlsx, schedulable | Not built (research doc + locked design exist) | 🔴 Planned below |
| Apps / GPT store | App directory, @-mentions, MCP apps | Explore/browse + calculators; no third-party surface | ⚪ Deliberately skip |
| Deliverables | Agent: editable PPTX/XLSX. NotebookLM: audio/video overviews | **Native cited PPTX / DOCX / PDF export shipped** (reports) | ✅ Ahead on citations, behind on breadth |
| Trust layer | None (no per-source verification) | scite-style tallies, retraction guard, study snapshots, evidence meter — shipped | ✅ **Our moat** |
| Source depth | ~40 visible sources | ~40 visible sources (shipped 2026-07-02) | ✅ Parity |

**Owner questions answered:**

1. **"I thought we merged deep research and meta analysis."** They were still two separate entries
   (in both the mode dial and the "+" menu). As of this branch they are one: the **Deep research**
   tool always runs the meta pipeline — full structured review, plus a *code-computed* pooled
   estimate whenever the studies are genuinely comparable, and an honest "no pooled estimate could
   be computed" note when they aren't. No engine deploy needed — the deployed research function
   already behaves this way; only the UI asked for them separately.
2. **"Does the app give deliverables like NotebookLM (especially PowerPoint), or connect to Google
   Workspace?"** It already gives them **natively**: every Deep research report has one-click
   **PowerPoint (.pptx), Word (.docx), and PDF** export — with real citations carried into the
   deck, which neither NotebookLM nor ChatGPT's agent does with verifiable sources. There is **no
   Google Workspace connection** today. Recommendation below (§6): keep native export as the spine
   (it's differentiated and works for everyone), add "Save to Google Drive / Slides" as a later
   connector once scheduled missions exist — that's when auto-delivery to Workspace becomes
   genuinely useful rather than a checkbox.
3. **"The '+' should be for selecting tools."** Shipped this branch — see §1.

---

## 1. Composer "+" tools menu

**ChatGPT:** one "+" button merges attachments and tools — first screen: attach files, Create
image, Thinking, Deep research, Web search; "More" holds connected apps; agent mode and study mode
via the menu or slash commands (`/agent`, `/Deepresearch`; typing "/" lists tools). Picking a tool
drops a **removable chip** into the composer that scopes the next send; the richer tools add a
"pre-send contract" — rewritten placeholder text, tool-specific starter prompts, and inline
controls (Deep research gets **Apps** and **Sites → Manage sites** source filters; image gets an
aspect-ratio dropdown). The model/effort picker is a separate control. Per-task source scoping:
enter domains and either hard-restrict the run to them or "prioritize these sites, but allow
full-web search."

**PharmaOrb (after this branch):** the "+" menu is now the tools hub —

| Entry | What it does |
|---|---|
| Deep research | Arms the merged Pro report run (cited report + pooled stats when possible) |
| Discovery | Arms the gaps/hypotheses/next-study report |
| Verify a claim | Prefills "Is it true that …" (the flagship framing) |
| Monitor this topic | Carries the typed topic to Monitoring's picker, pre-filled |
| *Search filters* (label) | **News only** and **Communities — Reddit & X**: honest "Soon" entries |
| Add photos & files | Honest "Soon" |

The right-hand dial is now **depth only** (Auto — or Fast/Thorough when simplified modes are off);
report tools no longer duplicate there. When a tool is armed the dial button shows its name, tools
are **single-shot** (the armed mode resets once the run launches — ChatGPT's behavior), and "Verify
a claim" disarms any armed tool so it can never accidentally fire a Pro run.

**Polish parity still open (small, worth taking):** ChatGPT's removable tool *chip* + rewritten
placeholder ("Get a detailed report") + tool-specific starter prompts when a tool is armed. Ours
signals the armed tool only via the dial label — a dismissible chip next to "+" plus a placeholder
swap would close the gap in an afternoon.

**The filters, when we build them (the ChatGPT "Manage sites" analog, adapted to evidence):**
- **News only** — scope a run to the news providers we already fetch for Monitoring's walled panel.
  Output stays walled ("not verified evidence") exactly like the Monitoring news list; it never
  mixes into cited answers. Backend: a `source_filter` param on /ask that skips the evidence
  retrieval and returns only the news surface. Small, contained change — but it touches the ask
  function, so it ships owner-gated like any engine change.
- **Communities (Reddit / X)** — "what are people saying" as a *separate walled lane* next to the
  evidence lane (never cited, clearly labeled, same wall discipline as news). Needs a Reddit/X
  fetch layer we don't have; real work, real differentiation ("here's the claim going around vs
  here's the evidence"). Slot it after missions (§5).

## 2. Deep research

**ChatGPT (Feb 2026 redesign):** three launch paths (tools menu, /Deepresearch, sidebar entry);
clarifying questions **plus an editable research plan** before the run; mid-run steering and source
changes; a **fullscreen report viewer** (table of contents, sources-used section, citations column,
activity history); export to Markdown/Word/PDF; per-task site scoping; connectors as read-only
sources; qualitative plan-tiered quotas.

**PharmaOrb:** launch from "+" or the welcome chip; **scope step already asks clarifying questions**
(chips + free text — parity with their clarify step); runs inline as a live progress card (the
thread stays usable — same as theirs); report lands in the Reports library with citation-style
switching and PPTX/DOCX/PDF export (they don't do PPTX from deep research; we do).

**Real gaps worth taking (in order):**
1. **Editable plan before the run** — we ask clarifying questions but never show "here's my
   research plan — edit it." The engine already produces a search method (databases, queries,
   inclusion notes) *after* the run; surfacing a plan *before* would build trust and steer quality.
2. **Fullscreen report viewer** — our report page is good but flat; a TOC rail for long reports +
   a sources column is straight parity work on `ResearchReportView`.
3. **Mid-run steering** — theirs allows interrupting to adjust focus. Ours is fire-and-forget
   after scope. Lower priority (runs are shorter than theirs).

## 3. Scheduled — ChatGPT "Tasks" vs PharmaOrb

**ChatGPT (June 2026 redesign):** a dedicated **"Scheduled" page** in the sidebar; create tasks
there or by just asking in chat ("let me know when…" → confirmation card in the thread); one-off or
recurring (hourly floor, broad windows like "morning"); **monitoring tasks** that check the web /
connected apps and only notify on meaningful change, remember previous runs, and auto-stop when an
end condition is met; delivery by push, email, or both; task caps by plan (Go 3 → Pro 15); task
pills in chat with Edit/Pause/Delete; agent runs schedulable separately at chatgpt.com/schedules.

**PharmaOrb:** the *infrastructure* half already exists and is live —
- `pg_cron` runs due watch checks hourly and daily digests (`watch_scheduler.sql`)
- watches re-check evidence on cadence; loud alerts only for high-tier studies/retractions
- `watch-digest` builds a daily email (dormant until Resend keys are configured — owner setup)

What's missing is the *user-facing* half: a user can't say "re-run this research every Monday and
send me the deck." **That's exactly the owner's stated idea ("an agent that can research
automatically in background and produce deliverables") — and it's the highest-leverage build in
this doc because every hard piece already exists:** async research runs (`research_report_runs`),
the Reports library, PPTX/DOCX/PDF export, pg_cron scheduling, per-plan quotas, and an email
sender. The missing piece is one table and one scheduler function. Full plan in §5.

**Also in this family — ChatGPT Pulse** (proactive daily briefs, Sept 2025, Plus/Pro mobile): once
a day ChatGPT researches topics from your chats/memory unprompted and delivers scannable cards.
The PharmaOrb analog is *better-grounded*: watches already know exactly what the user cares about,
so the daily digest email (§5) IS our Pulse — evidence-driven cards instead of vibes-driven ones.
No separate feature needed; it falls out of missions + the digest.

## 4. Projects

**ChatGPT:** projects hold chats + uploaded files + project instructions + project memory
(optionally project-only); sharing with chat/edit roles; Google Drive/Slack sources; deep research
and agent runs work inside a project; sidebar pinning/grouping.

**PharmaOrb:** Projects are **built** (`/app/projects`) — workspaces grouping chats, reports, and
watches, with a detail page for adding items. That's the right medical-research shape (a project =
a question you're tracking: its chats + its reports + its monitoring).

**Gaps, in value order:**
1. **Project instructions** ("always answer in the context of pediatric dosing") — small,
   high-value, engine-safe (prepended to the question client-side, clearly delimited).
2. **Files as sources** — upload a PDF and ask against it. Big (a whole ingestion + grounding
   lane); belongs after missions. When built, our trust layer applies to *their* PDFs — that's a
   NotebookLM-grade feature with citations NotebookLM can't verify.
3. **Research Map** — the Obsidian-style connection graph over a project's items
   (`docs/design/research-map-spec.md`). **Now unblocked** since Projects exists; parked
   `EvidenceGraph.tsx` is the seed.
4. Sharing — later; single-player is fine pre-team.

## 5. Agent mode + Monitoring — the unified plan

The agent-mode research (docs/AGENT_MODE_RESEARCH.md) locked the right call: **agent is a mode of
the one Ask chat, not a separate dashboard.** ChatGPT's agent then validated the interaction
grammar: invoked from the tools menu, narrates while it works, interruptible, produces editable
deliverables, and **a finished run gets a clock icon → repeat daily/weekly/monthly.**

**Manus is the purest comp** (the revenue leader in deliverable-producing agents, ~$90M+ ARR) and
its grammar is worth copying deliberately:
- **Plan-before-execute:** the agent shows its step plan up front so the user can intervene — the
  same move as our §2 "editable research plan" gap. One pattern, two surfaces.
- **Live action panel:** a side panel streaming what the agent is actually doing (pages opened,
  searches run), replayable afterward. Our research progress card already streams engine steps;
  the upgrade is keeping that trail on the finished report as its "activity history."
- **Async cloud + notify:** close the laptop; get pinged when the deliverable is ready. Ours
  already runs server-side — the missing half is the notification (missions email below).
- **Scheduled Tasks 2.0 with delivery destinations:** describe task + cadence + where the output
  goes (email, Slack, Google Drive upload, spreadsheet update). This is the model for missions
  `deliver` — start with in-app + email, design the field so Drive/Slack slot in later.
- **Wide Research** (hundreds of parallel sub-agents for breadth tasks) — the far-future analog is
  parallel per-drug evidence sweeps; noted, not planned.

**PharmaOrb's version — "Missions" (scheduled background research producing deliverables):**

1. **Data:** a `missions` table — `id, user_id, project_id?, question, report_mode, cadence
   (daily/weekly/monthly), deliver ('in_app' | 'email' | both), next_run_at, last_run_at, active`.
   RLS like watches. Per-plan caps mirroring the watch entitlement pattern (e.g. Plus 3, Pro 10).
2. **Scheduler:** a `run_due_missions()` pg_cron job (same pattern as `run_due_watch_checks`) that
   calls the existing research function per due mission with the mission's question + mode. The
   run persists to `research_report_runs` → saved report, exactly like a manual run. Nothing new
   in the engine; the mission is just a robot pressing the button the user already presses.
3. **Delivery:** on completion, insert a mission event; email delivery reuses the `watch-digest`
   Resend plumbing ("Your weekly report on tirzepatide is ready — 44 sources, pooled estimate
   updated · open report · download deck"). Push later (mobile app).
4. **UI (chat-first, per the locked design):**
   - On a finished research card in Ask: a **clock icon — "Repeat this research"** (ChatGPT's
     exact affordance) → cadence + delivery sheet. That's the entire creation flow; no new page
     required to start.
   - A **"Scheduled" section on the Monitoring page** listing missions next to watches (they are
     siblings: watches = *alert me when the evidence changes*; missions = *re-research and hand me
     the deliverable on a schedule*). Cards show next run, last report link, pause/delete.
   - Each completed run appends a turn to the mission's conversation — the mission IS a persistent
     thread (the "missions = persistent threads" decision, kept).
5. **Safety unchanged:** missions only run the existing research pipeline with its one safety scan,
   citation enforcement, and faithfulness gates. No browsing, no arbitrary actions — our agent
   researches and produces documents; it does not click around the web with your logins. That's a
   *feature* for medicine, not a limitation, and it's the honest version of "agent mode" we can
   defend.

**How Monitoring should look (the redesign, incorporating missions):**

Today `/app/monitor` is a list of watch cards + an add box, and the detail view is three sections:
loud **Alerts** (high-tier studies / retractions), the quiet **What's new** feed, and the walled
**In the news** list. That anatomy is right — the redesign is about hierarchy and unification:

1. **One "radar" page, two sibling sections:** *Watches* (event-driven alerts) and *Scheduled
   research* (missions, time-driven deliverables). One mental model: "PharmaOrb keeps working when
   I'm gone."
2. **Watch cards get a pulse line:** last check time (exists) + a 7-day sparkline of feed volume +
   an unread-alert badge (exists on detail; surface it on the card). The card should answer "is
   anything happening?" without a click.
3. **Detail view keeps the three-lane wall** (alerts / feed / news — the wall is a trust feature,
   don't soften it) and adds the watch's mission (if any) at top: "Weekly deep-research report ·
   next run Monday · last report → [link/deck]".
4. **Inline current-evidence stays** ("See current evidence" → prefilled Ask) — it's the bridge
   back to chat.
5. **Digest email** is the retention loop — needs the owner's Resend/domain setup to switch on
   (dormant by design today).

## 6. Deliverables — NotebookLM / agent-mode comparison

**ChatGPT agent:** editable .pptx (native vector elements) and .xlsx; slides "in beta, improving."

**NotebookLM (the deliverables benchmark):** a three-panel workspace (sources / grounded chat /
"Studio") whose Studio panel generates a whole artifact menu from the user's uploaded sources:
Audio Overviews (4 formats), Video Overviews, **Slide Decks (download as PDF or PPTX — notably no
native Google Slides export)**, Reports ("Export to Docs"), Data Tables ("Export to Sheets"),
Mind Maps, Infographics, Flashcards, Quizzes. Everything is grounded ONLY in uploaded sources with
passage-level inline citations, and it declines to answer beyond them. Quotas tier from free
(~3 audio/video per day) up through Google's AI plans. **What it does NOT do: verify those sources
— no retraction check, no supporting/contrasting context, no evidence grading.**

**PharmaOrb:** cited **PPTX / DOCX / PDF** from every deep-research report — the citation table in
the deck is identical to the report's (one shared builder), grades and provenance included. This is
the "cited deliverables" market hole the super-app research identified (Gamma at ~$100M ARR,
uncited). **Verdict: we are ahead where it matters (verified, graded citations in the deck; even
NotebookLM only cites, never verifies) and behind on breadth (no audio/video/flashcards/tables, no
Workspace push).**

Priority: (1) missions auto-producing decks on schedule (§5 — turns exports from a button into a
subscription; Manus explicitly markets "auto-refreshed weekly decks" as a combo); (2) "Save to
Google Drive/Slides" connector after that (NotebookLM itself ships PPTX-download-first — native
export is a respectable default, not a stopgap); (3) an Elicit-style **data table** deliverable
(§7) before audio/video — for science users a cited extraction table beats a podcast.

## 7. scite + Elicit — the evidence-layer comps (the other half of the owner's formula)

Deep detail lives in `docs/research/evidence-super-app-research.md`; what belongs in THIS audit is
where we stand against each:

- **scite** (Smart Citations: every citing statement classified supporting / contrasting /
  mentioning, with the exact snippet, over ~1.2B citation statements): **largely absorbed.** The
  trust layer shipped 2026-07-02 gives every source scite-style tallies, a retraction guard, and
  study snapshots — free-data equivalents (OpenAlex, Retraction Watch) of scite's paid layer. Gap
  remaining: we show *tallies*; scite shows the *snippets* behind them. Snippet-level context is a
  natural trust-layer v2.
- **Elicit** (systematic-review workflow: reproducible multi-database search → title/abstract
  screening → full-text screening → structured extraction into a table of PICO fields, effect
  sizes, risk of bias): **the real remaining gap.** Our meta pipeline already does the hard core
  (PICO pinning, count extraction, grounding, pooling) but exposes it only as report prose + a
  forest table. An **extraction-table deliverable** ("every study × population / n / effect /
  design / risk notes", exportable) would put us head-to-head with Elicit's flagship at a fraction
  of their $Pro price — and ours would carry the trust badges.
- **Citation-rendering synthesis** (the critic's cross-product point): ChatGPT renders link chips
  + a sources sidebar; NotebookLM renders passage-level numbered cites; scite renders classified
  snippets; Elicit renders cell-level cites in tables. PharmaOrb already does chips + panel +
  passage highlights + per-claim meters — the one rendering mode we lack is **cell-level citations
  in a table**, which the extraction-table deliverable would add.

## 8. Apps / GPT store

ChatGPT's Apps directory (MCP-based iframe apps, @-mentions, permission tiers) and the legacy GPT
store solve a *platform* problem — thousands of use cases OpenAI won't build themselves. PharmaOrb
is a vertical product: our equivalents are the built-in tools ("+" menu), the drug/topic Explore
catalog, and the calculators. **Deliberately skip** building an app store; revisit only if/when
third parties actually want to ship evidence tools on our rails. (If we ever expose our engine to
agents, MCP is the standard to speak — same protocol ChatGPT apps use.)

## 9. Build order (recommendation)

| # | What | Size | Why now |
|---|---|---|---|
| 1 | **Missions v1** (§5: table + cron + clock-icon + Monitoring section + email) | M | The owner's stated idea; every hard piece already exists; nothing else in this doc compounds like a subscription to your own research |
| 2 | Fullscreen report viewer (TOC + sources rail + activity trail) | S | Cheap parity; makes every report (incl. mission output) feel premium |
| 3 | Extraction-table deliverable (Elicit's flagship, our trust badges) | M | The §7 gap; reuses the meta pipeline's grounding; adds the one citation-rendering mode we lack |
| 4 | Project instructions | S | High value, engine-safe |
| 5 | Editable pre-run research plan (also Manus's plan-before-execute) | M | Trust + steerability for deep research |
| 6 | Armed-tool chip + placeholder swap in composer | S | Closes the §1 polish gap |
| 7 | News-only filter ("+" menu goes fully live) | S–M | Owner-gated engine change; completes the tools menu |
| 8 | Research Map v1 (project-level graph) | M–L | Now unblocked by Projects; the wow surface |
| 9 | Communities lane (Reddit/X, walled) | L | Real differentiation; needs a new fetch layer |
| 10 | Project files as sources | L | NotebookLM-grade; our trust layer on user PDFs |

---

## Appendix — research caveats (flagged by the verification pass, not yet corroborated)

Treat these specific claims as *probable but unconfirmed* before quoting them externally:
ChatGPT Canvas retirement date (May 28, 2026) and the exact June 2026 model-picker labels; the
"Scholar Gateway" connector name; "Thinking" as a Free/Go tools-menu item; NotebookLM's PPTX-export
date (March 2026) and Ultra-tier framing; Manus's ~$125M run rate (public reporting says ~$90M).
None of these change any recommendation above. Also deliberately out of scope here: ChatGPT voice/
record mode, memory/personalization details, and study-mode pedagogy — none are near-term
priorities for an evidence engine (voice dictation is table stakes we already stub in the composer;
memory has a sharper PharmaOrb answer in Projects + watches than generic chat memory).
