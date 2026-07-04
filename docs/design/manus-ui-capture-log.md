# Manus UI — fine-grain capture log (2026-07-04)

Systematic visual sweep of Manus 1.6 Lite (manus.im/app), ~30 surfaces/states, to feed
`manus-parity-spec.md`. Each section = one surface, its layout, every control, and its states.
This is the "down to the smallest grain" reference. Companion doc: `manus-parity-spec.md`.

Legend: → = maps to our equivalent; **[GAP]** = we don't have it; **[HAVE]** = we already do it.

---

## 1. Shell chrome

### Sidebar (collapsible: icon-rail ↔ expanded)
- **Top block:** "manus" wordmark (sprout logo) · search icon · collapse-toggle icon.
- **Nav (primary):** New task (pencil) · Agent (target) · Plugins (grid) · Scheduled (clock) · Library (books).
- **Projects** section header + "＋" (add). Below: project rows (folder icon + name), e.g. "test".
- **Tasks** section header + filter icon (Filter by: None / Favourite / Shared). Below: task rows (each = a past agent run; per-row "…" menu). e.g. "What Is Retatrutide?".
- **Account row (bottom):** avatar + "Axel Galvez" · device-cast icon · notification bell.
- → Our AppShell rail has Ask/Library/Scheduled + Projects + Recent chats + account footer. **[GAP]** "Agent" nav, "Plugins" nav, a "Tasks" (past-runs) list distinct from recent chats, the search icon at top, the device-cast + bell in the footer.

### In-task top bar
- Left: model-selector pill "Manus 1.6 Lite ▾".
- Right: "Start free trial" chip · Share · a bar-chart **Usage** icon · an **files/panel** icon · "…" menu.
- → Our topbar has a title + theme toggle + evidence-panel toggle + credits chip. **[GAP]** model selector, per-task Usage icon, per-task files icon, Share, "…".

