# The knowledge registries — Concept, Curriculum, Visualization

> **STATUS (2026-08-23, evening): THE COURSE VERTICAL SLICE IS BUILT — composer capability → turn
> router → plan on the territory marker → Minimap course section — AND THE LIBRARY SWEEP LANDED:
> 103 checked-in skeletons (`lib/learn/curricula/`), all `provisional`/`nemesis-authored`, every
> AP subject mapped by alias, the 1L law core, the nursing sequence and the engineering core
> included. Owner rulings the same day: sweep everything at once; ONE skeleton per subject taught
> to the clarified depth (no per-depth variants); unknown subjects go to the deep-research builder
> — SHIPPED the same evening: `lib/learn/curriculum-research.ts` (search → read → synthesise →
> validate, same rails as every turn), a researched plan carries its citations, and only research
> FAILING is a refusal now. Whole-exam names (nclex, mcat, cpa, bar) deliberately resolve to
> nothing — the builder owns exam-shaped prep. NO EXTERNAL CORPUS WAS INGESTED. The licence
> attestation migration is written and NOT applied (one apply attempt was correctly blocked by the
> permission layer; it waits for an explicit owner-approved run); the checked-in seeds serve
> reads.**
>
> Owner brief 2026-08-22; three explicit rulings 2026-08-23 — §38 narrowed for one-shot composer
> capabilities, v1 course scope follows the explicit user goal, and `core_sources` stays the one
> source catalogue with `core_source_license_versions` as its versioned attestation child. Built:
> `concept-identity.ts`, `licensed-source.ts` (consumes attestations, mints no identity),
> `curriculum-registry.ts` + one seed, `curriculum-plan.ts`, `curriculum-course.ts`, the Course
> chip in `canvas-composer.tsx`, `curriculumFor` on the turn decision, plan persistence on
> `CanvasTerritory`, and the Minimap's Course section.
>
> 🔴 THIS DOCUMENT CARRIES A STATUS LINE FOR THE REASON §41 DOES. A design document describing four
> tables while the code has none is read, six weeks later, as a description of built behaviour. Move
> this line in the same change that builds the thing it describes.

This architecture was produced by inspecting the repo, drafting, and then having three adversarial
critics attack the draft against the real code. Twelve blocking and fourteen serious findings came
back; nine blocking findings were verified and accepted, and they made the design materially
smaller — one column, one whole table and one unique index were deleted rather than built. Section 0
records what changed and what was refused, with the evidence for each.

---

# Nemesis Registries — final architecture

**Worktree inspected:** `/private/tmp/claude-501/-Users-axelgalvez-Desktop-nemesis/779cc0c9-9af6-4e68-8fce-feeaf5909c9c/scratchpad/registry-wt` (origin/main). Every path and line number below was opened, not recalled.

---

## 0. What the review changed, and what I refused

Three critics reviewed the first draft. I verified every blocking finding myself. Nine of them were right and one was wrong on its facts. The design is now materially smaller.

**Accepted, and they collapsed the design:**

| Finding | Verified how | Consequence |
|---|---|---|
| A `learning_canvases.curriculum_plan` column is a **second acquisition marker** on a row that already has one | `canvas-territory.ts:64` (`CanvasTerritory`), `canvas-knowledge.ts:791` — *"Making it right needs **the marker** to hold an accumulating set of subjects"* | **The column is deleted.** The plan becomes a field on `CanvasTerritory`. One marker, one `markerStands`, one `force`. Zero canvas-side migrations. |
| The plan's acquisition story **cannot fire**: `territoryReuse` ignores the topic | `canvas-territory.ts:271-280` — *"🔴 IT DOES NOT LOOK AT THE TOPIC AT ALL"*; `canvas-knowledge.ts:774-792` records the same behaviour live for a second lecture | **v1's plan governs SCOPE only.** `acquired` is deleted. The acquisition queue is deleted. |
| No acquisition queue ⇒ `curriculum_prerequisites` has **no consumer** | `policy-runtime.ts:230-232` — *"a dependency graph in a table becomes a curriculum somebody has to migrate"*; `canvas-cognitive-runtime.md:688` non-goal 10 | **The prerequisites table is cut from v1.** It returns in the migration that ships its consumer. |
| Global `unique (surface_key)` makes homonyms unrepresentable and fails the law/engineering test | `knowledge-identity.ts:186-193` — *"NOT SCOPED TO A COURSE OR A USER… if real collisions turn up, the fix is to add a scope to the key"*; `CLAUDE.md:12` | **Aliases are scoped to a curriculum.** Resolution requires a curriculum context; a bare global lookup returns nothing. |
| The Course chip is a control on the learning surface that selects what happens next | `docs/canvas-product-contract.md:916` verbatim: *"**And the rule generalises: no button on the learning surface that selects what happens next.**"* | **The capability ships model-derived, with no control.** The chip is Open Decision 4 and needs a recorded §38 reversal before one line of it is written. |
| `occlusionFor` cannot host the visual wiring | `canvas-policy-view.tsx:1` is `"use client"`; `:695` declares it **synchronous** and returns only `source_figure`; `reference-images.ts:243` is `async` | Candidates resolve **server-side** and arrive as a prop. A sibling `visualFor` returns the full route. |
| `offers.length > 1 ? menu : picker` makes **Upload unreachable** | `canvas-composer.tsx:702` and `:716` are the **only two** triggers of `filePicker.current?.click()` | `offers?: readonly ("upload"\|"record"\|"course")[]`, default `["upload"]`, one rule. |
| `algorithm\|calculate` cannot reach the ledger | `learning-objective.ts:57` — `ObjectiveCapability` is a closed six-value union; `calculate` is absent; `runtimeCanStage(type, capability: ObjectiveCapability)` | **Two refusals**, not one: `capability-unrecognised` ≠ `capability-not-supported`. Validate through `supportedPairs()`. |
| `findReferenceImages` queries Wikimedia **live at teaching time** | `reference-images.ts:243-251` unconditionally `await`s `searchCommons`; `canvas-product-contract.md:1420-1422` calls those repositories *"sources to harvest into a registry… not services to query live at teaching time"* | The teaching path calls `searchCurated` only. |

**Rejected, with evidence:**

**R-A. "Reuse `core_sources`; your enum argument is wrong."** — *Half right, and I retract the half that was wrong.* My claim that "widening a Postgres ENUM is less reversible than widening a CHECK" is **contradicted by this repo's own practice**: `0106_expand_core_source_providers.sql:8-25` runs `ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS` fourteen times, including `'openstax'`. That reason is withdrawn.

The reuse is still wrong, for a reason I can point at. **`core_sources` has no column that can hold a credit line.** Line 54 is `attribution_required BOOLEAN NOT NULL DEFAULT false` — it records *whether* attribution is owed and never *what it says*. §42 (`canvas-product-contract.md:1415-1418`) requires the opposite: *"the credit always exists to display at the moment the picture is shown. A licence stored in a database and never rendered is a record of a promise nobody kept."* Two further verified frictions: `provider` is a closed enum, so a field-agnostic corpus needs a migration per publisher; and `source_url TEXT NOT NULL` + `content_hash TEXT NOT NULL` (`0101:44,49`) assume a fetched, re-fetchable web document. This is now **Open Decision 1**, stated honestly rather than argued away.

**R-B. "Route curriculum orderings through `library_link_edges` with `origin = 'curriculum'`."** — Rejected. I verified the table at `20260729222659_second_brain_graph.sql:23-56`. It is `user_id uuid not null references auth.users(id)`, owner-only `for select`, and its endpoints are `readable_library_documents` — **notes, not concepts**. A global curriculum cannot be a row in a per-user note graph without inventing a user to own it. And its `relation` column holds `prerequisite_of` and `part_of` side by side under one `confidence` scale — the exact conflation the owner's second hard constraint forbids. Reusing it inherits the defect. *Accepted instead:* the critic was right that I named only two prerequisite stores when there are three. §4 now carries the reconciliation and a guard.

**R-C. "Delete the chip."** — Rejected as a conclusion, accepted as a sequencing rule. §38's two dead buttons ("Retest me", "Fix my weak spots") are dead for a stated reason: *"Both behaviours are already owed to the learner **automatically**"* (`:911`). Applying a curriculum is not owed automatically — nothing in the product does it, and nothing can observe the wish. And §38's own KEEP list (`:922`) preserves `+ attach` — a composer affordance that changes what the next submission *carries*. So the chip is arguable. But §38 is a written rule and arguable is not permission. **The design therefore ships the whole capability with no control**, which is §38-clean by construction, and puts the reversal in front of the owner as a decision.

---

## 1. What existing infrastructure is reused

Everything below was opened. Nothing here is new work.

### 1.1 Identity — the whole answer to "do not duplicate"

| Reused | Path | For | Verified constraint |
|---|---|---|---|
| `knowledgeIdentityKey` / `identityBasis` / `KNOWLEDGE_IDENTITY_VERSION = 2` | `apps/web/lib/learn/knowledge-identity.ts:211, :96, :209` | **Unchanged.** Stays the sole identity of a CLAIM. | The signature is a `Pick` of `type\|statement\|pair\|relation\|relationKind\|semanticRelations` — it structurally cannot see a source, canvas, user or curriculum. |
| `normalizeForIdentity` / `causalNodeKey` | `:56`, `:183` | The join key between a canonical concept's surface form and what a canvas holds. | `causalNodeKey` is exactly `normalizeForIdentity` and nothing else. **It is called from inside `identityBasis` at `:96`** — changing it re-keys the entire corpus and orphans every `learner_evidence` row. |
| `fnv1a64` | `:81` — **module-private today** | Hashing concept and curriculum keys. Needs one word: `function` → `export function`. | Re-implementing it would be a second copy of one hash. Export it; do not copy it. |

**The registries hold no claims at all.** Every claim a learner meets is still minted by one of the two producers `docs/canvas-interaction-model.md:1105` fixes the count at. There is nothing to duplicate because the knowledge layer owns CLAIM identity and has never owned CONCEPT identity.

### 1.2 The canvas marker — one, not two

| Reused | Path | For |
|---|---|---|
| `CanvasTerritory`, `territoryReuse`, `markerStands`, `materialStamp`, `buildRules`, `readTerritory`, `frozenTopic`, the `force` escape hatch | `canvas-territory.ts:64, :282, :193, :234, :174, :396, :265`; `force` rationale at `:304-311` | **The plan lives inside `CanvasTerritory`.** One reuse predicate, one staleness rule, one `force`. |
| `loadCanvasTerritory` / `saveCanvasTerritory` | `canvas-store.ts:379, :407` | Unchanged. `saveCanvasTerritory` already does a partial upsert of `{id, territory, title, user_id}` — verified at `:415`. |
| The `territory` column's deliberate absence from `canvasToRow` | `canvas-store.ts:183-190` | Unchanged, and **no new column is added**, so the trap cannot be re-entered. |

🔴 **One verified gotcha this creates.** `readTerritory` (`canvas-territory.ts:396-432`) **reconstructs its return value field by field** and silently drops anything it does not name. Adding `plan` to the interface without adding a branch there means the plan is written and never read back — the same hand-written-list trap as `canvasToRow`, one level down. §3.4 has the exact edit.

### 1.3 Licence

| Reused | Path | For | Constraint |
|---|---|---|---|
| `REUSABLE_LICENCES`, `AssetLicence`, `attributionRequired`, `chooseAsset`, `PROVENANCE_LADDER`, `mayBearAccuracyClaim`, `creditLineFor` | `visual-provenance.ts:99, :75, :106, :202, :49, :138, :289` | The licence half of the Source Registry. | Extract the inline predicate at `:256` into `isReusableLicence()`; **both** `chooseAsset` and the ingest gate call it. The file's own header names the trap: `startsWith("CC BY")` silently admits CC BY-NC. |
| `CuratedEntry` / `REFERENCE_REGISTRY` / `searchCurated` | `reference-images.ts:57, :209`; `reference-registry.ts:35` | The Visualization Registry itself. | `:53-55` — *"a curated row cannot exist without one, because the type will not let it."* **This IS the image licence record.** `registry_sources` never touches it (see §5.2). |
| `core_sources`' RLS shape + the modern revoke/grant block | `0101_core_sources.sql:144-162`; `20260806T01:85-87`; `20260724200000:66` | The posture for all four registry tables. | 0101 writes **no grants**, and `20260724200000:66` records that Supabase's defaults hand `anon`/`authenticated` full DML at the GRANT layer. Copy 0101's policy **plus** the revoke/grant. |

