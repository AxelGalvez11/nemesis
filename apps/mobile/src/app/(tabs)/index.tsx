import { Redirect } from "expo-router";

// Home ("/") — cloud-first phone (owner call 2026-07-20): Mac-dispatch "sessions"
// are removed from the phone entirely; chat is the app's home screen, matching
// the web app. See docs/design/nemesis-cloud-first-phone-2026-07.md §10. This
// route used to render the missions list + composer (MissionsHome); it now just
// hands off to Chat immediately. The parent layout ((tabs)/_layout.tsx) already
// gates unauthenticated, non-guest visitors to /sign-in before this ever renders.
export default function Home() {
  return <Redirect href="/chat" />;
}
