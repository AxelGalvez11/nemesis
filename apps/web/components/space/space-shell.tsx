"use client";

// The Space workspace as the app's shell (docs/space/PLAN.md). The Preact frontend in apps/web/space draws the sidebar
// and every page; the React app's own surfaces (Canvas, Study, Calendar) render in the column beside it, inside the old
// shell with its navigation switched off, so every provider they rely on is still there.
//
// 🔴 THE OLD SHELL STAYS MOUNTED ON SPACE ROUTES TOO, JUST HIDDEN. The gates it hosts (onboarding, terms re-consent)
// open their dialogs through portals and read its providers. Unmounting it on /p/... would silently skip a re-consent.

import "@/space/styles/space.css";
import "@/space/styles/host.css";
import "katex/dist/katex.min.css";

import { usePathname, useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useRef } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { supabase } from "@/lib/supabase";
import { isSpacePath, space } from "@/space/app/runtime.js";

export function SpaceShell({ children, gates }: { children: React.ReactNode; gates?: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme } = useTheme();
  const { signOut } = useAuth();
  const live = useRef({ router, setTheme, signOut });
  live.current = { router, setTheme, signOut };
  const spaceRoute = isSpacePath(pathname);

  useEffect(() => {
    let alive = true;
    let unmount: (() => void) | undefined;
    void import("@/space/app/main.js").then(({ mountSpace }) => {
      if (!alive || !root.current) return;
      unmount = mountSpace(root.current, {
        supabase,
        navigate: (path, opts) => (opts?.replace ? live.current.router.replace(path) : live.current.router.push(path)),
        setTheme: (pref) => live.current.setTheme(pref),
        signOut: async () => {
          await live.current.signOut();
          live.current.router.replace("/sign-in");
        },
        // Sharing goes through the route so the people invited also get an email; ws_invite still decides everything.
        invite: async (request) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const res = await fetch("/api/space/invite", {
            method: "POST",
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(request),
          });
          const body = (await res.json().catch(() => ({}))) as { error?: string; invited?: number; emailed?: number };
          if (!res.ok) throw new Error(body.error || "Sharing did not work. Try again.");
          return { invited: body.invited ?? 0, emailed: body.emailed ?? 0 };
        },
      });
    });
    return () => {
      alive = false;
      unmount?.();
    };
  }, []);

  // A navigation inside the React app (a link, the back button) moves the address bar without telling the Space
  // frontend. This tells it.
  useEffect(() => {
    space.routeChanged();
  }, [pathname]);

  return (
    <>
      <div className="nsp" data-workspace="" ref={root} />
      <div className="nsp-app-column" data-hidden={spaceRoute ? "true" : undefined}>
        <WorkspaceShell navless>
          {spaceRoute ? null : children}
          {gates}
        </WorkspaceShell>
      </div>
    </>
  );
}
