import { Redirect } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { newThreadId } from "@/api/chat";
import { listCalendarEvents } from "@/api/cloudCalendar";
import { fetchLibrary } from "@/api/cloudLibrary";
import { useAuth } from "@/auth/AuthProvider";
import { readOnboarding } from "@/lib/onboarding";
import { decideOnboardingGate, type GateDecision } from "@/lib/onboarding-gate";

// Home ("/") — cloud-first phone (owner call 2026-07-20): Mac-dispatch "sessions"
// are removed from the phone entirely; chat is the app's home screen, matching
// the web app. See docs/design/nemesis-cloud-first-phone-2026-07.md §10.
//
// Cold launch lands on a FRESH chat (owner ask 2026-07-21), not the resumed
// last thread — so we hand Chat a brand-new thread id the same way the
// drawer's "New chat" button does. The id was never saved, so ChatScreen
// loads zero messages and shows the welcome state; prior threads stay one
// drawer-tap away. Leaving the id off would trip chat.tsx's no-param fallback,
// which deliberately resumes the most-recent thread (delete-active-thread
// relies on that), so the id must be supplied here.
//
// This screen is ALSO the first-run gate. See lib/onboarding-gate.ts for why the
// wait below is a keychain read on nearly every launch rather than a network
// call, and onboarding-gate.test.ts for the test that pins it.

/** How far either side of today to look for a single event. Wide enough that a
 *  syllabus imported for next term still proves the account is not new, narrow
 *  enough to stay one indexed query. Only ever runs on a device with no marker. */
const PROBE_YEARS = 3;

export default function Home() {
  const freshId = useMemo(() => newThreadId(), []);
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
  return <Redirect href={`/chat?c=${freshId}` as never} />;
}
