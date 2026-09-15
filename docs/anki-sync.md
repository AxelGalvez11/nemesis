# Anki import and sync contract

**Status:** target architecture
**Owner direction:** 2026-09-13

## Goal

A student who already has Anki can bring existing decks into Nemesis and keep them available there without rebuilding cards manually.

The primary direction is **Anki → Nemesis**:

```text
existing Anki decks
      ↓
import / desktop sync
      ↓
Nemesis card library
      ↓
search + organize + connect to lectures/notes
      ↓
AI explanations / related material / study tools
      ↓
optional Nemesis review
```

Nemesis should treat Anki as an acquisition source for a student's existing study memory, not mainly as an export destination.

## Product promise

The user-facing action should be understandable as:

**Connect Anki** or **Import Anki**

After connection, a student can select decks and see those cards inside Nemesis. Imported cards should preserve, where available:

- deck hierarchy
- note/card type
- note fields
- tags
- card front/back rendering data where practical
- media references
- Anki identity
- scheduling/review metadata when the chosen import path supplies it

Nemesis may add its own metadata around an imported card without destructively rewriting the Anki source.

## MVP direction

Build in two layers.

### Layer 1 — file import

Support Anki package import so a user can move decks into Nemesis even without a desktop bridge.

Primary inputs:

- `.apkg` — a deck / deck tree; it can include cards, notes, note types, media and scheduling when exported with those options
- `.colpkg` — the whole collection; collection packages preserve scheduling and may include media

File import is a snapshot, not continuous sync.

### Layer 2 — connected desktop sync

For users who want their existing Anki collection to remain mirrored in Nemesis:

```text
Anki desktop
      ↓ localhost
AnkiConnect / later Nemesis Anki add-on
      ↓
Nemesis desktop helper
      ↓ authenticated
Nemesis backend
      ↓
web + mobile see the same imported cards
```

AnkiConnect exposes local actions such as deck listing, note search, note details and card details while Anki desktop is running. The standard local endpoint is `127.0.0.1:8765`.

Because Nemesis already has a desktop app, the desktop process is the natural bridge between localhost Anki and the Nemesis account.

A later dedicated **Nemesis Anki add-on** can provide deeper identity, deletion and change tracking if the AnkiConnect bridge proves too limited.

## Source of truth

For Anki-originated cards, the MVP authority is:

- **Anki owns the original card/note content.**
- **Anki owns scheduling and review history.**
- **Nemesis owns Nemesis-only metadata:** course links, lecture links, AI explanations, semantic relationships, annotations, mastery overlays and source associations created inside Nemesis.

Do not silently overwrite Anki content from Nemesis in the first version.

This makes initial sync safe: Nemesis can re-pull a changed Anki card without risking the user's Anki collection.

Later, an explicit two-way content mode can be added. That mode must have conflict handling before it can modify Anki notes.

## Identity

Imported cards need stable linkage back to Anki.

Suggested logical source mapping:

```text
external_card_sources
  id
  user_id
  provider                 'anki'
  connection_id            which Anki profile / import source
  anki_note_id              nullable local/synced note id
  anki_card_id              nullable card id
  anki_guid                 nullable, when available from package/add-on
  deck_name
  model_name
  source_modified_at
  source_hash
  last_seen_at
  sync_state                imported | synced | changed | missing | error
  last_error
```

Do not identify a card by its front text. Wording changes, duplicate-looking prompts and cloze variants make text identity unsafe.

For package imports, preserve Anki GUIDs when available. For AnkiConnect-based sync, scope Anki note/card IDs to the connected Anki profile and keep a content hash for change detection.

## Canonical Nemesis card

The external-source mapping points at a normal Nemesis card object rather than forcing the rest of the app to understand Anki's schema.

Suggested logical fields:

```text
cards
  id                       UUID — Nemesis identity
  user_id
  origin                   native | anki
  external_source_id       nullable mapping
  note_type
  fields                   normalized + original fields
  rendered_front
  rendered_back
  tags
  media_refs
  nemesis_course_id        nullable
  nemesis_lecture_id       nullable
  explanation              nullable Nemesis-only enrichment
  created_at
  updated_at
```

Preserve original Anki fields even when Nemesis also creates normalized `rendered_front` and `rendered_back`. Custom note types cannot safely be reduced to two strings and then reconstructed later.

## Initial connection flow

```text
Settings / Cards
      ↓
Connect Anki
      ↓
Nemesis desktop detects AnkiConnect
      ↓
show deck tree + counts
      ↓
student selects decks
      ↓
initial pull
      ↓
Nemesis card library appears on web/mobile
```

The student should be able to choose:

- all decks
- selected top-level decks
- selected subdecks

Do not automatically import the entire collection without showing scope and estimated card count.

## Sync algorithm

### Initial pull

1. Read available deck names/IDs.
2. For each selected deck, find its notes/cards.
3. Read note fields, tags, note type and related card information.
4. Normalize for Nemesis display while preserving original fields.
5. Upsert by the Anki source identity.
6. Record source modification/hash state.
7. Mark the connection's initial sync complete.

