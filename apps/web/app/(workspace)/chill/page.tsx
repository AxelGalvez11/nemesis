import { redirect } from "next/navigation";

// RETIRED SURFACE (owner 2026-08-10).
//
// Chill was a standalone "brain break" page. Nemesis does not need a Learning Nemesis and a
// Casual Nemesis as separate applications — the Canvas composer holds an ordinary conversation
// where that is what the moment calls for.
//
// 🔴 REDIRECTED, NOT DELETED. `BreakWorkspace` and every game under it are untouched and still
// compile; this route simply stops being a destination. Unlike Study and Library, Chill has no
// deep links anywhere — nothing carries a query string here — so the redirect is unconditional
// and can happen on the server, which means no flash of the retired page and no JavaScript
// required to leave it.
//
// Bringing it back is deleting these three lines.
export default function BreakPage() {
  redirect("/learn");
}
