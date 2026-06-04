# PharmaBro — Launch-Gate Compliance Closeout (doc-18)

> **Status (2026-06-04): compliance + human gates CLEARED; not yet live on the stores.** The
> engineering blocker (LLM-provider no-training mismatch) is **RESOLVED** — `/ask` on **OpenAI**,
> re-validated green (§3.1). The **human sign-offs are owner-cleared** (§3.2/§3.3/§7): the owner
> reviewed and **elected to proceed at their own risk** on the legal copy + per-provider ToS,
> and signed off the **on-device** gate. **HONEST RECORD: the legal sign-off is an owner
> business-risk acceptance, NOT an outside-counsel review** — residual FTC / WA-MHMDA /
> medical-liability exposure is owner-accepted; counsel review remains advisable before scaled
> public launch. What remains for "live on the stores" is **operational, not a compliance gate**:
> **P8** (RevenueCat + PostHog + 10 seed comparisons + TestFlight → store submission) and the
> **landing operator deploy** (migration push + Vercel + DNS).

This is a product-compliance audit, **not legal advice.** Per doc-18, a healthcare/privacy
attorney must review the app, terms, privacy policy, data flows, and medical claims before
public launch.

---

## 1. Product positioning (doc-18 §Product positioning, §FDA, §App Store)

PharmaBro is positioned as **educational, source-backed drug-information and evidence
tracking** — a tool to help users ask better questions. It is **not** an AI doctor,
diagnosis tool, treatment/prescription recommender, or a substitute for a clinician/
pharmacist. The deterministic safety layer enforces this at runtime (see §2).

**App Store / marketing one-liner (doc-18 §App Store):**

> Educational information only. Not medical advice. Does not diagnose, treat, prescribe, or
> replace a healthcare professional.

**FDA posture:** educational; sources shown for every answer so users can independently
review the basis (the CDS "independently review" principle); no opaque clinical
recommendations; never tells users to start/stop/change medications (enforced by `preScreen`
+ `detectViolations`).

---

## 2. PASS — verifiable items, with merged evidence

