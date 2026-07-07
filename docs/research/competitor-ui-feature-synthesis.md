# PharmaOrb vs. the Research-AI Field — Full UI/UX + Feature Teardown

_Written 2026-07-02, deep click-through 2026-07-03. Method: every product was opened live in Chrome on the **same question — "what is retatrutide"** and then **clicked through control-by-control** — composer buttons, sidebar tabs, model pickers, filters, per-paper drill-downs, export menus. This is a hands-on teardown, not a spec sheet. Products: our app (app.pharmaorb.app), ChatGPT, Elicit, Scite, Consensus, NotebookLM, ResearchRabbit, Manus, Obsidian graph._

---

## The one-paragraph answer

Our evidence **engine** is genuinely ahead of the field, and clicking through everything confirmed our **product surface is richer than I first credited** — we already have an evidence map, a per-paper "also reviewed / not cited" pool, live monitoring, projects, and document deliverables (Word/PPT/PDF with citation-style switching). The real gaps that survived the deep pass are narrower and sharper: **(1) per-paper evidence intelligence** (journal quality tier, citation counts, verbatim supporting quotes) — Consensus is clearly ahead here; **(2) media deliverables** (audio/video/mind-map/flashcards/quiz) — NotebookLM owns this; and **(3) a directional living-claim page** that fuses a verdict with monitoring — which *nobody*, not even Consensus, has built. The engine race is ours; the finish-the-workspace race is where the work is.

---

## Correction to my first-pass report

The deep click-through overturned several things I claimed we lack. For the record, we **already have**:

- **An Evidence Map** — a strength × recency scatter (year on x-axis, evidence strength on y-axis; filled dot = cited in the answer, hollow = reviewed-but-not-cited; click a dot to open the source). I wrongly said "only forest plots."
- **Per-paper metadata in Sources** — each source shows type (Research Article), study design, sample size (n=98), and **citation count ("Cited by 247")**, plus an **"Also reviewed · searched, not cited (34)"** honesty pool showing the full 38-source search, not just what we cited.
- **Projects is live** — grouping chats + Deep Research reports + monitoring watches into one workspace (a "GLP-1 research" project exists).
- **Document deliverables are live** — Reports export to **Word / PowerPoint / PDF** (all "cited"), toggle **citation style (Vancouver / AMA)**, carry a **"How this report was researched" + 5-sub-question** transparency trail, mark claims **fact-checked**, and offer **"Repeat this research"** (schedule) + **"Watch this report"** (monitor).

So our deliverables gap is specifically **media** deliverables, and our source gap is specifically **per-paper quality grading**, not "no map / no export / no projects."

---

## Part 1 — PharmaOrb, control by control (what's actually there)

**Sidebar / workspace:** New chat, search, **Ask / Reports / Monitoring**, **Projects**, recent chats, plan badge ("pro · 1/250 today").

**Composer:** a **"+" tools menu** (Verify a claim, Monitor this topic, and filters "News only" / "Communities — Reddit & X" / "Add photos & files" marked _Soon_), a **Fast / Thorough** depth toggle, mic, send.

**Landing:** "What can I help you research?" + starter chips (Verify a claim · Deep research · Is this good for me? · Evidence brief on a drug · Deep-check a viral claim · Compare two treatments · Find the research gaps).

**Answer:** a **"Thought through evidence"** reasoning trail; a whole-answer **evidence badge** (MODERATE); prose in a **"What the evidence shows"** section with bolded numbers; **inline source pills welded to sentences** (PubMed +2); a **per-claim confidence meter on each point** (our signature — no competitor does sentence-level confidence); a **Sources** button; copy.

**Evidence panel (right):** header "38 sources searched · 24 PubMed · 11 trials · 3 FDA · LIVE"; **Sources tab** (cited + "also reviewed not cited" pool, per-paper type/design/n/cited-by); **Map tab** (the strength×recency scatter); footer "dense · rerank-2.5".

**Reports:** Deep Research + Discovery groups; detail view = citation-style toggle, Word/PPT/PDF export, Repeat/Watch, sub-question trail, evidence-base table.

**Monitoring:** live daily watches (Atorvastatin, Mounjaro — "checked 8h ago", "2 of 50 used"), + a **Scheduled Research** section (Missions).

---

## Part 2 — Each competitor, control by control

