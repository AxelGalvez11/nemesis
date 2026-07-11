# ChatGPT citation pills + sources drawer — live recon notes (2026-07-10)

Observed live on the owner's ChatGPT Plus session (dark theme), conversation "Nemesis
Competitor Watch" (a searched, cited answer). Screenshots referenced: ss_3882x7nle
(inline pills), zoom 1246x48 (pill close-up), ss_9476nwcvn / ss_0080vmytm (Activity
drawer open), ss_5576b84h8 (answer footer "Sources" affordance).

## 1. Inline citation pills (in the answer body)

- Placement: **inline at the end of the specific paragraph/claim** the sources support —
  NOT grouped at the bottom of the whole answer. Reads as a punctuation-like receipt.
- Anatomy: `[favicon] SourceName +N` — favicon ~14px round; source display NAME
  (e.g. "Companion", "Times Higher Ed…") truncated ~14–16 chars; `+N` in dimmer gray when
  more sources back the same claim (N = additional sources collapsed into this one pill).
- Shape/fill: fully rounded (pill), **no border**, fill one step lighter than the message
  background (dark mode: ~#414141 on ~#303030), height ~22–24px, x-padding ~10px, text
  ~12px normal weight, light gray (not white).
- Behavior: **click opens the source URL directly** (new tab). Hover shows a citation
  card (didn't capture — synthetic hover didn't trigger it).
- One pill per claim-cluster: multiple sources for the same claim collapse into ONE pill
  (first source's favicon + name, `+N` for the rest) — they don't stack N pills per line.

## 2. Answer-footer "Sources" affordance

- Sits in the message action row (copy / vote / share / retry / …) as the LAST item:
  **three overlapping favicons** (~16px, z-stacked with ~4px overlap, each ringed in the
  background color) followed by the word `Sources` (13px, muted).
- Click toggles the right-hand drawer.

## 3. Right-hand drawer ("Activity")

- Right side panel ~400–430px wide, pushes content (not an overlay), header:
  `Activity · 25s` (title + total thinking time) with an × close on the right.
- Content = the run's steps in order: section label ("Thinking"), then per step:
  - Step title line (bold-ish, with a small leading icon: globe for searches, • for
    thoughts), optional body paragraph in dim gray.
  - A wrap of **domain chips** under search steps: `[favicon] www.domain.com` — same pill
    recipe as inline (rounded-full, dark elevated fill, 12px) but shows the DOMAIN.
  - Overflow chip: `[favicon][favicon] N more` — 2–3 stacked favicons + count.
- Scrollable; sources are presented in the context of the step that fetched them.

## What Nemesis adopts (concrete deltas)

Already matching after round 26: chip visual recipe (favicon-first, rounded, subtle fill),
panel chips, click-pill → Sources rail w/ highlight.

New deltas to apply:
1. **Group per source**: collapse same-domain citations into one pill with stacked
   favicons + `+N` (e.g. `PubMed +3`) instead of one pill per PMID. Clicking focuses the
   Sources rail (our behavior, better than ChatGPT's direct-open for studying).
2. **Footer "Sources" affordance** on assistant messages: 3 stacked source favicons +
   `Sources` label at the end of the message meta row → opens the Sources rail.
3. Sources rail keeps per-source rows (studying needs every PMID distinct) — our rail is
   the "drawer"; no separate Activity clone needed (thinking preview already exists).
