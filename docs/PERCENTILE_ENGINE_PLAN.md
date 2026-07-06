# The Percentile Engine — "Strava for Longevity"

_Plan created 2026-06-24. Product concept by owner; technical mapping grounded in the codebase
audit + the mid-2026 market/regulatory fact-check (see session research)._

> **One-line concept:** Don't sell a diagnosis — sell a **rank**. The app ingests a user's
> wearables and lab values, places them on a percentile curve versus their demographic, wraps it in
> a gamified, shareable "stat card," and keeps the score **alive** by re-weighting it as new clinical
> research lands. Non-diagnostic, informational only. The living score is the moat; the share card is
> the growth loop.

---

## 0. Why this fits PharmaOrb specifically

This is not a new company bolted onto the side. Three of the four hard parts already exist in the
repo:

| Capability the concept needs | What already exists | Status |
|---|---|---|
| Continuous, cheap literature monitoring | Live Monitoring / `evidence_watches` (cron diffs source lists, no LLM in the hot loop; alerts on high-grade studies + retractions) | **Built** |
| "Educational, not directive" safety enforcement | Deterministic safety engine in `supabase/functions/ask` (pre-screen, 13-rule scanner, professional routing, markdown-proof) | **Built** |
| Evidence synthesis for "protocol alternatives" content | Deep Research engine (`research/orchestrate.ts` → `synthesize.ts`) with real-source citations + faithfulness check | **Built** |
| Native data ingestion (wearables, labs) | `apps/mobile` (Expo) scaffolded; `user_health_context` table holds profile but **no numeric biomarkers** | **Partial / new** |
| Shareable PNG card + public living URL | Already on `EVIDENCE_OS_ROADMAP.md` as planned renderers | **Planned** |

**The genuinely new build is: numeric biomarker storage, a defensible percentile service, the
scoring model, native wearable ingestion, and the share-card/leaderboard surfaces.** Everything that
makes the score *intelligent and current* is already running.

---

## 1. The regulatory spine (read this first — it shapes every screen)

The pitch claims percentiles "sidestep" the FDA. **Half true, and the wrong half is dangerous.**
This section is the design constraint that the whole product must obey.

### What's actually true
- Percentile/comparison framing is the **right instinct** and has real precedent: fitness
  percentiles, and epigenetic "pace of aging" clocks (DunedinPACE, sold by the likes of
  TruDiagnostic) ship today as **wellness/research** products, not diagnostics.
- "General wellness" products get FDA enforcement discretion (the agency doesn't regulate them as
  devices) **when they make general well-being claims and don't touch disease.**

### What's false / dangerous
- **The chart type is not the legal shield. The intended use and the claims are.** The FDA's
  "General Wellness: Policy for Low Risk Devices" guidance (revised **Jan 6, 2026**) excludes
  anything that intends to **screen, diagnose, monitor, treat, or _alert_** about a disease or
  condition. You can render a percentile and still be a device if the *claim around it* communicates
  disease risk.
- The pitch's own example is on the wrong side of the line: _"Your HbA1c is 5.8%."_ — 5.7–6.4% is
  the clinically recognized **prediabetes** range. Surfacing that number against a "healthy target"
  can read as **screening for prediabetes**, regardless of the percentile wrapper.
- _"Your Cardiovascular Rank dropped — here are protocol alternatives to reclaim your rank"_ — a
  **personalized intervention recommendation** tied to the user's own data is the exact thing the
  device rules are about. Push **alerts** about a user's specific decline are explicitly named
  ("alert") in the exclusion.
- The clinician-only exemption (21st Century Cures CDS) **does not apply to a consumer app** — it's
  provider-facing only. So a consumer product cannot lean on it.

### The discipline that keeps this a wellness tool (design rules)
1. **Rank against a population, never against a diagnostic threshold.** Show "62nd percentile for
   men 30–39," not "normal/abnormal" and not "pre-diabetic." Optimization language
   ("to reach the 90th percentile…"), never clinical-state language.
2. **Education is general; never individualized prescription.** "Current literature on Zone 2
   training and ApoB…" (about the topic) — never "you should take 200 mg of X."
3. **The "living score downgrade" notification is framed as science news, not a health verdict.**
   ✅ _"New high-grade study downgraded the evidence for [supplement]. It contributes less to your
   score's evidence weighting. Tap to read it."_ ❌ _"Your health got worse / your risk went up."_
4. **Every generated sentence still passes the existing safety engine** — it already blocks "take
   this dose," "this is safe," "stop taking," "cures." Reuse it verbatim on all score copy.
5. **Persistent disclaimer + clinician routing**: "Informational, not medical advice. Discuss with
   your clinician." Already a built behavior.
