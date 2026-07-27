# Nemesis heavy-student unit economics

Date: 2026-07-25  
Scope: iOS-only, web-only, and iOS + web students

## Executive conclusion

The described student is a **Max-level user under the current entitlements**:

- 5 study days/week is 21.67 active days/month.
- 4 lecture hours/day is **86.67 hours or 5,200 minutes/month**.
- The present Max live-audio limit is 4,000 minutes, so it is short by **1,200
  minutes (20 hours, or 23.1%)**.
- The modeled study workflow uses about **3.05M text tokens/month**, above the
  current Student (1.9M) and Agent Pro (2.1M) ceilings, but below Max (5.5M).

The economics are strong when lectures are captured on iOS and transcribed
on-device. They are still viable at $99 when the web app provides all 5,200
minutes as paid live transcription. They are not viable at $9.99, and barely
viable at $19.99, if the web app pays for 86.7 hours of live speech-to-text.

The best product structure is therefore:

1. Treat on-device iOS transcription as an included capability; do not meter it
   like paid cloud audio.
2. Separate **recording transcription** from **live copilot** on the web:
   route completed recordings to $0.04/hour batch transcription and reserve
   $0.15/hour streaming for users who need live notes/insights.
3. Allow at least 5,200 live minutes on Max if the product promise is four hours
   of lecture capture, five days a week.
4. Raise the practical text allowance for Agent Pro to roughly 3.5M tokens, or
   meter by actual dollars instead of raw tokens. The current request router can
   serve that workload for far less than the pessimistic all-output-token
   ceiling used to set the existing limit.

## Workload model

This is a planning model, not a claim that every student behaves identically.
All assumptions are explicit so they can be replaced with production telemetry.

| Workload | Monthly base case |
|---|---:|
| Active study days | 21.67 |
| Lecture recording | 86.67 hours / 5,200 minutes |
| Uploaded lecture decks | 21.67 |
| Slides per deck | 40 |
| Slide pages processed | 866.67 |
| Photos for analysis | 43.33 (2 per study day) |
| Flashcard generations | 21.67 |
| Test generations | 21.67 |
| Tutoring/library chat turns | 260 (12 per study day) |
| Syllabus-to-calendar jobs | 1 |
| Student project slide decks | 2 × 10 slides |
| Pages screened for image occlusion | 20% of uploaded slides |

### Text-token assumption

The base case totals about 2.60M input and 445K output tokens:

| Activity | Input | Output |
|---|---:|---:|
| Tutoring and library organization | 1.56M | 234K |
| Flashcard generation | 260K | 65K |
| Test generation | 260K | 87K |
| Slide ingest and note organization | 433K | 43K |
| Syllabus and project-slide work | 87K | 16K |
| **Total** | **2.60M** | **445K** |

This assumes retrieval sends relevant excerpts rather than the full library on
every turn. Sending entire decks or entire notebooks repeatedly would make both
latency and cost materially worse.

## Variable service cost

### Text AI

The current router uses DeepSeek V4 Flash for ordinary and thinking turns,
DeepSeek V4 Pro for qualified high-effort turns, GLM as the first provider
failover, then Qwen, Kimi, and Anthropic as uptime fallbacks.

For the base case, assume 90% of text tokens use V4 Flash, 10% use V4 Pro, 35%
of prompt tokens are cache hits, and $0.05 is reserved for occasional failover.
At the app's current provider prices this is about **$0.49/user/month**.

This is why request routing matters. Sending the same entire workload to Claude
Sonnet 4.6 at $3/M input and $15/M output would cost about **$14.48/month**
before cache discounts—roughly 30 times the routed base case. Anthropic can add
quality on the rare hardest request; it should not be the default lane.

Provider sources:

