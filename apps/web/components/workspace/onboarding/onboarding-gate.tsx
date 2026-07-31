"use client";

// Decides whether the welcome flow appears, and remembers that it did.
//
// TWO GUARDS, because a marker in localStorage is per-browser and students have
// more than one. A stored outcome means "already done here"; content in the
// account means "not a new student, whatever this browser remembers". Someone
// who set up on their laptop must not be greeted with "name your courses" when
// they open their phone. The account is the durable record and it is right
// everywhere — which is what lets this ship without a database migration.
//
// It waits for the Library to finish loading before deciding. Asking "is this
// account empty?" while the answer is still "we have not looked" would flash
// the flow at every returning student for a moment, which is worse than the
// half-second of nothing it costs to wait.

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { loadCalendarEvents } from "@/lib/workspace/calendar-model";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import {
  ONBOARDING_STORAGE_KEY,
  type OnboardingOutcome,
  parseStoredOnboarding,
  shouldShowOnboarding,
} from "@/lib/workspace/onboarding";

import { OnboardingFlow } from "./onboarding-flow";

function readMarker() {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredOnboarding(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
  } catch {
    // Storage can be disabled outright. Treat that as "never ran" — the
    // emptiness guard still stops a returning student from seeing this.
    return null;
  }
}

function writeMarker(outcome: OnboardingOutcome) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ at: new Date().toISOString(), outcome }));
  } catch {
    // Nothing to do. Worst case they see the flow once more on this browser.
  }
}

export function OnboardingGate() {
  const { loading, session } = useAuth();
  const preview = useWorkspacePreview() !== null;
  const library = useCloudLibrary();
  const [show, setShow] = useState(false);
  const [decided, setDecided] = useState(false);

  const uid = session?.user.id ?? null;
  const libraryReady = library.status === "loaded";

  useEffect(() => {
    // The dev-preview harness renders fake content and must never be treated as
    // a real empty account.
    if (preview || loading || !uid || !libraryReady || decided) return;

    let alive = true;
    void (async () => {
      let hasEvents = false;
      try {
        const state = await loadCalendarEvents({ preview, userId: uid });
        hasEvents = state.events.length > 0;
      } catch {
        // Could not tell. Assume they HAVE events: showing a welcome screen to
        // an existing student is the worse of the two mistakes.
        hasEvents = true;
      }
      if (!alive) return;
      setDecided(true);
      setShow(
        shouldShowOnboarding({
          hasEvents,
          hasLibrary: library.notes.length > 0,
          stored: readMarker(),
        }),
      );
    })();

    return () => {
      alive = false;
    };
  }, [decided, library.notes.length, libraryReady, loading, preview, uid]);

  if (!show) return null;

  return (
    <OnboardingFlow
      onDone={(outcome) => {
        writeMarker(outcome);
        setShow(false);
      }}
    />
  );
}
