# PharmaBro mobile — device sign-off checklist

The headless Playwright gate (`e2e/`) proves the app's logic, the §8 wiring, and the
react-native-web render as a **real authenticated user against cloud**. It cannot
honestly prove the genuinely native parts of "full loop on device" (Phase 6 gate).
Those are verified here by a human, on a device, via **Expo Go** or a **dev build**.

This is a **required gate** for Phase 6 to be called done — completed at **6b-5**
(after all screens land), and recorded as signed-off in `PROGRESS.md`.

## How to run on a device

```bash
# from repo root — set the public client env first (anon key only)
#   apps/mobile/.env: EXPO_PUBLIC_SUPABASE_URL=..., EXPO_PUBLIC_SUPABASE_ANON_KEY=...
pnpm --filter @pharmabro/mobile exec expo start      # scan the QR with Expo Go
# or a dev build for native modules:  npx expo run:ios   /   npx expo run:android
```

## Checklist (tick at 6b-5)

Native shell:
- [ ] App launches on a physical iOS device (Expo Go or dev build).
- [ ] App launches on a physical Android device.
- [ ] The 4-tab loop (Ask · Explore · Watchlist · Profile) navigates on device.
- [ ] Email sign-in works on device; session **persists** across an app restart
      (SecureStore — watch for the ~2KB key-size caveat noted in `src/api/supabase.ts`).
- [ ] Sign-out clears the session on device.

Native-only capabilities:
- [ ] Notification-permission prompt appears (when push lands — Phase-5 carry-forward).
- [ ] Apple sign-in works (after OAuth native config is provided — deferred).
- [ ] Google sign-in works (after OAuth native config is provided — deferred).
- [ ] True offline: airplane mode shows the cached/offline state, not a crash.

AC-visible end-to-end on device (mirrors the headless gate):
- [ ] Search → drug page with label / trials / PubMed / evidence score (AC1/4/5/6/9).
- [ ] Ask → cited structured answer; emergency phrasing routes to urgent care (AC2/3).
- [ ] Follow ≥3 items; weekly digest renders (AC7/8).
- [ ] Privacy / terms / educational disclaimer / delete-account affordances reachable (AC10 surfaces).

## 6b-1 status

Scaffold + auth + typed §8 client + the Playwright harness are in place; the headless
fidelity gate passes (web boot + seeded-user sign-in + authenticated `get_drug` render
+ guest UI state). No device sign-off is expected at 6b-1 — this checklist is created
now and exercised at 6b-5.
