// Plugins — the connected-apps destination the sidebar points at.
//
// Inside `(workspace)`, so the route group's layout does the sign-in gate and draws the shell.
// The page itself is thin on purpose: everything it does lives in `PluginsPage`, which is a
// client component because the connection state is read from the browser's own Supabase session
// (see `composio-client.ts` — the API key never leaves the server, and the caller's identity comes
// from their token, never from a request body).
//
// The account id is passed rather than read inside, so the page re-asks when a different learner
// signs in. Connected accounts are per learner and there is no shared answer to cache.

"use client";

// 🔴 RETIRED 2026-09-07: *"could you remove the calendar and the apps I mainly just want to focus
// on the canvas right now for the live website"*. The row is out of the rail and a bare visit lands
// on the canvas. Nothing was deleted; see lib/workspace/sidebar-nav.ts.

import { useAuth } from "@/components/AuthProvider";
import { PluginsPage } from "@/components/workspace/plugins/plugins-page";

import { RetiredSurfaceGuard } from "@/components/workspace/retired-surface-guard";

export default function PluginsRoute() {
  const { session } = useAuth();
  return (
    <RetiredSurfaceGuard allowDeepLinks={false}>
      <PluginsPage userId={session?.user.id ?? null} />
    </RetiredSurfaceGuard>
  );
}
