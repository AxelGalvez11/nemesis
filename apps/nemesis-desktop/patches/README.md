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
- `0083-fix-nemesis-consent-dialog-ignores-failed-boot-stubs.patch` — migration dialog
  ignores runtime-less ~/.nemesis stubs from beta.2's failed boots and clears them
  before an accepted move; commit message carries the beta.2 postmortem (push the
  branch public BEFORE building).
- `0084-feat-nemesis-Study-tab-closes-its-Anki-gaps.patch` — cloze cards with per-blank
  FSRS scheduling, local-day caps (was UTC), card search, deck rename, undo grade,
  leech auto-suspend, target retention, session recap (101 study tests green).
- `0085-feat-nemesis-Library-tab-closes-its-Obsidian-gaps.patch` — [[ autocomplete, list
  continuation, task checkboxes/strikethrough/code styling, unresolved-link create,
  rename with vault-wide link rewrite + tab remap, delete, global search, inline
  images (99 library tests green).
- `0086-chore-nemesis-regenerate-compiled-.js-siblings-for-S.patch` — compiled twins.
- `0087-chore-nemesis-v0.1.0-beta.3.patch` — version bump; first release stamped past
  the install-script repoint, fixing beta.2's fatal first boot.
- `0088-fix-nemesis-renderer-blank-screen-copilot-wiring-mov.patch` — THE beta.2/3
  blank-screen root cause: module-scope nanostores listeners in live-copilot.ts
  crashed the whole prod renderer bundle at load; wiring moved into
  initCopilotWiring() on recorder mount. Bumps v0.1.0-beta.4. RULE: never attach
  store listeners at module scope in the desktop renderer; verify packaged
  bundles by serving dist/ to a plain browser before releasing.
- `0089-fix-install-explicit-macOS-browser-case-Chromium-ins.patch` — install.sh gets
  a real macos) case: installs Playwright Chromium during bootstrap (browser
  automation works out of the box; replaces the false "will not work" warning).
- `0090-feat-desktop-v0.1.0-beta.5-zero-setup-AI-OAuth-sign-.patch` — beta.5:
  zero-setup AI (device key → \$HERMES_HOME/.env via nemesis:llm:sync IPC +
  backend restart; provider onboarding suppressed for students), Google/Apple
  desktop sign-in via app.enternemesis.com/auth/desktop + nemesis:// deep link
  (state-nonce checked, refresh token exchanged before trust), Account & usage
  settings page (plan + 7-day RLS-scoped usage chart), Keyboard-shortcuts
  settings entry, Study demo decks removed (fresh installs empty), field-neutral
  persona (any major) w/ auto-upgrade of app-written SOULs, generic consent-partner
  copy, Projects view for students, NSLocalNetworkUsageDescription.
- `0091-feat-desktop-v0.1.0-beta.6-in-app-auto-update-silent.patch` — beta.6:
  electron-updater auto-update (background download → "Restart now / On next quit"
  dialog, autoInstallOnAppQuit, 4h recheck; releases now must ship zip + blockmap +
  latest-mac.yml with the DMGs) + the intentional provider-sync backend restart no
  longer flashes the red "Backend stopped" banner (suppressNextBackendExit).
- `0092-beta7-transcript-refine-telemetry.patch` — beta.7: Recorder saves the note
  instantly with live captions, then re-transcribes the audio with the accurate
  batch model (whisper-base.en) in the background and swaps the note's Transcript
  section (≤30 min recordings; a student edit to the section always wins) + PostHog
  telemetry behind the consent gate (CONSENT_VERSION 2026-07-14 — real data-practice
  change) with default-on disclosed checkbox, immediate opt-out switch in Settings →
  Account & usage, uuid-only identify, feature counters + crash capture only.
- `0093-beta8-parakeet-native-asr.patch` — beta.8: native on-device speech engine.
  sherpa-onnx-node + NVIDIA parakeet-tdt-0.6b-v2 int8 (CC-BY-4.0, ~6% WER — beats
  whisper-large-v3 on English) in an Electron utilityProcess replaces whisper-base.en
  as the recorder's accuracy pass (~20x realtime measured; refine now covers ≤3h
  recordings, WASM fallback keeps ≤30 min). One-time ~480MB model download to
  userData/asr with streamed progress + disk guard; audio never leaves the machine.
  Build ships sherpa via stage-native-deps (also per-target in before-pack).
- `0094-beta9-updater-banner-section-delete.patch` — beta.9: update banner narrates
  the silent auto-updater (downloading → Restart now; manual download only on
  updater error/unavailable) + Study sections deletable (decks kept, ungrouped).
- `0095-beta10-status-below-prose-restart-fix.patch` — beta.10: the running
  "Working…" status/intent strip renders BELOW the streamed prose (ActivityStrip
  header/live split — settled "Worked for Xs" toggle stays on top); FIX for
  restart-to-update never swapping versions (Squirrel.Mac closes windows via
  'before-quit-for-update' which the macOS hide-on-close handler swallowed —
  flag flips on the native event + in the install IPC); native update dialog
  removed — the themed banner is the only update surface.
- `0096-bundle-nemesis-skills-in-repo.patch` — the 14 nemesis-* school/study/
  evidence skills committed into the repo's skills/ dir. install.sh seeds
  $HERMES_HOME/skills from there (tools/skills_sync.py), but these skills only
  lived on the dev machine + this kit — every fresh install ran the school
  agent with NO skill files.
- `0097-agent-voice-nemesis-no-emojis.patch` — agent persona: Nemesis is the
  only name (never "Hermes" in conversation — it had proposed "a daily Hermes
  cron job") and no emojis/decorative symbols in answers, notes, or documents
  unless asked. DEFAULT_SOUL_MD + DEFAULT_AGENT_IDENTITY + help-guidance
  rewrite; previous SOUL template added to the legacy list so app-written
  installs upgrade in place; live recorder copilot prompt gains the same
  plain-text rule.
- `0098-beta11-three-answer-modes.patch` — beta.11: the chat answer-mode
  picker becomes three plain choices — Instant / Medium / High (owner ask) —
  mapping to fast-mode / thinking+medium / thinking+high. High's description
  carries the honest cost note; the composer pill shows the active mode name.