### 1.4 Teaching, focus, Minimap

| Reused | Path | Constraint verified |
|---|---|---|
| `FocusScope` / `applyFocus` / `isFocused` / `WHOLE_CANVAS` | `canvas-focus.ts:22, :48, :59, :29` | Three fields, and `applyFocus` **returns everything when the filter empties** (`:41-46`). A plan node naming nothing this canvas holds would silently focus the whole canvas — so unreachable nodes must be rendered unfocusable. |
| `availableTerritories` | `canvas-focus.ts:86-138` | **Unchanged and unwidened.** Verified at `:100-137`: a parent appears only when ≥2 leaves explicitly name the same `hierarchy` parent / `classification` category / `part_whole` whole. That is the one sanctioned ontology→structure conversion and it is GROUPING ONLY. A curriculum tree is an author's plan — a different justification — and must not be laundered through this function. |
| `territoryMark` / `MarkedTerritory` / `Territory` | `canvas-minimap.ts:55, :30, :21` | `territoryMark` returns `null` when every key is `unknown`. A plan node never asked about carries **no mark** — UI-001, and the visual form of "unknown is not the bottom of a scale". |
| `projectLearnerState` | `learner-evidence.ts:368` | `canvas-minimap.ts:4-8`: *"THIS FILE INVENTS NO LEARNER STATE."* There is no `curriculum_progress` column and there must never be one. |
| `runtimeCanStage` / `SUPPORTED` / **`supportedPairs`** | `runtime-support.ts:70, :26, :80` | Six pairs. `supportedPairs()` is *"EXPORTED SO A TEST CAN SWEEP IT RATHER THAN RESTATE IT"* (`:76-78`) — it is what the registry validates against, because `runtimeCanStage` takes the closed `ObjectiveCapability` and free text cannot reach it. |
| `termsOf` / `prerequisiteMap` / `dependentsOf` | `objective-prerequisites.ts:80, :154, :187` | **Untouched.** Verified at `:80-131`: causal→node keys, association→`causalNodeKey`, procedure→`${scope}#step#N`, **everything else `NO_TERMS`**. `classification` is deliberately absent (`:74-78`). |

### 1.5 The turn

| Reused | Path | For |
|---|---|---|
| `TurnDecision` envelope, `asAction`, `readTurnDecision`'s `reply` fallback | `turn-router.ts:97, :818, :894` | The curriculum request arrives as **one new nullable field on the decision the model already returns** — not a fourth `TurnAction`, not a bypass. |
| `TurnContext.lessonInProgress` as the shape for a fact in the packet | `:207` declared, `:751` rendered | The template. `turn-router.test.ts:166` forbids any internal identifier in `stateBlock`. |
| `converse`'s `study` branch and its `isPreContent` fork | `use-canvas-session.ts:992-1021`, fork at `:1003` | 🔴 `:904-905`: *"THE MODEL DECIDES WHAT THE TURN MEANT; THIS FUNCTION DECIDES WHAT THAT CAN DO."* The plan is applied here. |
| The WHICH-SUBJECT-vs-WHICH-PART refusal | `turn-router.ts:668-694` | **Inherited, never overridden.** Measured in a browser 2026-08-21: *"can you teach me a new language"* retitled the canvas and ingested two marketing pages as study material. |
| `composerIntent` | `composer-intent.ts:47, :109` | **Untouched.** `:109` returns `answer` unconditionally before anything else is read. |

### 1.6 Schema conventions

`parsed_documents`' three-version columns (`20260805040000:49-79`), `reprocess.ts:55`'s side-by-side `needsReprocess`, `isMissingTableError` (`canvas-store.ts:198`) and `isMissingTable` (`learner-store.ts:26`, whose 🔴 records that 42703 is a **broken deploy**, not a missing table), `__fixtures__/three-disciplines.ts:4-9`, and the runner glob at `apps/web/package.json:17`.

---

## 2. What new tables and types are actually necessary

Four tables. Three migrations. **Zero changes to any existing table.**

### 2.1 `registry_sources` — necessary

*Nearest neighbours, all opened:* `library_sources` (`20260804010000:17`) has `file_name, mime_type, size_bytes, storage_path, content_hash, course_id` and **no licence, attribution, rights or provenance-of-rights column**. `paper_access` (`20260629040206:49`) is paper-keyed (`doi/pmid/pmcid`) and has no `gate_version`. `core_sources` — see R-A: no credit-line column, closed provider enum, `source_url NOT NULL`.

**Justification against no-duplication:** it duplicates no licence record that exists. It deliberately does **not** cover images — those keep their licence on `CuratedEntry`, where the type already makes it unforgeable.

### 2.2 `concepts` + `concept_aliases` — necessary

`canvas-model.ts:218-220`, quoted in full because its third sentence is the one that matters:

> *"A concept is the unit the diagnosis speaks in. Nemesis has no global concept entity (we checked — no table, no id, no field anywhere), so a canvas carries its own short list. **Deliberately not a new global taxonomy:** just enough for 'which ideas are blocking you'."*

**Answering the third sentence directly.** That comment declines a global taxonomy *for the diagnosis's own use* — for naming what is blocking one learner on one canvas, a canvas-local list is enough and a taxonomy would be overbuilt. The registries need something the diagnosis never did: a stable id an **authored curriculum** can point at across canvases and across learners. `CanvasConcept` cannot do that — its ids come from a lesson-generation model's JSON (`canvas-parse.ts:156-165`) and are meaningless outside the canvas that minted them. So this is not the taxonomy that was declined; it is the missing entity-identity layer `knowledge-types.ts:161-166` names by hand:

> *"merging them needs a real entity-identity layer, and having a model declare two phrasings equivalent would be a guess that silently welds unrelated mechanisms together."*

**Justification against no-duplication:** `knowledge_objects` is per-user by construction (`user_id NOT NULL DEFAULT auth.uid()`, `unique (user_id, identity_key)`, four owner-only policies) and its `statement` is verbatim learner material — `20260811T02:37-44` records both reasons a shared table was declined. It also holds claims, not entities. A concept row holds an identity and a label and **no statement, no pair, no relation, no objective**.

### 2.3 `curricula` + `curriculum_nodes` + `curriculum_outcomes` — necessary

`grep -l curriculum supabase/migrations/` returns nothing. `learning_objectives` is one row per (learner, knowledge object, capability) minted mechanically, with no ordering, grouping, depth or outcome. `public.courses` (`20260806200000:18`) is a per-user `{code,name}` filing label that **no application code reads** — verified by grep across `apps/`, `packages/`, `extension/`, `landing/`.

### 2.4 Cut, and why

| Cut | Reason |
|---|---|
| `curriculum_prerequisites` | No consumer in v1. `canvas-cognitive-runtime.md:688`: *"A nullable column waiting for a future model is a promise the schema cannot keep."* Returns with its consumer. |
| `learning_canvases.curriculum_plan` | Would be a second acquisition marker. Folded into `CanvasTerritory`. |
| `PlanSubject.acquired` | A stored interpretation of state that lives elsewhere — non-goal 9, and `20260811T03:40`. Computed at read time. |
| A `visual_assets` table | `REFERENCE_REGISTRY` is already the shipped shape, already deliberately empty, already has its injection seam. |
| A `VisualRole` union | Grep-verified absent under every spelling. `visual-route.ts:340-359` records the deletion of exactly this kind of rule. |
| A third `UnanchoredProvenance` variant | Nothing carries a canonical claim, so nothing needs a canonical way of knowing. |

---

## 3. Proposed migrations

### 3.1 `supabase/migrations/20260822T10_registry_sources.sql`

```sql
-- 20260822T10 — nothing enters a registry without a licence somebody read.
--
-- 🔴🔴 UNKNOWN LICENCE = DO NOT INGEST, AS A CONSTRAINT RATHER THAN A CONVENTION.
-- `licence` is NOT NULL with NO DEFAULT: an unlicensed source is not a row with a
-- blank field, it is a row that cannot be written. Same two-layer shape
-- 0101_core_sources.sql already uses (a throwing gate in `license.ts:162` plus
-- `CHECK (commercial_use_allowed = true)` the row cannot pass) — here the code
-- half is `admitSource` in apps/web/lib/learn/licensed-source.ts, whose branded
-- return type every registry ingestion function requires as a parameter.
--
-- 🔴 THE LICENCE IS PER FILE, AND "IT CAME FROM A BIG OPEN REPOSITORY" IS NOT ONE.
-- Owner, quoted at apps/web/lib/learn/visual-provenance.ts:68. `source_key` names
-- ONE document. Gating at the repository level and then trusting every file from
-- it violates this rule while looking compliant.
--
-- 🔴 TEXT SOURCES ONLY. THIS TABLE NEVER HOLDS AN IMAGE'S LICENCE, AND THAT IS
-- LOAD-BEARING RATHER THAN AN OVERSIGHT. `CuratedEntry` (reference-images.ts:57)
-- already requires assetPath, attribution, caption, concepts, licence and source —
-- "a curated row cannot exist without one, because the type will not let it"
-- (:53-55). Giving a curated image row an FK here would put one file's licence in
-- two places, which is 20260811T02:106 verbatim: "two representations of one
-- relationship are two things that can disagree, and the disagreement would be
-- invisible." Concepts, curricula and their nodes cite this table. Images do not.
--
-- 🔴 SPDX TEXT, AND IT DOES NOT WIDEN `core_source_license`. Two licence
-- vocabularies already exist and disagree: this repo's SPDX strings
-- (REUSABLE_LICENCES, visual-provenance.ts:99) and 0101's Postgres ENUM. This
-- table joins the FIRST rather than minting a third. `core_sources` is not reused
-- because it has NO column that can hold a credit line — line 54 is
-- `attribution_required BOOLEAN`, which records THAT attribution is owed and never
-- WHAT IT SAYS, and §42 (canvas-product-contract.md:1417) requires the opposite:
-- "A licence stored in a database and never rendered is a record of a promise
-- nobody kept." Its `provider` is also a closed enum needing a migration per
-- publisher, and `source_url`/`content_hash` are NOT NULL, which assumes a fetched
-- web document. (An earlier draft of this header argued that widening an enum is
-- less reversible than widening a CHECK. That was WRONG and is withdrawn:
-- 0106_expand_core_source_providers.sql:8-25 widens one fourteen times with
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS, including 'openstax'.)
--
-- 🔴 NO CHECK ON THE IDENTIFIER, ON PURPOSE, AND THE ASYMMETRY IS THE POINT —
-- the argument 20260818T01:14 makes. The allow list is applied on READ by
-- `isReusableLicence`, so a GROWING list can never fail a write, and a list that
-- later NARROWS retroactively excludes rows written under the older one —
-- which is what `gate_version` is for.
--
-- 🔴 `gate_version` EXISTS BECAUSE `paper_access` DOES NOT HAVE ONE. That table
-- (20260629040206:49) stores a licence decision without storing which rules made
-- it, so a rule change cannot find the rows it invalidated.
-- `parsed_documents.parser_version` is the in-repo pattern this copies.
--
-- 🔴 THE CC-BY CREDIT RULE IS **NOT** DUPLICATED HERE. `attributionRequired`
-- (visual-provenance.ts:106) already is that predicate, in TypeScript, and a SQL
-- regex beside it would be a second hand-maintained copy of one rule — the exact
-- drift `isReusableLicence`'s extraction exists to prevent, and what
-- runtime-support.ts:3-9 records as having already cost this product a surface.
-- `admitSource` owns it alone. What SQL owns is what TypeScript cannot express:
-- NOT NULL columns and NOT NULL foreign keys.
--
-- Owner constraint, verbatim from reference-registry.ts:11: "Do NOT bulk-ingest
-- the internet." Every row is a file somebody opened, read the licence of, and
-- wrote down. This table is expected to grow slowly.
--
-- APPLIED: <date> to production, BEFORE the code that reads it. Nothing in this
-- repo applies migrations automatically (20260814T02:27), and every registry read
-- degrades to today's behaviour via `isMissingTableError` when the table is absent.
-- PROVED: <fill in> — under `role authenticated` with a subject claim, never the
-- service role, which bypasses RLS and would prove nothing (20260811T02:8).
-- Calibrate FIRST: prove an authenticated INSERT changes ZERO ROWS (a missing
-- policy is silent — 20260811T03:5 — the statement SUCCEEDS having changed
-- nothing), then prove SELECT returns the seeded rows.
-- NOT DONE HERE: no rows written, no existing table modified, no licence
-- backfilled onto library_sources, and `core_sources` is not touched.

create table if not exists public.registry_sources (
  id uuid primary key default gen_random_uuid(),

  -- One document or one file. Never a repository name.
  source_key text not null check (char_length(source_key) between 1 and 200),
  title text not null check (char_length(title) between 1 and 500),

  -- 🔴 NOT NULL, NO DEFAULT. Unknown licence is unrepresentable, not "assumed open".
  licence text not null check (char_length(licence) between 1 and 60),

  -- The credit line, verbatim as the licence asks for it. This is the column
  -- core_sources lacks, and the reason this table exists rather than reusing it.
  attribution text check (char_length(attribution) <= 500),
  url text check (char_length(url) <= 2000),

  gate_version text not null check (char_length(gate_version) between 1 and 40),

  -- 🔴 NOT DEFAULTED TO now(). A default would claim a human read a licence on a
  -- day nobody did — 20260812T01:11 applied to a rights claim. Absent means NOT
  -- CHECKED, which is why the column is NOT NULL instead of nullable.
  checked_at timestamptz not null,

  created_at timestamptz not null default now()
);

comment on table public.registry_sources is
  'One licensed TEXT document, per FILE and never per repository. Written by a service-role script only, after a human read the licence. A row cannot exist without a licence: unknown licence means the ingestion is refused, not stored with a null. Image licences live on CuratedEntry in reference-registry.ts and are deliberately NOT recorded here — one file, one licence record.';
comment on column public.registry_sources.checked_at is
  'When a human read this licence. Never defaulted — absent is unrepresentable rather than assumed.';
comment on column public.registry_sources.attribution is
  'The credit line, verbatim. Null is legitimate only for a licence that owes none; admitSource refuses a CC-BY-family source without one.';
comment on column public.registry_sources.gate_version is
  'Which version of the licence gate admitted this row, so a rule change can find the rows it invalidated.';

-- 🔴 A PLAIN UNIQUE INDEX, NOT A PARTIAL ONE. 20260811T05:3 records that a partial
-- index made every evidence write from the app fail for hours, because PostgREST
-- cannot name a partial index in ON CONFLICT.
create unique index if not exists registry_sources_key_idx
  on public.registry_sources (source_key);

alter table public.registry_sources enable row level security;

-- Read: any authenticated user, because the credit line must be renderable in the
-- browser. Write: service role only — the ABSENCE of an insert/update/delete
-- policy is the denial (0101_core_sources.sql:147).
create policy registry_sources_read_authenticated
  on public.registry_sources for select to authenticated using (true);

-- The second lock 0101 omits. Per 20260724200000:66, Supabase's default privileges
-- otherwise hand anon and authenticated full DML at the GRANT layer.
revoke all on public.registry_sources from anon, authenticated;
grant select on public.registry_sources to authenticated;
```

