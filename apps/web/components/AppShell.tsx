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

function titleForPath(path: string) {
  if (path.includes("/app/ask")) return "Ask";
  if (path.includes("/app/explore")) return "Explore";
  if (path.includes("/app/watchlist")) return "Watchlist";
  if (path.includes("/app/billing")) return "Billing";
  if (path.includes("/app/profile")) return "Profile";
  if (path.includes("/app/drugs/")) return "Drug page";
  if (path.includes("/app/source/")) return "Source viewer";
  return "Evidence workspace";
}

function isActive(path: string, href: string) {
  if (href === "/app") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
  }, [loading, session, router, path]);

  if (loading) return <main className="centered">Loading…</main>;
  if (!session) return <main className="centered">Redirecting…</main>;

  const title = titleForPath(path);
  const wide = path.includes("/app/ask") || path.includes("/app/explore") || path.includes("/app/drugs/");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="brand-mark">P</span>
          <Link className="brand" href="/app">Pharma<span>Orb</span></Link>
          <span className="beta-pill">Beta</span>
        </div>
        <nav>
          {nav.map((item) => (
            <Link key={item.href} className={isActive(path, item.href) ? "active" : ""} href={item.href}>
              <span className="nav-dot" />
              {item.label}
            </Link>
          ))}
        </nav>
        <section className="sidebar-card">
          <h3>Free plan</h3>
          <p>2 / 10 Ask today. 1 / 3 follows used.</p>
          <div className="mini-meter"><span /></div>
        </section>
        <div className="sidebar-footer">
          <a href={landingUrl}>Landing</a>
          <button type="button" onClick={() => void signOut().then(() => router.replace("/sign-in"))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          {path.includes("/app/explore") ? <div className="topbar-search">Search drugs, trials...</div> : null}
          <div className="account-chip">
            <span className="account-avatar">{session.user.email?.[0]?.toUpperCase() ?? "A"}</span>
            <span>{session.user.email ?? "preview@pharmaorb.app"}</span>
          </div>
        </header>
        <div className={wide ? "content wide" : "content"}>{children}</div>
      </main>
    </div>
  );
}