### Credits chip (top-right on home) → popover
- Chip: "✨ 1,300".
- Popover: header "Free [Upgrade]" · "Credits (?) 1,000" · "Free credits 1,000" · "Daily refresh credits (?) 300 — Refresh to 300 at 00:00 every day" · "View usage →".
- **[HAVE]** our credits chip + panel (PR #96) — but ours shows quotas, Manus shows a spendable credit balance with daily refresh. Different model (we chose visible-quotas).

### Model selector dropdown
- Three tiers, each name + tier badge + one-line descriptor:
  - **Manus 1.6 Max** [Pro] — "High-performance agent designed for complex tasks."
  - **Manus 1.6** [Pro] — "Versatile agent capable of most tasks."
  - **Manus 1.6 Lite** ✓ — "A lightweight agent for everyday tasks."
- → Our depth dial (Fast/Thorough/Auto) is the closest; Manus frames it as agent *tiers* not depth. **[GAP]** the tier-with-descriptor presentation.

### Account menu (bottom-left)
- "Axel Galvez / Personal" + workspace switcher chevron.
- "Free [Upgrade]" · "Credits 1,300 →" · Account · Personalization · Settings · Homepage ↗ · Get help ↗ · Sign out.

---

## 2. Home / new-task screen
- Centered **serif** greeting "What can I do for you?" (large serif display face — distinct from body sans).
- Composer card: placeholder "Assign a task or type / for more"; left cluster: **+** (Add files and more) · tools-fork icon · **computer/monitor** icon; right cluster: chat-bubble · mic · send (↑, circular).
- Below composer: "Suggested for you" (refresh + dismiss ✕) — 3 connector-integrated cards (Slack+Gmail+Calendar "Get a daily summary…", Drive+Gmail "Summarize what you missed…", chat "Build your personal website…"), each with a launch ↖ corner.
- Quick-action chips row: Create slides · Build website · Develop desktop apps · Design · More.
- Promo/education cards: "Download Manus for Windows or macOS", "Personalize your Manus", "Create Skills".
- Top strip: "Free plan | Start free trial".
- → **[HAVE]** our Ask landing (serif-ish greeting + composer + chips) is close. **[GAP]** the "/ for more" slash-command hint, the computer icon in the composer, connector-integrated suggestion cards, the download/personalize promo cards.

### Composer "+" menu (Add files and more)
- Add from local files · Recent files → · **Use Skills** → · Add from Google Drive files · Add from OneDrive files → · Add from Figma.
- → Our "+" menu = tools/skills (Deep research/Discovery/Verify/Monitor/Playbooks/Data sources). Manus's "+" is file-attach + Skills + cloud-drive imports. **[GAP]** cloud-drive file import, "Recent files".

---

## 3. Agent-run view (THE centerpiece)
Observed on the completed "What Is Retatrutide?" task:
- Agent messages prefixed with **"🌱 manus"** avatar + name.
- Opening ack line: "Let me look that up for you."
- Inline completed-step chip: "✓ Research retatrutide from credible sources" (green check + step label).
- The deliverable rendered inline: heading "Retatrutide (LY-3437943)" + rich prose with **bold** key terms + sub-headings ("Mechanism of Action").
- **Pinned "Task progress" tracker** just above the composer (collapsible via chevron): label "Task progress", each step a green ✓ + text ("Research retatrutide from credible sources", "Deliver a comprehensive explanation to the user"), and an **"N / N"** counter (2 / 2).
- Persistent bottom composer "Message Manus" (to steer/continue).
- Footer disclaimer: "Manus is an AI Agent and can make mistakes. Please double-check before use."
- → **[HAVE]** ResearchRunCard + the thinking/activity trail. **[GAP]** the pinned Task-progress tracker with per-step checkmarks + N/N counter; the agent-avatar framing; the persistent steer composer under a completed run.

### Per-task Usage popover (bar-chart icon)
- Grid: "Credits used 32 · Time worked 27s · Pages viewed 4 · Commands run 0 · API called 1 · Files created 0" + "Rate this task ★★★★★".
- → **[GAP]** — and this is the moat opportunity: reframe as **Evidence work** ("Sources searched / reviewed / cited · Claims verified against source · Retractions checked · Time"), pulled from data the run already produces.

### Per-task Files panel (files icon → "All files in this task")
- Tabs: All / Documents / Images / Code files / Links. Empty state "No items yet". Copy-all icon.
- → **[GAP]** an artifacts/files view per run (our reports have exports but not a per-run file browser).

### "Manus's Computer" live-work panel
- The signature "watch it work" side pane (live tool/browser/file activity). NOT shown on this simple Q&A task (0 commands, 0 files created) — only appears on tasks that use the computer. Conceptually: right-docked panel streaming the agent's actual actions.
- → **[GAP]** — for us this becomes a "watch the evidence engine work" panel: live "Searching PubMed… 34 hits… Verifying claim 3/8…" streamed from real orchestrator steps. This is the moat-aligned version of Manus's computer panel.

---

## 4. Settings (modal, left-nav, 11 tabs in 2 groups)

**Group "Account":**
- **Account** — Full name (edit) · Free [Upgrade] · Credits 1,000 / Free credits 1,000 / Daily refresh 300 · Email (Change) · User ID (Copy) · Manage sign-in methods (Manage) · Delete account (danger).
- **General** — Appearance: Language (dropdown "English"), Theme (Light / Dark / Auto cards). Communication preferences: Browser notifications (toggle), Sound alert, Receive product updates (toggle), Email me when queued task starts (toggle), Ads about Manus.
- **Usage & Billing** — sub-tabs Tasks / Websites / Computers. Free [Upgrade]. Credits. **Credits history** (per-task ledger: "What Is Retatrutide? −32", "Bonus for new users +1,000").
- **Personalization** — sub-tabs Profile / Knowledge. "Import memory from another AI" (auto-fill from other AI providers). Nickname, Occupation, "More about you" (textarea), Custom Instructions (Import memory).

**Group "Features":**
- **Mail Manus** — sub-tabs Settings / Inbox. Create tasks by email. Manus's email (…@manus.bot), Workflow email (Add workflow email), Approved senders (Add approved sender).
- **Data controls** — cards: Shared tasks · Shared files · Websites · Apps · Purchased domains · Archived tasks.
- **My Computer** — sub-tabs Cloud computer / Local computer. "Persistent cloud workspace, available 24/7" (Create now).
- **Cloud browser** — "Persist login state across tasks" (toggle) · "Cookies and other website data" (Manage).
- **Integrations** — cards: Build with Manus API · Use Manus in Zapier · Use Manus in Slack · Telegram · Line.
- **Skills** ("Added skills") — search + Browse Skills + Create ▾. Grid of skill cards (verified badge + on/off toggle): tts-prompter, manus-api, video-generator, youtube-video-research, music-prompter, similarweb-analytics, stock-analysis, skill-creator. Grouped "Official".
- **Connectors** ("Added connectors") — search + Browse Connectors + Create ▾. Empty state: "Connect Manus with your everyday apps, APIs and MCPs" + Add connectors.
- "Get help ↗" at bottom of nav.
- → Our Settings (SettingsSurface) = General/Account/Billing/Usage/About (5 tabs). **[GAP]** the depth: Personalization (memory/custom instructions), Mail-to-task, Data controls, Cloud browser, Integrations, and Skills/Connectors *as settings tabs* (we have Skills in the composer + a Data-sources panel, not as settings management surfaces).

---

## 5. Plugins page (dedicated nav item)
- Header "Plugins" + Manage ▾ + Create ▾ (top-right).
- Top: 3 promo tiles ("Run complex tasks safely through your own browser", "Get a personal email assistant for Gmail", "Turn repeat workflows…").
- Search bar "Search connectors, skills, data sources".
- **Connectors** section ("Connect apps and APIs to share your context") — ‹ › carousel + View all. Cards (icon + name + one-line + "＋"): My Browser, Gmail, GitHub, Instagram, Google Drive, Meta Ads Manager, Google Calendar, Notion.
- **Skills** section ("Turn your know-how into reusable flows") — ‹ › + View all. (verified-badge skill cards, as in settings).
- **Data sources** section (from earlier recon) — Similarweb, World Bank, X/Twitter, Brand24, CoinGecko, Morningstar, PopHIVE, Ahrefs…
- → **[GAP]** a dedicated Plugins page. We have a Data-sources *panel* + Skills in the "+" menu, not a browsable marketplace page. For us the moat version = a **Data sources / Skills** page showing our evidence taps (PubMed, ClinicalTrials, FDA, OpenAlex…) + our research skills (Deep research, Systematic review, Journal club).

---

## 6. Scheduled page
- Header "Scheduled" + tabs **Calendar / Tasks**.
- Empty state: calendar illustration + "Manus works independently, without you asking" + 3 template rows (Set up automated monitoring · Get a daily inbox summary · Turn manual processes into scheduled pipelines) + "＋ Create your scheduled task".
- → **[HAVE]** our Scheduled page (missions + monitors) is close in spirit. **[GAP]** the Calendar tab/grid view (we skipped it as low-value at our volume — reconfirm).

---

## 7. Library page
- Header "Library" + filter "All ▾" + "★ My favorites" + search "Search files" + grid/list toggle.
- Empty state: archive icon + "Nothing in the library" + "Build your own knowledge base by creating new tasks" + New task.
- → **[HAVE]** our Library (reports) has search + grouping. **[GAP]** the ★ favorites filter, grid/list toggle, the "New task" empty-state CTA framing.

---

## 8. Projects (from earlier recon)
- Project detail right-rail: **Instructions** · **Connectors** · **Files & sources** · **Skills** · **Scheduled tasks** — each per-project.
- → **[HAVE]** our project workspace (chats/reports/monitoring/map + instructions). **[GAP]** per-project Connectors, Files & sources, Skills, Scheduled-tasks rail.

---

## Cross-cutting design language notes
- Restrained palette, near-monochrome + one soft accent; heavy use of light-gray card fills on white.
- **Serif display** for the home greeting; sans for everything else.
- Rounded-2xl cards, soft shadows, generous padding, ~13–14px body.
- Two-group left-nav pattern (labelled group headers) reused in Settings AND the sidebar.
- Every list surface has the same skeleton: filter/segment control + search + grid/list toggle + "Create/New" primary action top-right.
- Consistent card idiom: icon-tile + title + one-line description + trailing action ("＋" / "›" / toggle).

## The single biggest takeaway for parity
Manus's whole app is organized around **the agent run as the primary object** (Tasks = runs, Library = run outputs, Scheduled = future runs, the run view = plan-tracker + usage + files + computer panel). Our app is organized around **chat**. True Manus parity = re-centering on the *run*: a first-class run view (Phase 1 of the parity spec) with the Task-progress tracker, the Evidence-work panel (our moat reframe of Usage), and a run files/artifacts view — wired to the research/appraisal/mission engine we already have.
