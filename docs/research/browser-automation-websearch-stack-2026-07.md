# Nemesis agent stack — browser automation & web search (July 2026)

*Research + verdict. Question from owner: "Does onboarding ask for the essential school
sites (Blackboard/Canvas/Brightspace/email)? Is the agent equipped with the best website
automation as of July 2026? What about web search? What's the most optimal stack (GitHub
repos included)?"*

*Generated 2026-07-12. Sources at the bottom. GitHub star/currency figures are from
web sources (the GitHub API token was stale during this run).*

---

## TL;DR verdict

1. **Onboarding does ask for the school sites** — the `/welcome` wizard's Step 1 embeds the
   full Connections panel ("Sign in on the real site, in Nemesis's own browser. Your logins
   stay on this Mac."), then Step 2 offers a one-click "Read my semester" sweep of Blackboard.
   It supports Blackboard, Canvas, Brightspace/D2L, Moodle, Schoology + school email.
   **One real papercut:** a fresh install still defaults the LMS to the owner's
   `blackboard.uthsc.edu`, and nothing forces a new student to change it before continuing.

2. **Browser automation is already the leading open-source approach, and it fits the hard
   constraint.** Nemesis's engine is `agent-browser` = the **Agent Browser Protocol (ABP)**,
   the #1 open-source browser agent on the realistic Online-Mind2Web benchmark (July 2026).
   Combined with Nemesis's own **visible, logged-in, persistent-cookie Chromium driven over
   CDP**, it already solves the #1 production failure other frameworks hit (fighting login
   flows every run). This is the correct architecture for auth-gated LMS work. **No migration
   recommended.** Small hardening opportunities only (below).

3. **Web search is solid but has one strategic wrinkle.** Nemesis uses a multi-backend web
   layer (Tavily/Exa/Firecrawl/Parallel) behind a metered server-side proxy — the right shape.
   But the shipped **primary is Tavily, which was acquired by Nebius (Feb 2026, up to $400M)**;
   analysts expect its roadmap to tilt toward enterprise. Because search is metered and billed
   to students, **cost-per-call matters** — and cheaper, equally-or-more-accurate options
   (Linkup, Exa, Brave) are already wired as backends. Recommendation: keep the abstraction,
   re-point the default.

---

## The binding constraint (read this before any "switch to X")

The question invites a tools leaderboard. The honest framing is narrower. Nemesis's core
browser job is **not** "be the most capable web agent in the abstract." It is:

- **Auth-gated LMS with no public API** (Blackboard/Canvas/Brightspace). The student *must* be
  logged in; there is no key-based path.
- **Credentials & cookies stay on the student's Mac** (local-first positioning + privacy).
- **Maintained by one non-engineer.** Fewer moving parts and external, maintained deps win.
- **Metered & billed.** Cost-per-action (tokens + per-call fees) is a margin line.

That constraint **disqualifies cloud headless browsers for the core LMS job on arrival** —
shipping a student's Blackboard password to Browserbase / Browser Use Cloud / Steel Cloud is a
non-starter on both privacy and positioning. So the incumbent to beat is Nemesis's *current*
"visible local Chromium over CDP + persistent cookie profile," and it is already the right
answer. Cloud engines remain useful only as an *optional* backend for public, unauthenticated
tasks.

Two axes keep the analysis honest:
- **Perception/action engine** (how the agent sees & acts): accessibility-tree vs DOM vs vision
  vs hybrid. *This is the only axis where a change could matter.*
- **Runtime/hosting** (local-visible / local-headless / cloud). *Largely settled by the
  constraint above.*

---

## Part 1 — What Nemesis runs today (code-grounded)

### Onboarding (`apps/desktop/src/app/welcome/`)
- Gated by a `nemesis.onboarding.v1` localStorage flag (`onboarding.ts`).
- **Step 0** — intro: "It runs the work around school. Let's connect your semester."
- **Step 1 — Connect:** embeds `<ConnectionsSettings />`. Student sets their LMS by URL
  (placeholder `blackboard.myschool.edu or canvas.myschool.edu`) and signs in inside Nemesis's
  own browser. Brand auto-detected (`lmsNameFor`): Blackboard / Canvas / Brightspace-D2L /
  Moodle / Schoology.
- **Step 2 — First sweep:** two one-click agent jobs —
  - *Read my semester* → agent prompt: "connect to my school accounts and read my semester:
    every course on Blackboard — syllabi, slides, lecture files, announcements, due dates …
    file into Library, update calendar + semester graph" (uses `nemesis-graph`, `nemesis-ledger`).
  - *Find my study materials* → local files + Anki + Quizlet (`nemesis-import`).
- **Step 3 — Ready:** "Nemesis is watching your semester now."

