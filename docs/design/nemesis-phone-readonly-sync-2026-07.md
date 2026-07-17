# Nemesis phone: read-only sync + study review — v2 spec (2026-07-16)

Owner ask: "since the app is supposed to be a 'user does not edit' app where the agent
does all the work, is a read-only option viable?" — and "find a solution to the study
page review." This spec is the answer.

Status: **Phase-0 DECIDED by owner 2026-07-16 (~9:30pm):** D1 = END-TO-END ENCRYPTED
(QR key pairing; server stores unreadable blobs). D2 = graph LATER (Library/Study/
Calendar first). D3 = Mac-rendered ICS feed (dates + titles readable server-side as a
scoped exception, note contents never).
**Phase 1 SHIPPED 2026-07-17** (migration applied; desktop beta.18+, phone build 6+;
owner-verified end-to-end). **Phases 2 + 3 BUILT 2026-07-17** on owner's
"build phase 2 and 3" — wire deltas in nemesis-phone-sync-format-v1.md §v1.1;
`review_events` + `calendar_feeds` migrations and the `nemesis-ics` edge function
are written but NOT applied/deployed (per-ask owner gate, as with Phase 1).

## The idea in one paragraph

The Mac agent is the only author of everything in the library. If the phone never edits,
"sync" stops being a two-way merge problem (the hard, dangerous kind) and becomes one-way
publishing: the Mac uploads fresh copies of what the agent wrote; the phone displays
them. There is nothing to merge because there is only one writer. The phone's only
writes are small **requests** — exactly the pattern missions already use — and the one
that matters is flashcard grades, which the Mac ingests and applies itself.

## Architecture: two channels

**DOWN (Mac → cloud → phone): replicas.** The mission dispatcher already running inside
the desktop app (30s tick, device identity, Supabase auth) gains a publisher job: on its
tick, hash-sweep the vault's text files; upload changed docs; tombstone deletions;
debounce ~5s after agent write-bursts. Initial backfill = one full sweep.

**UP (phone → cloud → Mac): intents.** The phone inserts small append-only rows asking
for things. Missions (built). New: card review grades. The Mac remains the single
writer of files and study state.

## Tables (Supabase, RLS `user_id = auth.uid()` own-rows, same pattern as the dispatch migration)

- `library_documents` — id, user_id, path (vault-relative), title, kind
  (note|deck|study_state|calendar|graph), content, content_hash, updated_at,
  deleted (tombstone). Upsert key (user_id, path). Realtime ON so the phone
  live-updates while the agent works. Caps: 256KB/doc, text only.
- `review_events` — id, user_id, device_id, deck_path, card_id, grade
  (again|hard|good|easy), reviewed_at, ingested_at (null until the Mac applies it).
  Append-only; phone inserts, Mac selects `ingested_at IS NULL`, applies, stamps.

Study state needs no special table: the study remodel's state-to-disk keystone makes
decks + mastery plain files in the vault, so they replicate through the same pipe.

## The study-review solution (the specific ask)

Problem: reviewing cards inherently WRITES (grades → scheduling state). Solution:
**many writers of events, one writer of state.**

1. The Mac precomputes each deck's due queue into the on-disk study state; it replicates
   down like any file. The phone displays it — zero scheduler code on the phone.
2. The student grades cards on the phone. Each grade = one `review_events` row
   (queued locally when offline, inserted when online). Within the session, the phone
   advances OPTIMISTICALLY (local, ephemeral) so review feels instant even with the
   Mac asleep.