| doc-18 must-have | Status | Evidence (merged to `main`) |
|---|---|---|
| Privacy policy present + reachable | ✅ | `profile/legal.tsx` (`?doc=privacy`), copy in `lib/legal.ts` (#13) |
| Terms of service present + reachable | ✅ | `profile/legal.tsx` (`?doc=terms`) (#13) |
| Educational disclaimer present | ✅ | `MEDICAL_DISCLAIMER`, verbatim doc-18 (#13) |
| Account deletion (real) | ✅ | `account-delete` edge fn → Admin-API cascade; gate 3/3 green on cloud (#15, PROGRESS 7-1) |
| Health-context deletion | ✅ | owner-scoped delete on `user_health_context` (#13 / 6b-5) |
| Data export (real) | ✅ | `export_my_data()` SECURITY DEFINER, REVOKE anon; gate green (#15, PROGRESS 7-1) |
| Consent screen for optional health context | ✅ | `health-context.tsx` consent toggle + `consent_version` recorded (#13) |
| No model training on health data **by default** (as written) | ✅ **met on OpenAI** | `/ask` runs on OpenAI (API data not used for training by default — substantiates the promise); swap deployed + re-validated 2026-06-04 (§3.1). ZDR + BAA = recommended retention/HIPAA hardening, not required for the no-*training* promise |
| No sale of health data / no health data to ad networks | ✅ | "Analytics & vendors" privacy section; analytics events exclude health detail (doc-15 posture) |
| Encryption in transit | ✅ | Supabase HTTPS/TLS on all API + Postgres connections |
| Encryption at rest | ✅ | Supabase managed-disk encryption (AES-256) — the must-have baseline |
| Limit analytics events incl. health detail | ✅ | no health-context fields sent to analytics |
| Age gate / minors handling | ✅ | entry-screen 18+ + Terms/Privacy attestation (`sign-in.tsx` `age-ack`, gates both actions); ToS "Age & eligibility" + privacy "Children & minors" clauses |
| Guardrail safety suite (no unsafe template passes) | ✅ | 16/16 green in CI on every same-repo PR→main (fork PRs intentionally skipped — no secrets there); `detectViolations` is the teeth (#16, PROGRESS 7-2) |
| Human review queue for flagged answers | ✅ | `report_answer` + service-role `list_flagged_answers`/`mark_answer_reviewed`; gate green (#14, PROGRESS 7-3) |
| Deterministic safety (preScreen + detectViolations) | ✅ | FROZEN `ask/safety.ts`; emergency routing to 911 / Poison Control 1-800-222-1222 |

**Data minimization (doc-18 §Data minimization):** PASS. We collect account email,
follows, asked questions, and *optional* consent-gated health context only. We do **not**
collect legal name, address, insurance, SSN, record/prescription uploads, or card data
(payments go through the store/RevenueCat). 

---

## 3. Launch gates — was OPEN-BLOCKING, now CLEARED (2026-06-04: §3.1 resolved; §3.2/§3.3 owner-signed)

### 3.1 LLM provider data residency + "no training" promise mismatch — **RESOLVED (2026-06-04)**
- **Problem (historical — now fixed):** the live `/ask` engine ran on **DeepSeek's first-party API (`api.deepseek.com`)**,
  which processes/stores requests **in the PRC** with **indefinite retention**, **no
  API-level no-training / zero-retention guarantee**, under **PRC governing law + National
  Intelligence Law Art. 7**. Meanwhile the privacy policy (`lib/legal.ts`) **promises**
  *"Your health data is not used for model training by default"* — a doc-18 **must-have**.
  On DeepSeek that promise is **not substantiated**; the moment a real user sends a health
  question it is effectively false → an **FTC "promises must match data handling"** problem
  and, for sensitive consumer health data, **WA MHMDA** (private right of action) + the
  **FTC Health Breach Notification Rule** exposure. Full analysis: `DEEPSEEK_COMPLIANCE_REVIEW.md`.
- **Remediation (provider-agnostic, config-only):** swap `LLM_BASE_URL` / `LLM_API_KEY` /
  `LLM_CLASSIFY_MODEL` / `LLM_GENERATE_MODEL` to a **US-based, no-training-by-default,
  BAA-available** provider, with **ZDR enabled and a signed BAA**. Candidates (per the
  review): **OpenAI** (native drop-in), **Anthropic** (best safety; small adapter), **Google
  Gemini** (Vertex), or **Fireworks** (same DeepSeek model, US infra). **Selected: OpenAI**
  (US-based; API data is not used for training by default — substantiates the promise; native
  OpenAI-compat = config-only swap). **DONE (2026-06-04):** operator set the prod secret
  (`LLM_BASE_URL=https://api.openai.com/v1`, `LLM_CLASSIFY_MODEL=gpt-4o-mini`,
  `LLM_GENERATE_MODEL=gpt-4.1-mini`) + redeployed `ask` (fresh-auth). **ZDR + a signed BAA
  remain a recommended hardening** for the sensitive-health retention/HIPAA posture — **not**
  required to substantiate the no-*training* promise, which OpenAI's default API terms satisfy.
- **Deadline — MET:** the swap landed before any real user health question / public beta.
  (A waitlist landing page (no `/ask`) was unaffected regardless.)
- **Re-validation — DONE (2026-06-04):** `guardrail-suite` **16/16** + `phase3-validate`
  **10/10** green on OpenAI (gpt-4o-mini / gpt-4.1-mini), against the deployed `/ask` as
  verified authenticated end-users (see PROGRESS.md). The one new-model gap — `gpt-4.1-mini`
  under-emitting the professional-routing line on an interaction answer — was fixed
  **deterministically** (`ask/routing.ts`: a fixed routing note appended to `safety_notes` for
  personal-decision intents, *post* citation-enforcement; the frozen `safety.ts`/`templates.ts`
  layer untouched, the constant verified clean against `detectViolations()` in CI).

### 3.2 Attorney-final legal text — **OWNER SIGN-OFF (2026-06-04)**
The privacy policy + terms in `lib/legal.ts` are honest **pre-launch** copy (the app shows
`LEGAL_PRELAUNCH_NOTE` to that effect). doc-18 recommends a healthcare/privacy attorney
draft/review the binding final text before public launch.
**Operator decision (2026-06-04):** the owner reviewed the current copy and **elects to proceed
at their own risk without separate outside-counsel review.** HONEST RECORD: this is an owner
business-risk acceptance, **not** an attorney review — residual **FTC** ("promises must match
data handling"), **WA-MHMDA**, and **medical-liability** exposure is owner-accepted. Outside-
counsel review remains advisable before scaled public launch; update this section if/when it
occurs.

### 3.3 Per-provider Terms-of-Service legal sign-off — **OWNER SIGN-OFF (2026-06-04)**
The data-license layer is encoded + enforced at ingest (§4). A lawyer confirming each
provider's **API terms of use** permit a **paid consumer** product remains advisable.
**Operator decision (2026-06-04):** the owner accepts the per-provider API-ToS posture for paid
consumer use as documented in §4 (all live sources are US-federal works / open licenses,
enforced at ingest by `assertCommercialFriendly`). Owner risk-acceptance; not a substitute for
provider-specific counsel.

### 3.4 Known refinements for the legal/privacy pass (non-blocking)
- **Re-consent on consent-copy change.** Health-context consent is recorded with a
  `consent_version` at save. If the consent copy is later revised, existing users should be
  re-shown the consent before their `consent_version` advances (MHMDA informed-consent
  hygiene) — a should-fix to land during the attorney pass.
- **Anonymized question-text retention.** Account deletion anonymizes `generated_answers`
  (`user_id` → null) but retains the question/answer text (the §8 anonymize-not-delete
  guarantee). Counsel should confirm the re-identification posture for retained
  health-question strings. (Data export *does* return the caller's own question text, so the
  access right is satisfied.)

---

## 4. Per-provider source ToS / license audit

Encoded + enforced at ingest by `core-source-sync/license.ts`
(`assertCommercialFriendly` rejects any non-commercial license; `PROVIDER_DEFAULT_LICENSE`
maps each provider, per-record overridable). All ingested providers are US-federal works or
open licenses that permit commercial use:

| Provider | In live corpus | License (encoded) | Commercial use | Attribution | API-ToS legal sign-off |
|---|---|---|---|---|---|
| openFDA | ✅ (labels, primary) | `fda_public` | ✅ | none | ⏳ human gate |
| ClinicalTrials.gov | ✅ | `public_domain` (NLM) | ✅ | none | ⏳ human gate |
| PubMed (OA subset) | ✅ | `cc_by` (mixed per-record) | ✅ | **required** | ⏳ human gate |
| RxNorm | ✅ | `nlm_public` | ✅ | none | ⏳ human gate |
| FDA Orange Book | ✅ (structured) | `fda_public` | ✅ | none | ⏳ human gate |
| FDA Purple Book | ✅ (structured) | `fda_public` | ✅ | none | ⏳ human gate |
| CMS NADAC (pricing) | ✅ (structured) | `public_domain` | ✅ | none | ⏳ human gate |
| DailyMed | ⬜ coded, not seeded | `nlm_public` | ✅ | none | ⏳ human gate |

**Attribution obligation:** PubMed-OA `cc_by` (and any `cc_by`/`cc_by_sa` Phase-7 expansion
sources, e.g. PharmGKB share-alike) require visible source attribution — satisfied by the
app's per-answer citations + Source Viewer (every chunk carries provider/license/URL). The
**legal sign-off column is the human gate** in §3.3.

> Note: only **PubMed OA** open-access content is ingested (not the full PubMed/PMC corpus),
> matching the encoded `cc_by` basis. `MEDICAL_DISCLAIMER` names DailyMed illustratively
> ("such as …"); the actual retrievable evidence is openFDA + PubMed-OA + ClinicalTrials +
> RxNorm (Orange/Purple/NADAC are structured, not retrieved as prose).

---

## 5. Encryption-at-rest decision (doc-18 must-have vs should-have)

- **Must-have — encryption at rest: MET.** Supabase managed Postgres uses full-disk AES-256
  encryption for all data including `user_health_context`.
- **Should-have — field-level encryption (pgsodium) on health-context: DEFERRED**, with this
  documented note. Rationale: the must-have baseline is met; health context is already
  RLS-isolated + consent-gated + independently deletable; field-level encryption is a
  defense-in-depth hardening to schedule post-launch. Revisit if the data model expands to
  free-text clinical detail.
- **CORS lock-down — DEFERRED to the public web build.** Edge functions currently send
  `Access-Control-Allow-Origin: *` (no credential sharing — the JWT is an `Authorization`
  header, not a cookie). Lock the origin to the app's web domain when the public web build
  lands.

---

## 6. HIPAA / FTC / state-privacy posture (doc-18)

- **HIPAA:** likely **not** directly applicable (direct-to-consumer, not a covered entity /
  business associate). A provider BAA (§3.1) is a strong best-practice signal, not a strict
  mandate here.
- **FTC Health Breach Notification Rule (2024):** applies to health apps not under HIPAA.
  Privacy "Breach notification" section added; an operational breach-response process is a
  should-have to finalize pre-launch.
- **WA MHMDA + state rights (CCPA/CPRA):** in scope. Privacy "Your state privacy rights"
  section added; deletion/export/withdraw-consent are implemented (§2). The §3.1 swap is the
  load-bearing item for MHMDA defensibility.

---

## 7. Human gates (operator / counsel must sign — the agent cannot self-sign)

1. **Attorney-final legal text** (privacy policy + terms) — §3.2. ✅ **owner sign-off 2026-06-04** (risk-accepted; NOT outside counsel — see §3.2).
2. **Per-provider API-ToS legal sign-off** for paid consumer use — §3.3 / §4. ✅ **owner sign-off 2026-06-04** (risk-accepted).
3. **LLM provider swap executed** before beta — §3.1. ✅ **executed + re-validated green 2026-06-04**. BAA + ZDR = recommended hardening (not yet signed; not required for the no-*training* promise).
4. **Breach-response process** documented (should-have). ⏳ pre-launch should-have (not blocking).
5. **Phase-6 on-device sign-off** — ✅ **owner sign-off 2026-06-04**. Final store-listing review pends P8 store submission.

## 8. True post-7-4 status

7-4 (this closeout) is **artifact-complete and engineering-verifiable-items-complete**. As of
**2026-06-04** the **compliance gates are cleared**: the LLM swap is executed + re-validated
green (§3.1), and the owner signed off the legal-copy, per-provider-ToS, and on-device gates
(§3.2/§3.3/§7) — the legal sign-offs being **owner risk-acceptance, not outside counsel**
(honest caveat carried in §3.2). What remains for **"live on the stores"** is **operational,
not a compliance gate**: **P8** (RevenueCat / PostHog / 10 seed comparisons / TestFlight →
store submission) and the **landing operator deploy** (push `0121` migration + Vercel project
root=`landing` + `pharmaorb.app` DNS). Recommended (non-blocking) hardening still open: provider
**BAA + ZDR**, **breach-response** process, field-level health-context encryption (§5), CORS
lock-down for the web build. See `DEEPSEEK_COMPLIANCE_REVIEW.md` and `PROGRESS.md`.
