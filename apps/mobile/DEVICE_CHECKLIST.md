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
- [ ] True offline: airplane mode shows the global offline banner (the headless gate
      drives this via `setOffline`; on device, confirm the real radio toggle is observed
      by `useOnline` and the banner clears when connectivity returns).

AC-visible end-to-end on device (mirrors the headless gate):
- [ ] Search → drug page with label / trials / PubMed / evidence score (AC1/4/5/6/9).
- [ ] Ask → cited structured answer; emergency phrasing routes to urgent care (AC2/3).
- [ ] Follow ≥3 items; weekly digest renders (AC7/8).
- [ ] Privacy / terms / educational disclaimer / delete-account / export affordances reachable (AC10 surfaces).
- [ ] My Health Context: edit + consent + **save**, reload shows it persisted, then
      **delete** removes it (the on-device keyboard + the comma-separated list fields behave).

## 6b-5 status — READY FOR DEVICE SIGN-OFF

All Phase-6 screens have landed (6b-1…6b-5). The headless gate is green end-to-end:
**13/13** Playwright tests as real authenticated users against cloud — AC1–AC9 fully
exercised + AC10 affordances present/reachable + the 8-state matrix's live cells (offline,
guest). `tsc` clean; `deno test` 34/34. The 30-cell matrix ledger is in `STATE_MATRIX.md`.

What remains for Phase 6 to be called **done** is exactly this checklist, run by a human
on a physical device — the genuinely native parts a web gate cannot honestly prove. This
is a **human gate the agent cannot self-sign.** When you (the operator) complete the ticks
above, record the sign-off (date + device/OS) in `PROGRESS.md`.

> Deferred-by-design (not sign-off blockers, tracked in `PROGRESS.md`): Apple/Google OAuth
> (needs native config), push-notification delivery (Phase-5 carry-forward), and the
> real account-delete **cascade** + data-export **generation** (Phase 7 — the 6b-5 screens
> are honest affordances, not working deletion/export).