**Portals model (`apps/desktop/src/lib/school-portals.ts`):** LMS + school email stored in
localStorage, mirrored one-way to `~/Documents/Nemesis Library/.nemesis/portals.json` so the
agent navigates to the same portal the UI shows. **Default = the owner's UTHSC Blackboard +
Outlook** — deliberately, from when Nemesis had a single user. *This is the papercut:* a
non-UTHSC student who clicks "Continue" without editing inherits the wrong school.

### Browser automation (`tools/` + `apps/desktop/electron/`)
Layered, and stronger than "fine":
- **Engine: `agent-browser` (npm `^0.26.0`) = Agent Browser Protocol (ABP).** Accessibility-tree
  (`ariaSnapshot`) page representation + `@e1/@e2` ref selectors → token-efficient, model-agnostic,
  no vision required. External, actively-maintained (v0.25.3+ added `--engine lightpanda`).
- **Desktop runtime = a persistent, VISIBLE Chromium driven over CDP** (`school-browser.ts`,
  port 9333; newer default = native Electron `WebContentsView`s that are themselves CDP targets,
  `school-view.ts`). Mirrored live in the chat right rail. **Profile dir persists Blackboard/
  Outlook cookies across restarts**; the student types credentials into the mirror (trusted CDP
  input) or the real window — never into chat. Download behavior set at browser scope so LMS
  slides/PDFs and email attachments actually save.
- **Optional stealth backend: Camoufox** (`browser_camofox.py`, `github.com/jo-inc/camofox-browser`)
  — anti-detection Firefox, local REST on 9377.
- **Optional cloud backends:** Browserbase, Browser Use Cloud (auto-detected from creds).
- **Vision fallback:** `tools/computer_use/` for pages where DOM/a11y parsing is unreliable.

### Web search (`tools/web_tools.py` + metered proxy)
- `web_search_tool` + `web_extract_tool`, backend-selectable: **Exa, Firecrawl, Parallel, Tavily.**
- Ships behind a **server-side metered proxy** (Tavily search + Firecrawl extract) so students
  need no keys; extraction compressed via OpenRouter + Gemini 3 Flash.
