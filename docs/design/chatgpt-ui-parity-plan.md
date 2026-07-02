# ChatGPT UI/UX Parity Plan for PharmaOrb

Date: 2026-07-01. Source: live inspection of chatgpt.com (logged-in Plus account, dark theme, desktop 1494px) via browser automation. All numbers below are measured from the real page, not guessed.

## What ChatGPT actually does (measured spec)

### 1. Layout skeleton
- Three columns: left sidebar, center thread, right "Activity" panel (only when opened).
- Background: pure black `#000000` (dark mode). No page-level borders or cards.
- Center column: composer max-width **768px**; answer text column **640px** wide.
- Right Activity panel: **~341–360px** wide, full height, own scrollbar, close X.

### 2. Sidebar
- Top: wordmark + collapse toggle. Collapses to a 52px icon rail.
- Nav: New chat, Search chats, Library, Scheduled, Apps, More — icon + label rows, ~40px tall, active row gets a subtle gray pill background.
- Sections with small gray headers: **Pinned**, **Projects**, **Chats**.
- Bottom: account row — avatar circle + name + plan label ("Plus").

### 3. Welcome (empty chat) state
- Vertically centered greeting: "What's on your mind today?" (~28px, regular weight).
- Composer sits centered under the greeting (not bottom-docked yet).
- Below composer: 3 outline pill suggestion chips with icons ("Create an image", "Write or edit", "Look something up").

### 4. Composer (the chat bar)
- Pill: background `#212121`, border-radius **28px**, min-height **52px**, padding 5px 8px. No border, no shadow.
- Left inside: **+** button → tools popover (see 5).
- Placeholder: "Ask anything" (gray). After sending, docked composer shows "Follow up" while streaming.
- Right inside, in order: effort dropdown (label "High" + chevron), mic icon, voice button (accent-gold filled circle; turns into square stop icon while streaming).
- Effort dropdown menu is titled **Intelligence**: Instant / Medium / High (check on active) + a model row ("GPT-5.5 ›") as submenu.
- Under composer when docked: 12px gray disclaimer "ChatGPT can make mistakes. Check important info."

### 5. "+" tools launcher
- Popover anchored above the + button, same dark surface, rounded ~16px.
- Rows: icon + bold-ish name + gray one-line description. Examples: "Add photos & files", "Create image — Visualize anything", "Web search — Find real-time news and info", "Deep research — Get a detailed report", then connected apps.
- Footer hint row: "Type to search plugins, files & skills".

### 6. Messages
- User message: right-aligned bubble, radius **22px**, padding **10px 16px**, max-width **70%**. Background is the user's accent color (this account: gold `#95611F`; ChatGPT default is `#303030`).
- Assistant message: **no bubble**. Plain text directly on the black background, 640px column, **16px / 26px line-height**, paragraph margin-bottom only **4px** (tight, rhythm comes from blank lines).

### 7. Thinking UX (the part we're copying carefully)
Sequence observed on a real health question ("is sucralose bad for you"):
1. Instantly: shimmer text "Thinking" at answer position.
2. A **pre-thought intro sentence streams as plain text first**: "I'll ground this in current evidence and separate 'normal intake' from the scarier headlines…". This is visible content, not hidden reasoning.
3. Then a collapsed gray row: **"Thought for 15s ›"**.
4. Clicking it opens the right **Activity** panel: header "Activity · 15s", then a vertical timeline:
   - thought paragraphs (gray 14px) with small bullet markers,
   - search steps: globe icon + title ("Searching for recent health evidence on sucralose") + **domain chips** — rounded `#2a2a2a` chips with favicon + hostname (www.fda.gov, www.who.int, pubmed.ncbi.nlm.nih.gov…) + a "15 more" overflow chip,
   - ends with "Thought for 15s / Done".

### 8. Answer formatting (markdown style)
- Direct-answer opener, one sentence, conversational: "Not really 'bad' in normal amounts — but it's also not a health food."
- Sections are **bold lead-in lines**, not H2/H3 headers: "**1. Regulators still consider it safe within limits.**" followed by normal prose.
- Heavy inline bold on the numbers that matter: "**5 mg/kg body weight/day**", "**February 2026**", "**410–420 mg/day**".
- Bold closer: "**Bottom line:**" + plain-English verdict.
- No tables, no bullet walls, no horizontal rules. Prose + bold. Tight spacing.

### 9. Inline citations
- Small rounded-full pill at the END of a claim sentence: dark gray `~#2f2f2f`, favicon (16px circle) + truncated source name ("PubMed", "World Health Org…") + lighter "+1" count. ~22px tall, 12px text.
- One pill per claim, grouping extra sources into the +N.