### 3.2 `supabase/migrations/20260822T20_concept_registry.sql`

```sql
-- 20260822T20 — a stable id for an IDEA, which this product has never had.
--
-- 🔴 THE SEARCH WAS ALREADY DONE, AND THE COMMENT THAT RECORDS IT ALSO DECLINES
-- SOMETHING. apps/web/lib/learn/canvas-model.ts:218-220, in full:
--   "A concept is the unit the diagnosis speaks in. Nemesis has no global concept
--    entity (we checked — no table, no id, no field anywhere), so a canvas carries
--    its own short list. Deliberately not a new global taxonomy: just enough for
--    'which ideas are blocking you'."
-- ANSWERING THE THIRD SENTENCE, WHICH IS THE ONE THAT MATTERS. That declines a
-- global taxonomy FOR THE DIAGNOSIS — for naming what blocks one learner on one
-- canvas, a canvas-local list is enough. This table serves a different consumer:
-- an AUTHORED curriculum needs an id that survives the canvas that met it, and
-- `CanvasConcept` cannot be that (its ids come from a lesson-generation model's
-- JSON at canvas-parse.ts:156-165 and mean nothing outside one canvas). This is
-- the entity-identity layer knowledge-types.ts:161-166 names by hand as missing,
-- not the taxonomy that was declined.
--
-- 🔴🔴 IT IS NOT A SECOND KNOWLEDGE SYSTEM, AND THE PROOF IS THAT IT HOLDS NO
-- CLAIMS. A concept row carries an identity and a label. No statement, no pair, no
-- relation, no objective. Every claim a learner meets is still minted by one of the
-- two producers docs/canvas-interaction-model.md:1105 fixes the count at — the
-- Parser and the Territory Constructor — and still lands on `knowledgeIdentityKey`.
-- There is nothing here that could duplicate an identity the knowledge layer owns,
-- because the knowledge layer owns CLAIM identity and has never owned this one.
--
-- 🔴 `identity_key` CARRIES ITS VERSION INSIDE THE STRING (`concept:v1:<16 hex>`),
-- exactly as `association:v2:…` does, for the reason knowledge-identity.ts:199
-- gives. Rows are referenced by uuid so a later algorithm change does not rewrite
-- every foreign key (20260811T02:51).
--
-- 🔴🔴 `concept_aliases.surface_key` IS `causalNodeKey(surface)` AND THAT IS THE
-- WHOLE INTEGRATION. Every causal edge, association pair and prerequisite term in
-- this product already reduces to that exact string, so a canonical concept joins
-- to what a canvas holds with no mapping table and no re-derivation.
--
-- 🔴🔴 AND IT IS A LOOKUP, NEVER A REWRITE OF `normalizeForIdentity`. That function
-- is called from inside `identityBasis` (knowledge-identity.ts:96); changing it
-- re-keys the entire corpus and orphans every learner_evidence row. Nor may an
-- alias be substituted into `termsOf` — `prerequisiteMap` joins by exact normalised
-- equality (objective-prerequisites.ts:154-186), and aliasing into that join starts
-- firing edges the source never made.
--
-- 🔴🔴 ALIASES ARE SCOPED TO A CURRICULUM, AND AN EARLIER DRAFT OF THIS MIGRATION
-- GOT THIS WRONG. It had `unique (surface_key)` globally, so the first discipline
-- to claim a word owned it for every other one: "balance" in accounting and in
-- mechanics, "consideration" in contract law and in ordinary speech, "moment",
-- "stress", "argument". Homonyms across fields are the NORMAL case, so that index
-- would have failed CLAUDE.md's own design test in the schema itself, and it would
-- have failed it on the READ as well as the write — an accounting canvas whose
-- statement normalises to "balance" would have joined to a mechanics concept.
-- knowledge-identity.ts:186-193 already ruled on this shape: "NOT SCOPED TO A
-- COURSE OR A USER, AND THAT IS A DECISION… if real collisions turn up, the fix is
-- to add a scope to the key." A global word→concept map is the collision case
-- arriving by construction rather than by surprise, so the scope is added here.
--
-- 🔴 AND RESOLUTION REQUIRES THAT SCOPE. A surface form with no curriculum in
-- context resolves to NOTHING, never to whichever field got there first. A missed
-- join costs one unmapped plan node; a cross-field false join teaches a law student
-- from a statics diagram (knowledge-identity.ts:14).
--
-- 🔴 NO BACKFILL. Existing `knowledge_objects` rows are NOT swept into concepts and
-- no learner row is rewritten to point at a canonical id. 20260806200000:55 — a
-- seeded row is indistinguishable from a verified one once written. Convergence
-- happens forward, at read time, on matching keys.
--
-- APPLIED: <date>, before the code. PROVED: <fill in>, role authenticated,
-- calibrated (an authenticated INSERT changes ZERO ROWS; SELECT returns the rows).
-- NOT DONE HERE: no ontology table. `is_a` / `part_of` have no home in this
-- migration and deliberately none anywhere yet — a table with no consumer is the
-- promise docs/canvas-cognitive-runtime.md:688 says the schema cannot keep.

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),

  -- `concept:v1:<16 hex of fnv1a64(normalizeForIdentity(label))>`
  identity_key text not null check (char_length(identity_key) between 1 and 200),
  identity_version integer not null,

  label text not null check (char_length(label) between 1 and 300),

  -- 🔴 NOT NULL. A concept cannot exist without a licensed source. This is the
  -- licence gate reaching every registry row, in SQL.
  source_id uuid not null references public.registry_sources(id),

  created_at timestamptz not null default now()
);

comment on table public.concepts is
  'Canonical identity for an idea, global and read-only. Holds no claim, no statement and no learner state — claims stay in knowledge_objects and are minted only by the parser and the territory constructor.';

create unique index if not exists concepts_identity_idx
  on public.concepts (identity_key);

create table if not exists public.concept_aliases (
  concept_id uuid not null references public.concepts(id) on delete cascade,

  -- 🔴 THE SCOPE. Which curriculum asserted that this surface form names this
  -- concept. Two disciplines may both claim "balance"; neither wins, and neither
  -- is refused. Denormalised deliberately: an alias without its scope is a claim
  -- about every field at once, which is what this column exists to prevent.
  curriculum_id uuid not null references public.curricula(id) on delete cascade,

  -- 🔴 EXACTLY `causalNodeKey(surface)` = `normalizeForIdentity(surface)`. Accents
  -- are PRESERVED by that normaliser and must stay preserved here: for a language
  -- learner the accent frequently IS the thing being learned.
  surface_key text not null check (char_length(surface_key) between 1 and 300),

  -- The form as written, kept so a disputed merge can be inspected by a human.
  surface text not null check (char_length(surface) between 1 and 300),

  source_id uuid not null references public.registry_sources(id),
  created_at timestamptz not null default now(),

  primary key (curriculum_id, surface_key)
);

comment on table public.concept_aliases is
  'Many surface forms to one concept, WITHIN ONE CURRICULUM. Used for retrieval and grouping only. Never substituted into a prerequisite term: prerequisiteMap joins by exact normalised equality and an alias there would invent edges the source never made. The primary key is (curriculum_id, surface_key) so one curriculum cannot claim a word twice while a second discipline stays free to claim the same word for its own concept.';

create index if not exists concept_aliases_concept_idx
  on public.concept_aliases (concept_id);

alter table public.concepts enable row level security;
alter table public.concept_aliases enable row level security;

create policy concepts_read_authenticated
  on public.concepts for select to authenticated using (true);
create policy concept_aliases_read_authenticated
  on public.concept_aliases for select to authenticated using (true);

revoke all on public.concepts from anon, authenticated;
revoke all on public.concept_aliases from anon, authenticated;
grant select on public.concepts to authenticated;
grant select on public.concept_aliases to authenticated;
```

> **Ordering note.** `concept_aliases.curriculum_id` references `public.curricula`, created in 20260822T30. Either move the `concept_aliases` block into 30 (recommended — it is a curriculum-scoped table), or split 20 into `20260822T20_concepts.sql` and `20260822T35_concept_aliases.sql`. **I have not resolved this by guessing which the owner prefers**; the shipping list in §10 uses the first.

### 3.3 `supabase/migrations/20260822T30_curriculum_registry.sql`

