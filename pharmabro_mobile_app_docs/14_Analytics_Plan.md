# Analytics Plan — PharmaBro

## North Star metric

**Weekly active users who ask a source-backed question or open a watchlist update.**

Why: This captures the core loop of asking, tracking, and returning.

## Funnel metrics

### Acquisition

- App Store page views.
- Install conversion.
- Source of install.
- Landing page conversion.
- Waitlist signup.

### Activation

- Onboarding completion.
- First search.
- First question.
- First cited answer viewed.
- First source tapped.
- First watchlist item added.

Activation definition:

> User asks one question, views a source-backed answer, and adds one watchlist item within 24 hours.

### Engagement

- Questions per active user.
- Drug pages per session.
- Source viewer taps.
- Watchlist opens.
- Updates opened.
- Digest opens.
- Compare page views.
- Medication class page views.

### Retention

- D1 retention.
- D7 retention.
- D30 retention.
- Weekly digest return rate.
- Watchlist user retention vs non-watchlist retention.

### Monetization

- Free-to-paid conversion.
- Paywall impressions.
- Paywall conversion.
- Trial starts.
- Trial-to-paid conversion.
- Churn.
- ARPU.
- LTV.
- Watchlist limit upgrade conversions.

### Quality and safety

- Citation coverage.
- Source retrieval failure rate.
- No-source answer rate.
- User-reported answer rate.
- Safety flag rate.
- High-risk answer review rate.
- Hallucination/unsupported-claim reports.
- Average source freshness.

## Event taxonomy

### Onboarding events

```text
onboarding_started
interest_selected
signup_started
signup_completed
guest_started
notification_permission_seen
notification_permission_granted
health_context_intro_seen
health_context_skipped
```

### Ask events

```text
ask_question_submitted
ask_intent_classified
source_retrieval_started
source_retrieval_completed
answer_generated
answer_viewed
citation_tapped
followup_question_tapped
answer_saved
answer_reported
```

### Drug/explore events

```text
search_submitted
search_result_clicked
drug_page_viewed
drug_tab_opened
evidence_badge_tapped
compare_started
class_page_viewed
popular_item_clicked
```

### Watchlist events

```text
watchlist_add_started
watchlist_item_added
watchlist_limit_hit
watchlist_item_removed
watchlist_update_viewed
digest_generated
digest_opened
notification_opened
```

### Monetization events

```text
paywall_viewed
subscription_trial_started
subscription_started
subscription_cancelled
subscription_renewed
subscription_failed
```

## Cohorts to track

- Users who add watchlist vs those who do not.
- Peptide users vs approved-drug users.
- Pharmacy-student users vs general users.
- Users who tap sources vs users who do not.
- Users who use guest mode vs signed-in users.
- Users who add My Health Context vs those who do not.

## Product questions analytics should answer

1. Which topics drive first value?
2. Which sources build trust?
3. Does the watchlist increase retention?
4. Do users understand Evidence Score?
5. What topics trigger paid conversion?
6. Which questions fail source retrieval?
7. Which entities should be manually curated next?
8. Are users using the app for unsafe medical advice?

## Dashboards

### Founder dashboard

- Weekly active users.
- Questions asked.
- Drug page views.
- Watchlist adds.
- Retention.
- Revenue.
- Safety flags.

### Content quality dashboard

- Top unanswered questions.
- Top unsupported claims.
- Source retrieval failures.
- Stale source pages.
- User reports.

### Growth dashboard

- Acquisition source.
- App Store conversion.
- Landing page conversion.
- Social post conversions.
- Waitlist conversion.

## Tooling

MVP:

- PostHog or Amplitude for product analytics.
- Sentry for errors.
- Supabase logs for backend.
- RevenueCat dashboard for subscriptions.
- Email service analytics for digest.

## Privacy approach

- Do not track sensitive health details in analytics events.
- Use entity IDs or generalized categories, not raw medication lists, where possible.
- Do not send health context to analytics tools.
- Create a privacy review checklist for every event before implementation.
