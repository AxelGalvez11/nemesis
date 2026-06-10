"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { useTheme } from "./theme-provider";
import { Orb } from "./Orb";
import { fetchConversations, fetchEntitlements, fetchUsage, type ConversationSummary } from "@/lib/api";
import { Icon } from "./icons";

/* ── chrome context: pages inject their evidence panel + topbar title here ── */
interface AppChromeValue {
  railCollapsed: boolean;
  toggleRail: () => void;
  evidenceCollapsed: boolean;
  toggleEvidence: () => void;
  openEvidence: () => void;
  setEvidence: (node: ReactNode | null) => void;
  setTopbar: (node: ReactNode | null) => void;
  bumpChats: () => void;
}
const AppChromeContext = createContext<AppChromeValue>({
  railCollapsed: false,
  toggleRail: () => {},
  evidenceCollapsed: false,
  toggleEvidence: () => {},
  openEvidence: () => {},
  setEvidence: () => {},
  setTopbar: () => {},
  bumpChats: () => {},
});
export const useAppChrome = () => useContext(AppChromeContext);

const workspace = [
  { href: "/app/ask", label: "Ask", icon: "message" as const },
  { href: "/app/research", label: "Deep research", icon: "doc" as const },
  // Explore is deferred (mostly mockup) — hidden from the nav until it's real. The route still exists.
  { href: "/app/watchlist", label: "Watchlist", icon: "bell" as const },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}
function titleForPath(path: string): { title: string; sub?: string } {
  if (path.startsWith("/app/ask")) return { title: "Ask", sub: "live evidence · cited" };
  if (path.startsWith("/app/research")) return { title: "Deep research", sub: "multi-step cited report" };
  if (path.startsWith("/app/explore")) return { title: "Explore" };
  if (path.startsWith("/app/watchlist")) return { title: "Watchlist" };
  if (path.startsWith("/app/billing")) return { title: "Billing" };
  if (path.startsWith("/app/profile")) return { title: "Profile" };
  if (path.startsWith("/app/settings")) return { title: "Settings" };
  if (path.startsWith("/app/drugs/")) return { title: "Drug" };
  if (path.startsWith("/app/source/")) return { title: "Source" };
  return { title: "PharmaOrb" };
}

const FULL_BLEED = ["/app/ask", "/app/research", "/app/explore", "/app/drugs/"];

// Client-only breakpoint probe (clicks are client-side, so window is always defined here).
const mqMatch = (q: string) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const path = usePathname();

  const [railCollapsed, setRailCollapsed] = useState(false);
  // Evidence panel starts COLLAPSED: the chat is the focus on entry. It opens on demand — the
  // topbar panel button, or a citation click (openEvidence) — so sources are one click away.
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(true);
  const [evidence, setEvidenceNode] = useState<ReactNode | null>(null);
  const [topbar, setTopbarNode] = useState<ReactNode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const [plan, setPlan] = useState<{ plan: string; used: number; limit: number }>({ plan: "free", used: 0, limit: 10 });
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  const [chatsVersion, setChatsVersion] = useState(0);
  // Lets the chat page refresh the rail history the moment it creates a new conversation.
  const bumpChats = useCallback(() => setChatsVersion((v) => v + 1), []);

  // Stable setters so child effects don't loop.
  const setEvidence = useCallback((node: ReactNode | null) => setEvidenceNode(node), []);
  const setTopbar = useCallback((node: ReactNode | null) => setTopbarNode(node), []);
  // The hamburger collapses the rail on desktop but toggles the off-canvas drawer at ≤720px; the
  // panel button collapses the evidence column on desktop but toggles its drawer at ≤1100px. We
  // gate on the live breakpoint so the *mobile* flags are only ever set at mobile widths — that
  // way a value set on desktop can't make a drawer pop open when the window is later shrunk past
  // the line. Opening one drawer closes the other.
  const toggleRail = useCallback(() => {
    setMobileEvidenceOpen(false);
    if (mqMatch("(max-width: 720px)")) setMobileNavOpen((v) => !v);
    else setRailCollapsed((v) => !v);
  }, []);
  const toggleEvidence = useCallback(() => {
    setMobileNavOpen(false);
    if (mqMatch("(max-width: 1100px)")) setMobileEvidenceOpen((v) => !v);
    else setEvidenceCollapsed((v) => !v);
  }, []);
  // Always-open command (used by citation clicks): opens the right place for the current breakpoint
  // and never toggles an already-open panel shut. Mirrors toggleEvidence's breakpoint split.
  const openEvidence = useCallback(() => {
    setMobileNavOpen(false);
    if (mqMatch("(max-width: 1100px)")) setMobileEvidenceOpen(true);
    else setEvidenceCollapsed(false);
  }, []);
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

  // Load the rail's saved-chat history (refreshes when the chat page bumps after creating one).
  useEffect(() => {
    if (!session) return;
    let alive = true;
    void fetchConversations().then((c) => { if (alive) setChats(c); }).catch(() => {});
    return () => { alive = false; };
  }, [session, chatsVersion]);

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

  // Force a drawer closed once the viewport grows back above its breakpoint, so it can't reappear
  // when the window is shrunk across the line again.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const railMq = window.matchMedia("(max-width: 720px)");
    const evMq = window.matchMedia("(max-width: 1100px)");
    const syncRail = () => { if (!railMq.matches) setMobileNavOpen(false); };
    const syncEv = () => { if (!evMq.matches) setMobileEvidenceOpen(false); };
    railMq.addEventListener("change", syncRail);
    evMq.addEventListener("change", syncEv);
    return () => { railMq.removeEventListener("change", syncRail); evMq.removeEventListener("change", syncEv); };
  }, []);

  const ctx = useMemo<AppChromeValue>(
    () => ({ railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats }),
    [railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats],
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
        <aside className="rail" id="app-rail">
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
            {/* Projects (group chats, sources & deliverables) is not built yet — inert placeholder,
                NOT a link. It previously pointed at /app/settings (wrong page); /app/projects does
                not exist, so a real href would 404. */}
            <div className="hist" style={{ color: "var(--text-3)", cursor: "default" }} aria-disabled="true">
              <Icon name="folder" className="hist-ic" />
              <span style={{ fontSize: 12 }}>Projects — coming soon</span>
            </div>
            <div className="hist" style={{ color: "var(--text-3)", cursor: "default" }}>
              <span style={{ fontSize: 12 }}>Bundle chats, sources & deliverables</span>
            </div>

            <div className="r-label">Recent chats</div>
            {chats.length === 0 ? (
              <div className="hist" style={{ color: "var(--text-3)", cursor: "default" }}>
                <span style={{ fontSize: 12 }}>Your saved chats appear here</span>
              </div>
            ) : (
              chats.map((c) => (
                <Link key={c.id} href={`/app/ask?c=${c.id}`} className="hist" title={c.title}>
                  <Icon name="message" className="hist-ic" />
                  <span>{c.title}</span>
                </Link>
              ))
            )}
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
            <button className="icon-btn" onClick={toggleRail} title="Toggle sidebar" aria-label="Toggle sidebar" aria-controls="app-rail" aria-expanded={mobileNavOpen}>
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
              <button className="icon-btn" onClick={toggleEvidence} title="Toggle evidence" aria-label="Toggle evidence" aria-controls="app-evidence" aria-expanded={mobileEvidenceOpen}>
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
            <aside className="evidence" id="app-evidence">{evidence}</aside>
          </>
        ) : null}
      </div>
    </AppChromeContext.Provider>
  );
}
