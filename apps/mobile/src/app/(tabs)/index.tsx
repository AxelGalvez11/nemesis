import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { listCalendarEvents } from "@/api/cloudCalendar";
import { fetchLibrary } from "@/api/cloudLibrary";
import { useAuth } from "@/auth/AuthProvider";
import { LearnHome } from "@/components/LearnHome";
import { readOnboarding } from "@/lib/onboarding";
import { decideOnboardingGate, type GateDecision } from "@/lib/onboarding-gate";

// Home ("/") — the app's front door, matching the web app's own front door (owner ask
// 2026-09-01, docs/design/ios-web-parity-2026-09.md, slice 1): an empty canvas with a centred
// greeting and a composer, rendered by LearnHome.tsx. There is no longer a redirect into a
// fresh chat_threads thread here — that was the previous "cloud-first phone" shape
// (nemesis-cloud-first-phone-2026-07.md §10), and it is what this replaces. Existing chats
// still live one drawer-tap away; this screen simply stops being one of them.
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
      // through to the front door exactly as it did before this file learned to ask.
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
  return <LearnHome />;
}