```sql
-- 20260822T30 — how a subject is learned, as an author stated it.
--
-- 🔴🔴 THE STANDING REFUSAL THIS MIGRATION MUST ANSWER, IN THE REPO'S OWN WORDS:
-- "A dependency graph in a table becomes a curriculum somebody has to migrate;
-- recomputed from the knowledge on hand, it can be rewritten completely the day a
-- better rule exists." — apps/web/lib/learn/policy-runtime.ts:230-232, restated
-- verbatim at teaching-snapshot.ts:236-238.
--
-- THE ANSWER: THERE IS NO DEPENDENCY GRAPH IN THIS MIGRATION.
-- An earlier draft added `curriculum_prerequisites`. It is CUT, and the reason is
-- the repo's own non-goal 10 (canvas-cognitive-runtime.md:688): the only consumer
-- named for it was an acquisition queue, and that queue cannot exist yet (see the
-- CanvasTerritory note below). A table whose consumer does not ship is the promise
-- the schema cannot keep. It returns in the migration that ships the queue.
--
-- WHAT REMAINS GOVERNS SCOPE AND NOTHING ELSE. `position` is the order the SOURCE
-- PRINTED — a filing fact, the same kind of fact `relationKindFromHeader` reads off
-- a grid's own header cells. It is not a claim that one thing must be learned
-- before another. `prerequisiteMap`, `dependentsOf`, `termsOf`, `decideNext` and
-- `next-action-value` are untouched by this migration and must stay untouched.
--
-- 🔴 AND THERE IS A THIRD PREREQUISITE STORE IN THIS PRODUCT, NAMED HERE SO THE
-- NEXT READER DOES NOT FIND IT ALONE. `public.library_link_edges`
-- (20260729222659:23) is LIVE, materialised by a trigger on every note save, and
-- holds `relation = 'prerequisite_of'` in the SAME CHECK list as `'part_of'`, under
-- one `confidence` scale. It cannot collide with this table: it is per-user
-- (`user_id uuid not null`, owner-only SELECT) and its endpoints are
-- `readable_library_documents` — NOTES, not concepts. It is also the exact
-- conflation this lane refuses, which is why nothing here reuses it. A guard test
-- asserts no module imports both.
--
-- 🔴 DEPTH IS CAPPED AT 2, WHICH MATCHES WHAT THE SURFACE CAN ACTUALLY RENDER.
-- `availableTerritories` (canvas-focus.ts:130-137) produces exactly parent → leaf
-- and nothing recurses further. Declaring a third level would be structure nothing
-- can draw. Widening it is its own migration, before the code that writes a 2
-- (20260814T03:27).
--
-- 🔴 FIELD-AGNOSTIC BY CONSTRUCTION. No subject column anything branches on, no
-- discipline vocabulary, no per-field row shape. A law curriculum and a statics
-- curriculum are the same columns. CLAUDE.md's design test applied to the SCHEMA:
-- if chemistry rows needed a field law rows did not, the shape would be encoding
-- subject knowledge and it would be logic wearing a table's clothes.
--
-- APPLIED: <date>, before the code. PROVED: <fill in>, role authenticated,
-- calibrated. NOT DONE HERE: no prerequisite edges, no ontology relations of any
-- kind, and no link to `public.courses` — that table means a student's ENROLMENT
-- identity, it is created only by the student, and nothing in this lane may write
-- it (docs/course-identity-design.md §6).

create table if not exists public.curricula (
  id uuid primary key default gen_random_uuid(),

  identity_key text not null check (char_length(identity_key) between 1 and 200),
  identity_version integer not null,

  subject text not null check (char_length(subject) between 1 and 300),

  -- 🔴 SEPARATE FROM identity_version, FOR THE REASON parsed_documents KEEPS THREE
  -- VERSIONS IN THREE COLUMNS (20260805040000:49): "collapsing them into one index
  -- version would make targeted reprocessing impossible." The identity ALGORITHM
  -- and the AUTHORED CONTENT change independently — a re-read of the same syllabus
  -- is a new skeleton_version and the same identity_key.
  skeleton_version text not null check (char_length(skeleton_version) between 1 and 40),

  source_id uuid not null references public.registry_sources(id),
  created_at timestamptz not null default now()
);

comment on table public.curricula is
  'One authored curriculum skeleton for one subject, global and read-only. It says what is in scope and in what order a source stated; it never says what to teach next, which stays a decision of policy-runtime from demonstrated learner state.';

create unique index if not exists curricula_identity_idx
  on public.curricula (identity_key);

create table if not exists public.curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,

  parent_id uuid references public.curriculum_nodes(id) on delete cascade,
  depth integer not null check (depth between 0 and 1),

  -- 🔴 A REAL FOREIGN KEY, NOT A TEXT COPY OF THE CONCEPT KEY. 20260811T02:106 —
  -- two representations of one relationship are two things that can disagree,
  -- invisibly.
  concept_id uuid not null references public.concepts(id),

  position integer not null check (position >= 0),
  label text not null check (char_length(label) between 1 and 300),
  created_at timestamptz not null default now(),

  -- 🔴 DEPTH AND PARENT ARE ONE FACT WRITTEN TWICE, SO THE DATABASE HOLDS THEM
  -- TOGETHER. Nothing else forbids `depth = 0` with a parent, and a tree whose two
  -- descriptions of itself disagree is the invisible-disagreement failure again.
  constraint curriculum_nodes_depth_matches_parent
    check ((parent_id is null) = (depth = 0))
);

comment on table public.curriculum_nodes is
  'One concept in one curriculum, at a stated position under a stated parent. position is the order the SOURCE printed, a filing fact — it is not a claim that one thing must be learned before another.';
comment on column public.curriculum_nodes.parent_id is
  'Grouping only. A parent is not a prerequisite: a class''s members are siblings on one axis, not a chain (objective-prerequisites.ts:74-78).';

-- 🔴 `NULLS NOT DISTINCT` OVER PLAIN COLUMNS, NOT AN EXPRESSION AND NOT A PARTIAL
-- INDEX. Postgres treats NULLs as distinct by default, so root siblings would
-- otherwise be unconstrained. An earlier draft used
-- `coalesce(parent_id, '000…'::uuid)` — an EXPRESSION index, which PostgREST can no
-- more name in ON CONFLICT than the partial index that broke every evidence write
-- for hours (20260811T05:3). This form is a plain unique index over plain columns,
-- so `on_conflict=curriculum_id,parent_id,position` resolves. Requires PG15+;
-- Supabase is PG15 or later. If that is ever untrue, the fallback is to declare
-- node writes inserts-only into a table the seed script owns, and to PROVE it.
create unique index if not exists curriculum_nodes_place_idx
  on public.curriculum_nodes (curriculum_id, parent_id, position) nulls not distinct;

create index if not exists curriculum_nodes_concept_idx
  on public.curriculum_nodes (concept_id);

create table if not exists public.curriculum_outcomes (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.curriculum_nodes(id) on delete cascade,

  -- 🔴 NO VALUE CHECK, MATCHING `knowledge_objects.type` NEXT DOOR
  -- (20260811T02:58), which is also deliberately unconstrained.
  knowledge_type text not null check (char_length(knowledge_type) between 1 and 40),

  -- 🔴 A CHECK HERE AND NOT ABOVE, AND THE ASYMMETRY IS DELIBERATE — the same
  -- reasoning that gives `response_modality` a CHECK and `error_type` none
  -- (20260818T01:14). `ObjectiveCapability` (learning-objective.ts:57) is a CLOSED
  -- six-value union tied to code: something must MINT the objective, WORD the
  -- question, tell the judge what to CHECK, and produce evidence the projection can
  -- READ (runtime-support.ts:11-14). A seventh capability is a code change, so the
  -- constraint is widened in ITS OWN MIGRATION BEFORE the code that writes it
  -- (20260814T03:27) — never implicitly by an import.
  --
  -- 🔴 IT IS ALSO WHAT SPLITS TWO REFUSALS THAT WERE ONE. A curriculum declaring
  -- `algorithm|calculate` is NOT "a pair the ledger has not reached yet" —
  -- `calculate` is not a capability this product HAS, anywhere, and it cannot even
  -- be passed to `runtimeCanStage`, whose signature takes the closed union. Those
  -- are different facts with different remedies: `capability-unrecognised` versus
  -- `capability-not-supported`. See curriculum-registry.ts.
  capability text not null check (
    capability in ('recall', 'discriminate', 'explain', 'predict', 'locate', 'sequence')
  ),

  -- What the source said this node is for, verbatim. What makes a disputed outcome
  -- inspectable by a human.
  stated_as text not null check (char_length(stated_as) between 1 and 1000),

  created_at timestamptz not null default now()
);

comment on table public.curriculum_outcomes is
  'What a curriculum node is meant to make a learner able to do, as a KnowledgeType|ObjectiveCapability pair. A DESIGN TARGET, never a reading of any learner: there is no progress column, no competency-attained column and no completion column, for the reason 20260811T03:40 gives for there being no learner_objective_state table. Pairs outside runtime-support.ts''s ledger are reported as not-teachable-yet on read, never silently discarded.';

create unique index if not exists curriculum_outcomes_pair_idx
  on public.curriculum_outcomes (node_id, knowledge_type, capability);

alter table public.curricula enable row level security;
alter table public.curriculum_nodes enable row level security;
alter table public.curriculum_outcomes enable row level security;

create policy curricula_read_authenticated
  on public.curricula for select to authenticated using (true);
create policy curriculum_nodes_read_authenticated
  on public.curriculum_nodes for select to authenticated using (true);
create policy curriculum_outcomes_read_authenticated
  on public.curriculum_outcomes for select to authenticated using (true);

revoke all on public.curricula from anon, authenticated;
revoke all on public.curriculum_nodes from anon, authenticated;
revoke all on public.curriculum_outcomes from anon, authenticated;
grant select on public.curricula to authenticated;
grant select on public.curriculum_nodes to authenticated;
grant select on public.curriculum_outcomes to authenticated;
```

### 3.4 No fourth migration — the plan rides on the marker that exists

`learning_canvases.territory` is already `jsonb`, already nullable, already absent from `canvasToRow`, already loaded and saved by its own pair of functions. The plan is a field on `CanvasTerritory`.

🔴 **`readTerritory` must gain a branch or the plan is written and never read back.** Verified at `canvas-territory.ts:396-432`: it reconstructs its return value field by field and drops everything it does not name — the same hand-written-list trap as `canvasToRow`, one level down.

```ts
// apps/web/lib/learn/canvas-territory.ts

export interface CanvasTerritory {
  topic: string;
  identityVersion: number;
  objects: KnowledgeObject[];
  mechanismsUnder?: string;
  mechanismsOver?: MaterialStamp;
  emptyUnder?: string;
  emptyOver?: MaterialStamp;
  /**
   * The curriculum skeleton a learner applied to this canvas.
   *
   * 🔴 ON THE MARKER, NOT BESIDE IT, AND THAT IS THE WHOLE ARGUMENT FOR THE SHAPE.
   * A second nullable jsonb column on `learning_canvases` with its own reuse
   * predicate and its own force path would be two independent decisions about one
   * canvas — the shape canvas-territory.ts:180-186 quotes the owner against: "DO
   * NOT CREATE A SECOND INDEPENDENT RETRY SYSTEM." And canvas-knowledge.ts:791,
   * which filed this gap, prescribes exactly this remedy: "Making it right needs
   * THE MARKER to hold an accumulating set of subjects, which is a data-shape
   * change… Filed, not fudged." This is that change.
   *
   * 🔴 A PLAN, NOT A SECOND AUTHORITY. 20260813T01:10 applies verbatim:
   * knowledge_objects and learning_objectives remain the only record of what a
   * learner is being taught. Nothing downstream may read this as authoritative
   * about the learner.
   *
   * 🔴 IT HOLDS NO FOCUS AND NO PROGRESS. canvas-focus.ts:13-15: "SESSION-LOCAL,
   * NEVER PERSISTED. Where a learner was looking is not a fact about what they
   * know." A stored "currently on unit 3" would be the week-later steering
   * teaching-strategy.ts:282-284 forbids.
   */
  plan?: CurriculumPlan;
}

export function readTerritory(value: unknown): CanvasTerritory | null {
  // …unchanged through mechanismsOver…

  // 🔴 A MALFORMED PLAN READS AS ABSENT, WHICH IS THE SAFE DIRECTION AND MATCHES
  // `readMaterialStamp` two lines up: the canvas keeps its territory and loses only
  // the grouping tree, which the learner can re-apply in one turn.
  const plan = readCurriculumPlan(row.plan);

  // 🔴 A PLAN IS A THIRD REASON A ROW IS WORTH KEEPING. The rule above rejects a
  // row with no objects and no emptyUnder because it claims nothing; a row
  // carrying a plan claims something, so it survives.
  if (row.objects.length === 0 && !emptyUnder && !plan) return null;

  return {
    ...(emptyUnder ? { emptyUnder } : {}),
    ...(emptyOver ? { emptyOver } : {}),
    ...(mechanismsUnder ? { mechanismsUnder } : {}),
    ...(mechanismsOver ? { mechanismsOver } : {}),
    ...(plan ? { plan } : {}),
    identityVersion: row.identityVersion,
    objects: row.objects as KnowledgeObject[],
    topic: row.topic,
  };
}
```

**A guard test that fails if the next field is forgotten:** read `canvas-territory.ts`, strip comments, extract the `CanvasTerritory` interface's optional field names, and assert every one appears inside `readTerritory`'s body. That is the `knowledge-lane-completeness.test.ts:9-12` idiom — *"IT READS THE SOURCE, NOT A LIST"* — applied to the trap that already bit `canvasToRow` once.

---

## 4. Ingestion architecture

**One line:** a licensed file → an author's reading of it → validated rows → a global registry that holds no claims.

### Step 0 — the gate is a type

`apps/web/lib/learn/licensed-source.ts`:

```ts
import type { AssetLicence } from "./visual-provenance";
import { attributionRequired, isReusableLicence } from "./visual-provenance";

declare const licensed: unique symbol;

/**
 * 🔴 THE BRAND IS THE GATE. `admitSource` is the only function in this codebase that
 * can produce this symbol, so `{ … } as LicensedSource` is the only way past it and
 * a cast is visible in review. A convention ("remember to check the licence") is what
 * visual-provenance.ts:88 already refused for images: "the default for an
 * unrecognised licence string must be 'no'."
 */
export interface LicensedSource {
  readonly [licensed]: true;
  /** Stable key for THIS file. Never a repository name — visual-provenance.ts:68. */
  readonly sourceKey: string;
  readonly title: string;
  /** The existing per-file licence shape, reused unchanged. Not a new one. */
  readonly licence: AssetLicence;
  /** When a human read the licence. No default: absent is unrepresentable. */
  readonly checkedAt: string;
  readonly gateVersion: string;
}

export type LicenceRefusal =
  | "source-key-missing"
  | "licence-missing"        // nothing recorded at all
  | "licence-not-reusable"   // recorded, and not on the allow list
  | "attribution-missing"    // CC-BY family with no credit line kept
  | "checked-at-missing";    // nobody says when a human looked

export const LICENCE_GATE_VERSION = "licence-gate/1";

export function admitSource(input: {
  sourceKey: string;
  title: string;
  licence?: AssetLicence;
  checkedAt?: string;
}): { ok: true; source: LicensedSource } | { ok: false; reason: LicenceRefusal; detail: string } {
  const sourceKey = input.sourceKey.trim();
  if (!sourceKey) return { ok: false, reason: "source-key-missing", detail: input.title };
  if (!input.licence?.licence?.trim()) {
    return { ok: false, reason: "licence-missing", detail: sourceKey };
  }
  if (!isReusableLicence(input.licence.licence)) {
    return { ok: false, reason: "licence-not-reusable", detail: input.licence.licence };
  }
  // 🔴 ONE PREDICATE, NOT A COPY. `attributionRequired` is the shipped CC-BY rule
  // (visual-provenance.ts:106) and this is a second CALL SITE of it. An earlier draft
  // of 20260822T10 restated it as a SQL regex; two hand-maintained copies of one rule
  // is what runtime-support.ts:3-9 records as having already cost this product a
  // working surface.
  if (attributionRequired(input.licence.licence) && !input.licence.attribution?.trim()) {
    return { ok: false, reason: "attribution-missing", detail: sourceKey };
  }
  if (!input.checkedAt?.trim()) {
    return { ok: false, reason: "checked-at-missing", detail: sourceKey };
  }
  return {
    ok: true,
    source: {
      [licensed]: true,
      checkedAt: input.checkedAt,
      gateVersion: LICENCE_GATE_VERSION,
      licence: input.licence,
      sourceKey,
      title: input.title.trim(),
    } as LicensedSource,
  };
}
```

Every ingestion function's signature is `ingestCurriculum(source: LicensedSource, reading: CurriculumReading)`. **An unlicensed ingestion does not compile.**

The extraction from `visual-provenance.ts:256`:

```ts
/**
 * 🔴 EXTRACTED SO THERE IS ONE LIST WITH TWO CALL SITES — SHOW AND INGEST — RATHER
 * THAN TWO LISTS. The trap this file already names twice is a second copy drifting:
 * `startsWith("CC BY")` looks reasonable and silently admits CC BY-NC.
 */
export function isReusableLicence(licence: string): boolean {
  const wanted = licence.trim().toLowerCase();
  return REUSABLE_LICENCES.some((allowed) => allowed.toLowerCase() === wanted);
}
```
…and `chooseAsset` calls it where the inline `.some(…)` stood.

### Step 1 — a human reads it

`reference-registry.ts:21-30`'s five-step HOW TO ADD A ROW, and its constraint verbatim: *"Do NOT bulk-ingest the internet… Every row is meant to be a file somebody opened, read the licence of, and wrote down. That is slow, which is the point."* **No crawler, no harvest job, no batch licence-checker.** Five seed curricula is the whole of v1.

### Step 2 — validation, as named rules

`apps/web/lib/learn/curriculum-registry.ts`. Follows `parseTerritory` (`knowledge-territory.ts:157`) exactly: a closed union of refusal reasons, **never a confidence score**. `canvas-interaction-model.md:1081`: *"A guard nothing can falsify is not a guard."*

```ts
export type CurriculumRefusal =
  | "licence-unadmitted"
  | "concept-label-empty"
  | "alias-claimed-twice"        // within ONE curriculum. Cross-curriculum is legal.
  | "depth-exceeds-two"
  | "depth-contradicts-parent"
  | "position-not-stated"
  | "outcome-not-a-pair"
  | "capability-unrecognised"    // not a word this product has
  | "capability-not-supported";  // a real pair the ledger has not reached
```

Two are load-bearing:

- **`alias-claimed-twice`** fires on the PK `(curriculum_id, surface_key)`. Two curricula claiming "balance" is **legal and correct** — that is a homonym, not a merge. One curriculum claiming it twice is a genuine authoring error.
- **`capability-unrecognised` vs `capability-not-supported`**, split because they are different facts:

```ts
import { supportedPairs } from "./runtime-support";

/** The six, read off the roster rather than restated — runtime-support.ts:76-78. */
const CAPABILITIES = new Set(supportedPairs().map((pair) => pair.capability));
const PAIRS = new Set(supportedPairs().map((p) => `${p.knowledgeType}|${p.capability}`));

/**
 * 🔴 TWO REFUSALS BECAUSE THERE ARE TWO FACTS, AND COLLAPSING THEM MISREPORTS BOTH.
 * `algorithm|calculate` is NOT "a pair the ledger has not reached yet": `calculate`
 * is not a member of `ObjectiveCapability` (learning-objective.ts:57) and appears
 * nowhere in this product, so it cannot even be passed to `runtimeCanStage`, whose
 * signature takes the closed union. Reporting it as not-supported would tell an
 * author to wait for a lane that is not coming.
 *
 * 🔴 AND NEITHER IS SILENT. runtime-support.ts:39-41 records what silence costs:
 * "Minted, never chosen." An outcome this product cannot teach is a TRUE fact about
 * the curriculum, so the row is stored and the fact is reported by name.
 */
export function readOutcome(
  knowledgeType: string,
  capability: string,
): { ok: true } | { ok: false; reason: "capability-unrecognised" | "capability-not-supported" } {
  if (!CAPABILITIES.has(capability as never)) return { ok: false, reason: "capability-unrecognised" };
  if (!PAIRS.has(`${knowledgeType}|${capability}`)) return { ok: false, reason: "capability-not-supported" };
  return { ok: true };
}
```

### Step 3 — the write

A `scripts/*.ts` run with the service key, same shape as `core-source-sync` and `scripts/seed-ingest.ts`. Verified: there is no admin role in this schema, no `is_admin()` predicate used in any policy, and no browser-reachable write to any global catalog. FK order: `registry_sources` → `concepts` → `curricula` → `concept_aliases` → `curriculum_nodes` → `curriculum_outcomes`.

### Step 4 — what it does NOT do, which is the load-bearing half

🔴🔴 **No knowledge object is ever minted by ingestion.** No `saveKnowledge`, no `KnowledgeObject`, no `LearningObjective`, no row in `knowledge_objects`.

This is the direct answer to *"do not become a second independent knowledge system"*, and it is answered **by subtraction rather than by reconciliation**. `docs/canvas-interaction-model.md:1092-1109` fixes the producer count at two with *"one everything else"*; `docs/knowledge-substrate-work-order.md:61-67` puts every new lane **inside** `extractKnowledgeObjects` because *"two paths read the same document, disagree, and whichever wrote last wins."* A registry that minted claims would be a third producer.

Consequences that fall out for free:
- No duplicate concept identities — the registry holds none of the identities the knowledge layer owns.
- No third `UnanchoredProvenance` variant needed.
- No `NO BACKFILL` violation.
- **No new lane in `RULESET_LANES`** — the registry is not an input to what a document *teaches*, so it neither authorises a corpus-wide backfill nor needs naming in `DEFERRED_REPROCESS_LANES` (`ruleset-version.ts:14, :57`).

### Reconciling the three prerequisite stores

| Store | Scope | Endpoints | Persisted? | Reaches `decideNext`? |
|---|---|---|---|---|
| `prerequisiteMap` (`objective-prerequisites.ts:154`) | Per canvas, per decision | Objective identity keys | **No** — rebuilt every call (`policy-runtime.ts:233-242`) | Yes. The only one that does. |
| `library_link_edges` (`20260729222659:23`) | **Per user**, live, trigger-materialised | `readable_library_documents` — notes | Yes | No. Read by `library-brain/index.ts:215` and `note-brain.tsx:81`. |
| `curriculum_nodes.position` | Global, authored | Concepts | Yes | **No.** |

They cannot contradict each other because they are about different things (objectives, notes, concepts) at different scopes. **Guard test:** no module imports both `objective-prerequisites` and any curriculum module; and neither `policy-runtime.ts`, `next-action-value.ts` nor `objective-prerequisites.ts` mentions a curriculum module.

### Staleness

Routed through the existing machinery — `canvas-territory.ts:184` quotes the owner: *"DO NOT CREATE A SECOND INDEPENDENT RETRY SYSTEM."* The plan is inside `CanvasTerritory`, so `markerStands` / `territoryReuse` / `force` already govern it. The plan carries `{ curriculumKey, skeletonVersion, conceptIdentityVersion }` compared side by side in the shape of `needsReprocess` (`reprocess.ts:55`).

---

## 5. Licence and provenance architecture

### 5.1 One predicate, two call sites

Today `visual-provenance.ts` implements *"unknown licence = do not show"* at **render** time — an allow list with no wildcard, per file, refusing an uncredited CC-BY asset. `isReusableLicence` is extracted; `chooseAsset` and `admitSource` call the same function. One list, two moments.

### 5.2 Three layers, and each catches what the others miss

1. **The type.** `LicensedSource` carries a `unique symbol`. `admitSource` is its only producer. Every ingestion function requires one.
2. **The schema.** `registry_sources.licence` is `not null` with no default; `checked_at` is `not null` with no default; every registry table's `source_id` is a `not null` FK. **SQL owns only what TypeScript cannot express** — NOT NULLs and FKs. The CC-BY credit rule is *not* restated here; `attributionRequired` owns it alone.
3. **The read.** `isReusableLicence` runs again on read, so an allow list that later narrows retroactively excludes older rows — and `gate_version` says which.

### 5.3 One file, one licence record

🔴 **`registry_sources` holds text sources only.** `CuratedEntry` (`reference-images.ts:57-66`) already requires `assetPath, attribution, caption, concepts, licence, source` — *"a curated row cannot exist without one, because the type will not let it."* An image's licence living in two places is `20260811T02:106` verbatim. This is written in the table comment, not left to memory.

### 5.4 Composition with the visual ladder

`PROVENANCE_LADDER` (`visual-provenance.ts:49`) is untouched. 🔴 `:48-54` and §42 both state *"THE ORDERING IS CODE, NOT PROSE"* — **the registry introduces no parallel ranking.**

| Rung | Owner now | Changes |
|---|---|---|
| 1 `source_figure` | The learner's own material | Nothing. Still wins before the request is read. |
| 2 `rendered` | The model's spec request | Nothing. Still `representation: spec.kind`. |
| 3 `reference_image` | `REFERENCE_REGISTRY` (empty) + Wikimedia | Gains `conceptKeys`; gains a **server-side** caller; **loses the live Wikimedia call on the teaching path**. |
| 4 `generated_image` | A router rule with nothing wired | Nothing. Still unwired. |

`chooseAsset`'s five gates run unchanged. `mayBearAccuracyClaim` stays `return provenance !== "generated_image";` — absolute, guarded verbatim by `visualization-roadmap.test.ts:235`. 🔴 **Nothing a registry records may override `accuracyBearing`.**

`assetFallback` fires only for `figure-has-no-asset` and `nothing-to-show` (`ASSET_ELIGIBLE_PROSE`, `visual-route.ts:486`), so a registry hit can never displace a refused, undrawable or already-earned request.

### 5.5 The learner-facing side

`creditLineFor` is unchanged. `visual-provenance.ts:284-285` is the reason the licence must be stored **and** rendered: *"A licence kept in a database and never rendered is a record of a promise nobody kept."*

