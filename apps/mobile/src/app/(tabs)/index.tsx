import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { listCalendarEvents } from "@/api/cloudCalendar";
import { fetchLibrary } from "@/api/cloudLibrary";
import { useAuth } from "@/auth/AuthProvider";
import { readOnboarding } from "@/lib/onboarding";
import { decideOnboardingGate, type GateDecision } from "@/lib/onboarding-gate";

// Home ("/") — the launch gate. It decides between onboarding and the app, and then hands off.
//
// 🔴 IT HANDS OFF TO THE CANVAS NOW, NOT TO CHAT. This screen used to mint a fresh chat thread id
// and redirect into `/chat`, because chat was the phone's home screen (owner call 2026-07-20).
// The product is built around the Canvas on both apps now, so the destination changed — and the
// thread-id machinery went with it, since a canvas is created by beginning rather than by
// arriving. Chat itself is retired, not deleted: see `lib/retired-surfaces.ts`.
//
// This screen is ALSO the first-run gate. See lib/onboarding-gate.ts for why the
// wait below is a keychain read on nearly every launch rather than a network
// call, and onboarding-gate.test.ts for the test that pins it.

/** How far either side of today to look for a single event. Wide enough that a
 *  syllabus imported for next term still proves the account is not new, narrow
 *  enough to stay one indexed query. Only ever runs on a device with no marker. */
const PROBE_YEARS = 3;

export default function Home() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [decision, setDecision] = useState<GateDecision | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      // Signed out: the auth gate owns this launch, not this screen. Fall
      // through to chat exactly as it did before this file learned to ask.
      if (!uid) {
        if (live) setDecision("app");
        return;
      }
      const stored = await readOnboarding(SecureStore);
      const next = await decideOnboardingGate(stored, async () => {
        const year = new Date().getUTCFullYear();
        const [library, events] = await Promise.all([
          fetchLibrary(uid),
          listCalendarEvents(uid, { from: `${year - PROBE_YEARS}-01-01`, to: `${year + PROBE_YEARS}-12-31` }),
        ]);
        return {
          hasEvents: events.length > 0,
          hasLibrary: library.notes.length > 0 || library.folders.length > 0,
        };
      });
      if (live) setDecision(next);
    })();
    return () => {
      live = false;
    };
  }, [uid]);

  // Nothing, deliberately not a spinner: on the common path this resolves within
  // a keychain read, and loading chrome that appears for one frame is the only
  // thing anybody would notice about it.
  if (decision === null) return null;
  if (decision === "onboarding") return <Redirect href={"/onboarding" as never} />;
  // 🔴 THE COLD LAUNCH LANDS ON THE CANVAS. It used to hand Chat a brand-new thread id, back when
  // chat was the home screen. The Canvas is the product's only entry path now (and the web app's
  // front door), and it needs no id: a canvas is minted by BEGINNING, not by arriving.
  return <Redirect href={"/learn" as never} />;
}
