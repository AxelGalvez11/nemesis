# Manus ↔ PharmaOrb — page-by-page visual comparison (2026-07-04)

Side-by-side of every equivalent surface, both apps captured **fully loaded** (Manus 1.6 Lite,
light theme; PharmaOrb prod, dark theme). Companion to `manus-ui-capture-log.md` (Manus fine-grain
anatomy) and `manus-parity-spec.md` (the build plan). Each page: what each app shows, the concrete
deltas, a parity estimate, and the specific gap to close.

> Tooling note: the browser tool cannot export screenshots as files, so this is a written
> comparison from verified fully-loaded captures, not an embedded photo set. Parity % is a
> judgment of how much of Manus's layout/behavior our page already reproduces.

---

## 1. Sidebar / shell

| | Manus | PharmaOrb |
|---|---|---|
| Top | "manus" wordmark · search icon · collapse toggle | "PharmaOrb" wordmark + orb · (no search icon here) |
| Primary create | "New task" | "New chat" (full-width button) |
| Global search | search icon (top) | "Search chats & drugs" input under New chat |
| Nav group | New task · Agent · Plugins · Scheduled · Library | Ask · Library · Scheduled |
| Projects | "Projects" + ＋, project rows | "Projects" section → single "Projects" link |
| Runs list | "Tasks" (past runs) + filter (None/Favourite/Shared) | "Recent chats" (flat list) |
| Account (bottom) | avatar + name · cast icon · bell | avatar + name + "pro · 1/250 today" |

**Deltas / gaps:** no **Agent** nav; no **Plugins** nav; our "Recent chats" isn't reframed as **Tasks** with a favourite/shared filter; no top search icon; no cast/bell in footer; our project section is a single link, not an inline expandable list with ＋.
**Parity ≈ 70%.** Structure and account footer match; the run-centric framing (Tasks list, Agent nav) is the real gap. → Parity spec Phase 2.

## 2. Home / new-task landing

| | Manus | PharmaOrb |
|---|---|---|
| Greeting | **serif** "What can I do for you?" | sans "What can I help you research?" (+ orb above) |
| Composer placeholder | "Assign a task or type **/ for more**" | (empty / "Ask anything") |
| Composer left cluster | ＋ · tools-fork · **monitor icon** | ＋ · depth pill ("fast") |
| Composer right cluster | chat-bubble · mic · send↑ | mic · send→ |
| Below composer | "Suggested for you" connector cards (refresh/dismiss) + action chips (Create slides/Build website/…) + promo cards | disclaimer line + 3 ghost chips (Verify a claim / Deep research / Is this good for me?) |

