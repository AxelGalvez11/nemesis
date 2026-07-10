# Nemesis — accounts, billing, and distribution (2026-07-10)

Plain-English map of how the money-and-identity layer works and what remains.

## Accounts (shipped)

- Students sign into the desktop app with their **PharmaOrb account** — same email/password,
  same Supabase user pool as the web app. No second signup system.
- The sign-in screen appears on launch (student build). "Create an account" opens the
  web signup page; "Skip for now" is a temporary owner/dev escape hatch (remove before
  public launch by deleting `bypassAccount` in `src/nemesis-account.ts`).
- Sessions persist and refresh automatically (`nemesis.account.v1` in localStorage).
- The status bar shows `email · Plan`; clicking it opens the Account dialog
  (plan badge, renewal date, Manage billing, Refresh plan, Sign out).

## Billing (shipped, structure)

- The desktop **reads the student's plan directly from the web app's database**:
  the `subscriptions` table, guarded by row-level security (`auth.uid() = user_id`),
  read with the student's own login token + the public anon key. No new backend was
  deployed; nothing in the web app changed.
- Active statuses (`active`, `trialing`, `past_due`) surface the plan code
  (e.g. `health_pro` → "Health Pro"); anything else = Free.
- **Upgrade / Manage billing** opens `https://app.pharmaorb.app/app/billing` — the web
  app's existing Stripe checkout/portal. One billing system, owned by the web app.
- Gating hook: read `$account` from `src/nemesis-account.ts` anywhere in the app to
  gate features by `plan` (e.g. `account.plan === 'free'`).

## The one big billing gap (next step, deliberate)

The agent still calls the model with the key configured on the machine. To make usage
billable per-student, the model key must move server-side behind a metered proxy:
an edge function that (1) validates the student's JWT, (2) checks plan + usage counters
(`usage_counters` table already exists), (3) forwards the completion request to the
provider, (4) records usage. The desktop agent then points its OpenAI-compatible base URL
at that proxy. Until that lands, distribute builds only to trusted testers.

## Distribution (shipped except Apple credentials)

- `npm run dist:mac:dmg` in `hermes-agent/apps/desktop` produces
  `release/Nemesis-<version>-mac-arm64.dmg` (+ `.zip`).
- App category is Education; the DMG has the drag-to-Applications window; microphone
  usage descriptions and the hardened-runtime `audio-input` entitlement are in place;
  an update-feed config points at `https://updates.pharmaorb.app/nemesis` (dormant).
- **Unsigned for now**: recipients must right-click → Open the first time
  ("unidentified developer" warning). That's the only install friction.

### Owner TODO to remove the warning (about 1 hour once enrolled)

1. Enroll in the Apple Developer Program ($99/yr) with your Apple ID.
2. In Xcode or developer.apple.com, create a **Developer ID Application** certificate
   and install it in your Keychain.
3. Create an App Store Connect **API key** (Users and Access → Integrations) and set
   three environment variables before building: `APPLE_API_KEY` (path to the .p8 file),
   `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
4. Run `npm run dist:mac:dmg` again — electron-builder finds the certificate
   automatically and the existing `scripts/notarize.mjs` hook notarizes the build.
   The result installs on any Mac with no warnings, and auto-update becomes possible.
5. To enable auto-update later: host the `release/latest-mac.yml` + artifacts at the
   update URL and wire `electron-updater` in the main process (small, documented task).