Registry outcomes keep the `prose` / `refused` discipline: *"no row for this concept"* (a coverage gap) and *"a row exists and its licence was never recorded"* (a bookkeeping failure) are `no-candidates` and `licence-missing` — different facts, separately countable, never collapsed into "no picture".

---

## 6. First five seed curricula

Every seed is an executable claim about a real mechanism.

**1. Formation of a contract (law).** *Proves the authored order and the derived graph coexist without either becoming the other.* `objective-prerequisites.test.ts:102` already calibrates on this chain, so the derived edges are known-good ground truth. Asserts: the curriculum's `position` order and `prerequisiteMap`'s derived edges are computed independently; nothing in the curriculum module reaches `prerequisiteMap`; and **`decideNext` returns byte-identical decisions with the plan applied and with it removed** — the plan changed the Minimap and the scope, and nothing about arbitration. This is the seed that proves `policy-runtime.ts:230-232` is not violated.
*Nodes:* depth 0 `Formation`; depth 1 (0..3) `Offer`, `Acceptance`, `Consideration`, `Intention to create legal relations`. Outcomes: Consideration → `conceptual_system|explain`; Offer → `association|recall`.

**2. Statics: forces and moments (mechanical engineering).** *Proves the two refusals are two facts.* Declares **both** cases: `algorithm|calculate` (rejected as **`capability-unrecognised`** — `calculate` is not a member of `ObjectiveCapability`, verified at `learning-objective.ts:57`) and `causal|recall` (a pair of two real vocabulary members that is **not** in the six-pair ledger — **`capability-not-supported`**). Asserts they are reported under different names, that the unsupported one does not block the supported ones on the same node, and that neither reaches `runtimeCanStage` without a cast.
*Nodes:* depth 0 `Equilibrium of rigid bodies`; depth 1 `Free-body diagrams` (`spatial|locate` — supported, and exercises the visual seam), `Resultant of concurrent forces` (`algorithm|calculate` — unrecognised), `Moment about a point` (`procedure|sequence` — supported).

**3. Spanish present-tense verb morphology (language).** *Proves the alias layer does not fold what `normalizeForIdentity` deliberately preserves.* `knowledge-identity.ts:56-68` does NFC + lowercase + whitespace collapse and strips only edge punctuation — accents survive, *"for anyone learning a language the accent frequently IS the thing being learned."* Asserts `conceptSurfaceKey("sé") !== conceptSurfaceKey("se")` and that no alias merges them.
🔴 **This seed also carries the honest gap.** `searchCurated`'s free-text fallback tokenises with `/[^a-z0-9]+/` (`reference-images.ts:259`), so `"sé"` splits to `["s"]` and is filtered out. **The fallback is Latin-alphabet-only, `conceptKeys` is the only working path for other scripts, and `tokens()` is filed as its own defect that predates this design.** Do not claim the fallback covers what it does not.
*Nodes:* depth 0 `Present indicative`; depth 1 `Regular -ar conjugation`, `Regular -er/-ir conjugation`, `Stem-changing verbs (e→ie)`. Aliases on the third: `"stem-changing verbs"`, `"boot verbs"`, `"verbos con cambio radical"`.

**4. Cellular respiration (biology).** *The owner's second hard constraint, as an executable negative.* The only seed whose source text contains an explicit ontology statement — *"glycolysis is a metabolic pathway"* — and the assertion is that it produces **zero edges in `prerequisiteMap`** and appears only as a depth-0 **grouping** parent, which is the one place `canvas-focus.ts:107-137` already lets ontology families create structure. A guard test asserts the strings `is_a`, `part_of`, `hierarchy`, `part_whole` and `classification` appear nowhere in the curriculum modules.
*Nodes:* depth 0 `Metabolic pathways`; depth 1 (0..2) `Glycolysis`, `Krebs cycle`, `Electron transport chain`. All three `causal|predict`.

**5. Double-entry bookkeeping (accounting).** *Proves the homonym works and the unreachable node is honest.* **(a)** This curriculum claims the alias `"balance"`, which the statics seed already claims for a mechanics concept. Both rows are written; **neither is refused and neither is merged**; and a resolution test asserts that resolving `"balance"` with the accounting plan in context returns the accounting concept, with the statics plan returns the mechanics concept, and with **no plan in context returns nothing**. **(b)** On a canvas holding material for only the first two subjects, the third node resolves to no `identityKeys` and renders as **"no material yet" — a fourth, separately-named state, not H5's ◇ and not ○** — and is **unfocusable**, because `applyFocus`'s empty-filter fallback (`canvas-focus.ts:41-46`) would otherwise silently focus the whole canvas and make the click a control that does nothing.
*Nodes:* depth 0 `The accounting equation`; depth 1 `Debits and credits` (`classification|discriminate`), `Recording a transaction` (`procedure|sequence`), `Preparing a trial balance` (`procedure|sequence` — the no-material node).

---

## 7. Curriculum Registry ↔ Course Mode

### 7.1 The §38 problem, stated rather than argued away

`docs/canvas-product-contract.md:916`, verbatim:

> **"And the rule generalises: no button on the learning surface that selects what happens next."** §27's ban on mode selection, expressed as a UI rule.

And the file the chip would go in, `canvas-composer.tsx:14-17`: *"There is deliberately no mode selector — the canvas already knows which cognitive state it is in, and asking the learner to say it again would be asking them to do the system's job."*

There is a real argument for the chip. §38's two dead buttons are dead for a stated reason — *"Both behaviours are already owed to the learner **automatically**"* (`:911`) — which is not true of applying a curriculum; and §38's own KEEP list (`:922`) preserves `+ attach`, a composer affordance that changes what the next submission *carries*. But §38 is a written rule, and "arguable" is not permission.

**So v1 ships the capability with no control at all**, which is §38-clean by construction and is the repo's own shape (`reply-owns-the-surface.test.ts:302-309` pins the recorder as wired-but-unoffered). The chip is **Open Decision 4**.

This also removes two verified blocking defects for free:

- **The chip could never have reached the model on the canvas it exists for.** Verified: on an empty / `sources_attached` canvas `composerIntent` returns `{kind:"start"}` (`composer-intent.ts:116`), the composer calls `onStart(value)` (`canvas-composer.tsx:365`), and `onStart` is `beginOrAnswer` (`learning-canvas.tsx:1690`) — which takes `(asked: string)` **and nothing else** (`:454`), and with empty text calls `session.begin(undefined)` with **no model call at all** (`:462`).
- **`converse(text, only, pendingCurriculum)` does not fit either `converse`.** Verified: the local wrapper is `converse(asked, staged = null)` (`learning-canvas.tsx:438`) — a third argument is dropped; `session.converse`'s third parameter is `onStudyDocument?: () => void` (`use-canvas-session.ts:922-937`).

### 7.2 How the capability actually works

**The model derives it, exactly as it derives everything else about what a turn meant.** One new nullable field on the decision it already returns:

```ts
// apps/web/lib/learn/turn-router.ts

export interface TurnDecision {
  // …unchanged…
  /**
   * The subject the learner asked to have PLANNED OUT, as opposed to asked about.
   * Null on almost every turn.
   *
   * 🔴 NOT A FOURTH `TurnAction`, AND THAT IS THE WHOLE SAFETY ARGUMENT. `asAction`
   * (:818-820) stays a three-value whitelist and `readTurnDecision`'s fallback stays
   * `reply`, not `study` (:894-897). A field that FORCED `study` would be a bypass
   * wearing a hint's clothes, and turn-router.test.ts:290 — "nothing in this module
   * can produce a study turn the model did not ask for" — must still pass unchanged.
   *
   * 🔴 A SUBJECT, NOT AN INSTRUCTION. There is no operation, no difficulty, no
   * strategy, no task form, no surface and no engine name in this field and there
   * must never be one. If its effect can be described as "run the policy
   * differently", it is the arm picker learn/page.tsx:79 forbids by name.
   *
   * 🔴 AND NOTHING SCANS THE LEARNER'S WORDS FOR IT. no-scripted-intent.test.ts
   * forbids a regex against `text`/`said`/`utterance`/`topic` in twelve watched
   * files. There is no "build me a course" detector and there must never be one:
   * the MODEL reads the sentence, which is the split docs/reading-a-turn.md:11-12
   * draws — "If the question is 'what did they mean?' the model answers it."
   */
  curriculumFor: string | null;
}
```

Prose in `DECISION_CONTRACT` (`:504-731`) tells the model when to set it, in the same register as everything else there. 🔴 It **inherits** the WHICH-SUBJECT-vs-WHICH-PART refusal (`:668-694`) — a category-level subject still comes back as `reply` asking which one. That failure was measured in a browser 2026-08-21.

### 7.3 Where behaviour changes — one place

`use-canvas-session.ts`'s `converse`, in the `study` branch (`:992-1021`). 🔴 `:904-905`: *"THE MODEL DECIDES WHAT THE TURN MEANT; THIS FUNCTION DECIDES WHAT THAT CAN DO."*

```ts
if (decision.then === "study") {
  setOpening(said);
  if (isPreContent(latest.current.state)) {
    if (decision.say) setAside({ /* …unchanged… */ });
    begin(decision.topic ?? undefined);
  } else {
    onStudyDocument?.();
    await command(said, staged ? [staged] : []);
  }
  // 🔴 AFTER, NOT INSTEAD OF. Everything above runs exactly as it does today. A plan
  // is applied to a canvas that is already doing what it was going to do — which is
  // what keeps this a scope change rather than a mode.
  if (decision.curriculumFor) await applyPlan(decision.curriculumFor);
  return decision;
}
```

`applyPlan` reads the registry, resolves the plan against what the canvas holds, and writes it onto the territory through the existing `saveCanvasTerritory`.

🔴 **It must never silently no-op.** If the registry holds no curriculum for the named subject, the refusal is named (`no-curriculum-for-subject`), **Nemesis says so in its reply**, and the turn proceeds exactly as today. `canvas-territory.ts:304-311` and `canvas-dead-controls.test.ts` both name the recurring defect: a control that renders and does nothing.

🔴 **It never writes `course_id` and never creates a `courses` row.** Those mean enrolment identity, are student-created only, and `docs/course-identity-design.md` §6 forbids inferring one from filename, contents, topic overlap or folder name.

**Two dep-array notes, both measured.** `converse`'s deps are `[begin, command, requireUid]` (`use-canvas-session.ts:1047`), and `conversation-is-the-default.test.ts:100-101` slices the body on the literal `"\n    [begin, command"`. A new dep sorting **ahead of `begin`** makes `indexOf` return −1, `slice(0, -1)` returns nearly the whole file, and four assertions pass by matching unrelated text. Append after `command`, and add `assert.notEqual(converse.indexOf("\n    [begin, command"), -1)` in the same commit.

### 7.4 What the plan is

```ts
// apps/web/lib/learn/curriculum-plan.ts

export interface CurriculumPlan {
  readonly curriculumKey: string;        // curriculum:v1:<hash>
  readonly skeletonVersion: string;
  readonly conceptIdentityVersion: number;
  readonly appliedAt: string;
  readonly nodes: readonly PlanNode[];
}

export interface PlanNode {
  readonly conceptKey: string;           // concept:v1:<hash>
  readonly label: string;
  readonly parentKey: string | null;     // grouping only; depth <= 2
  readonly position: number;             // the SOURCE'S OWN stated order
}
```

🔴 **There is no `acquired` field, and its absence is the point.** An earlier draft had one. It answers *"does this canvas hold material for this subject"* — a question the canvas's own objectives answer at read time — and persisting the answer in jsonb lets it disagree with the truth after any territory rebuild, detach, or identity-version bump. That is non-goal 9 (`canvas-cognitive-runtime.md:686-688`): *"Store what was measured; decide what it means where the decision can be changed."* Reachability is computed by `resolvePlanScope`, which already returns `{ reachable: false, reason: "no-material-yet" }`. There is no second thing for a stored flag to be.

### 7.5 Resolution — how a plan node finds objectives

The naive version does not work, and I verified why. `FocusScope.identityKeys` are **objective** keys — opaque hashes of `capability + knowledgeIdentityKey + parameters` (`learning-objective.ts:219`). Alias `surface_key`s are normalised text. And `termsOf` (`objective-prerequisites.ts:80-131`) reduces to normalised text only for `causal` and `association`; `procedure` emits the synthetic `${scope}#step#N`; `classification`, `spatial` and `conceptual_system` return `NO_TERMS`. So "every term already reduces to `causalNodeKey`" is **false for four of the six supported pairs**, and two seeds depend on those four.