**Deltas / gaps:** ours uses a sans greeting (Manus's is a distinct **serif display**); no "**/ for more**" slash-command hint; no monitor/computer icon in the composer; no connector-integrated suggestion cards; no download/personalize promo cards. Ours is *calmer* (one chip row) — a deliberate ChatGPT-lean we chose earlier.
**Parity ≈ 75%.** Composer geometry + chip pattern are close; the serif greeting + slash hint + suggestion cards are the visible deltas. → Parity spec Phase 5.

## 3. Library

| | Manus | PharmaOrb |
|---|---|---|
| Header | "Library" + filter "All ▾" + "★ My favorites" + search + grid/list toggle | "Library" + subtitle "everything you've generated" |
| Primary action | (New task, empty-state) | "＋ New report" (centered) |
| Content | file grid/list; empty = "Nothing in the library / Build your knowledge base" | grouped rows: **DEEP RESEARCH** / **DISCOVERY REPORTS**, each row = title · date · N sources |
| Item unit | file tile | report row (doc icon + clean title + date + sources) |

**Deltas / gaps:** no **★ favorites** filter; no **grid/list toggle**; no persistent top **filter/segment** control; our search only appears past 6 items (Manus's is always present). Our *content* is richer (grouped cited reports vs generic files) — an intentional divergence.
**Parity ≈ 80%.** Ours is arguably better organized for cited reports; missing the favorites + grid-toggle + always-on search chrome. → Parity spec Phase 6.

## 4. Scheduled

| | Manus | PharmaOrb |
|---|---|---|
| Header | "Scheduled" + tabs **Calendar / Tasks** | "Scheduled" + subtitle "recurring research + monitors" |
| Empty/compose | illustration + "Manus works independently…" + 3 template rows + "＋ Create your scheduled task" | compose box ("Describe research to run on a schedule…" + Weekly ▾ + Schedule) + suggestion chips |
| List | (task list under Tasks tab) | **MONITORS (2)** + "＋ New monitor"; rows = name · daily · last checked · Pause |

**Deltas / gaps:** no **Calendar** tab/grid (we deliberately skipped — reconfirm at low volume); otherwise ours is *more built-out* (live compose box + real monitors) than Manus's empty state.
**Parity ≈ 85%.** Strong; only the Calendar view is absent. → Parity spec Phase 6 (optional).

## 5. Settings

| | Manus (modal, 11 tabs) | PharmaOrb (page, 5 tabs) |
|---|---|---|
| Account group | Account · General · Usage & Billing · Personalization | Account · General · Billing · Usage · About |
| Features group | Mail Manus · Data controls · My Computer · Cloud browser · Integrations · Skills · Connectors | — (none) |
| General/Appearance | Language + Theme (Light/Dark/Auto) + comm prefs | Appearance: **System / Light / Grey / Dark** theme cards (we have 4, Manus 3) |
| Layout | left-nav modal | left-nav page (General/Account/Billing/Usage/About) |

**Deltas / gaps:** Manus has a *much* deeper settings surface — **Personalization** (memory/custom instructions), **Mail-to-task**, **Data controls**, **Cloud browser**, **Integrations**, and **Skills/Connectors as managed settings tabs**. Ours covers appearance/account/billing/usage/about well but lacks the feature-management tabs. Our theme picker (4 options incl. Grey) is actually richer than Manus's 3.
**Parity ≈ 45%.** The Account half matches; the entire "Features" management half is unbuilt. → Parity spec (later phase; much is Personalization + connector story, which needs product decisions).

## 6. Credits / usage

| | Manus | PharmaOrb |
|---|---|---|
| Chip | "✨ 1,300" | "✨ 249" |
| Popover | Free/Upgrade · Credits · Free credits · **Daily refresh 300 @ 00:00** · View usage | Your credits · Today (Ask N/M, Deep research N/M) · Slots (Monitors, Scheduled) · See plans |
| Model | spendable **credit balance** (decrements per task, e.g. −32) | **visible quotas** (per-day counts, per-slot) |

**Deltas / gaps:** fundamentally different economic model — Manus = spendable credits w/ daily refresh; ours = visible quotas (we chose this deliberately). Presentation is comparable; the credit-ledger ("What Is Retatrutide? −32") is the one element we don't have.
**Parity ≈ 80% on presentation**, intentional divergence on model.

## 7. Agent-run view (the centerpiece — biggest gap)

| | Manus | PharmaOrb |
|---|---|---|
| Message framing | "🌱 manus" avatar + ack line ("Let me look that up for you") | plain answer render + thinking/activity trail |
| Plan | **pinned "Task progress" tracker**: ✓ per step + **N/N** counter, collapsible | (engine produces steps but no pinned tracker) |
| Per-run metrics | **Usage popover**: Credits · Time · Pages · Commands · API · Files + Rate task | (none) |
| Artifacts | **Files panel**: All/Documents/Images/Code/Links | (report exports only, not a per-run file browser) |
| Live work | **"Manus's Computer"** side pane (watch it work) | evidence panel (opens on citation click, not live) |

**Deltas / gaps:** this is where we're least Manus-like — and where the moat lives. We have the raw material (the engine emits `ResearchProgressStep`; runs produce source/citation/verification counts) but none of the run-view *surface*. The moat reframe: our Usage panel → **"Evidence work"** (sources searched/cited, claims verified), and Manus's computer pane → **"watch the evidence assemble"** (sources streaming in during the gathering phase).
**Parity ≈ 30%.** The single highest-leverage build. → Parity spec **Phase 1**.

## 8. Projects

| | Manus | PharmaOrb |
|---|---|---|
| Detail rail | Instructions · Connectors · Files & sources · Skills · Scheduled tasks | New-chat composer + tabs Chats/Reports/Monitoring/**Map** + settings (rename/instructions/delete) |

**Deltas / gaps:** Manus's project = a configured agent workspace (connectors/files/skills/scheduled per project); ours = a research workspace with a **citation graph (Map)** Manus doesn't have. Different emphasis; ours is arguably richer for research, Manus richer for agent-config.
**Parity ≈ 60%**, with divergence both ways (we have the Map; they have per-project connectors/skills/files).

## 9. Model / engine selector

| | Manus | PharmaOrb |
|---|---|---|
| Control | "Manus 1.6 Lite ▾" → tiers (Max/1.6/Lite), each name + Pro badge + one-line descriptor | depth dial (Fast/Thorough/Auto) in the composer |

**Deltas / gaps:** Manus frames it as **agent tiers** in the top bar; ours is a **depth dial** in the composer. Same idea, different placement + framing.
**Parity ≈ 50%.** → Parity spec Phase 3 (top-bar model pill).

---

## Overall parity scorecard

| Surface | Parity | Priority to close |
|---|---|---|
| Agent-run view | ~30% | **Phase 1 (highest leverage — the moat surface)** |
| Settings (features half) | ~45% | Later (needs product decisions) |
| Model selector | ~50% | Phase 3 |
| Projects | ~60% | Divergent (we have Map; add per-project config later) |
| Sidebar / shell | ~70% | Phase 2 |
| Home landing | ~75% | Phase 5 |
| Library | ~80% | Phase 6 |
| Credits | ~80% presentation | Intentional model divergence |
| Scheduled | ~85% | Phase 6 (Calendar tab, optional) |

**Headline:** on the *chat/list surfaces* we're 70–85% Manus-parity already. The one place we're far off (~30%) is the **agent-run view** — and that's exactly the surface that makes Manus feel like an agent instead of a chatbot. Closing it (Phase 1) is worth more than closing the other eight combined, and it's where the evidence moat becomes *visible* rather than buried.
