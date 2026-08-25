# Nemesis — landing page

A standalone marketing page for **enternemesis.com**. Static content only — home, about,
pricing, privacy, terms — with both calls-to-action linking out to
`app.enternemesis.com/sign-up`. **No `/ask`, no health data.**

## Stack

- Next.js (App Router) + React + Tailwind v4

The page no longer talks to Supabase at all (see *Waitlist* below).

This app is **isolated from the parent Nemesis pnpm workspace** (it has its own
`pnpm-workspace.yaml`), so its React 19 graph never collides with the Expo/RN app. Deploy it
as its **own Vercel project** with **root directory `landing`**.

## Develop

```bash
cd landing
pnpm install
pnpm dev                     # http://localhost:3000
pnpm typecheck
pnpm build
```

## Environment

**None required.** The page is static and makes no network calls to Supabase. The two
`NEXT_PUBLIC_SUPABASE_*` vars are documented (commented out) in `.env.example` only so a
future waitlist restore knows what it needs; nothing reads them today. `lib/supabase.ts` is
a leftover from the removed form and is imported by nothing.

## Waitlist — RETIRED (2026-07-24)

The email-capture form was removed from this page during the school-OS pivot; visitors now
go straight to sign-up. The database side has been closed to match, in
`supabase/migrations/20260724200000_security_advisor_hardening.sql`:

- `join_waitlist(p_email)` — **`anon` and `authenticated` EXECUTE both revoked.**
  `service_role` only. The function and its 2 historical rows are kept, not dropped.
- `public.waitlist` — anon/authenticated table grants revoked as well.

That closed the last unauthenticated write endpoint in the database. It had no rate limit,
which was an accepted risk only while a real form justified it.

**To bring the waitlist back**, restore the grant and re-add the form:

```sql
grant execute on function public.join_waitlist(text) to anon, authenticated;
```

Before you do, read the constraints the original design depended on — they still apply:
returning `void` plus `ON CONFLICT DO NOTHING` is what denies an email-enumeration oracle,
the email-shape `CHECK` on the table is the real server-side gate, and a form honeypot is
**not** a security control. **Add Cloudflare Turnstile + per-IP rate limiting before wiring
any outbound email** to an insert — a confirmation mail on an unbounded public write is a
spam-amplification vector. Keep the table **email-only** (no IP/UA) for data minimization.

### Correction to the old note

The previous version of this section claimed the table had "**no anon table grants**, so
emails can never be read back through the API". That was not true: Supabase's default
privileges had granted `anon` full DML on `public.waitlist` since it was created. Emails
were never actually exposed — but the thing holding the line was RLS-enabled-with-no-policy,
not the grants. Both locks are now in place.
