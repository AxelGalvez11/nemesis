# Anki sync contract

**Status:** target architecture
**Owner direction:** 2026-09-12

## Goal

A student can generate and approve flashcards in Nemesis, press **Sync to Anki**, and have those cards appear in the correct Anki deck without copy/paste. Later edits in Nemesis should update the same Anki notes rather than create duplicates.

Nemesis owns card generation, provenance and approval. Anki may own scheduling/review after export.

## MVP direction

Start with **one-way content sync: Nemesis → Anki**.

Do not begin with two-way scheduling sync. Anki's review state is complex and valuable; duplicating or mutating it before the content bridge is reliable creates unnecessary risk.

The cleanest initial path for this repository is:

```text
Nemesis web/mobile
      ↓
Nemesis backend — approved card + stable ID + sync queue
      ↓
Nemesis desktop helper / Anki bridge
      ↓ localhost
AnkiConnect while Anki desktop is running
      ↓
Anki collection
      ↓
normal Anki sync
      ↓
AnkiMobile / AnkiDroid / other Anki clients
```

AnkiConnect is a community Anki add-on that exposes a local HTTP API while desktop Anki is running. The standard local endpoint is `127.0.0.1:8765`. The bridge must remain local; do not expose that service to the public internet.

Because Nemesis already has a desktop app, the desktop process is a natural place to talk to localhost without coupling the web app to browser CORS/network restrictions.

A later alternative is a dedicated **Nemesis Anki add-on** that authenticates to Nemesis and pulls pending operations. That can provide a cleaner install/sync experience once demand justifies maintaining an add-on.

## Why not direct AnkiWeb integration?

Do not build the product around undocumented/private AnkiWeb endpoints, scrape AnkiWeb, or ask users to give Nemesis their Anki password.

Anki's normal sync can remain responsible for propagating a user's local collection to their other Anki clients. Nemesis only needs a supported/local bridge into the desktop collection.

## Fallback path

Always preserve a no-addon fallback:

1. Export approved cards as an Anki-compatible text import.
2. Where practical, offer `.apkg` deck export.
3. Preserve a stable Nemesis ID in the exported note so re-import/update behavior can be reconciled.

File export is not equivalent to sync, but it prevents lock-in and lets the card pipeline ship before the full bridge is perfect.

## Card identity

Every Nemesis card needs an immutable application identity independent of its wording.

Suggested logical fields:

```text
id                    UUID — immutable Nemesis card ID
user_id               owner
course_id              nullable course
lecture_id             nullable source lecture
knowledge_object_id    nullable semantic identity
note_type              basic | cloze
front                   Basic prompt, or display text where applicable
back                    Basic answer
cloze_text              Cloze source text where applicable
extra                   optional explanation/context
source_refs             transcript timestamps / document anchors
status                  draft | approved | suspended | archived
content_hash            hash of sync-relevant content
created_at
updated_at
```

Do not use the card's front text as identity. Students will edit prompts, and two cards may legitimately share similar wording.

## Sync mapping

Store a per-destination mapping rather than putting Anki-specific state directly on the canonical card.

Suggested logical table:

```text
card_sync_targets
  id
  user_id
  card_id
  provider              'anki'
  target_profile_id      local/profile bridge identity
  target_deck            requested deck name/path
  remote_note_id         Anki note ID once created
  last_synced_hash
  sync_state             pending | synced | error | conflict | disabled
  last_error
  last_synced_at
```

One Nemesis card may eventually sync to more than one destination/profile. Keeping the mapping separate avoids making that impossible later.

## Sync operation model

Use an idempotent operation queue. Replaying a request must not create duplicate notes.

Suggested operations:

```text
CREATE_NOTE
UPDATE_NOTE
MOVE_DECK
SUSPEND_SYNC
ARCHIVE_MAPPING
```

Each operation references the immutable Nemesis card ID and expected content hash.

### Create

When an approved card has no `remote_note_id`:

1. Ensure target deck exists.
2. Ensure the Nemesis note model exists or map to Anki's Basic/Cloze models.
3. Create the note.
4. Include a stable marker such as `nemesis_id:<UUID>` in a dedicated field or tag.
5. Store the returned Anki note ID and synced content hash.

### Update

When `content_hash != last_synced_hash` and a mapping exists:

1. Resolve the mapped Anki note.
2. Verify the note still contains the expected Nemesis marker.
3. Update content fields/tags.
4. Store the new hash/time.

Never create a second card merely because wording changed.

### Delete

Do **not** automatically delete an Anki note when a Nemesis card is deleted/archived in the MVP.

Deletion is destructive and users may have review history attached to the Anki card. Prefer:

- stop future Nemesis updates, or
- explicitly ask the user whether to remove the Anki note.

## Note models

Initial mapping:

### Basic

```text
Front
Back
Extra
Source
NemesisID
```

### Cloze

```text
Text
Extra
Source
NemesisID
```

`Source` should contain human-readable provenance such as course/lecture name plus timestamp, with a Nemesis deep link when available.

Use tags for organizational metadata rather than identity:

```text
nemesis
nemesis::course::<slug>
nemesis::lecture::<slug>
```

Never rely on a mutable tag as the sole sync key.

## Approval workflow

The correct UX is:

```text
Generate 24 drafts
      ↓
student scans/edits/rejects
      ↓
Approve 17
      ↓
Sync approved cards
      ↓
17 created/updated in Anki
```

Do not automatically push every generated card. Card quality and deck bloat are product risks, not merely model-quality problems.

Batch approval should support:

- edit inline
- accept/reject
- change Basic ↔ Cloze where valid
- choose destination deck
- inspect source timestamp/page
- detect likely duplicates

## Conflict policy

MVP authority is deliberately simple:

- **Nemesis controls content fields it created.**
- **Anki controls scheduling/review history.**
- Unknown Anki fields and scheduling state are never overwritten by Nemesis.

If the user edits the card content directly in Anki, a later Nemesis edit may conflict. Do not silently overwrite both versions.

Initial conflict options:

- Keep Anki version
- Replace content with Nemesis version
- Duplicate intentionally
- Disconnect this card from sync

A future two-way bridge can pull content edits back into Nemesis, but that is not required for the MVP.

## Offline and mobile behavior

Mobile Nemesis does not need direct access to the Anki collection.

When the user approves cards on iPhone:

1. Backend marks Anki operations pending.
2. Next time the desktop bridge and Anki are running, pending operations are applied.
3. Anki's normal sync distributes them to the user's Anki devices.

The UI should therefore say **Queued for Anki** rather than falsely claiming **Synced** before the local bridge confirms it.

## Security

- Never store the user's AnkiWeb password.
- Never make AnkiConnect publicly reachable as part of setup.
- Authenticate the Nemesis desktop/helper to the user's Nemesis account normally.
- Treat localhost Anki operations as local-device actions requiring the user's installed bridge/add-on.
- Keep source-course data scoped to the signed-in Nemesis user.

## Observability

Measure:

- users who enable Anki sync
- approved cards queued
- create/update success rate
- duplicate-prevention failures
- sync latency from approval to confirmation
- error reason by bridge/Anki version
- percentage of generated cards approved before sync

Do not measure success only as "cards generated." The useful metric is cards the learner chose to keep and can actually review.

## Implementation order

1. Add stable card identity/content hashes if not already present.
2. Add sync-target mapping and operation queue.
3. Add Anki-compatible text export as fallback.
4. Implement desktop → AnkiConnect capability detection.
5. Implement deck listing/creation and Basic note creation.
6. Add Cloze.
7. Add update/reconciliation by stable marker + Anki note ID.
8. Add batch UI and sync status.
9. Only then evaluate a dedicated Nemesis Anki add-on and/or two-way content reconciliation.

## Definition of done for MVP

A student can approve ten cards in Nemesis, choose an Anki deck, open Anki on desktop, and receive exactly ten notes. Editing two of those cards in Nemesis and syncing again updates exactly those two notes, creates no duplicates, and leaves Anki scheduling/review history intact.
