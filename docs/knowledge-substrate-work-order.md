# Phase 1 — the knowledge substrate

**Owner greenlit 2026-08-14.** The question this phase answers, and the only one:

> **Can Nemesis faithfully represent what is learnable in heterogeneous educational material?**

Not *what does the learner know* (Phase 2), not *what appears on the Canvas* (Phase 3). Those stay
**largely untouched** until this layer can represent heterogeneous material — see
`nemesis-product-philosophy.md` **R4**.

## Why now, and what is NOT the problem

The parser question is closed and the foundation is serving in production (#600). A real 24-page
drug chart arrives intact — 27 tables, 8–11 columns, **561 candidate facts** — and produces
**0 knowledge objects**. The refusal is `table-not-pairs`.

**Parser quality is not the constraint.** Both vendors read those tables correctly. The material
arrives and nothing is built from it.

## 🔴 The rule that governs every decision below

> **Extract the smallest faithful knowledge structure supported by the source. Never invent
> structure merely to make the graph fuller.**

This is not new discipline — `knowledge-extraction.ts` already refuses rather than guesses, because
a wrong knowledge object is one a learner then gets **drilled on**. Widening what can be
*represented* must not widen what may be *guessed*.

## 🔴 The trap this work order exists to prevent

**Do not fix "the drug table".** The two-column rule is the first *symptom*. The goal is the general
transition:

> **structured educational material → structured learnable knowledge**

Every rule, signal and heuristic must read sensibly for a law student's `Case | Holding |
Jurisdiction` and a mechanical engineer's `Material | Yield strength | Density`. Structural signals
(headers, position, uniqueness, document shape) only — **never subject-matter keyword lists**, which
never generalise.

## What already exists — do not rebuild it

Verified against `origin/main` at `8d630834`. The substrate is further along than "one lane" suggests:

| Already built | Where |
|---|---|
| **Ten knowledge types**, field-agnostic | `knowledge-types.ts` — `association`, `classification`, `causal`, `algorithm`, `conceptual_system`, `procedure`, `spatial`, `temporal`, `conditional_rule`, `synthesis` |
| **Fourteen cognitive operations** | `CognitiveOperation` |
| **Association payload** | `AssociationPair` — with `leftRole`/`rightRole` from the source's own column names |
| **Causal payload** | `CausalRelation` — 8 relation kinds, `negated`, verbatim modality, shared nodes so `A→B→C` is two joinable edges |
| **`relationKind`** | on `KnowledgeObject`, part of identity, derived from headers |
| **Provenance to the cell** | `SourceContext` carries `table.columns` (never invented), `cells`, `origin: {row, column}` |
| **Durable locators** | `sourceAnchors` (quote-based, survive reparsing) vs canvas-local `sourceRefs` |
| **Refusals as output** | `ExtractionRefusalReason` — zero objects with a reason ≠ zero objects without one |

**Two of ten types have payloads.** The other eight are declared and deliberately unpayloaded:
*"eight of those shapes would be guesses written before the interaction that uses them exists."*
**That judgement stands.** Add a payload when a lane produces it — not before. R4 says the same
thing from the other end.

## 🔴 The seam — one function, one answer

`extractKnowledgeObjects(context: SourceContext)` has exactly **one** production caller
(`canvas-knowledge.ts:240`). Every new lane goes **inside** it.

A lane added *beside* it reintroduces the failure the parser layer already paid for: two paths read
the same document, disagree, and whichever wrote last wins.

## 🔴 The predicate decision — owner, 2026-08-14

A column headed `Class` is **not** `is_a`. Turning one into the other is Nemesis deciding what a
header word means, which is the subject-matter inference this codebase refuses, and it would need a
hand-maintained vocabulary per field.

**The ruling:**

```
THE SOURCE'S OWN WORD IS THE TRUTH.       "class"   ← from the header, normalised
An interpretation may ride alongside.      is_a      ← clearly marked as Nemesis's reading
```

- Identity, teaching, testing and objectives use **the source's word only**.
- The interpretation is **never load-bearing** — it may be absent, it may be wrong, and nothing
  downstream may branch on it.
- An unnamed column stays unnamed. `SourceContext` already refuses to invent one, and so must this.

## What Phase 1 builds

### Lane A — an n-column grid becomes n−1 named relations

The generalisation of the existing two-column lane, and the one the drug chart needs. For a grid
with a subject column, each remaining column yields one relation from the subject, carrying the
header as its `relationKind` and provenance down to `{row, column}`.

🔴 **Identifying the subject column is a STRUCTURAL question and must be refused when ambiguous.**
Candidate signals: values unique across rows, position, header presence. A grid with no defensible
subject column is a **refusal with a reason**, not a guess — the same standing `table-not-pairs`
has today, narrowed to the cases that genuinely cannot be read.

Type stays `association`. Claiming `classification` for a `Class` column would require exactly the
inference the ruling above forbids.

### Lane B — at least one non-table shape

Chosen so acceptance is not table-only. A definition or glossary list is the strongest candidate:
`knowledge-extraction.ts`'s own header names it as the intended next lane, and it needs no new
payload.

### Not in Phase 1

Equations, diagrams, pathways, procedures, hierarchies. They are in the target shape and they are
**not** guesses to be written now. A lane per shape, when a real document needs it.

## 🔴 Acceptance — and the corpus is thin, which is stated now rather than discovered later

The 561-fact chart is **one** acceptance test. **It is not the specification.** Optimising for it is
the exact trap named above.

Before any lane merges:

1. The drug chart yields relations with provenance to `{row, column}` — **and** the count is
   defended against the document by eye, not asserted.
2. **At least one non-table shape** produces knowledge.
3. **At least one non-medical document** produces knowledge, to prove nothing subject-specific crept in.
4. Every refusal still carries a reason. A lane that raises a count by weakening a refusal has
   failed, not passed.
5. Round-trip: `real file → parser → model → JSON → readDocumentModel() → extract → locator RESOLVES`.

🔴 **The available corpus is thin — production holds 11 parse rows and 8 table blocks across 2
documents.** Requirements 2 and 3 may need a document uploaded first. Name the gap rather than
quietly dropping the requirement.

## 🔴 CI cannot verify this phase

GitHub Actions is in billing lockout — runs fail in 3 seconds with `steps: 0`, on documentation-only
branches included. Vercel checks are the only meaningful signal, and they do not run these tests.

**The local run is the only gate.** `node:test` + `tsx`, cwd `apps/web`. Say so in every PR, and
never read a red check here as a test failure or a green one as proof.
