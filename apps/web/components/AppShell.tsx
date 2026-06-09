"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { useTheme } from "./theme-provider";
import { Orb } from "./Orb";
import { fetchEntitlements, fetchUsage } from "@/lib/api";
import { Icon } from "./icons";

/* ── chrome context: pages inject their evidence panel + topbar title here ── */
interface AppChromeValue {
  railCollapsed: boolean;
  toggleRail: () => void;
  evidenceCollapsed: boolean;
  toggleEvidence: () => void;
  setEvidence: (node: ReactNode | null) => void;
  setTopbar: (node: ReactNode | null) => void;
}
const AppChromeContext = createContext<AppChromeValue>({
  railCollapsed: false,
  toggleRail: () => {},
  evidenceCollapsed: false,
  toggleEvidence: () => {},
  setEvidence: () => {},
  setTopbar: () => {},
});
export const useAppChrome = () => useContext(AppChromeContext);

const workspace = [
  { href: "/app/ask", label: "Ask", icon: "message" as const },
  { href: "/app/explore", label: "Explore", icon: "search" as const },
  { href: "/app/watchlist", label: "Watchlist", icon: "bell" as const },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}
function titleForPath(path: string): { title: string; sub?: string } {
  if (path.startsWith("/app/ask")) return { title: "Ask", sub: "live evidence · cited" };
  if (path.startsWith("/app/explore")) return { title: "Explore" };
  if (path.startsWith("/app/watchlist")) return { title: "Watchlist" };
  if (path.startsWith("/app/billing")) return { title: "Billing" };
  if (path.startsWith("/app/profile")) return { title: "Profile" };
  if (path.startsWith("/app/settings")) return { title: "Settings" };
  if (path.startsWith("/app/drugs/")) return { title: "Drug" };
  if (path.startsWith("/app/source/")) return { title: "Source" };
  return { title: "PharmaOrb" };
}

