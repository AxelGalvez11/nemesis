// The phone's destinations, in one place — the mirror of the web app's
// `apps/web/lib/workspace/sidebar-nav.ts`.
//
// 🔴 THIS LIST AND THE WEB'S `SIDEBAR_NAV` ARE THE SAME PRODUCT DECISION, WRITTEN TWICE.
// They cannot be one file (the web rows carry codicon names and Next routes; these carry
// React Native icon components and expo-router paths), so the guarantee has to come from
// keeping them literally aligned — same ids, same labels, same order. The web file records
// why it was extracted in the first place: a copied array is how two navigations silently
// drift apart, each looking correct on its own. Two apps is the same hazard, one step wider.
//
// If a destination is added, removed or reordered on either side, change BOTH.
//
// The reasoning for WHICH destinations these are lives on the web side (owner 2026-08-13,
// §L): the sidebar represents DESTINATIONS, never content. Students are "managing BODIES OF
// KNOWLEDGE", not recovering a conversation from three weeks ago — which is why there is no
// chat-thread list here any more.

import { CalendarIcon, GraphIcon, LibraryIcon, PlusIcon, type IconProps } from "@/components/icons";
import type { ComponentType } from "react";
import { STATS_RETIRED } from "./retired-surfaces";

export interface NavDestination {
  readonly id: string;
  readonly label: string;
  readonly Icon: ComponentType<IconProps>;
  readonly route: string;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  // The front door. `/learn` IS the minimal composer — a question, with upload and record —
  // and the canvas is created automatically once the learner starts. It is deliberately not a
  // "new canvas" action: nothing is created by pressing this, only by beginning.
  { id: "new-canvas", label: "New canvas", Icon: PlusIcon, route: "/learn" },
  { id: "library", label: "Library", Icon: LibraryIcon, route: "/library" },
  { id: "calendar", label: "Calendar", Icon: CalendarIcon, route: "/calendar" },
  // 🔴 STATS IS HIDDEN ON THE PHONE, AND ONLY ON THE PHONE (owner 2026-08-20: "remove the stats
  // page for now (hide it)"). The web app still lists it, so this is the ONE place the two
  // navigations deliberately disagree — recorded here rather than silently dropped, because a
  // missing row with no explanation is exactly the drift this file exists to prevent.
  // `app/(tabs)/stats.tsx` and `components/StudyStatsBody.tsx` are untouched and still work.
  ...(STATS_RETIRED ? [] : [{ id: "stats", label: "Stats", Icon: GraphIcon, route: "/stats" } as NavDestination]),
];

/** Whether a destination is the surface currently on screen. Mirrors the web's `navItemActive`. */
export function navItemActive(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}
