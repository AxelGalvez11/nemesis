# PharmaBro

Evidence-backed medication / supplement / peptide / clinical-trial intelligence.
**Ask → cited answer → source-backed page → follow → return for updates.** Conservative,
source-grounded — **not** an AI doctor.

Source of truth for the build: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
(15 sections, AC1–AC10, Phases 0–8) + [`pharmabro_mobile_app_docs/`](./pharmabro_mobile_app_docs)
(docs 00–21).

## Architecture (two layers)

- **Layer A — evidence substrate** (`supabase/`): forked from `Ascend_StudyApp`'s
  Layer-1 "core-source" RAG — a global, citation-grade clinical corpus
  (`core_sources` + `core_source_chunks`) with a provider-routed ingest
  (`core-source-sync`) and a 1024-dim ANN retriever (`match_core_source_chunks`,
  Voyage `voyage-3-large`).
- **Layer B — PharmaBro domain** (net-new): typed drug/trial/article entities, the
  `/ask` answer engine, the deterministic evidence-scoring engine, watchlist/digest, and
  the RN + Expo app — all on top of Layer A.

## Monorepo layout

```
apps/mobile/          # RN + Expo (Phase 6)
packages/db/          # generated Supabase types (Phase 2)
packages/shared/      # answer-spec / evidence / citation types (Phase 2+)
supabase/migrations/  # Layer-A schema (forked) + net-new domain (Phase 2+)
supabase/functions/   # core-source-sync (forked); ask/search/… (net-new)
docs/                 # forked runbooks + source strategy
```

## Status — Phase 0 (foundations & fork gate)

Backend/corpus first; mobile (Phase 6) builds against the frozen §8 API contract.
**Phase 0 is go/no-go on the reuse strategy** — the smoke test
`match_core_source_chunks("lisinopril contraindications")` must return clean DailyMed
chunks (section + URL + license). See §13.

```bash
pnpm install
# fill .env.local from .env.example (VOYAGE_API_KEY required)
supabase start                 # local stack (Docker)
supabase db reset              # apply Layer-A migrations locally — separability check
# → ingest one DailyMed record → query the retriever = the gate
```
