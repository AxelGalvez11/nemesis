# DailyMed product (pill/package) image in the /ask answer header

**Date:** 2026-06-20
**Branch:** `feat/monitoring-universal-entities`
**Status:** approved, ready to implement

## Goal

Show the actual FDA product photo (pill / packaging) next to the existing PubChem molecule
structure in a drug answer's header, so the answer reads like a real drug monograph:
**chemical structure + real-world product image**.

This is the deferred menu item #5 from the answer-formatting research. The molecule image
(commit `c51c914`) is already live on this branch; this adds the complementary product photo.

## Non-goals

- No medical-device images (no deterministic free source; Wikipedia guesses wrong — out of scope).
- No change to answer generation, citation enforcement, or the safety filter.

## Decision: server-side lookup (CORS forced the pivot)

The first cut did the two-hop in the browser (client-only, no server change). That is **foreclosed**:
DailyMed's JSON API sends **no CORS headers**, so a client `fetch().then(r => r.json())` is blocked.
Verified two ways:
- `curl -H "Origin: https://app.pharmaorb.app" .../spls.json` → no `Access-Control-Allow-Origin`.
- Real cross-origin browser `fetch` of the live two-hop → `TypeError: Failed to fetch`.

The molecule image is unaffected (it's a pure `<img src>` URL — image loads are CORS-exempt). Only the
JSON lookup is blocked. So the lookup moves **server-side** into the `/ask` edge function (Deno `fetch`
has no CORS restriction), and the resolved URL rides back on the response as an optional field; the
client renders a plain `<img src={answer.product_image_url}>`.

## Source: DailyMed (NLM), public domain

Two-hop, both client-side `fetch` (verified live 2026-06-20):

1. `GET https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=<primary_drug>&pagesize=1`
   → first result's `data[0].setid`.
2. `GET https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/<setid>/media.json`
   → first `data.media[0].url` (an `image.cfm` JPEG, e.g.
   `https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid=...&name=...jpg`).

Verified: lisinopril, metformin, atorvastatin, ibuprofen all return a real `image/jpeg`.
Licensing: part of the official FDA label → public domain (no attribution needed),
unlike Wikipedia/Commons.

## Architecture — server resolves the URL, client renders a plain `<img>`

**Server (`supabase/functions/ask/`):**
- New `product-image.ts`: pure, unit-tested helpers (`dailyMedSplsUrl`, `dailyMedMediaUrl`,
  `parseSetid`, `parseMediaUrl`) + `resolveProductImageUrl(drug)` orchestrating the two-hop with an
  injectable fetch and an `AbortController` timeout. Never throws; null on any miss/timeout.
- `index.ts`: fire `resolveProductImageUrl(primaryDrug)` **non-awaited** right after entity resolution
  (the drug name is known then), so its two round-trips **overlap retrieval + rerank + generation** and
  add ~no wall-clock. **Await it only at assembly**, then attach `product_image_url?` to the response
  with the same spread-conditional as `primary_drug`. Un-sinkable, matching `augmentWithLive`'s ethos.
- `packages/shared/src/answer.ts`: add optional `product_image_url?: string` to `AskResponse`
  (additive, back-compatible with saved chats + mobile).

**Client (`apps/web/app/app/ask/page.tsx`):**
- `ProductImage({ url, drug })` is a pure `<img src={url}>` in a `.mol-fig` figure — no fetch, no CORS.
  Self-hides via `onError` if the resolved URL ever fails to load. Rendered only when
  `answer.product_image_url` is present.

### Gating (identical to the molecule image, page.tsx:755)

Render the media column only when:
`answer.primary_drug && !answer.template && !answer.refused_unsupported`
(and never for `intent === "smalltalk"`, which returns before this block).

### Layout

- Group the two figures into one right-floated **media column**: molecule on top, product photo
  below. Reuse the existing `.mol-fig` float/size system; add a light wrapper (e.g. `.media-col`)
  so they stack instead of competing for the float.
- Responsive: on the existing `@media (max-width: 560px)` breakpoint the column un-floats and
  centers, same as the molecule does today.
- If only one of the two images resolves, the column shows just that one (each hides
  independently). If neither resolves, nothing shows — body text reflows full-width as today.

## Error handling / safety

- DailyMed calls are best-effort, isolated, client-side, and run AFTER the response is rendered.
  They cannot touch the answer text, citations, or the safety/citation-enforcement layers.
- All failures degrade to "render nothing" — never to a wrong or broken image.

## Known limitations (accepted)

- Most useful for marketed small-molecule **pills**; biologics/injectables show packaging,
  and brand-new investigational drugs have no DailyMed entry (column hides the product photo).
- A `primary_drug` that is a generic name maps to *some* labeler's product photo (first match);
  this is illustrative, not a specific brand the user takes. Caption marks it as a product image,
  not a prescription match.
- Degrades to nothing, never to wrong — acceptable, same risk profile as the molecule image.

## Verification

1. Confirm the two-hop returns an image for lisinopril/metformin and nothing for a non-drug
   (done pre-implementation; re-confirm the component's exact calls).
2. Typecheck green (`tsc --noEmit` in `apps/web`).
3. Real-browser visual check (light + dark) via the real-CSS static mock + screenshot
   technique — do not ship a visual change blind.