The honest resolution scans what the canvas holds and matches the fields a concept can be recognised in — mirroring how `availableTerritories` already groups (`canvas-focus.ts:86-99`, by `entry.knowledge.statement`):

```ts
/**
 * A plan node → the objective identity keys this canvas ACTUALLY holds.
 *
 * 🔴 IT SCANS THE CANVAS, IT DOES NOT WALK A JOIN. There is deliberately no canvas →
 * knowledge lookup table (canvas-knowledge.ts:3-8), so this reads what
 * `ensureKnowledgeForCanvas` already resolved.
 *
 * 🔴 THE COVERAGE IS STATED RATHER THAN CLAIMED. A concept is recognised in a pair's
 * left/right, a relation's cause/effect key, and the normalised statement — the
 * fields `availableTerritories` already groups by. `procedure` steps are reached
 * through their parent knowledge object's statement, never through the synthetic
 * `#step#N` key, which is a POSITION and not a word (objective-prerequisites.ts:110-118).
 *
 * 🔴 AND THE ALIAS LOOKUP TAKES THE PLAN'S OWN CURRICULUM. A bare global lookup would
 * make "balance" mean whichever discipline was ingested first.
 */
export function resolvePlanScope(
  node: PlanNode,
  surfaceKeys: ReadonlySet<string>,          // this node's aliases, curriculum-scoped
  objectives: readonly ResolvedObjective[],
): { reachable: true; scope: FocusScope } | { reachable: false; reason: "no-material-yet" } {
  const identityKeys = objectives
    .filter((entry) => recognises(entry.knowledge, surfaceKeys))
    .map((entry) => entry.objective.identityKey);
  if (identityKeys.length === 0) return { reachable: false, reason: "no-material-yet" };
  return { reachable: true, scope: { identityKeys, kind: "selection", label: node.label } };
}

function recognises(knowledge: KnowledgeObject, keys: ReadonlySet<string>): boolean {
  if (knowledge.pair) {
    if (keys.has(causalNodeKey(knowledge.pair.left))) return true;
    if (keys.has(causalNodeKey(knowledge.pair.right))) return true;
  }
  if (knowledge.relation) {
    if (keys.has(knowledge.relation.cause.key)) return true;
    if (keys.has(knowledge.relation.effect.key)) return true;
  }
  return keys.has(normalizeForIdentity(knowledge.statement));
}
```

### 7.6 The Minimap

The plan tree is **a second, separately-labelled section**, not merged into `availableTerritories`. `canvas-controls.tsx:21-29` already warns that Objectives and Territory *"look like they overlap and do not share a substrate… Do not 'unify' them here — ask Brain, this is a substrate question, not a presentation one."* A plan is a third thing in that corner and stays third.

Verified change set — the claim "no component change" was false:

| Fact verified | Required change |
|---|---|
| `MinimapControl` takes exactly one `territories` prop (`canvas-controls.tsx:445`) | A second prop `planTerritories`, landing through `canvas-header.tsx:43`'s `Pick<PolicyRuntime,…> & { … }` intersection so `canvas-minimap-surface.test.ts:122` stays green |
| Row click calls `setFocus` unconditionally, no unreachable path (`:508-511`) | A non-button row for `reachable: false` |
| `current` / `isRecommended` / `path` all key on the raw `label` (`:470-472`, `:475`, `:528`) | Namespaced expansion paths (`plan/…` vs `knowledge/…`) |
| `orderedTerritories` re-sorts siblings recommended → marked → rest (`canvas-minimap.ts:120-129`) | A `keepOrder` parameter — **forwarded into the recursive call at `:118-120`**, or roots keep the author's order while children are re-sorted |
| `canvas-minimap.ts:108-110` says *"Structure is already evidence-backed by canvas-focus"* | **That comment becomes false** the moment a non-evidence-backed tree flows through. It moves in the same commit. |

🔴 **The H6 guard reddens if the scope is resolved inline.** Verified at `canvas-minimap-surface.test.ts:54`: `[...body.matchAll(/setFocus\(([\s\S]*?)\)/g)]` is **non-greedy**, so any nested call inside the argument truncates the capture. The call must be `setFocus({ identityKeys: resolved, kind: "selection", label })` with `resolved` computed on the line above — a bare `setFocus(scope)` fails both shape tests too.

🔴 **"No material yet" is a fourth state and must not be collapsed into H5.** `canvas-v1-acceptance.md:851` (I3): *"Source uncertainty · learner unknown · no-demonstration · incorrect · actual completion never collapse into one state."* H5's ◇ means *Nemesis could not reliably read the source* (`minimap-knowledge-territory.md:196-200`); an unmapped plan node means **there is no source at all yet**. Different words, different render.

🔴 `territoryMark` is an AND over every member key, so a large plan node reads `developing` for a long time. **That is the honest answer and the owner must accept it** — do not loosen it to "most", and do not add a percentage. `canvas-objectives.ts:8-10`: *"'73% mastery' is a number we cannot defend."* The panel's guarded slice (`canvas-minimap-surface.test.ts:78-103`) forbids `%`, `N / M`, `mastery|score`, card vocabulary, and `✓`/done/complete.

---

## 8. Visualization Registry ↔ teaching and visual generation

`docs/canvas-product-contract.md:1258`: *"a second, parallel visual system is how one product ends up with two of everything, and for a while this product had one."*

### 8.1 The seam exists, is tested, and is dead

`routeVisual`'s `assets?: readonly CandidateAsset[]` (`visual-route.ts:236-254`). Its own comment: *"OPTIONAL, AND ABSENT IS THE ONLY VALUE ANY CALLER PASSES TODAY… This repo's most repeated failure is implemented, merged, deployed, dead."* No new router branch, no new `VisualRepresentation`, no new refusal reason, no change to `chooseAsset`, `PROVENANCE_LADDER`, `REUSABLE_LICENCES`, `mayBearAccuracyClaim` or `creditLineFor`.

### 8.2 Four rules the wiring must not break

🔴 **1. `routeVisual` is PURE** (`:30-31`). Registry lookup is I/O and stays in the caller — the field is shaped for it: *"CANDIDATES, NOT A CHOICE"* (`:250-252`).
🔴 **2. The router owns no notion of sameness.** `canvas-policy-view.tsx:690-694` passes `normalizeLabel` in: *"a pure routing module reaching for it would decide, in passing, that its notion of sameness is the product's."* This is directly the shared-Concept-Registry constraint.
🔴 **3. Code may not decide whether a picture is WORTH IT.** `visual-route.ts:340-359` records the deletion of `association-has-no-structure` and `too-few-relations`. **This is why no `VisualRole` union ships.** The registry may say *which asset exists*; never *this concept needs a diagram*.
🔴 **4. Structural, never subject-matter** (`:23-28`). `visualization-roadmap.test.ts:410-423` asserts none of `accounting`/`physics`/`finance`/`history`/`geometry`/`statistics` appears as a representation.

### 8.3 Registry side — a checked-in array

```ts
// apps/web/lib/learn/reference-images.ts

export interface CuratedEntry {
  // …unchanged, every showable field still required…
  /** Global concept identities this asset shows. `concept:v1:<hash>`, not a uuid —
   *  computable offline, so the registry stays a checked-in array with no database
   *  round trip, and so `searchCurated`'s free-text path keeps working for rows
   *  nobody has aliased yet. Sits BESIDE `concepts`, never replacing it. */
  readonly conceptKeys?: readonly string[];
}

