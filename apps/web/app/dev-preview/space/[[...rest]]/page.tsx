"use client";

// A harness for the Space workspace with no account and no network: the real frontend (apps/web/space) over the
// in-memory backend in lib/space/fake-backend.ts. Everything made here lives until the tab reloads.

import "@/space/styles/space.css";
import "katex/dist/katex.min.css";

import { Inter } from "next/font/google";
import { useEffect, useRef } from "react";

import { createFakeSupabase, fakeChatEngine, fakeMeetingDeps } from "@/lib/space/fake-backend";
import { setBasePath, space } from "@/space/app/runtime.js";

const BASE = "/dev-preview/space";
// The same face the real shell loads (components/space/space-shell.tsx), so this harness shows the real type.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-app", display: "swap" });

export default function SpacePreview() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    let unmount: (() => void) | undefined;
    setBasePath(BASE);
    if (location.pathname === BASE) history.replaceState(null, "", BASE + "/home");
    const fake = createFakeSupabase();
    // Handles for inspecting the harness from the browser console; this page is never part of the product.
    Object.assign(window, { __space: space, __fakeSpace: fake });
    // No model here: chats answer with a stand-in that streams the way the real answer does.
    (space as unknown as { chatEngine: unknown }).chatEngine = fakeChatEngine;
    // No microphone or recording worker either: meeting notes record into a stand-in that writes up a sample meeting.
    Object.assign(space as unknown as Record<string, unknown>, { meetingDeps: fakeMeetingDeps(fake), meetingPollMs: 1000 });
    void import("@/space/app/main.js").then(({ mountSpace }) => {
      if (!alive || !root.current) return;
      unmount = mountSpace(root.current, {
        supabase: fake as never,
        navigate: (path) => {
          history.pushState(null, "", path.startsWith(BASE) ? path : BASE + "/home");
          space.routeChanged();
        },
        setTheme: (pref) => {
          const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
          document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
        },
        signOut: () => {},
        invite: async ({ page, emails, role }) => {
          const { data } = await fake.rpc("ws_invite", { p_page: page, p_emails: emails, p_role: role });
          return { invited: ((data as { notify?: string[] } | null)?.notify ?? []).length, emailed: 0 };
        },
      });
    });
    return () => {
      alive = false;
      unmount?.();
    };
  }, []);
  return <div className={`nsp ${inter.variable}`} data-workspace="" ref={root} />;
}
