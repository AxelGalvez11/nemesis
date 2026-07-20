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
- `STRIPE_MAX_PRICE_ID` (recurring monthly Max price at exactly $99 USD)
- `STRIPE_MAX_LEGACY_PRICE_IDS` (comma-separated retired Max prices retained for grandfathered users)
- `STRIPE_ALLOW_TEST_BILLING` (non-production only, and only with an isolated test Supabase project)
- `STRIPE_ALLOW_LIVE` (`true` only when deliberately going live)
- `ASSEMBLYAI_API_KEY` (server-only key for live transcription; never expose it to the browser)
- `ASSEMBLYAI_SPEECH_MODEL` (optional; defaults to `universal-streaming-multilingual`)
- `NCBI_API_KEY` (optional; raises PubMed E-utilities rate limits)
- `UNPAYWALL_EMAIL` (optional but recommended; contact email used for Unpaywall/OpenAlex API etiquette)

## Live audio copilot

Live audio uses short-lived AssemblyAI browser tokens for transcription and the existing metered
DeepSeek chat path for discipline-neutral notes, questions, and topics to explore. Apply the latest
Supabase migration before enabling it; the migration adds monthly audio allowances and reservation
accounting so a recording cannot silently exceed its plan limit.

AssemblyAI must be able to reach `POST /api/live-audio/webhook` over public HTTPS to reconcile billed
connection time and save the final transcript. Use a deployed preview URL or HTTPS tunnel for local
end-to-end testing. On Vercel, the webhook also verifies AssemblyAI's documented fixed source IPs so
the browser-visible callback secret cannot be used to refund a live reservation. Raw audio is streamed
directly to AssemblyAI and is not stored by Nemesis.

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
