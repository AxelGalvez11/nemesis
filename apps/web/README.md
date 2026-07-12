# Nemesis Web App

Signed-in account and research workspace for `app.enternemesis.com`. The public marketing site is
in `landing/` on `www.enternemesis.com`.

## MVP Scope

- Email/password auth through Supabase.
- Ask, Explore, Drug page, Source Viewer, Watchlist, Profile, Billing.
- Free/Plus entitlements read from Supabase (`0122`).
- Stripe Plus checkout at `$20/month`, mirrored into `subscriptions` by webhook.

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
- `STRIPE_ALLOW_LIVE` (`false` for MVP test mode; `true` only when deliberately going live)
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