export interface ReferenceQuery {
  readonly concept: string;
  readonly limit?: number;
  /** 🔴 ADDED HERE RATHER THAN PASSED SEPARATELY, because `concept` is REQUIRED and
   *  `findReferenceImages({ conceptKeys })` does not type-check without it. */
  readonly conceptKeys?: readonly string[];
}
```

`searchCurated` prefers a `conceptKeys` exact hit and falls back to token overlap. **No `visual_assets` table in v1** — the array is the shipped shape, its emptiness is the tested status line, its `ReferenceDeps.registry` injection seam is what makes the emptiness testable, and a table invites the crawler `reference-registry.ts:11` forbids by name.

### 8.4 Caller side — server, not the render body

The originally-named insertion point does not work. Verified: `canvas-policy-view.tsx:1` is `"use client"`; `occlusionFor` is declared **synchronous** at `:695`, is called inline in JSX at `:269`, and **discards every route that is not `source_figure`** at `:704`. `findReferenceImages` is `export async function` (`reference-images.ts:243`). And §42 (`:1326-1328`) deliberately kept the chemistry resolver server-side: *"the learner's browser never touches a third party."*

The real change set:

1. **A server route** beside `app/api/learn/structure/route.ts` that resolves an objective's concept to `readonly CandidateAsset[]`. It calls **`searchCurated(query, REFERENCE_REGISTRY)` only** — never `findReferenceImages`, because that unconditionally `await`s `searchCommons` (`:250`), and §42 (`:1420-1422`) says those repositories are *"sources to harvest into a registry with per-asset licence metadata, **not services to query live at teaching time**."* `findReferenceImages` stays for the dev Lab and for a harvest script.
2. **Candidates arrive as a prop.** The policy view holds them in state; nothing async happens in a render body.
3. **A widened `visualFor`** (sibling to `occlusionFor`) returning the full `VisualRoute`, with its callers updated.
4. 🔴 **`visual-route.test.ts:174` extracts the caller's call with `/routeVisual\(\{[^}]*\}\)/s`** — a `}` anywhere inside the argument object makes the match fail and the test asserts *"a caller stopped calling routeVisual"*. `assets` must be a **bare identifier**.

### 8.5 Renderer side — same commit or not at all

`SemanticVisual` draws only the nine spec kinds; `RoutedVisual` (`canvas-document.tsx:530`) enumerates them *"so a new rung fails to compile rather than silently falling through"* (`:534-538`). A `reference_image` route currently draws **nothing**. So the wiring ships with a `ReferenceImage` component rendering the asset **and its credit line from `creditLineFor`**.

**Storage.** `figureAssetUrl` signs an owner-scoped path (`<uid>/figures/<hash>.png`) in the private `library-images` bucket and cannot serve a shared asset. A public read-only registry bucket, or copy-on-use, is required — and `CandidateAsset.assetPath` may still be an external URL (`reference-registry.ts:28-30` calls hotlinking a known weakness), so the two must not be conflated by one resolver.

### 8.6 Four doc claims go red, and two new guards stop it happening again

The first draft named only one. Verified, there are four:

| Claim | Location | Guarded? |
|---|---|---|
| §42's status line | `canvas-product-contract.md:1317` | Yes — `visualization-roadmap.test.ts:195` |
| `REFERENCE_REGISTRY = []` | `reference-registry.ts:35` | Yes — `:200-204` |
| No caller passes `assets` | `canvas-product-contract.md:1548-1551` | Yes — `:206-208` |
| **§41's route enumeration** — *"source figure, equation, relationship and quantitative"* | `canvas-product-contract.md:1167` | **No.** `:104-108` matches only `/STATUS: FIRST TRUSTED ROUTES SHIPPED[^\n]*ADVANCED ROUTES REMAIN PLANNED/` — the enumeration between the anchors can go stale silently, and the package guard at `:111-129` lists only jsxgraph/mermaid/vega/three, none of which a curated `<img>` needs. |
| **§42's table row** — `\| Licensed reference image \| … \| **resolver shipped, curated registry EMPTY** \|` | `canvas-product-contract.md:1445` | **No.** |

All four move in the same commit, and **two guards are added**: pin §41's route enumeration by name, and pin the §42 table row's status cell. `visualization-roadmap.test.ts:10-12`: *"It does not police the design — it polices the claim."*

### 8.7 Not wired, said plainly

Rung four stays dead. `nemesis-media` remains unreferenced from `visual-route.ts` and `visual-provenance.ts`, asserted at `visualization-roadmap.test.ts:209-213`. Stated as a gap, not counted as coverage.

---

## 9. REJECTED IDEAS — what the brief asked for that this repo makes unnecessary or wrong

**1. A separate `learning_canvases.curriculum_plan` column.** Unnecessary and actively wrong. `learning_canvases.territory` already holds a per-canvas marker compared through `markerStands` → `needsReprocess`, with a `force` escape hatch. A second jsonb column with its own marker triple, its own reuse predicate and its own force path is two independent retry decisions over one canvas — `canvas-territory.ts:180-186` quotes the owner: *"DO NOT CREATE A SECOND INDEPENDENT RETRY SYSTEM."* And the gap this feature fills was already filed with its remedy prescribed: `canvas-knowledge.ts:791` — *"Making it right needs **the marker** to hold an accumulating set of subjects."* The plan goes on the marker. **Net: one fewer migration and one fewer column.**

**2. Persisted pedagogical prerequisite edges, in v1.** `policy-runtime.ts:229-232`: *"A dependency graph in a table becomes a curriculum somebody has to migrate."* The first draft answered the second clause (these are authored, not derived, and never reach `decideNext`) and not the first — an authored table *is* a curriculum somebody has to migrate. And its stated single consumer, an acquisition queue, **cannot exist yet**: `territoryReuse` (`canvas-territory.ts:271-280`) *"DOES NOT LOOK AT THE TOPIC AT ALL"*, so on the second and every later subject in a plan it returns `{reuse: true}` and the Territory Constructor is never reached. A table with no consumer is non-goal 10 (`canvas-cognitive-runtime.md:688`). **The DDL-level refusal of `is_a`/`part_of` was good and returns with the table.**

**3. `PlanSubject.acquired`.** A stored interpretation of state that lives elsewhere — non-goal 9 (`canvas-cognitive-runtime.md:686-688`) and `20260811T03:40`. It can disagree with the truth after any rebuild, and `resolvePlanScope` already computes it.

**4. A global `unique (surface_key)` on `concept_aliases`.** This was the first draft's worst idea and it was celebrated as a feature. It makes one normalised word name one concept for **every discipline at once**: "balance", "moment", "consideration", "stress", "argument". The first field ingested captures the word permanently and every other field's learner resolves to the wrong concept — a cross-field false join arriving *by construction*, and a failure of `CLAUDE.md:12`'s design test in the schema itself. `knowledge-identity.ts:186-193` had already ruled: *"if real collisions turn up, the fix is to add a scope to the key."*

**5. A `VisualRole` union** (spatial / structural / causal / quantitative / …). Grep-verified absent under every spelling. Three reasons: `spatial`, `causal` and `temporal` are already `KnowledgeType` members and `quantitative` is already a `VisualRepresentation`, so a role union would be a fourth vocabulary of homonyms; nothing can consume one, because `visual-route.ts:396` reads `representation: spec.kind` straight off the model's request; and 🔴 a stored fact saying *"this concept needs a causal diagram"* is precisely the rule **deleted from that file** (`:340-359`) on the ruling that *"code deciding whether a picture was WORTH IT… is a judgement about the idea, and the only thing that has read the idea is the model."*

**6. A `visual_assets` Postgres table.** `REFERENCE_REGISTRY` is already the shipped shape, its emptiness is already the tested status line, and its `ReferenceDeps.registry` seam is what makes that testable. A table implies cross-deploy writes nothing needs and invites the crawler `reference-registry.ts:11` forbids by name.

**7. `registry_sources` holding image licences.** `CuratedEntry` (`reference-images.ts:53-55`) already makes every showable field required: *"a curated row cannot exist without one, because the type will not let it."* Putting one file's licence in two places is `20260811T02:106` verbatim. The "split between a licence record and a concept→asset map" was not a split — the array **is** a licence record.

**8. A SQL CC-BY credit-line CHECK.** Two hand-maintained copies of one predicate, in two languages, in a design whose stated reason for extracting `isReusableLicence` is that one rule must not exist twice. `attributionRequired` (`visual-provenance.ts:106`) is the rule; `admitSource` is its second call site. SQL keeps only what TypeScript cannot express.

**9. Ingesting canonical claims through `saveKnowledge`.** `learner-store.ts:130` states the concurrency limit — *"two concurrent saves that both read the old payload lose one set of anchors"* — which becomes routine on a shared corpus, and fixing it needs a SQL-side jsonb merge that is out of scope. More decisively: it would make the registry a **third producer**, and `docs/canvas-interaction-model.md:1105` fixes the count at two.

**10. `turnRouterMessages`' `sourceRule` as the carrier.** Verified: it is singular, its doc names one job (*"which source wins when they disagree"*), and it has one producer (`canvas-chat.ts:205`). Two callers stuffing two unrelated rules into one string is the drift shape this repo keeps finding.

**11. The Course chip, in v1.** Not rejected on the merits — rejected on sequencing. §38:916 is a written rule and the reversal must be recorded in the owner's words before code. Open Decision 4.

**12. A front-door trigger.** `canvas-home.tsx:376-387` records the owner deleting the front door's menu on 2026-08-20 because it had one item left. `front-door-staging.test.ts:55` pins the href ternary, `:60` the send-disabled expression, and `:49` that `putPending(` appears exactly once — a front-door carrier reddens three tests for a reason unrelated to what it does.

**13. `canvas-seed.ts` as a carrier.** It already exists, already carries `{files, topic}`, and has **zero importers** (grep-verified). Reviving dead code as a carrier is worse than a named `LearnEntry` field.

---

## 10. Implementation order

**Slice 1 — the smallest thing that is true. Nothing behaves differently.**

| File | Change |
|---|---|
| `apps/web/lib/learn/knowledge-identity.ts` | `function fnv1a64` → `export function fnv1a64`. One word. |
| `apps/web/lib/learn/visual-provenance.ts` | Extract `isReusableLicence` from the inline `.some(…)` at `:256`; `chooseAsset` calls it. |
| `apps/web/lib/learn/licensed-source.ts` | **New.** `LicensedSource`, `admitSource`, `LicenceRefusal`, `LICENCE_GATE_VERSION`. |
| `apps/web/lib/learn/concept-identity.ts` | **New.** `conceptIdentityKey`, `conceptSurfaceKey = causalNodeKey`, `CONCEPT_IDENTITY_VERSION`. Header states the two non-joins: `normalizeForIdentity` must not change, and `learner_lookups` keys on `glossaryKey` (`vocabulary-lookup.ts:78-80`), which strips punctuation *inside* the string — **these two term spaces do not join and neither may substitute for the other.** |
| `apps/web/lib/learn/licensed-source.test.ts`, `concept-identity.test.ts` | Guard tests, comments stripped, calibrated stripper, three disciplines. |

Ship. Nothing imports the new modules. Everything is green.

**Slice 2 — the schema, applied before the code.**
`20260822T10_registry_sources.sql`, `20260822T20_concept_registry.sql` (with `concept_aliases` moved in after `curricula` exists, or split — see the note in §3.2), `20260822T30_curriculum_registry.sql`. Applied by hand with `supabase db push`; each header's PROVED line filled in from a run under `role authenticated`, calibrated first.

**Slice 3 — the reader and the ingest script.**
`apps/web/lib/learn/curriculum-registry.ts` (`readCurriculum`, `CurriculumRefusal`, `readOutcome`), `apps/web/scripts/seed-curricula.ts` (service key), and the five seeds. Every registry read wrapped in `isMissingTableError`. Still nothing on the surface.

**Slice 4 — the plan on the marker.**
`apps/web/lib/learn/curriculum-plan.ts` (`CurriculumPlan`, `PlanNode`, `readCurriculumPlan`, `resolvePlanScope`, `planTerritories`), the `plan` field and the `readTerritory` branch in `canvas-territory.ts`, and the field-completeness guard test.

**Slice 5 — the turn.**
`turn-router.ts` gains `curriculumFor` on `TurnDecision` + `DECISION_CONTRACT` prose + a `stateBlock` line in learner-facing prose. `use-canvas-session.ts` gains `applyPlan` after the `study` fork, with the dep appended **after `command`** and the anchor assertion added to `conversation-is-the-default.test.ts` in the same commit. Guard: `policy-runtime.ts`, `next-action-value.ts` and `objective-prerequisites.ts` reference no curriculum module.

**Slice 6 — the Minimap.**
`canvas-minimap.ts` gains `keepOrder` (**forwarded into the recursion at `:118-120`**) and its `:108-110` comment moves. `canvas-controls.tsx` gains `planTerritories`, a second labelled section, a non-button row for `no-material-yet`, and namespaced expansion paths. `canvas-header.tsx:43` carries the prop. Every `setFocus` literal inline with `resolved` precomputed.

**Slice 7 — the visual wiring, all in one commit.**
The server route (`searchCurated` only), `conceptKeys` on `CuratedEntry` and `ReferenceQuery`, `visualFor` beside `occlusionFor`, `assets` as a bare identifier, the `ReferenceImage` renderer with `creditLineFor`, the storage decision, the first curated rows, **four doc claims moved** (`canvas-product-contract.md:1167`, `:1317`, `:1445`, `:1548-1551`) and **two new guards added**.

**Later, gated:** the acquisition queue (needs subject-scoped `territoryReuse` — the change `canvas-knowledge.ts:791` filed), then `curriculum_prerequisites` in the same migration as its consumer. Then, on an owner ruling, the chip.

**Every PR says which run gated it.** CI is in billing lockout (`docs/knowledge-substrate-work-order.md:133-139`); `tsx --test`, cwd `apps/web`, is the only gate. Test files must match `lib/*.test.ts`, `lib/*/*.test.ts`, `lib/*/*/*.test.ts` or `components/workspace/*/*.test.ts` (`apps/web/package.json:17`) or they never run.

---

## 11. Open decisions for the owner

**1. `registry_sources`, or extend `core_sources`?**
A critic showed my original reason was wrong: `0106_expand_core_source_providers.sql:8-25` widens the provider enum fourteen times with `ALTER TYPE … ADD VALUE`, including `'openstax'`, so "enums are less reversible" is contradicted by this repo's own practice. The real differences I can point at: `core_sources` has **no column that can hold a credit line** (line 54 is `attribution_required BOOLEAN` — *whether*, never *what*), while §42 (`:1417`) requires the credit to be renderable; `provider` is a closed enum needing a migration per publisher, which is field-hostile for an open academic corpus; and `source_url`/`content_hash` are `NOT NULL`, assuming a fetched web document.
**Recommendation: a new `registry_sources`, scoped to text sources, using the SPDX vocabulary that already exists in `REUSABLE_LICENCES`.** This joins one of the two existing licence vocabularies rather than minting a third; `core_sources` is left untouched, because reconciling the two is the right eventual answer and the wrong thing to do inside this change (`20260810T01:17` refuses to create tables and migrate data in one migration for exactly this reason). File the stale pointer in `license.ts`'s header to `apps/web/lib/sources/provenance.ts` — **a file that does not exist** — as its own fix.

**2. Does v1's plan govern SCOPE only, or must acquisition ship with it?**
Verified: `territoryReuse` (`canvas-territory.ts:271-280`) *"DOES NOT LOOK AT THE TOPIC AT ALL"*, so on the second subject in a plan the Territory Constructor is never reached. Acquisition needs `territoryReuse` keyed on `{canvas, conceptKey}` — the data-shape change `canvas-knowledge.ts:791` filed.
**Recommendation: SCOPE only in v1.** What ships is real and observable: an authored grouping tree in the Minimap, curriculum-node focus, and a named list of subjects this canvas has **no material for** — an honest source gap the product cannot state today. Acquisition is slice 8, after the reuse key is widened deliberately. Shipping a plan whose subjects can never be acquired would be *"a control that does nothing"* (`canvas-territory.ts:304-311`).

**3. How large may a plan node be before `developing` stops being useful?**
`territoryMark` is an AND over every member key (`canvas-minimap.ts:40-53`): *"`established` requires EVERY identity key the territory names to read `correct`."* A curriculum module naming forty objectives will read `developing` effectively for ever.
**Recommendation: accept it, and cap authored depth-0 nodes at a handful of children.** Do not loosen the rule to "most" and do not add a percentage — `canvas-objectives.ts:8-10`: *"'73% mastery' is a number we cannot defend."* If a coarser roll-up is genuinely wanted, that is a Brain decision about the projection, not a palette change on the Minimap.

**4. Do you want the Course chip, and will you record the §38 reversal?**
`docs/canvas-product-contract.md:916` reads: *"no button on the learning surface that selects what happens next."* The design ships the capability **fully working with no control**, which is §38-clean, and is the shape `reply-owns-the-surface.test.ts:302-309` already pins for the recorder.
**Recommendation: ship without the chip, then decide.** Use the capability for a week; if typing *"plan out contract formation for me"* feels like enough, the chip was never needed and §38 stays intact. If you do want it, it is one prop plus one menu item — but it needs your words in §38 first, and the label must be **"Course plan"** or **"Plan this subject"**, never "Course": `public.courses` (`20260806200000:18`) already owns that word for a student's enrolment identity, created only by the student, never inferred (`docs/course-identity-design.md` §6). Two meanings for one word in one product is the four-spellings problem that table was created to end.