### 10. Answer footer (action row)
- Gray 16px icon buttons: copy, thumbs-up, thumbs-down, share, regenerate, "…".
- **Sources button**: pill with 3 overlapping stacked favicons + the word "Sources". Opens the right panel.

### 11. Sources panel (same right panel as Activity)
- Full-height scroll list of source cards: favicon + publisher name (13px gray) on line 1, **bold white title** (truncated), then 2-line gray snippet including date and "Cited by N".
- Citations used in the answer listed first, then all reviewed sources.

---

## Gap analysis vs PharmaOrb today

| ChatGPT element | PharmaOrb today | Gap |
|---|---|---|
| Black canvas, no cards | Themed surfaces, boxier | Retheme tokens |
| 768px composer pill #212121 r28 | Different chat bar | Rebuild composer |
| + tools launcher | No launcher | New popover |
| Intelligence selector | Fast/Thorough mode pills | Convert to dropdown |
| User bubble r22 accent / assistant no-bubble | Similar but different metrics | Adjust |
| Shimmer → pre-thought → "Thought for Xs ›" | thinking-preview lib exists (`lib/thinking-preview`, ask/page.tsx:553) | Reshape render |
| Activity panel w/ domain chips | Inline engine-preview blocks | Move to right panel |
| Inline favicon pills +N | Inline cites, no favicons | New pill component |
| Sources button w/ stacked favicons | EvidencePanel | Refit |
| Source cards (favicon/publisher/title/snippet/cited-by) | Citation list | Enrich cards |
| Bold-lead prose, Bottom line | ask-v14 prose | Prompt tweak (gated) |

## Implementation plan (phased, each shippable)

### Phase 1 — Canvas + composer (core visual parity)
- `apps/web/app/globals.css`: token pass — dark bg `#000`, surface `#212121`, chip `#2a2a2a`/`#2f2f2f`, radii 28/22, text 16px/26px, tight paragraph spacing (4px + blank-line rhythm).
- `apps/web/app/app/ask/page.tsx`: composer → 768px pill, min-h 52, placeholder "Ask anything"/"Follow up", send button as accent circle → square stop while streaming, disclaimer line under it.
- User bubble: r22, 10px 16px, max-w 70%, accent bg. Assistant: bubble-less 640px column.

### Phase 2 — Thinking UX
- Keep `buildThinkingPreview` stages; render as: shimmer "Thinking" → one-sentence pre-thought intro (we already generate scoping text) → collapsed "Thought for Xs ›" row.
- New right Activity panel component (reuse/replace `EvidencePanel.tsx` shell): timeline of thought paragraphs + search steps with real domain chips (pubmed.ncbi.nlm.nih.gov, clinicaltrials.gov, api.fda.gov, dailymed…). Favicons via `https://www.google.com/s2/favicons?domain=X&sz=32`.
- Panel is 360px, slides in, close X, header "Activity · Xs".

### Phase 3 — Citations + sources
- Inline citation pill component: favicon + short source name + "+N", end-of-sentence placement, click → opens panel scrolled to that source.
- Action row under answer: copy / good / bad / rerun + **Sources pill with stacked favicons + count** (this is also our 46-vs-12 honesty display: show cited + reviewed).
- Source cards in panel: favicon, publisher, bold title, snippet, year, "Cited by N" where we have it (PubMed citation counts). Cited-in-answer section first, then all reviewed sources.

### Phase 4 — Welcome + tools launcher + intelligence dropdown
- Welcome: centered "What can I check for you?" + centered composer + 3 chips ("Verify a claim", "Deep research", "Is this good for me").
- "+" launcher popover: Verify a claim, Deep research, Meta-analysis (Pro), News check, Attach photo (future label-scan).
- Mode pills → "Intelligence"-style dropdown: Fast / Thorough / Deep research (check on active).

### Phase 5 — Answer prose format (engine, gated)
- Prompt-side (ask-vNext, guardrail-gated like v10–v14): direct-answer opener, bold lead-in numbered section lines instead of markdown headers, inline bold on key numbers, "Bottom line:" closer. Render-side already markdown-safe (stripMarkdownForScan shipped).
- Keep PharmaOrb differentiators in the layout: safety block behavior unchanged (server-side), evidence meter/report card slots under the answer, not removed.

## What we deliberately do NOT copy
- Voice orb (no voice feature yet) — keep mic slot empty or hide.
- Apps/connectors rows in the + menu.
- Their user-accent theming (we keep our theme picker; default bubble `#303030`-equivalent per theme).

## Verification
- Screenshot parity check per phase against the reference screenshots from this session (welcome, streaming, thinking open, sources open, + menu, intelligence menu).
- Existing guardrail suite must stay green for any Phase 5 engine change; Phases 1–4 are frontend-only.
