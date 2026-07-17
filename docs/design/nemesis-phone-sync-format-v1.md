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

## Explicitly out of scope in v1

Binary files, non-.md text, key rotation / device revoke (Phase 1 note: re-pair by
generating a new key re-publishes everything), multi-Mac vaults, compression.
