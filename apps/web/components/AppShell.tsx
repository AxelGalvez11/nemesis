"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { landingUrl } from "@/lib/env";

const nav = [
  { href: "/app", label: "Home" },
  { href: "/app/ask", label: "Ask" },
  { href: "/app/explore", label: "Explore" },
  { href: "/app/watchlist", label: "Watchlist" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/profile", label: "Profile" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
  }, [loading, session, router, path]);

  if (loading) return <main className="centered">Loading…</main>;
  if (!session) return <main className="centered">Redirecting…</main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/app">PharmaOrb</Link>
        <nav>
          {nav.map((item) => (
            <Link key={item.href} className={path === item.href ? "active" : ""} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href={landingUrl}>Landing</a>
          <button type="button" onClick={() => void signOut().then(() => router.replace("/sign-in"))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
