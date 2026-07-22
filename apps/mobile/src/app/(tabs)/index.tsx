import { Redirect } from "expo-router";
import { useMemo } from "react";

import { newThreadId } from "@/api/chat";

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
export default function Home() {
  const freshId = useMemo(() => newThreadId(), []);
  return <Redirect href={`/chat?c=${freshId}` as never} />;
}
