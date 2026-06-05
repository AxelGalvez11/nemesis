# PharmaOrb Web App

Signed-in public beta for `app.pharmaorb.app`. The public marketing/waitlist site remains
in `landing/` on `pharmaorb.app`.

## MVP Scope

- Email/password auth through Supabase.
- Ask, Explore, Drug page, Source Viewer, Watchlist, Profile, Billing.
- Free/Plus entitlements read from Supabase (`0122`).
- Stripe Plus checkout at `$12/month`, mirrored into `subscriptions` by webhook.

## Environment

Public:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (`https://app.pharmaorb.app` in production)
- `NEXT_PUBLIC_LANDING_URL` (`https://pharmaorb.app`)

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PLUS_PRICE_ID`

## Commands

```bash
pnpm --filter @pharmaorb/web dev
pnpm --filter @pharmaorb/web typecheck
pnpm --filter @pharmaorb/web build
```

## Deployment

Deploy as a separate Vercel project with root directory `apps/web` and alias it to
`app.pharmaorb.app`. Start with Stripe test keys/price id; switching to live mode should
only require environment variable changes.