### Consensus — the closest competitor, and the most feature-complete
The one to study hardest. Two-panel (structured answer + 1.1K References).
- **Composer:** **"+"** = Add sources (Upload papers / Import from **Zotero** / saved collections as attachments). **Corpus** dropdown = **All (200M papers) / Medical (top journals + guidelines, ~8M) / My Library**. **Deep** = a deep-research toggle ("3 uses left"). **Filter** drawer = publish year, **journal rank Q1–Q4**, **min citations**, **exclude preprints**, **open-access**, **methodology** (study design / sample size / duration), **publishers**, **fields of study**.
- **Answer:** auto-structured headed sections (What It Does / Key Trial Findings / Safety And Status), bolded numbers, **inline author-year pills welded to sentences** — nearly identical to ours. A transparency trail ("Pro · 2 searches → retatrutide 1.1K · Read 20 abstracts/PDFs"). Ends with a **clinician disclaimer** like ours.
- **The Consensus Meter is claim-gated:** because "what is retatrutide" isn't yes/no, no meter appeared — instead it **offered to convert it**: "CONSENSUS METER · Does retatrutide improve glycemic control in type 2 diabetes?" (exactly the right UX for our confidence meter). Plus "Get a lit review" action.
- **References panel:** three view modes (card / compact / **table**), export/download, per-paper badges (**RCT · LARGE HUMAN TRIAL · N supporting quotes**), checkboxes to select papers.
- **Per-paper drill-down (deep):** tabs **Overview / Snapshot / Evidence / Metadata**; **journal quality (Nature Medicine, Q1 SJR)**, **219 citations / 16 influential**, DOI, abstract, PDF; **Snapshot** = structured extraction (Pro); **Evidence** = **5 verbatim supporting quotes** (Q01–Q05) with "Show in full text."
- **Tools:** **Paper search**, **Citation Graph** (BETA — seed-paper network builder like ResearchRabbit), My Library, History.

