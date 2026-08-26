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

import { useAuth } from "@/components/AuthProvider";
import { PluginsPage } from "@/components/workspace/plugins/plugins-page";

export default function PluginsRoute() {
  const { session } = useAuth();
  return <PluginsPage userId={session?.user.id ?? null} />;
}
