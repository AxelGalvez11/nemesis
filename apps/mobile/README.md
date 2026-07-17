# @nemesis/mobile

PharmaBro's **React Native + Expo** app, built against the frozen **§8 API contract**
(`IMPLEMENTATION_PLAN.md` §8) and the §12 mobile plan. 4-tab MVP — **Ask · Explore ·
Watchlist · Profile**.

## Stack

- **Expo SDK 56** + **Expo Router** (file-based routing in `src/app/`) + **react-native-web**
  (the web target is what makes the headless e2e gate possible).
- **supabase-js** for auth + the §8 reads; **@tanstack/react-query** for fetch/cache
  state (its loading/error/empty states back the doc-06 8-state matrix).
- Types come from the workspace package **`@nemesis/shared`** (the frozen §8 DTOs).

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
pnpm --filter @nemesis/mobile run web

# 3) device (Expo Go / dev build) — see DEVICE_CHECKLIST.md
pnpm --filter @nemesis/mobile exec expo start
```

## Verify (the headless gate)

```bash
# secrets sourced for the e2e seed/teardown (service key stays in Node, never the bundle)
set -a; source supabase/functions/.env; set +a
export SB_URL=https://qyjmivntajbigjswhahb.supabase.co
pnpm --filter @nemesis/mobile exec playwright test --config e2e/playwright.config.ts
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
      watchlist.tsx    follows + update feed + weekly digest (watchlist_items/updates/digests)
    drug/[id].tsx      drug page: overview · evidence · label · trials · pubmed · follow · compare
    source/[id].tsx    doc-12 Source Viewer (get_source)
    compare.tsx        side-by-side (compare fn): 6 doc-11 groups + unioned sources
    profile/           Profile sub-screens: health-context (real CRUD) · legal (privacy/terms/
                       disclaimer) · delete-account + export (AC10 affordances) · subscription
  api/                 typed §8 client over supabase-js (supabase, search, drugs, sources,
                       ask, watchlist, compare, healthContext, cast, derive, types)
  auth/                AuthProvider (email sign-in + guest UI state)
  components/          AnswerView · SafetyBanner · EvidenceCard · LabelSections · TrialList ·
                       PubmedList · FollowButton · ComparisonView · SourceLink · OfflineBanner · ui · states
  lib/                 route-param validation (UUID_RE) · free-tier limits · legal copy (doc-18) · useOnline
  theme/               shared styles (doc-13 design system fleshed out in 6b-5)
e2e/                   Playwright AC gates (global-setup seeds the test user)
```

## Roadmap (sub-PRs)

- **6b-1** ✅: scaffold · auth (email + guest UI state) · typed §8 client (`get_drug`) · 8-state primitives · Playwright fidelity gate.
- **6b-2** ✅: Explore + Drug page + Source Viewer → AC1/4/5/6/9.
- **6b-3** ✅: Ask (cited answers + safety routing) → AC2/3.
- **6b-4** ✅: Watchlist + Compare → AC7/8.
- **6b-5** (this PR): Profile hub + My Health Context (real CRUD) + legal/disclaimer + data/delete
  affordances → AC10 surfaces; the 8-state matrix completed (see `STATE_MATRIX.md`). Device sign-off
  (`DEVICE_CHECKLIST.md`) is the remaining human gate that closes Phase 6.
