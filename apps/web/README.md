# Nemesis Account Portal

Browser-based identity and subscription control plane for the desktop-first Nemesis app at
`app.enternemesis.com`. The public marketing site is in `landing/` on `www.enternemesis.com`.

Normal sign-in, sign-up, email confirmation, `/`, and the legacy `/app` entry land at `/account`.
The desktop app signs in natively and opens `/account/billing` only when a user chooses or manages a
subscription. Existing research-workspace routes remain available by direct `/app/*` path while that
older product is set aside, but they are no longer the default post-auth destination.

## MVP Scope

- Email/password auth through Supabase.
- Account overview and Stripe-backed subscription management.
- Free/Plus/Pro entitlements read from Supabase (`0122`).
- Stripe price amounts are read from the configured price IDs so the plan cards match checkout.
- Existing `/app/*` research surfaces are retained for compatibility, not linked as the primary app.

## Environment

Public:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (`https://app.enternemesis.com` in production)
- `NEXT_PUBLIC_LANDING_URL` (`https://www.enternemesis.com`)

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PLUS_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_ALLOW_TEST_BILLING` (non-production only, and only with an isolated test Supabase project)
- `STRIPE_ALLOW_LIVE` (`true` only when deliberately going live)
- `NCBI_API_KEY` (optional; raises PubMed E-utilities rate limits)
- `UNPAYWALL_EMAIL` (optional but recommended; contact email used for Unpaywall/OpenAlex API etiquette)

Evidence broker:

- `GET /api/v1/evidence/search?q=berberine+glucose`
- Federates PubMed, Europe PMC, OpenAlex, and Unpaywall.
- Returns source provenance and access labels instead of pretending all papers are full-text indexed.
- Only store/index full text when a source/license explicitly allows reuse.

## Commands

```bash
pnpm --filter @pharmaorb/web dev
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
WEB_SMOKE_BASE_URL=https://app.enternemesis.com pnpm --filter @pharmaorb/web smoke
```

## Deployment

Deploy as a separate Vercel project with root directory `apps/web` and alias it to
`app.enternemesis.com`. Start with Stripe test keys/price id; switching to live mode should
only require environment variable changes.