6. **No disease-named scores.** Pillars are wellness framings ("Metabolic Fitness," "Recovery"),
   not "Diabetes Risk" / "Cardiac Risk" (a risk score for a disease is a device function).

### Two non-FDA legal items (real, often missed)
- **Consumer health-data privacy laws** now bite non-HIPAA apps. Washington's **My Health My Data
  Act** (and the wave of similar 2024–2026 state laws) require explicit consent to collect/share
  consumer health data. Labs + wearables + a **leaderboard that shares data** = squarely in scope.
  Consent flows and a real privacy posture are a build item, not an afterthought.
- **Percentile credibility = legal credibility.** If the percentiles are invented, that's both a
  trust problem and a potential false-advertising exposure. The percentile service must cite a real
  reference population (see §3).

> **Gate:** a regulatory attorney reviews the copy + claims **before** lab-upload and
> alert/notification features ship (Phase 2+). It is cheap insurance against the one risk that can
> end the product.

---

## 2. Architecture overview

```
                 ┌─────────────────────────────────────────────┐
   Wearables ───▶│  Native ingestion (Expo: HealthKit /         │
   (RHR,HRV,     │  Health Connect)  — continuous, silent       │
    VO2,sleep)   └───────────────┬─────────────────────────────┘
                                 │
   Labs (PDF/   ───▶  VLM extract │+ LOINC map + unit normalize
    photo / manual)              │
                                 ▼
                   ┌──────────────────────────────┐
                   │  user_biomarkers (numeric,    │
                   │  dated, unit-normalized)      │
                   └───────────────┬──────────────┘
                                   │
        NHANES / cohort ──▶ ┌──────▼───────┐   ┌────────────────────────────┐
        reference dist.     │ Percentile   │   │ Live Monitoring watches     │
                            │ service      │   │ (existing) — new evidence   │
                            └──────┬───────┘   │ on the user's biomarkers /  │
                                   │           │ supplement stack            │
                            ┌──────▼───────────▼──────┐
                            │  Scoring engine          │  ← evidence-weighted
                            │  pillar scores + rank    │     contributions
                            └──────┬───────────────────┘
                                   │
                ┌──────────────────┼───────────────────┐
                ▼                  ▼                    ▼
        Stat card (PNG)    Push: "rank changed     Leaderboards
        share loop          because science X"      (opt-in, cohort)
```

Two decoupled clocks (both already the pattern in your watch system):
- **Body clock** — wearable/lab data changes the *inputs*.
- **Science clock** — new literature changes the *evidence weights* on those inputs. **This second
  clock is the unique hook** and it's the part competitors don't have.

---

## 3. The hard new pieces (with real gotchas)

### 3a. Reference distributions → the percentile service
- **Blood biomarkers:** use **NHANES** (CDC's public National Health and Nutrition Examination
  Survey). It contains population distributions for many labs (HbA1c, lipids incl. ApoB on some
  cycles, hs-CRP, etc.) **by age and sex** — free, citable, defensible. This is the backbone.
- **Wearable metrics (RHR, HRV, VO2 max, sleep):** harder, no single public gold standard. Bootstrap
  from **published cohort norms** (e.g., VO2-max age/sex tables; HRV-by-age literature) at launch,
  then transition to **your own user base** percentiles as it grows (cold-start: don't show
  "vs. PharmaOrb users" until N is meaningful).
- Output: `percentile(metric, value, age_band, sex) → 0–100` with a **cited source** for the
  distribution. Never an un-sourced number.

