# @pharmabro/mobile

PharmaBro's **React Native + Expo** app, built against the frozen **§8 API contract**
(`IMPLEMENTATION_PLAN.md` §8) and the §12 mobile plan. 4-tab MVP — **Ask · Explore ·
Watchlist · Profile**.

## Stack

- **Expo SDK 56** + **Expo Router** (file-based routing in `src/app/`) + **react-native-web**
  (the web target is what makes the headless e2e gate possible).
- **supabase-js** for auth + the §8 reads; **@tanstack/react-query** for fetch/cache
  state (its loading/error/empty states back the doc-06 8-state matrix).
- Types come from the workspace package **`@pharmabro/shared`** (the frozen §8 DTOs).

## Security posture

The app ships **only the public anon key** via `EXPO_PUBLIC_*` (inlined into the
bundle by design). It reads as a **signed-in user (JWT)** — the §8 read RPCs are
REVOKEd from anon and GRANTed to authenticated (migrations 0111/0112/0118), so the
anon key alone can't read protected data. **The service key never ships in the app.**

## Run

```bash
# 1) public client env (anon key only)
cp apps/mobile/.env.example apps/mobile/.env   # then fill EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY

# 2) web (dev)
pnpm --filter @pharmabro/mobile run web

# 3) device (Expo Go / dev build) — see DEVICE_CHECKLIST.md
pnpm --filter @pharmabro/mobile exec expo start
```

## Verify (the headless gate)

```bash
# secrets sourced for the e2e seed/teardown (service key stays in Node, never the bundle)
set -a; source supabase/functions/.env; set +a
export SB_URL=https://qyjmivntajbigjswhahb.supabase.co
pnpm --filter @pharmabro/mobile exec playwright test --config e2e/playwright.config.ts
```

The gate runs the app on web via `expo start --web`, seeds a confirmed test user via
the admin API (Node only), drives a real UI sign-in, and asserts the AC-visible flows
under react-native-web. The genuinely native parts are covered by `DEVICE_CHECKLIST.md`.

## Layout

```
src/
  app/                 Expo Router routes
    _layout.tsx        providers (react-query, AuthProvider, SafeArea) + Stack
    sign-in.tsx        email sign-in + "continue as guest"
    (tabs)/            the 4-tab shell (Ask/Explore/Watchlist/Profile), auth-guarded
      index.tsx        Ask: question → cited structured answer / safety routing (ask fn)
      explore.tsx      search (search_entities) → results → drug page
    drug/[id].tsx      drug page: overview · evidence · label · trials · pubmed (all cited)
    source/[id].tsx    doc-12 Source Viewer (get_source)
  api/                 typed §8 client over supabase-js (supabase, search, drugs,
                       sources, ask, cast, derive, types)
  auth/                AuthProvider (email sign-in + guest UI state)
  components/          AnswerView · SafetyBanner · EvidenceCard · LabelSections · TrialList
                       · PubmedList · SourceLink · ui (Card/Chip/Badge/Centered) · states
  lib/                 route-param validation (UUID_RE)
  theme/               shared styles (doc-13 design system fleshed out in 6b-5)
e2e/                   Playwright AC gates (global-setup seeds the test user)
```

## Roadmap (sub-PRs)

- **6b-1** ✅: scaffold · auth (email + guest UI state) · typed §8 client (`get_drug`) · 8-state primitives · Playwright fidelity gate.
- **6b-2** ✅: Explore + Drug page + Source Viewer → AC1/4/5/6/9.
- **6b-3** (this PR): Ask (cited answers + safety routing) → AC2/3.
- **6b-4**: Watchlist + Compare → AC7/8.
- **6b-5**: Profile + legal + full 8-state matrix (AC10 affordances) + device sign-off.