### Incremental pull

On later sync:

1. Re-read selected deck scope.
2. Compare modification metadata/content hashes where available.
3. Fetch changed/new notes or cards.
4. Update their Nemesis mirror.
5. Preserve all Nemesis-only metadata and course/lecture relationships.
6. Periodically reconcile the full selected scope so removed cards can be identified safely.

A source refresh must never erase Nemesis-only annotations merely because Anki does not know about them.

### Missing/deleted source cards

Do not immediately delete a Nemesis card when an Anki item disappears from one poll. A deck may have been renamed, moved, temporarily excluded from scope or unavailable.

Use a staged state:

```text
synced → missing → confirmed_removed
```

Only after reconciliation should Nemesis offer options such as:

- keep in Nemesis as a detached card
- archive in Nemesis
- remove from Nemesis

## Scheduling data

Anki scheduling is valuable but should not be required to get useful cards into Nemesis.

When available, preserve source scheduling information separately from Nemesis's own review system:

```text
anki_review_state
  card_id
  due
  interval
  ease / difficulty fields when available
  queue/state
  lapses
  reps
  source_updated_at
```

Do not translate Anki scheduling into Nemesis mastery as though the two were equivalent. "Anki says this card is due" and "Nemesis has evidence the learner understands this concept" are different facts.

If the user reviews an imported card inside Nemesis, initial Nemesis review evidence stays Nemesis-side. Do not mutate Anki's schedule until an explicit bidirectional review-sync design exists.

## Custom note types and Cloze

Anki users frequently have more than Basic and Cloze.

The importer must therefore preserve:

- model/note-type name
- original field names and values
- card-template identity where available
- tags
- rendered question/answer if the bridge can obtain them

For Nemesis study views, prefer the rendered card when available. Use field-level normalization only as a convenience layer.

Cloze cards may generate several Anki cards from one note. Preserve the note ↔ card relationship instead of flattening every card into an unrelated note.

## Media

Package imports may contain sounds/images. Continuous sync may need a separate media-fetch path.

For MVP:

- import package media when present
- store media with user-scoped ownership
- rewrite internal references for Nemesis rendering
- avoid duplicating identical media where hashes match
- do not make the first continuous-sync release depend on perfect media parity if text cards already provide value

## AnkiWeb

Do not build the product around private/undocumented AnkiWeb endpoints, scrape AnkiWeb, or ask users for their AnkiWeb password.

Anki's own sync can continue moving a user's collection among Anki devices. Nemesis only needs a safe ingress path from a local/exported collection.

## Mobile behavior

The iPhone app does not need direct access to Anki.

Once the desktop bridge uploads imported cards to Nemesis, they are normal cloud-backed Nemesis artifacts and can appear on:

- Nemesis web
- Nemesis iPhone/iPad
- Nemesis desktop

This is an important product benefit: **connect Anki once on desktop, then use the imported study library anywhere Nemesis runs.**

## Two-way sync — later

Two-way content sync may eventually be useful, but it is not required for the first useful product.

If added, it must distinguish:

- Anki edit only
- Nemesis edit only
- both edited since last sync
- scheduling-only changes
- Nemesis-only enrichment changes

Conflict options should be explicit:

- Keep Anki version
- Keep Nemesis version
- Merge fields where safe
- Duplicate intentionally
- Disconnect the mirror

Scheduling/review history should remain Anki-owned unless Nemesis deliberately implements a reviewed and tested scheduler synchronization contract.

## Security

- Never store the user's AnkiWeb password.
- Never expose AnkiConnect to the public internet.
- The desktop helper authenticates only to the signed-in Nemesis account.
- User card content and media are user-scoped.
- Import is read-only against Anki for MVP.
- Any future writes back to Anki require explicit connection permission and visible conflict behavior.

## Observability

Measure:

- users who connect/import Anki
- decks selected
- cards imported
- initial sync success rate
- changed cards pulled per subsequent sync
- sync error categories
- custom note-type rendering success
- percent of imported Anki users who later search, annotate, link or review those cards in Nemesis
- retention of Anki-connected users versus non-connected users

The success metric is not merely "we copied cards." It is whether importing an existing study library makes Nemesis immediately useful.

## Implementation order

1. Add generic external-card source mapping.
2. Build `.apkg` import with preserved note fields/tags/deck hierarchy.
3. Add package media import.
4. Add `.colpkg` import where appropriate.
5. Implement desktop AnkiConnect capability detection.
6. Implement deck picker and initial Anki → Nemesis pull.
7. Add stable mapping + content-hash reconciliation.
8. Add scheduling metadata ingestion where available.
9. Add periodic/full reconciliation for removed/moved cards.
10. Evaluate a dedicated Nemesis Anki add-on for stronger incremental sync.
11. Only then evaluate bidirectional content/review sync.

## Definition of done for MVP

A student with an existing Anki collection can connect or import a selected deck, see the same cards in Nemesis on web and mobile, keep deck/tag/note-type identity, re-sync after editing or adding cards in Anki without creating duplicates, and keep Nemesis-only annotations/lecture links intact across refreshes.