### 3b. Native wearable ingestion (Expo)
- iOS: **HealthKit** via a config plugin (`react-native-health` / Expo dev build). Requires a
  **paid Apple Developer account**, a **real device** (HealthKit doesn't run in the simulator), and
  explicit per-metric permission prompts. Data is read on-device; you choose what to sync up.
- Android: **Health Connect** (`react-native-health-connect` / Expo). Similar permission model.
- Pull: resting HR, HRV, VO2 max, sleep stages, steps. Background refresh on a schedule.
- You already have `apps/mobile` scaffolded — this extends it; it is not a from-scratch app.

### 3c. Lab ingestion (the data-ingestion landmine)
- The fact-check confirms the clean pipes (Health Gorilla, FHIR, TEFCA) are **gated and litigated**;
  shipping consumer apps fall back to **upload a lab PDF/photo → vision model reads the values**.
- Pipeline: upload → VLM extraction → **LOINC code mapping** → **unit normalization** (e.g., mg/dL ⇄
  mmol/L) → human-confirm screen (user verifies the extracted values before they count) → store.
- Start with **manual entry** in Phase 1 to de-risk, add VLM upload in Phase 2.

### 3d. The scoring engine
- Per-pillar score = function of the user's percentiles on that pillar's metrics, **weighted by the
  current strength of evidence** that each metric matters. Keep it **transparent** (show the user why)
  and **not a disease-risk score**.
- Pillars (wellness framings): **Pace of Aging** (epigenetic clock if/when offered), **Metabolic
  Fitness** (VO2 max, HbA1c, glucose), **Cardiovascular** (ApoB, hs-CRP, lipids, RHR),
  **Recovery** (HRV, sleep efficiency).
- Deterministic aggregation + an LLM-written *rationale* (same split your evidence engine already
  uses) — never an LLM-guessed number.

### 3e. The living-score delta (the moat)
- Maintain, per intervention (supplement/habit) and per biomarker, an **evidence-weight**.
- When Live Monitoring surfaces a new high-grade study or a retraction that changes that weight,
  **recompute the affected pillar contribution** and emit a *science-framed* notification.
- This reuses the watch system end-to-end; the new part is the **intervention → score-weight map**
  and the recompute-on-evidence-change trigger.

### 3f. Stat card + leaderboards (growth)
- **Stat card:** server-rendered PNG (OG-image style) — pillar scores, percentile, tier, brand mark
  + handle watermark for acquisition. Your roadmap already lists "Static social card (PNG)."
- **Leaderboards:** **opt-in only**, pseudonymous, cohort-bucketed (age/sex). Gated behind explicit
  consent (privacy laws above). Tiers + "you crossed into the 90th percentile" moments drive shares.

---

## 4. Phased build (sequenced to ship the viral loop early)

### Phase 0 — Foundation _(reuses the most; cheap)_
- [ ] `user_biomarkers` table — numeric, dated, unit-normalized, LOINC-coded, RLS-scoped. _(M)_
- [ ] Biomarker entities (parallel to `drug_entities`) so a biomarker is watchable. _(M)_
- [ ] Percentile service backed by NHANES, returns sourced percentiles. _(M–L)_
- [ ] Non-diagnostic copy rules wired into the safety engine for all score text. _(S)_

### Phase 1 — The score + the card (the MVP that proves virality) _(highest leverage)_
- [ ] Scoring engine → pillar scores + overall rank from **manually entered** labs + a linked
  wearable (or even manual VO2/RHR to start). _(L)_
- [ ] Stat-card PNG generator + share sheet. _(M)_
- [ ] One pillar end-to-end first (e.g., **Metabolic Fitness**) to validate the loop, then fan out.
- **Goal:** a user can get a rank and post a card within a week of starting. No hard ingestion yet.

### Phase 2 — Frictionless ingestion _(the landmine; needs legal gate)_
- [ ] Native HealthKit / Health Connect in `apps/mobile` — continuous wearable sync. _(L)_
- [ ] Lab PDF/photo upload → VLM extraction → confirm screen. _(L)_
- [ ] **Regulatory + privacy review before this ships.**

### Phase 3 — The viral + living loop
- [ ] Opt-in leaderboards (cohort, pseudonymous, consented). _(M)_
- [ ] Tier system + "rank changed" push notifications (science-framed). _(M)_
- [ ] Public, auto-updating share URL (doubles the roadmap's "public living claim URL"). _(M)_

### Phase 4 — Deepen the moat
- [ ] Intervention → evidence-weight map + recompute-on-new-evidence (the living score). _(L)_
- [ ] "Protocol alternatives" education from the Deep Research engine, non-prescriptive. _(M)_

---

## 5. Honest risks

1. **Competition is real, not absent.** Function Health ($2.5B, Nov 2025) has publicly named the
   "continuously update insights with new research" direction and owns lab logistics (phlebotomy,
   MRI). **Your edge is not lab draws** — it's the *living-science score + virality + honesty
   engine*. Win on the score being alive and shareable, not on owning the blood test.
2. **Percentile credibility.** Invented percentiles kill trust and invite false-claims exposure.
   NHANES de-risks blood markers; wearable norms need real cohort data. Non-negotiable.
3. **Regulatory tightrope.** The single best growth hook (the "your rank dropped" push) is also the
   single biggest regulatory risk (it's an *alert*). Word it as science news, never health status,
   and get it reviewed.
4. **Privacy law.** Health data + leaderboards = consent-gated under state consumer-health-data laws.
   Build consent in from Phase 0; don't retrofit.
5. **Wearable ingestion friction.** HealthKit needs paid Apple account + real devices for testing;
   permissions are per-metric. Budget real native time in Phase 2.

---

## 6. Recommended first move

Build **Phase 0 + a one-pillar slice of Phase 1 on the web first** (Metabolic Fitness:
manual HbA1c + VO2 max → NHANES percentile → pillar score → shareable PNG). It reuses your existing
engine, needs no native work or hard ingestion, validates whether the rank-and-share loop actually
makes people share, and stays cleanly inside the wellness line. If the loop works on web, *then*
invest in native ingestion (Phase 2). If it doesn't, you've spent days, not months.
