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
- `0078-feat-nemesis-live-recorder-copilot-AI-notes-ask-next.patch` — live lecture
  copilot in the recorder: running AI notes + "ask next" suggestions through the
  metered nemesis-llm proxy (event-driven, 5s hard floor, short rolling window,
  opt-in OFF by default, Max fast / Agent Pro slower / Student excluded). Notes
  fold into the saved lecture note on stop. Adds llmComplete() device-key caller.
- `0079-feat-nemesis-in-app-update-notice-v0.1.0-beta.2.patch` — version 0.1.0-beta.2
  + in-app update notice for the student build: checks the public nemesis-desktop
  GitHub release feed on launch, floats a dismissible card when a newer version
  exists, and the Download button opens app.enternemesis.com/api/download/mac in
  the browser. Detection only — nothing self-installs. Also commits the beta
  identity build config beta.1 actually shipped with (appId, publish target,
  nemesis:// protocol) so shipped builds are reproducible from the repo.
- `0080-chore-nemesis-commit-files-referenced-by-shipped-bui.patch` — commits files the
  shipped beta.2 build config referenced but which were never committed (Hermes MIT
  attribution THIRD_PARTY_NOTICES.md bundled into the DMG, nemesis-identity module used
  by the platform test script, orphaned account/copilot test files).
- `0081-test-nemesis-unmask-and-repair-the-renderer-test-sui.patch` — renderer test suite
  green again (163 files / 1346 tests): vitest scoped to .test.ts{,x} so stale compiled
  .test.js twins stop double-running, CSS.escape jsdom polyfill, and 13 test files
  repaired (each failure traced to the commit that changed behavior; zero source
  regressions found).
- `0082-feat-nemesis-land-the-.nemesis-identity-migration-Co.patch` — lands Codex's
  ~80-file rebrand/migration WIP: runtime home ~/.nemesis (packaged builds never adopt a
  foreign HERMES_HOME), self-update URLs → AxelGalvez11/nemesis-desktop, Nemesis-Setup
  Tauri installer, i18n rebrand. ADDS a consent dialog on first launch when a legacy
  agent home exists (Move it here = rename / Start fresh = untouched; nothing moves
  silently). Fixes verified WIP defects (raw i18n keys on boot + update toast, installer
  version drift, stale package-lock that broke npm ci).
