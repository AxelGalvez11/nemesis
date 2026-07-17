# Nemesis cloud-first pivot — master plan (2026-07-17)

Owner decision (2026-07-17, ~1:30am): *"I feel like that is the better approach for
growth. Can we shift toward that? And do something similar like Claude desktop does
where they have the agent side and the chat side?"* — said in response to the
cloud-first assessment (brain + library on our servers, every device a window, the
Mac shrunk to the jobs that physically need it), including the closing
recommendation that privacy become a **setting** ("Private vault" E2EE toggle)
rather than the default tax.

## The product shape (the Claude-desktop analogy, made ours)

Two surfaces, same account, every device:

- **Chat** — instant, conversational, runs in OUR cloud. Ask anything; the answer
  can draw on the student's own library (server-side search over their notes).
  Works from the phone on a bus with the MacBook dead. This is the "it's useful
  by itself" surface.
- **Agent (Missions)** — long-running work with tools: build decks from slides,
  organize the vault, research + draft, harvest the LMS. Missions route to one of
  two lanes:
  - **Cloud lane** — anything that needs no local machine: research, drafting,
    deck generation, note writing, calendar upkeep. Runs even with the Mac off.
  - **Mac lane** — the jobs that physically need the student's machine: school
    portals (their logged-in browser, their IP), local files, Anki. This is
    today's dispatcher, unchanged — it becomes the special case, not the norm.

The unified-quiet positioning survives intact: one connected system, agent-
assembled; the cloud just makes every window into it live.

## Architecture target

- **Cloud library = source of truth.** Per-user documents in Postgres/storage,
  readable server-side (RLS own-rows, same hygiene as everything else). The Mac
  becomes a *sync client* (two-way) instead of the single home of the files:
  it mirrors the cloud library to `~/Documents/Nemesis Library` so local tools
  and the student's sense of "my files on my disk" keep working.
- **Write model.** Keep single-LOGICAL-writer discipline per document: the agent
  (cloud or Mac lane) authors docs; devices send intents (missions, grades) —
  exactly the pattern that already works. Two-way sync conflicts are then rare
  and resolvable by "agent wins, human edits stay on desktop-owned docs."
- **Cloud agent runtime.** Needs a spike (first task of P2): candidates are
  Vercel Fluid functions (300s default, fits most missions), a small dedicated
  worker, or Supabase queues + functions for short tasks. Uses the existing
  engine pieces (nemesis-llm proxy, nemesis-search) and the existing metering
  (missions bill like chat — owner decision from the dispatch plan stands).
- **Chat with your notes.** Server-side embeddings over the readable library
  (pgvector is already in the stack) + the nemesis-llm proxy. Phone, web, and
  desktop all call the same endpoint.
- **Study.** Deck + FSRS state moves to cloud rows; desktop Study page and phone
  both read it; grades stay `review_events` (that table is already
  architecture-agnostic). Scheduler stays client-side (same pure model code),
  state becomes shared.
- **Privacy = a setting.** Default account: readable sync (max UX). "Private
  vault" toggle (later phase): today's E2EE architecture, kept as the opt-in
  trust feature — it is literally already built and shipping. Landing copy and
  the privacy policy MUST change before readable sync ships (the current promise
  is E2EE-flavored); that's a launch-gate item, not an afterthought.

## Hard lines that do NOT move to the cloud, ever

- School portal credentials / sessions (the Einstein/OpenClaw graveyard; also
  fails practically on 2FA + bot detection). Portal work stays on the Mac lane.
- Auto-submit anything (drafts-never-submissions is identity, not policy).
- Selling/mining the now-readable data. Readable ≠ exploited.

## Phasing (each slice shippable on its own)

- **P0 — ship what's built.** Phase 2/3 (phone Study/Calendar/appearance, PRs
  nemesis#161 + desktop#26) goes out as-is once the owner gives the standing
  gate (migrations + ICS function + merges + releases). Nothing in it is wasted:
  screens, grade events, and calendar tables carry over unchanged; only the doc
  payload's encryption flips later.
- **P1 — phone Chat (the standalone win).**
  - P1a: plain chat on the phone against the existing cloud engine + metering.
    Small build, no Mac involved, immediately makes the app useful alone.
  - P1b: readable library sync behind a flag (Mac publishes plaintext rows) +
    server-side index → chat answers from the student's own notes.
- **P2 — cloud mission lane.** Runtime spike → run non-portal missions in the
  cloud; router decides cloud vs Mac lane per mission; phone mission UX
  unchanged (it already just inserts rows and watches events).
- **P3 — two-way library.** Cloud agent writes into the cloud library; the Mac
  mirrors down. The Mac app stops being the source of truth.
- **P4 — study/calendar state to cloud** (desktop + phone share live state; the
  snapshot pipe retires).
- **P5 — Private vault toggle** (re-offer E2EE as the Pro trust feature) +
  migration path for paired-vault users.

## Costs and risks, honestly

- Server compute/storage rises (agent runs on our bill) — bounded by the
  existing per-plan token metering; storage is pennies (text).
- Two-way sync is the real engineering tax (P3); the write-model rules above
  exist to keep it from becoming a merge nightmare.
- Positioning/legal: privacy copy + policy update must precede P1b.
- Migration: existing paired users (currently: the owner) move from E2EE rows to
  readable rows — acceptable while the user base is one person; another reason
  to sequence this NOW rather than after beta invites.

## Relationship to in-flight work

The E2EE Phase 1-3 system keeps running as-is until P1b/P3 land, and then
becomes the "Private vault" mode in P5 — the work is reused, not discarded.