- The multi-backend abstraction already follows the analyst advice ("abstract your search
  dependency behind a clean interface").

---

## Part 2 — The landscape, scored against the constraint

### Browser automation

**Online-Mind2Web** (300 realistic tasks / 136 sites; the benchmark that hasn't saturated,
updated 2026-07-10). WebVoyager is now saturated (98%+) and less informative.

| Rank | Agent | Success | Open? | Notes |
|---|---|---|---|---|
| 1 | Browser Use **Cloud** (bu-max) | 97.0% | Hosted | Model-agnostic (Claude Agent SDK) — but cloud |
| 2 | GPT-5.4 Native Computer Use | 93.0% | Closed | Tied to GPT-5.4 |
| 3 | **ABP + Claude Opus 4.6** | **90.5%** | **Open** | **Agent Browser Protocol = Nemesis's engine** |
| 4 | TinyFish | 90.0% | Hosted | Proprietary |
| 5 | UI-TARS-2 | 88.2% | Hosted | ByteDance native GUI agent |
| … | Stagehand (Gemini 2.5 CU) | 65.0% | Open SDK | Browserbase |

**Engine architectures:**
- **browser-use** (21K+★, ~89% WebVoyager) — DOM/a11y-tree-first, token-efficient, model-agnostic,
  standalone/local; but an LLM call per step, weak native anti-detection, and (stock) spins fresh
  sessions → *fights login every run.*
- **Stagehand** (Browserbase) — DOM+CDP, **caches DOM→action mappings for ~<100ms replay on repeat
  workflows on a known logged-in site.** Excellent for a fixed LMS you're logged into — but the
  intended path is Browserbase cloud.
- **Skyvern** (85.8% WebVoyager) — **vision-first**, handles legacy/canvas/obfuscated portals where
  DOM parsing breaks, built-in 2FA/CAPTCHA; ~30–50k tokens per 10 steps (vs 7–15k for a11y-tree) →
  pricier; best anti-bot features are cloud/managed.
- **ABP / agent-browser** (Nemesis) — a Chromium *fork* built specifically so the browser layer stops
  being the failure point; a11y-tree + discrete multimodal steps; local; model-agnostic; REST + MCP.

**Reading against the constraint:** Nemesis already pairs the **#1 open-source engine (ABP)** with the
**exact runtime property the competition lacks** — a persistent, visible, logged-in browser with
saved cookies. That combination *is* the production answer to the login-flow problem the field
complains about. The only genuine gap is Stagehand-style **action caching** (cheap deterministic
replay of a known Blackboard/Outlook path) and vision robustness on messy LMS pages — both of which
Nemesis can add incrementally (it already has a vision fallback + Camoufox).

### Web search

| Provider | Price / 1k searches | Accuracy signal | Fit for Nemesis |
|---|---|---|---|
| **Linkup** | **€5** standard / €50 deep | 92% F-score SimpleQA (self-reported #1); premium sources | Cheapest + top accuracy; already a wireable pattern |
| **Exa 2.0** | $7 (deep) | 91% SimpleQA; 81% WebWalker vs Tavily 71%; sub-350ms; JSON | Fast, research-grade, structured; **already a backend** |
| **Brave Search API** | low, independent index | Leads AIMultiple agentic benchmark (~+1 pt vs Tavily) | Independent index, cheap, privacy-aligned |
| **Tavily** (current default) | 1k free/mo | Good agent-tuned baseline | **Acquired by Nebius Feb 2026**; roadmap risk |
| **Parallel.ai** | — | Deep search | Already a backend |
| **Valyu** | $29/mo+ | 94% SimpleQA, 79% FreshQA; **PubMed / clinical-trials / bioRxiv / SEC** | Specialized medical/academic — relevant to the pharmacy wedge, but overlaps Nemesis's existing PubMed/ClinicalTrials connectors |

**Reading against the constraint:** the abstraction is already right; the *default* is the weak
link. Tavily is now enterprise-owned and mid-priced; Linkup (cheapest + highest self-reported
accuracy) or Exa (fast + structured + already integrated) are better metered defaults. For the
**health/pharmacy** angle, specialized biomedical retrieval (PubMed/clinical trials) is better
served by Nemesis's dedicated connectors than by any general search API — don't route clinical
questions through a general SERP.

---

## Recommendations (ranked, solo-maintainer sized)

1. **Fix the onboarding default (small, ship-before-beta).** Blank `DEFAULT_SCHOOL_PORTALS` (or gate
   "Continue"/the sweep on a real portal being set) so no non-UTHSC student inherits the owner's
   school. Pure win, ~an hour.
2. **Re-point the web-search default off Tavily** to **Linkup or Exa** (both already backends; Exa is
   already wired and fast). Keeps margins predictable and removes single-vendor roadmap risk. Keep the
   multi-backend abstraction exactly as is.
3. **Keep the browser engine (ABP/agent-browser) — do not migrate.** It's the leading open-source
   engine and already matched to the constraint. Track upstream `agent-browser` releases.
4. **Incremental browser hardening (later, optional):** (a) Stagehand-style **action caching / recorded
   macros** for the handful of fixed LMS paths (log in → open course → list new items) to cut tokens and
   latency on the repeated semester sweep; (b) lean on the existing **vision fallback** for canvas/legacy
   LMS pages where a11y-tree parsing is thin; (c) keep **Camoufox** as the stealth escape hatch if a
   portal gets aggressive about automation.
5. **Do not adopt cloud browser backends for the core LMS job.** Reserve Browserbase/Browser Use Cloud
   strictly for public, unauthenticated tasks if ever needed.

---

## Sources
- Online-Mind2Web leaderboard (Steel), updated 2026-07-10 — https://leaderboard.steel.dev/leaderboards/online-mind2web/
- Agent Browser Protocol (ABP) — https://github.com/theredsix/agent-browser-protocol ; Show HN — https://news.ycombinator.com/item?id=47336171
- Firecrawl, "11 Best AI Browser Agents in 2026" — https://www.firecrawl.dev/blog/best-browser-agents
- Framework Wars: browser-use vs Stagehand vs Skyvern — https://dev.to/stevengonsalvez/browser-tools-for-ai-agents-part-2-the-framework-wars-browser-use-stagehand-skyvern-4gn
- Skyvern comparison — https://www.skyvern.com/blog/browser-use-vs-stagehand-which-is-better/
- "Tavily Alternatives in 2026 (After the Nebius Acquisition)" — https://medium.com/@unicodeveloper/tavily-alternatives-in-2026-after-the-nebius-acquisition-9de526780686
- AIMultiple, "Agentic Search in 2026: Benchmark 8 Search APIs" — https://aimultiple.com/agentic-search
- Linkup, "Best web search API 2026" — https://www.linkup.so/blog/best-web-search-api-in-2026-top-providers-compared
- Exa vs Tavily — https://exa.ai/versus/tavily
- Nemesis code: `apps/desktop/src/app/welcome/`, `apps/desktop/src/lib/school-portals.ts`,
  `apps/desktop/electron/school-browser.ts` + `school-view.ts`, `tools/browser_tool.py`,
  `tools/browser_camofox.py`, `tools/web_tools.py` (in `~/.hermes/hermes-agent`).
