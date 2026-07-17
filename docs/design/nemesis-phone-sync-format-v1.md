# Nemesis phone sync — wire format v1 (normative)

Both implementations MUST match this byte-for-byte: the Mac publisher
(nemesis-desktop-public `apps/desktop/electron/library-publisher.ts`, node:crypto) and
the phone reader (nemesis `apps/mobile/src/lib/library-crypto.ts`, @noble/ciphers).
Interop is proven by a desktop-side test that encrypts with node:crypto and decrypts
with @noble/ciphers. Parent spec: nemesis-phone-readonly-sync-2026-07.md.

## Vault key + pairing

- Vault key `K` = 32 random bytes, generated on the Mac, stored safeStorage-encrypted
  in the Electron userData dir. The server NEVER sees it.
- Pairing code (QR content and manual-paste string): `nemsync1.<base64url(K)>`
  (no padding). Parsers reject anything whose prefix differs or whose decoded key
  is not exactly 32 bytes.

## Per-document row

- `path` = vault-relative POSIX path, Unicode NFC-normalized (e.g. `PHCY 1205/Exam 2 notes.md`).
- `path_hash` = lowercase hex of HMAC-SHA256(K, "nemesis-sync-v1:path:" + path). 64 chars.
- Plaintext = UTF-8 JSON:
  `{"v":1,"path":"...","title":"...","kind":"note","content":"...","mtime":"<ISO8601>"}`
  - `title` = first `# ` heading in the file, else the filename without extension.
  - `kind` = "note" in Phase 1 (decks/calendar/graph arrive with later phases).
- Encryption = AES-256-GCM with key K:
  - nonce = 12 random bytes per write, tag = 16 bytes.
  - AAD = the UTF-8 bytes of the `path_hash` hex string (binds ciphertext to its row —
    a swapped payload fails authentication).
  - `payload` column = standard base64 of `nonce || ciphertext || tag`.
- Tombstone (file deleted on Mac): `deleted = true`, `payload = null`, same path_hash.

## Publisher rules (Mac)

- Scope: `*.md` files under the vault root only. Skip any dot-prefixed file or
  directory (`.nemesis`, `.obsidian`, …) and `node_modules`. Skip files whose content
  exceeds 262,144 bytes (log once per path).
- Quiet rule: skip a file modified within the last 5 seconds (agent write-bursts settle
  before upload; the 30s tick retries it next round).
- Change detection is Mac-local: sha256(content) per path in a sync-state JSON under
  userData. The server column `updated_at` is set by a DB trigger (server clock), never
  by the client.
- Upserts batched (≤20 rows/request) to PostgREST with `on_conflict=user_id,path_hash`
  + `Prefer: resolution=merge-duplicates`, using the dispatcher's authed session.
- Sync-state entries update only after a confirmed 2xx.

## Reader rules (phone)

- Incremental pull: `updated_at > (cursor - 5s overlap)`, merged idempotently — newer
  `updated_at` wins per `path_hash`; tombstones remove content but stay cached so an
  older stale row can't resurrect a deleted note.
- Decrypt failures (wrong key / tampered row) render as an explicit "can't decrypt —
  re-pair with your Mac" state, never as silent absence.
- Cache holds CIPHERTEXT rows (encrypted at rest for free); decryption happens on read.

## v1.1 — Phases 2/3 additions (2026-07-17)

Same envelope, same crypto, two new `kind` values plus one plaintext side-channel.

### kind: "deck" — study snapshots (Phase 3, DOWN)

- One document per deck. `path` = `.study/sync/deck/<deckId>` (synthetic — no such
  file exists; the dot prefix keeps it out of the markdown walker's namespace).
  `title` = the deck name. Source: the desktop renderer precomputes
  `.study/phone-decks.json` (it owns the FSRS scheduler); electron main splits it.
- `content` = JSON:
  `{"v":1,"asOf":"<ISO>","id":"<deckId>","name":"...","course":"...","stats":{"due":n,"fresh":n,"total":n},"queue":[{"key":"<scheduleKey>","prompt":"...","answer":"...","note":"...","isNew":bool}]}`
  - `queue` is the deck's due queue in review order, daily caps applied, cloze
    prompts/answers PRE-RENDERED — the phone ships zero scheduler code.
  - `key` is the desktop study model's schedule key (`<cardId>` or
    `<cardId>#c<n>` for a cloze slot) and must be echoed back verbatim.

### kind: "calendar" — the agenda (Phase 2, DOWN)

- Exactly one document. `path` = `.derived/calendar`, `title` = "Calendar".
  Source: `School/calendar.json`, windowed −7…+180 days, main-process rendered.
- `content` = JSON:
  `{"v":1,"asOf":"<ISO>","feedUrl":"https://.../functions/v1/nemesis-ics?token=<64 hex>"|null,"events":[{"id","title","date":"yyyy-mm-dd","time"?,"kind":"assignment|exam|rotation|class|other","course"?,"note"?}]}`
  - `note` may appear here (it ships encrypted). It must NEVER appear in the ICS.

### review_events — grades (Phase 3, UP)

Append-only rows the phone inserts and the Mac ingests (`ingested_at IS NULL`,
oldest `reviewed_at` first) through the SAME `gradeCard` path the desktop Study
page uses, then stamps `ingested_at`:
`{user_id, device_id: null, deck_path_hash, schedule_key, grade: again|hard|good|easy, reviewed_at, client_event_id}`
- `deck_path_hash` = the deck doc's row key (audit/grouping; apply needs only
  `schedule_key`).
- `client_event_id` = phone-generated UUID; `unique (user_id, client_event_id)` +
  ignore-duplicates upsert makes offline-queue retries idempotent.
- Grades for since-deleted cards are stamped-and-skipped on the Mac. Double
  apply after a crash-between-save-and-stamp is spec-blessed (a card shows one
  extra time; no grade is ever lost).

### calendar_feeds — the ONE plaintext exception (owner decision D3)

`{user_id (pk), token (64 hex, unguessable capability), ics, updated_at}` — the
Mac-rendered ICS (dates + titles + course; NEVER note text), served to native
calendar apps by the public `nemesis-ics` edge function
(`GET ?token=...` → `text/calendar`; deploy with verify_jwt=false). Unpairing
deletes the row + local token; a re-pair mints a new token (old URLs die).

## Explicitly out of scope in v1

Binary files, non-.md text, key rotation / device revoke (Phase 1 note: re-pair by
generating a new key re-publishes everything), multi-Mac vaults, compression.