- [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Z.ai model pricing](https://docs.z.ai/guides/overview/pricing)
- [Anthropic model pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Alibaba Model Studio pricing](https://help.aliyun.com/en/model-studio/model-pricing)
- [Kimi K3 pricing page](https://platform.kimi.ai/docs/pricing/chat-k3)

### Vision, slide OCR, and image occlusion

The conservative current-path estimate uses Gemini 2.5 Flash for slide OCR,
photo analysis, and diagram/mask analysis:

- Uploaded slide OCR: about $1.56/month.
- Photo analysis: about $0.07/month.
- Occlusion screening/final mask JSON for diagram-heavy pages: about $0.16/month.
- Twenty optional generated project-slide images at $0.039/image: $0.78/month.

Total vision/image cost is approximately **$2.58/month**. Routing bulk OCR and
easy photo transcription to Gemini 2.5 Flash-Lite lowers the non-generation
portion from about $1.79 to $0.47, saving about **$1.32/user/month** without
using a weaker model for final diagram coordinates.

The code currently supports manual image-occlusion authoring and review, but it
does **not yet automatically generate occlusion masks from uploaded slides**.
This model includes the expected automatic workflow as a future cost.

[Google's current Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
lists 2.5 Flash at $0.30/M input and $2.50/M output, 2.5 Flash-Lite at
$0.10/M input and $0.40/M output, and 2.5 Flash Image at $0.039 per standard
image.

### Search, storage, and shared infrastructure

- 13 current-information searches/month at the app's $0.005 primary-search
  assumption: **$0.065**.
- Retained slides/photos, egress, and overage reserve: **$0.20**.
- Shared Vercel + Supabase base at 1,000 paid users: **$0.045/user**.

Supabase Pro starts at $25/month and includes 100K MAU, 100GB file storage, and
250GB egress before overages. Vercel Pro starts at $20/month, with usage-based
compute beyond its included amounts. These base fees therefore dilute quickly,
but file retention and egress still need per-user monitoring.

- [Supabase pricing](https://supabase.com/pricing)
- [Vercel pricing](https://vercel.com/pricing)

### Audio

| Audio path | Cost for 86.67 hours |
|---|---:|
| iOS on-device transcription | $0.00 direct provider cost |
| Groq Whisper batch | $3.47 |
| AssemblyAI streaming | $13.00 |
| AssemblyAI batch Universal-3 Pro | $18.20 |

The app already deletes temporary cloud recording uploads when enhancement
finishes, which is the correct retention behavior. Permanently keeping monthly
audio would add several GB per student per month and eventually turn storage
into a meaningful cost.

- [Groq pricing](https://groq.com/pricing)
- [AssemblyAI pricing](https://www.assemblyai.com/pricing)

## Contribution P&L by user type

This is a **monthly contribution P&L**, not GAAP net income. It includes provider
costs, estimated storage/egress, shared infrastructure allocation, and payment
fees. It excludes payroll, support labor, refunds, taxes, marketing, and general
overhead.

The conservative non-audio service cost is **$3.37/user/month**. It includes
current Gemini Flash routing and 20 generated project images. The cross-platform
case adds $0.25 for additional sync/egress. Web-only adds $13.00 for all 86.67
hours of live transcription.

Apple is modeled at the Small Business Program's 15% commission. Stripe is
modeled at 2.9% + $0.30 for a domestic card plus 0.7% of Billing volume.

- [Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [Stripe pricing](https://stripe.com/pricing)

### Heavy student on the only currently sufficient tier: Max at $99

| Cohort | Billing channel | Net receipts | Service COGS | Contribution | Margin on net receipts |
|---|---|---:|---:|---:|---:|
| iOS-only | Apple (15%) | $84.15 | $3.37 | **$80.78** | **96.0%** |
| Web-only | Stripe | $95.14 | $16.37 | **$78.77** | **82.8%** |
| iOS + web | Web/Stripe | $95.14 | $3.62 | **$91.52** | **96.2%** |
| iOS + web | Apple (15%) | $84.15 | $3.62 | **$80.53** | **95.7%** |

For 1,000 equally heavy Max subscribers, that is approximately:

| Cohort | Monthly billings | Payment/store fees | Service COGS | Contribution |
|---|---:|---:|---:|---:|
| iOS-only | $99,000 | $14,850 | $3,367 | **$80,783** |
| Web-only | $99,000 | $3,864 | $16,367 | **$78,769** |
| iOS + web, web-billed | $99,000 | $3,864 | $3,617 | **$91,519** |

Cross-platform is the best economic cohort when lecture capture happens on the
iPhone and the subscription was acquired on the web. It combines on-device
audio economics with the lower web payment fee. A cross-platform subscriber
acquired through Apple is still profitable, but produces about $10.99 less in
monthly net receipts at the $99 price.

### Price sensitivity if the full heavy workload were allowed

These rows deliberately ignore today's plan caps to show whether each price
could economically support the requested workload.

| Cohort | $9.99 Student contribution / margin | $19.99 Pro contribution / margin | $99 Max contribution / margin |
|---|---:|---:|---:|
| iOS-only, Apple-billed | $5.12 / 60.3% | **$13.62 / 80.2%** | $80.78 / 96.0% |
| Web-only, all audio live | **-$7.04 / -75.4%** | $2.60 / 13.7% | **$78.77 / 82.8%** |
| iOS + web, web-billed | $5.71 / 61.2% | **$15.35 / 80.9%** | $91.52 / 96.2% |

Implications:

- Agent Pro can support this workload at an 80% contribution margin for
  iOS-only or iOS-recording cross-platform students.
- Full paid live transcription makes $19.99 web-only economics too thin.
- Replacing non-live web transcription with Groq batch reduces web audio from
  $13.00 to $3.47 and makes Agent Pro economically reasonable for recorded
  lectures, while live copilot remains a Max feature.
- Max at $99 can support all 5,200 streaming minutes and still clear the current
  80% target.

## Quality-preserving routing policy

1. **Casual chat, calendar mutations, library organization:** DeepSeek V4 Flash,
   thinking off. These are tool and formatting problems, not premium-reasoning
   problems.
2. **Tutoring, flashcards, tests, and explanations:** V4 Flash with thinking and
   the academic teaching/item-writing skills. Use deterministic validators for
   answer-position balance, duplicates, ambiguity, and artifact schema rather
   than paying a premium model to fix avoidable formatting defects.
3. **Hard synthesis or a failed quality check:** V4 Pro. Keep this to roughly
   5–10% of turns.
4. **Current information:** perform one bounded search, then answer with the
   Flash thinking lane and citations. Do not invoke deep research while that UI
   is hidden.
5. **Slide/page triage and literal OCR:** Gemini Flash-Lite, ideally batch.
   Reuse OCR by document hash for notes, cards, tests, and syllabus extraction.
6. **Diagram interpretation and final image-occlusion coordinates:** Gemini
   Flash. Only analyze pages the cheap triage pass classifies as diagrams.
7. **Provider outages:** GLM → Qwen → Kimi → Anthropic, matching the current
   fallback design. These providers preserve availability, but should not
   silently become the everyday lane.

The current cost ledger prices DeepSeek and GLM but reports Qwen, Kimi, and
Anthropic fallbacks as unpriced calls. Before meaningful scale, add provider
price revisions for every fallback and Gemini, and alert on both unpriced calls
and cost per active user. “Unpriced” must never be interpreted as free.

## Required product and scale changes

1. Increase Max live audio from 4,000 to **5,200 minutes**, or clearly describe
   that four hours/day is not fully covered.
2. Decouple unlimited/on-device iOS transcription from the cloud live-audio
   meter.
3. Give web users a low-cost completed-recording lane and reserve streaming for
   live copilot.
4. Revisit the 2.1M Agent Pro text ceiling. A 3.5M allowance with a dollar-based
   kill switch better matches real routed cost and the stated daily workflow.
5. Implement automatic image-occlusion mask generation; the current editors are
   manual.
6. OCR each uploaded slide once, store the structured result, and reuse it for
   notes, cards, tests, tutoring context, calendar extraction, and occlusion.
7. Queue PDF/OCR/deck generation jobs with idempotency keys and bounded
   concurrency. Never hold a request open for an entire deck.
8. Keep temporary audio deletion, add lifecycle rules for abandoned uploads,
   and avoid retaining lecture audio by default.
9. Track cost and latency by `client`, feature, model, and plan. Add alarms at
   50%, 75%, 90%, and 100% of each plan's dollar budget.
10. Load-test the reservation RPCs and document-generation queues. Supabase and
    Vercel can scale the stateless request layer, but provider concurrency,
    retries, and job fan-out are the real bottlenecks for “lots of users.”