3. The Mac dispatcher ingests un-ingested events in order and applies them to the study
   state through the SAME apply-function the desktop Study page uses (route the desktop
   UI's own grades through that one code path too — one writer, one code path). It then
   republishes the state file, and the phone converges to truth.
4. Safety properties: events carry ids → idempotent (state file records last-applied
   id per device); double-apply worst case = a card shows one extra time — spaced
   repetition is forgiving; no grade is ever lost (append-only, ingested_at audit).

## Privacy — the one real decision (Phase 0, owner call)

Notes would now pass through our servers. Two honest options:

- **A. End-to-end encrypted (recommended).** Mac generates a vault key (macOS Keychain);
  the phone gets it once by scanning a QR the desktop shows (iOS Keychain after that).
  Docs encrypted per-file (AES-GCM); paths/titles encrypted too via a manifest so course
  names don't leak; the server stores blobs it cannot read. Search happens on the phone
  against its local replicas (they're cached anyway). Cost: pairing UX, key rotation on
  device revoke, and the server can never render content (see ICS note). Keeps "your
  files are yours" fully true — and it's a marketable Pro feature (this is literally
  what Obsidian sells).
- **B. Plaintext behind RLS (owner-beta only).** Fastest to ship, fine while the only
  user is the owner; privacy policy must say notes sync through our servers. Do NOT
  take non-owner users on this path — the brand is trust-first.

Grades (`review_events`) are low-sensitivity either way; card_id may be hashed.

## Calendar bonus + its tension

Cheapest calendar win: also publish a tokenized **ICS feed** URL so deadlines appear in
the iPhone's built-in Calendar app with zero UI work. Tension: under full E2EE the
server can't render ICS. Options: (a) treat calendar as the one plaintext kind (it's
dates + titles, owner decides), (b) Mac uploads a pre-rendered .ics artifact (server
serves bytes it can't interpret — works, feed just lags the Mac), (c) skip ICS, in-app
calendar screen only. Decision D3 below.

## What does NOT sync

PDFs, lecture audio, images (size — the real storage cost lives here), portals.json and
anything credential-shaped (NEVER), chat sessions (separate feature), config/SOUL.

## Offline behavior

Phone caches replicas in local storage → library readable offline, grades queue locally.
Mac asleep → phone shows last-synced copy with an honest "as of <time>" label; grades
pile up server-side and ingest on wake.

## Phone UI (drawer gains three rows; missions home stays "/")

1. **Library** — folder list → markdown reader (tables, wiki-links navigate when the
   target is replicated).
2. **Study** — deck list with mastery bars → due-queue review screen (grade buttons →
   optimistic advance + review_events).
3. **Calendar** — agenda list (this week / upcoming).
4. **Graph** — optional Phase 4 (read-only render); defer unless owner wants it early.

## Cost & metering

Sync moves text through Supabase — no LLM tokens, so the student meter is untouched.
Storage/egress for a semester of markdown ≈ single-digit MB per student → pennies/month.
No change to money-watch thresholds (it watches provider spend, not storage).

## Phases

- **Phase 0 (owner decisions):** D1 privacy A-or-B (A recommended; B acceptable for
  owner-only beta with a flag). D2 graph screen now or later. D3 ICS feed option a/b/c.
- **Phase 1:** publisher in the dispatcher (hash sweep, upsert, tombstones, debounce) +
  `library_documents` migration + phone Library reader. Smallest end-to-end slice.
- **Phase 2:** Calendar screen (+ ICS per D3).
- **Phase 3:** `review_events` migration + Mac ingester (single apply path shared with
  the desktop Study page) + phone review screen with optimistic session.
- **Phase 4 (optional):** graph view; on-phone search index.
- Tests per repo conventions: Deno-style for phone pure logic (queue math, optimistic
  session), electron node tests for publisher/ingester following the
  mission-dispatcher injected-fetch pattern.

## Gotchas carried in from earlier work

- New tables follow the dispatch migration's RLS + revoke-anon hygiene.
- Realtime bursts while the agent writes a big deliverable → debounce + batch upserts.
- Vault/doc size caps enforced Mac-side so one giant pasted file can't wedge the pipe.
- Desktop and phone grading the same deck concurrently is fine by design (one ingester,
  idempotent events, forgiving scheduler) — but route BOTH through the one apply path.
- App Store: read-only content + no purchase links = no IAP entanglement.
