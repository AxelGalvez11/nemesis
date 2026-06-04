# PharmaOrb — landing page

A standalone marketing + waitlist page for **pharmaorb.app**. Static content plus a single
email-capture form. **No `/ask`, no health data** — it's safe to run while the LLM provider
swap is still pending.

## Stack

- Next.js (App Router) + React + Tailwind v4
- Supabase (waitlist capture via the `join_waitlist` RPC in the shared project)

This app is **isolated from the parent PharmaBro pnpm workspace** (it has its own
`pnpm-workspace.yaml`), so its React 19 graph never collides with the Expo/RN app. Deploy it
as its **own Vercel project** with **root directory `landing`**.

## Develop

```bash
cd landing
pnpm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev                     # http://localhost:3000
pnpm test                    # unit tests (email validation + submit logic)
pnpm typecheck
pnpm build
```

## Environment

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL (`https://qyjmivntajbigjswhahb.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — safe in the browser bundle; RLS + the RPC-only surface protect the data. |

Set both in the Vercel project env (they are inlined at build time).

## Waitlist data model

Defined in `supabase/migrations/0121_waitlist.sql` (the shared Supabase project):

- `public.waitlist(id, email, source, created_at)` — RLS on, **no anon table grants**, so
  emails can never be read back through the API.
- `join_waitlist(p_email)` — `SECURITY DEFINER`, returns **void**, `INSERT … ON CONFLICT DO
  NOTHING`. The only anon-reachable surface.

### Security note (read before changing the waitlist)

`join_waitlist` is **intentionally anon-executable** — it is a public PostgREST endpoint by
design (the anon key ships in the page). The real server-side gate is the **email-shape
`CHECK`** + **`ON CONFLICT DO NOTHING`**; returning `void` denies an email-enumeration
oracle. The form honeypot only stops naive bots — it is **not** a security control. There is
no rate limit yet; if junk volume becomes a problem, add **Cloudflare Turnstile** on the
form (the cheap real defense). Worst case today = junk rows you can `TRUNCATE`. **Add
Turnstile + per-IP rate-limiting BEFORE wiring any outbound email** to a waitlist insert —
a confirmation/welcome mail on insert turns the unbounded public write into a
spam-amplification vector. Keep the table **email-only** (no IP/UA) to preserve the
project's data-minimization posture.