### Elicit — the academic transparency + extraction standard
- **Workflow dropdown:** **Research agent / Report / Systematic review (Pro)**; **Tools:** **Find papers / Chat with papers / Extract data (Pro)**.
- **Deliverable quick-actions:** **Create table / Generate slides / Draft report / Map landscape** (the data-extraction table is Elicit's flagship).
- **Answer:** a **"Ran analysis — 6 searches"** panel listing every sub-query (Academic/Clinical-trial, Max 10 each); inline author-year citations; follow-up chips.
- **Citation drill:** clicking a pill opens a **Citation panel with the exact numbered grounding snippets** from the paper (not just a link) — claim-to-sentence provenance.
- **Sidebar:** New / Recents / Library / **Alerts**.

### Scite — the "supported vs disputed" engine (hard-paywalled today)
- Two right-panel tabs: **References** and **Search Strategy** (it generates a boolean query: `("retatrutide" OR "LY3437943" OR "triple agonist") AND (...)`).
- Pitch (from its own upgrade screen): **"built on paywalled research other AIs can't reach," alerts when findings are supported or challenged, dashboards, connect to ChatGPT/Claude via MCP.** Its signature is classifying citations as **supporting / mentioning / contrasting** — the "evidence-against" set we're missing.

### NotebookLM — the deliverables powerhouse
- Three panels: **Sources / Chat / Studio**.
- **Add sources:** Upload (pdf/images/docs/audio) / **Websites + YouTube** / **Drive** / Copied text / web search (Fast Research).
- **Studio (the story):** **Audio Overview, Video Overview, Slide Deck, Mind Map, Reports, Flashcards, Quiz, Infographic, Data Table** — one corpus → ten artifacts. Chat is grounded strictly in your sources, with a "Thoughts" trail.
- Top bar: Create notebook, Analytics, Share, Settings.

### ResearchRabbit — the citation-network explorer
- **Modes:** **Similar / References / Citations** toggle (changes graph edges); **Looking for: Articles / Authors**.
- **Graph:** paper nodes wired by citations; a node click opens an **Article panel** (abstract, DOI, Save-to-Collection) with a **"Dive deeper: Similar 2.8k / Refs 22 / Cited By 810"** bar to expand from any node.
- **Views:** graph / list / grid / column; filter; extracted **Keywords** panel.
- **Library:** Collections (folders), Recently Found, All Articles; import/export via **Search / BibTeX / Zotero** — it doubles as a reference manager.

### Manus — the general agent
- **Plan checklist:** decomposes the task into steps ("Research retatrutide from credible sources ✓ / Deliver a comprehensive explanation ✓ — 2/2").
- **Composer "+":** Add from **Figma / OneDrive / Google Drive / local files**, **Plan**, **Use Skills**, Recent files; plus **fork** and a **Computer** view (agent's virtual desktop). Model selector "Manus 1.6 Lite."
- **Sidebar:** New task / Agent / Plugins / **Scheduled** / Library / Projects. Deployable to Telegram / Slack / LINE. Horizontal, not vertical — no domain guardrails.

### Obsidian graph — the visual language, not a competitor engine
An interactive node-graph of notes (each note a dot, links as edges). It's the **aesthetic target** for our Research Map, not a research tool with buttons. ResearchRabbit/Consensus show the citation-network version; Obsidian shows the personal-knowledge version.

---

## Part 3 — Engine comparison (same question, side by side)

| Engine | Sources on this Q | Citations | Provenance depth | Honesty signal | Domain safety |
|--------|-------------------|-----------|------------------|----------------|---------------|
| **PharmaOrb** | 38 (24 PubMed / 11 trials / 3 FDA), shows the full pool | Real, inline, per-claim | Source pills + per-claim **confidence meter** | Evidence grade + "science state" + FAERS "signal not proof" | **Strong** — safety routing, guardrails |
| **Consensus** | 1.1K found, 20 read | Real, inline author-year | **Verbatim supporting quotes** + journal Q-rank + citation counts | **Consensus Meter** (claim-gated) | Medium — Medical mode filter, disclaimer |
| **Elicit** | 6 sub-queries, ~10/each | Real, inline author-year | **Exact grounding snippets** per citation | Shows every sub-query | Low — general academic |
| **Scite** | (paywalled) | Real | **Supported / disputed** tallies | Supporting-vs-contrasting counts | Low |
| **ChatGPT** | 55 browsed | Inline, but **mixes company PR** (investor.lilly.com) with journals | Activity/Thinking trail | "Thought for 15s" | **None** — no FAERS/label logic |
| **NotebookLM** | only what you upload | Grounded to your sources | Source-grounded | "double-check responses" | None |
| **ResearchRabbit** | citation graph of 4 seeds → 2,169 | Metadata only | Abstracts, cited-by counts | — | None |
| **Manus** | agent-chosen | Agent-cited | Plan checklist | — | None |

**Reading:** Our engine wins on **domain safety** and **per-claim honesty** outright. Consensus, Elicit and Scite beat us on **per-paper provenance depth** (verbatim quotes, journal quality, supported/disputed). ChatGPT is fast and broad but its source mix is the weakest (company PR treated like evidence) and it has zero domain safety.

---

## Part 4 — UI/UX comparison

| Dimension | Who's best | Where we stand |
|-----------|-----------|----------------|
| **Answer legibility** (prose + inline cites + bold numbers) | **Tie: us / Consensus / ChatGPT** | Already at parity — our per-claim meter is a differentiator |
| **Retrieval transparency** (show the searches) | **Elicit / Consensus** | We have a "Thought through evidence" trail + 5-sub-question report view; we don't surface the sub-queries as a list yet |
| **Per-paper reference panel** | **Consensus** | We show type/design/n/cited-by; we lack journal Q-rank, influential-citation counts, verbatim quotes |
| **Deliverables** | **NotebookLM** (media) | We own document deliverables (Word/PPT/PDF + citation styles); we lack audio/video/mind-map/flashcards/quiz |
| **Discovery / maps** | **ResearchRabbit / Consensus** | We have a strength×recency Evidence Map; we lack a citation-network graph |
| **Monitoring / agentic** | **PharmaOrb** | We win — live daily watches + Missions; Consensus/Elicit are one-shot, Manus is general |
| **Composer power** (tools, filters, corpus) | **Consensus** | Their Q-rank/methodology/corpus filters are deeper than our "+" tools menu |

---

## Part 5 — What to copy, ranked by leverage

| # | Steal this | From | Why | Foundation we already have |
|---|-----------|------|-----|----------------------------|
| 1 | **Media deliverables shelf** (audio / mind-map / flashcards / quiz) | NotebookLM | Biggest missing surface; turns one answer into ten return visits | Word/PPT/PDF export + report engine |
| 2 | **Per-paper evidence intelligence** (journal Q-rank, influential-citation count, **verbatim supporting quotes**) | Consensus + Elicit | Upgrades our per-*entity* grade to per-*paper*; makes the Sources panel itself trustworthy | Per-entity grader, study-type classifier, cited-by already shown |
| 3 | **Supported-vs-disputed** split (evidence-against set) | Scite | Our audit's "keystone" gap; makes the confidence meter honest both ways | Grading engine + reserved `conflicting` gap type |
| 4 | **Claim→meter conversion** ("turn this into a yes/no we can measure") | Consensus | Right UX for our confidence meter / "Verify a claim" | Confidence meter + Verify-a-claim intent |
| 5 | **Surface the sub-queries** as a list | Elicit + Consensus | Near-free trust win; we already multi-query internally | "Thought through evidence" trail + 5-sub-question report view |
| 6 | **Evidence-quality filters** (journal rank, exclude preprints, min citations, Medical mode) | Consensus | One-click "only top-tier evidence" | Source metadata + tiering exist |
| 7 | **Citation-network Research Map** | ResearchRabbit + Consensus + Obsidian | Owner's north-star visual; complements our strength×recency map | Source metadata; Projects live |
| 8 | **Living claim page** with a directional verdict that updates in place | (none — our whitespace) | The one square nobody occupies; fuses our answer + monitoring | Report + watch halves + Missions live |

**Top of the list:** #1 (media deliverables — most visible deficit), #2 (per-paper intelligence — cheapest high-trust win, Consensus's clearest lead over us), and #8 (living claim page — the defensible whitespace). #2, #4, #5, #6 all attach to graders and trails we already run.

---

## Bottom line

Clicking through everything sharpened, not softened, the conclusion. We are winning the **hard invisible half** (graded evidence, per-claim honesty, domain safety, monitoring) and — more than I first credited — we've already built much of the **workspace** (map, projects, document deliverables, honesty pool). The three places a rival is genuinely ahead are **per-paper provenance depth (Consensus), media deliverables (NotebookLM), and supported/disputed (Scite)** — all additive to our engine, none requiring a rebuild. And the highest-value square on the board — a **directional living-claim page that updates as evidence changes** — is still empty, and it's the one only we are positioned to take, because only we have the monitoring backbone to power it.
