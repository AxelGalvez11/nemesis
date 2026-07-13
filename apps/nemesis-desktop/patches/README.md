# Nemesis fork patches

Durable copies of the commits living on the `nemesis/study-v1` branch of the local
Hermes checkout (`~/.hermes/hermes-agent`), so nothing is lost if that checkout is
reinstalled. Apply onto a fresh hermes-agent clone with `git am <patch>`.

- Commit 1 (brand reskin, mono default) is NOT stored here — it's fully regenerable:
  run `../reskin/apply-nemesis-reskin.mjs --hermes <checkout>`.
- `0002-…Study-page…patch` — the Study page v1 (FSRS flashcards): new
  `apps/desktop/src/app/study/`, route/sidebar/i18n wiring, ts-fsrs dep.
- `0075-feat-nemesis-desktop-first-account-portal-cutover.patch` — keeps sign-in
  native to the desktop while moving signup and subscription management to the
  `app.enternemesis.com` account portal.
- `0076-fix-nemesis-ship-no-pre-set-school-portal-blank-firs.patch` — fresh installs
  ship with NO pre-set school portal (the owner's UTHSC Blackboard/Outlook was the
  hardcoded default); students connect their own LMS/email in onboarding Step 1.
- `0077-feat-nemesis-consent-gate-bug-report-button-plan-inc.patch` — one-time
  plain-language privacy/responsibility consent screen after first sign-in
  (names data processors truthfully; portals read-only; check-your-syllabus
  line), Report-a-bug button in the Account dialog, plan-includes-intelligence
  copy replacing stale BYOK text, and Providers/Model settings hidden from the
  student build. Also carries prior in-place account-gate WIP (trial countdown
  reminder + entitlement revalidation).
