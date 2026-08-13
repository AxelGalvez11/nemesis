# Nemesis — accounts, billing, and distribution (2026-07-12)

Plain-English map of how the money-and-identity layer works and what remains.

## Desktop-first account model (shipped)

- Nemesis is desktop-first. Students enter their email/password in the native desktop
  sign-in gate; successful sign-in returns them directly to the desktop experience.
- Identity and subscription entitlements still use the existing Supabase user pool, so
  current users keep the same account and data. There is no second signup system.
- The sign-in screen appears on launch (student build). "Create an account" opens the
  browser account portal at `https://app.enternemesis.com/sign-up`; it does not replace
  native desktop sign-in. "Skip for now" is a temporary owner/dev escape hatch (remove
  before public launch by deleting `bypassAccount` in `src/nemesis-account.ts`).
- Sessions persist and refresh automatically (`nemesis.account.v1` in localStorage).
- The status bar shows `email · Plan`; clicking it opens the Account dialog
  (plan badge, renewal date, Manage subscription, Refresh plan, Sign out).

## Billing (shipped, structure)

- The desktop **reads the student's plan directly from the account database**:
  the `subscriptions` table, guarded by row-level security (`auth.uid() = user_id`),
  read with the student's own login token + the public anon key. No new backend was
  required for the desktop sign-in flow.
- Active statuses (`active`, `trialing`, `past_due`) surface the plan code
  (e.g. `health_pro` → "Health Pro"); anything else = Free.
- **Choose a plan / Manage subscription** opens
  `https://app.enternemesis.com/account/billing` in the default browser. This thin
  browser portal owns Stripe checkout, invoices, payment-method changes, cancellation,
  and resubscription; after returning to the desktop, **Refresh plan** reloads the
  entitlement. The browser is an account surface, not a second Nemesis product.
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
  `release/Nemesis-<version>-mac-arm64.dmg` (+ `.zip`). (`hermes-agent` here is the literal
  directory name of the forked build checkout — the command needs the real name to run; it
  isn't a product reference.)
- App category is Education; the DMG has the drag-to-Applications window; microphone
  usage descriptions and the hardened-runtime `audio-input` entitlement are in place;
  the dormant update-feed config still needs a verified Nemesis-owned host before
  auto-update is enabled.
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