const FULL_BLEED = ["/app/ask", "/app/explore", "/app/drugs/"];

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const path = usePathname();

  const [railCollapsed, setRailCollapsed] = useState(false);
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(false);
  const [evidence, setEvidenceNode] = useState<ReactNode | null>(null);
  const [topbar, setTopbarNode] = useState<ReactNode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const [plan, setPlan] = useState<{ plan: string; used: number; limit: number }>({ plan: "free", used: 0, limit: 10 });

  // Stable setters so child effects don't loop.
  const setEvidence = useCallback((node: ReactNode | null) => setEvidenceNode(node), []);
  const setTopbar = useCallback((node: ReactNode | null) => setTopbarNode(node), []);
  // The hamburger collapses the rail on desktop AND toggles the mobile drawer; the panel button
  // collapses the evidence column on desktop AND toggles its drawer at ≤1100px. Each layout's CSS
  // reads only its own state, so one button drives both. Opening one drawer closes the other.
  const toggleRail = useCallback(() => { setRailCollapsed((v) => !v); setMobileNavOpen((v) => !v); setMobileEvidenceOpen(false); }, []);
  const toggleEvidence = useCallback(() => { setEvidenceCollapsed((v) => !v); setMobileEvidenceOpen((v) => !v); setMobileNavOpen(false); }, []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const closeMobileEvidence = useCallback(() => setMobileEvidenceOpen(false), []);

  useEffect(() => {
    if (!loading && !session) router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
  }, [loading, session, router, path]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void Promise.all([fetchEntitlements(), fetchUsage()])
      .then(([ent, usage]) => {
        if (!alive) return;
        const ask = usage.counters.ask_daily;
        setPlan({ plan: ent.plan, used: ask?.used ?? 0, limit: ask?.limit ?? Number(ent.entitlements.ask_daily_limit ?? 10) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session]);

  // Close the account menu on Escape or an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".acct-wrap")) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  // Close both mobile drawers on route change.
  useEffect(() => { setMobileNavOpen(false); setMobileEvidenceOpen(false); }, [path]);

  // Close the open drawer on Escape.
  useEffect(() => {
    if (!mobileNavOpen && !mobileEvidenceOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMobileNavOpen(false); setMobileEvidenceOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, mobileEvidenceOpen]);

  const ctx = useMemo<AppChromeValue>(
    () => ({ railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, setEvidence, setTopbar }),
    [railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, setEvidence, setTopbar],
  );

  // Hooks are all above this line — only conditional returns below (Rules of Hooks).
  if (loading) return <div className="centered muted">Loading…</div>;
  if (!session) return <div className="centered muted">Redirecting…</div>;

  const hasEvidence = evidence != null;
  const isChat = path.startsWith("/app/ask");
  const fullBleed = FULL_BLEED.some((p) => path.startsWith(p));
  const pageClass = isChat ? "page-content" : fullBleed ? "page-content scroll" : "page-content padded";
  const appClass = [
    "app",
    railCollapsed && "rail-collapsed",
    mobileNavOpen && "mobile-open",
    hasEvidence && mobileEvidenceOpen && "mobile-evidence-open",
    hasEvidence ? evidenceCollapsed && "evidence-collapsed" : "no-evidence",
  ]
    .filter(Boolean)
    .join(" ");
  const defaultTitle = titleForPath(path);
  const email = session.user.email ?? "preview@pharmaorb.app";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <AppChromeContext.Provider value={ctx}>
      <div className={appClass}>
        {/* ── rail ── */}
        <aside className="rail">
          <div className="brand">
            <Orb size={28} />
            <div className="wordmark">PharmaOrb</div>
          </div>
          <button className="new" onClick={() => router.push("/app/ask")} aria-label="New chat">
            <Icon name="plus" size={16} />
            <span className="new-txt">New chat</span>
          </button>
          <div className="search">
            <Icon name="search" size={15} />
            <input placeholder="Search chats & drugs" aria-label="Search chats and drugs" />
          </div>
          <nav className="nav">
            <div className="r-label">Workspace</div>
            {workspace.map((item) => (
              <Link key={item.href} href={item.href} aria-label={item.label} className={`hist${isActive(path, item.href) ? " active" : ""}`}>
                <Icon name={item.icon} className="hist-ic" />
                <span>{item.label}</span>
              </Link>
            ))}

            <div className="r-label">Projects</div>
            <Link href="/app/settings" className="hist" aria-label="New project">
              <Icon name="folder" className="hist-ic" />
              <span>New project</span>
            </Link>
            <div className="hist" style={{ color: "var(--text-3)", cursor: "default" }}>
              <span style={{ fontSize: 12 }}>Bundle chats, sources & deliverables</span>
            </div>

            <div className="r-label">Recent chats</div>
            <div className="hist" style={{ color: "var(--text-3)", cursor: "default" }}>
              <span style={{ fontSize: 12 }}>Your saved chats appear here</span>
            </div>
          </nav>

          <div className="acct-wrap">
            {menuOpen ? (
              <div className="acct-menu" role="menu">
                <Link href="/app/settings" onClick={() => setMenuOpen(false)}><Icon name="settings" size={15} />Settings</Link>
                <Link href="/app/profile" onClick={() => setMenuOpen(false)}><Icon name="user" size={15} />Profile</Link>
                <Link href="/app/billing" onClick={() => setMenuOpen(false)}><Icon name="card" size={15} />Billing · {plan.plan}</Link>
                <div className="sep" />
                <button onClick={() => void signOut().then(() => router.replace("/sign-in"))}><Icon name="logout" size={15} />Sign out</button>
              </div>
            ) : null}
            <button className="acct-btn" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu">
              <span className="av">{initials}</span>
              <span className="acct-meta">
                <b>{email.split("@")[0]}</b>
                <small>{plan.plan} · {plan.used}/{plan.limit} today</small>
              </span>
            </button>
          </div>
        </aside>

        {/* mobile drawer backdrop */}
        <button className="rail-backdrop" aria-label="Close menu" onClick={closeMobileNav} tabIndex={-1} />

        {/* ── main ── */}
        <main className="main">
          <div className="topbar">
            <button className="icon-btn" onClick={toggleRail} title="Toggle sidebar" aria-label="Toggle sidebar">
              <Icon name="menu" />
            </button>
            {topbar ?? (
              <div>
                <div className="thread-title">{defaultTitle.title}</div>
                {defaultTitle.sub ? <div className="thread-sub">{defaultTitle.sub}</div> : null}
              </div>
            )}
            <div className="spacer" />
            <button className="icon-btn" onClick={toggleTheme} title="Toggle light/dark">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            {hasEvidence ? (
              <button className="icon-btn" onClick={toggleEvidence} title="Toggle evidence">
                <Icon name="panel" />
              </button>
            ) : null}
          </div>
          <div className={pageClass}>{children}</div>
        </main>

        {/* ── evidence (page-injected) — a right-side drawer at ≤1100px ── */}
        {hasEvidence ? (
          <>
            <button className="evidence-backdrop" aria-label="Close evidence" onClick={closeMobileEvidence} tabIndex={-1} />
            <aside className="evidence">{evidence}</aside>
          </>
        ) : null}
      </div>
    </AppChromeContext.Provider>
  );
}
