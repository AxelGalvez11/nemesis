"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { useTheme } from "./theme-provider";
import { Orb } from "./Orb";
import { deleteConversation, fetchConversations, fetchEntitlements, fetchProjects, fetchUsage, pinConversation, renameConversation, setItemProject, type ConversationSummary, type Project } from "@/lib/api";
import { Icon } from "./icons";
import { AppModal } from "./AppModal";
import { SettingsSurface } from "./SettingsSurface";
import { CreditsPanel } from "./CreditsPanel";

type Overlay = "settings" | null;

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
  bumpUsage: () => void;
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
  bumpUsage: () => {},
});
export const useAppChrome = () => useContext(AppChromeContext);

const workspace = [
  { href: "/app/ask", label: "Ask", icon: "message" as const },
  { href: "/app/reports", label: "Library", icon: "doc" as const },
  // Monitoring's nav entry folded into Scheduled 2026-07-03 (one automation surface, ChatGPT-style).
  // /app/monitor routes still exist — reached from Scheduled's monitor rows and its "New monitor" link.
  { href: "/app/scheduled", label: "Scheduled", icon: "clock" as const },
  // Explore is deferred (mostly mockup) — hidden from the nav until it's real. The route still exists.
  // (The old "Watchlist" feature was retired 2026-06-18, superseded by Monitoring above. Its empty DB
  // tables stay dormant for now; the drug-page "Follow" now creates a Monitoring watch.)
  // Score ("Percentile Engine") is an off-nav MVP — reachable at /app/score for review, hidden from
  // users until the reference data + lab ingestion land. Add it here to surface it in the menu.
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}
function titleForPath(path: string): { title: string; sub?: string } {
  if (path.startsWith("/app/ask")) return { title: "Ask" };
  if (path.startsWith("/app/research")) return { title: "Deep research", sub: "multi-step cited report" };
  if (path.startsWith("/app/reports")) return { title: "Library", sub: "everything you've generated" };
  if (path.startsWith("/app/monitor")) return { title: "Monitoring", sub: "live evidence watches" };
  if (path.startsWith("/app/scheduled")) return { title: "Scheduled", sub: "recurring research + monitors" };
  if (path.startsWith("/app/score")) return { title: "Score", sub: "your longevity rank" };
  if (path.startsWith("/app/explore")) return { title: "Explore" };
  if (path.startsWith("/app/billing")) return { title: "Billing" };
  if (path.startsWith("/app/profile")) return { title: "Profile" };
  if (path.startsWith("/app/settings")) return { title: "Settings" };
  if (path.startsWith("/app/drugs/")) return { title: "Drug" };
  if (path.startsWith("/app/source/")) return { title: "Source" };
  return { title: "PharmaOrb" };
}

const FULL_BLEED = ["/app/ask", "/app/research", "/app/reports", "/app/monitor", "/app/scheduled", "/app/explore", "/app/drugs/", "/app/score"];

// Client-only breakpoint probe (clicks are client-side, so window is always defined here).
const mqMatch = (q: string) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const path = usePathname();

  // Persisted across reloads so the sidebar stays where the user left it (ChatGPT/Manus behavior).
  // Lazy initializer so we read localStorage exactly once, and only in the browser (SSR-safe).
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("rail-collapsed") === "1";
  });
  // Evidence panel starts COLLAPSED: the chat is the focus on entry. It opens on demand — the
  // topbar panel button, or a citation click (openEvidence) — so sources are one click away.
  const [evidenceCollapsed, setEvidenceCollapsed] = useState(true);
  const [evidenceWidth, setEvidenceWidth] = useState(344);
  const [evidenceFullscreen, setEvidenceFullscreen] = useState(false);
  const [evidence, setEvidenceNode] = useState<ReactNode | null>(null);
  const [topbar, setTopbarNode] = useState<ReactNode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Settings/Profile/Billing render as overlays (account menu) instead of replacing the chat. The route
  // pages (/app/settings etc.) still work for a direct URL; this is the in-shell affordance.
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const [plan, setPlan] = useState<{ plan: string; used: number; limit: number }>({ plan: "free", used: 0, limit: 10 });
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  // Sidebar search: a client-side filter over the loaded Recent chats (title substring). Honest scope —
  // this searches saved chats only, not the drug catalog.
  const [chatQuery, setChatQuery] = useState("");
  const [chatsVersion, setChatsVersion] = useState(0);
  // Bumped after each ask so the account footer + credits chip re-read usage (they'd otherwise go stale —
  // AppShell reads usage once on mount). Private local state; only bumpUsage() is exposed on the context.
  const [usageVersion, setUsageVersion] = useState(0);
  // Whether the credits modal (opened from the topbar chip) is showing.
  const [creditsOpen, setCreditsOpen] = useState(false);
  // Per-chat overflow (⋯) menu: which chat's menu is open + the fixed viewport coords to render it at
  // (fixed-positioned so the scrolling rail can't clip it).
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // The per-chat ⋯ menu can swap into a "pick a project" list in place (no nested flyout). `projMenuFor`
  // is the chat id whose project picker is showing; `projects` is lazily loaded on first open.
  const [projMenuFor, setProjMenuFor] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  // Delete confirmation: the chat awaiting a styled confirm dialog (replaces window.confirm). null = closed.
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  // Inline rename: the chat whose title is being edited in-row (replaces window.prompt) + the draft text.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Escape sets this so the input's blur handler cancels instead of saving — Enter and click-away both
  // blur the field (the single commit path), and this flag tells that path it was a cancel.
  const cancelRenameRef = useRef(false);
  // Lets the chat page refresh the rail history the moment it creates a new conversation.
  const bumpChats = useCallback(() => setChatsVersion((v) => v + 1), []);
  const bumpUsage = useCallback(() => setUsageVersion((v) => v + 1), []);

  // Delete a chat: optimistically drop it from the rail, then delete server-side (RLS-scoped). If we
  // were viewing it, return to a blank chat. Re-fetch on failure so the rail reflects the real state.
  const handleDeleteChat = useCallback(async (id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (path.startsWith("/app/ask") && new URLSearchParams(window.location.search).get("c") === id) {
      router.push("/app/ask");
    }
    try {
      await deleteConversation(id);
    } catch {
      setChatsVersion((v) => v + 1); // resync from the server
    }
  }, [path, router]);

  // Rename a chat: optimistic title swap in the rail, then persist (RLS-scoped). Resync on failure.
  const handleRenameChat = useCallback(async (id: string, title: string) => {
    const clean = title.trim().slice(0, 120);
    if (!clean) return;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    try {
      await renameConversation(id, clean);
    } catch {
      setChatsVersion((v) => v + 1); // resync from the server
    }
  }, []);

  // Commit the inline rename: close the editor and persist the draft (handleRenameChat trims, caps,
  // and no-ops a blank). Single commit path — Enter and click-away both blur the field; Escape cancels.
  const commitRename = useCallback((id: string) => {
    setRenamingId(null);
    void handleRenameChat(id, renameDraft);
  }, [handleRenameChat, renameDraft]);

  // Pin / unpin a chat: optimistically flip `pinned` and re-sort the rail (pinned first, then
  // most-recent — mirrors the server order), then persist (RLS-scoped). Resync on failure.
  const handlePinChat = useCallback(async (id: string, pinned: boolean) => {
    setChats((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, pinned } : c))
        .sort((a, b) => (a.pinned === b.pinned ? b.updated_at.localeCompare(a.updated_at) : a.pinned ? -1 : 1)),
    );
    try {
      await pinConversation(id, pinned);
    } catch {
      setChatsVersion((v) => v + 1); // resync from the server
    }
  }, []);

  // Assign / unassign a chat to a project from the rail. Optimistically updates the row's project_id,
  // closes the menu, then resyncs from the server (matching handlePinChat's pattern).
  const handleAssignChat = useCallback(async (id: string, projectId: string | null) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, project_id: projectId } : c)));
    setRowMenu(null);
    setProjMenuFor(null);
    try {
      await setItemProject("conversation", id, projectId);
    } catch {
      setChatsVersion((v) => v + 1); // resync from the server on failure
    }
  }, []);

  // Open the in-place project picker for a chat; lazy-load the project list the first time.
  const openProjMenu = useCallback((id: string) => {
    setProjMenuFor(id);
    if (projects === null) void fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, [projects]);

  // Open the ⋯ menu anchored to the kebab button, clamped to the viewport (toggles if already open).
  const openRowMenu = useCallback((id: string, btn: HTMLElement) => {
    setRowMenu((cur) => {
      if (cur?.id === id) return null;
      const r = btn.getBoundingClientRect();
      const W = 200, H = 184;
      const x = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
      const y = r.bottom + 4 + H > window.innerHeight ? Math.max(8, r.top - 4 - H) : r.bottom + 4;
      return { id, x, y };
    });
  }, []);

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
    else
      setRailCollapsed((v) => {
        const next = !v;
        if (typeof window !== "undefined") window.localStorage.setItem("rail-collapsed", next ? "1" : "0");
        return next;
      });
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
  const closeMobileEvidence = useCallback(() => { setMobileEvidenceOpen(false); setEvidenceFullscreen(false); }, []);
  const toggleEvidenceFullscreen = useCallback(() => {
    setMobileNavOpen(false);
    setMobileEvidenceOpen(false);
    setEvidenceCollapsed(false);
    setEvidenceFullscreen((v) => !v);
  }, []);
  const beginEvidenceResize = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (evidenceFullscreen || mqMatch("(max-width: 1100px)")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = evidenceWidth;
    const onMove = (ev: PointerEvent) => {
      const max = Math.min(760, Math.max(344, window.innerWidth - (railCollapsed ? 96 : 296) - 420));
      const next = Math.max(320, Math.min(max, startW + startX - ev.clientX));
      setEvidenceWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("resizing-evidence");
    };
    document.body.classList.add("resizing-evidence");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [evidenceFullscreen, evidenceWidth, railCollapsed]);

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
  }, [session, usageVersion]);

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

  // Close the per-chat ⋯ menu on outside click / Escape, and (since it's fixed-positioned and won't
  // track the rail) on scroll or resize.
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => { setRowMenu(null); setProjMenuFor(null); };
    const onDoc = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".row-menu, .hist-more")) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const nav = document.querySelector(".nav");
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    nav?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      nav?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [rowMenu]);

  // Close both mobile drawers + any account overlay + the row menu / its dialogs on route change.
  useEffect(() => { setMobileNavOpen(false); setMobileEvidenceOpen(false); setEvidenceFullscreen(false); setOverlay(null); setRowMenu(null); setProjMenuFor(null); setConfirmDelete(null); setRenamingId(null); }, [path]);

  // Close the delete-confirm dialog on Escape.
  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmDelete(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  // Close the open drawer on Escape.
  useEffect(() => {
    if (!mobileNavOpen && !mobileEvidenceOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMobileNavOpen(false); setMobileEvidenceOpen(false); setEvidenceFullscreen(false); } };
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
    () => ({ railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats, bumpUsage }),
    [railCollapsed, toggleRail, evidenceCollapsed, toggleEvidence, openEvidence, setEvidence, setTopbar, bumpChats, bumpUsage],
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
    hasEvidence && evidenceFullscreen && "evidence-fullscreen",
    hasEvidence ? evidenceCollapsed && "evidence-collapsed" : "no-evidence",
  ]
    .filter(Boolean)
    .join(" ");
  const appStyle = hasEvidence ? ({ "--evidence": `${evidenceWidth}px` } as CSSProperties) : undefined;
  const defaultTitle = titleForPath(path);
  const email = session.user.email ?? "preview@pharmaorb.app";
  const initials = email.slice(0, 2).toUpperCase();
  // Filter Recent chats by title (case-insensitive substring). Empty query → the full list.
  const q = chatQuery.trim().toLowerCase();
  const visibleChats = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;

  return (
    <AppChromeContext.Provider value={ctx}>
      <div className={appClass} style={appStyle}>
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
            <input
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
            />
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
            {/* Projects workspaces (group chats + reports + watches). Lives on its own pages
                (/app/projects + /app/projects/[id]) rather than inline in the rail. */}
            <Link href="/app/projects" className="hist">
              <Icon name="folder" className="hist-ic" />
              <span style={{ fontSize: 12 }}>Projects</span>
            </Link>

            <div className="r-label">Recent chats</div>
            {chats.length === 0 ? (
              <div className="hist" style={{ color: "var(--text-2)", cursor: "default" }}>
                <span style={{ fontSize: 12 }}>Your saved chats appear here</span>
              </div>
            ) : visibleChats.length === 0 ? (
              <div className="r-label" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                No chats match
              </div>
            ) : (
              visibleChats.map((c) => (
                <div key={c.id} className={`hist-row${rowMenu?.id === c.id ? " menu-open" : ""}`}>
                  {renamingId === c.id ? (
                    // Inline rename: the title becomes an editable field. Enter or click-away saves;
                    // Escape cancels (both route through blur — the single commit path).
                    <input
                      className="hist-rename"
                      value={renameDraft}
                      autoFocus
                      maxLength={120}
                      aria-label={`Rename chat ${c.title}`}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                        else if (e.key === "Escape") { e.preventDefault(); cancelRenameRef.current = true; e.currentTarget.blur(); }
                      }}
                      onBlur={() => {
                        if (cancelRenameRef.current) { cancelRenameRef.current = false; setRenamingId(null); return; }
                        commitRename(c.id);
                      }}
                    />
                  ) : (
                    <>
                      <Link href={`/app/ask?c=${c.id}`} className="hist" title={c.title}>
                        {/* pinned chats lead with a pin glyph (and sort to the top) */}
                        <Icon name={c.pinned ? "pin" : "message"} className="hist-ic" />
                        <span>{c.title}</span>
                      </Link>
                      <button
                        type="button"
                        className="hist-more"
                        aria-label={`Options for chat ${c.title}`}
                        aria-haspopup="menu"
                        aria-expanded={rowMenu?.id === c.id}
                        title="Chat options"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openRowMenu(c.id, e.currentTarget); }}
                      >
                        <Icon name="more" size={16} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </nav>

          <div className="acct-wrap">
            {menuOpen ? (
              <div className="acct-menu" role="menu">
                <button onClick={() => { setOverlay("settings"); setMenuOpen(false); }}><Icon name="settings" size={15} />Settings</button>
                <div className="sep" />
                <button onClick={() => void signOut().then(() => router.replace("/sign-in"))}><Icon name="logout" size={15} />Sign out</button>
              </div>
            ) : null}
            <button className="acct-btn" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
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
            <button className="icon-btn" onClick={toggleRail} data-tip="Toggle sidebar" aria-label="Toggle sidebar" aria-controls="app-rail" aria-expanded={mobileNavOpen}>
              <Icon name="menu" />
            </button>
            {topbar ?? (
              <div>
                <div className="thread-title">{defaultTitle.title}</div>
                {defaultTitle.sub ? <div className="thread-sub">{defaultTitle.sub}</div> : null}
              </div>
            )}
            <div className="spacer" />
            <button
              className="credits-chip"
              onClick={() => setCreditsOpen(true)}
              data-tip="Your credits"
              aria-label={`Your credits — ${Math.max(0, plan.limit - plan.used)} asks left today`}
            >
              <Icon name="sparkle" size={15} />
              <b>{Math.max(0, plan.limit - plan.used)}</b>
            </button>
            <button className="icon-btn" onClick={toggleTheme} data-tip="Switch theme" aria-label="Switch theme (light, grey, dark)">
              <Icon name={theme === "light" ? "moon" : "sun"} />
            </button>
            {hasEvidence ? (
              <button className="icon-btn" onClick={toggleEvidence} data-tip="Show the evidence behind the answer" aria-label="Toggle evidence" aria-controls="app-evidence" aria-expanded={mobileEvidenceOpen}>
                <Icon name="panel" />
              </button>
            ) : null}
          </div>
          <div className={pageClass}>{children}</div>
        </main>

        <CreditsPanel open={creditsOpen} onClose={() => setCreditsOpen(false)} />

        {/* ── evidence (page-injected) — a right-side drawer at ≤1100px ── */}
        {hasEvidence ? (
          <>
            <button className="evidence-backdrop" aria-label="Close evidence" onClick={closeMobileEvidence} tabIndex={-1} />
            <aside className="evidence" id="app-evidence">
              <button className="evidence-resizer" type="button" aria-label="Resize evidence panel" onPointerDown={beginEvidenceResize} />
              <button
                className="evidence-fullscreen-toggle icon-btn"
                type="button"
                data-tip={evidenceFullscreen ? "Exit full screen evidence" : "Full screen evidence"}
                aria-label={evidenceFullscreen ? "Exit full screen evidence" : "Full screen evidence"}
                onClick={toggleEvidenceFullscreen}
              >
                <Icon name={evidenceFullscreen ? "panel" : "expand"} size={16} />
              </button>
              {evidence}
            </aside>
          </>
        ) : null}

        {/* ── per-chat ⋯ menu (fixed-positioned so the scrolling rail can't clip it) ── */}
        {rowMenu && (() => {
          const c = chats.find((x) => x.id === rowMenu.id);
          if (!c) return null;
          return (
            <div className="row-menu" role="menu" style={{ left: rowMenu.x, top: rowMenu.y }}>
              {projMenuFor === c.id ? (
                <>
                  <button role="menuitem" onClick={() => setProjMenuFor(null)}>
                    <Icon name="chevron-down" size={15} style={{ transform: "rotate(90deg)" }} />Back
                  </button>
                  <div className="sep" />
                  {c.project_id ? (
                    <button role="menuitem" onClick={() => void handleAssignChat(c.id, null)}>
                      <Icon name="folder" size={15} />Remove from project
                    </button>
                  ) : null}
                  {projects === null ? (
                    <button role="menuitem" disabled><Icon name="folder" size={15} />Loading projects…</button>
                  ) : projects.length === 0 ? (
                    <button role="menuitem" disabled><Icon name="folder" size={15} />No projects yet</button>
                  ) : (
                    <div className="row-menu-scroll">
                      {projects.map((p) => (
                        <button key={p.id} role="menuitem" disabled={p.id === c.project_id}
                          onClick={() => void handleAssignChat(c.id, p.id)} title={p.name}>
                          <Icon name={p.id === c.project_id ? "check" : "folder"} size={15} />{p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button role="menuitem" onClick={() => { setRowMenu(null); setRenamingId(c.id); setRenameDraft(c.title); }}>
                    <Icon name="pencil" size={15} />Rename
                  </button>
                  <button role="menuitem" onClick={() => { setRowMenu(null); void handlePinChat(c.id, !c.pinned); }}>
                    <Icon name="pin" size={15} />{c.pinned ? "Unpin chat" : "Pin chat"}
                  </button>
                  <button role="menuitem" onClick={() => openProjMenu(c.id)}>
                    <Icon name="folder" size={15} />{c.project_id ? "Move to project" : "Add to project"}
                  </button>
                  <div className="sep" />
                  <button role="menuitem" className="danger" onClick={() => { setRowMenu(null); setConfirmDelete({ id: c.id, title: c.title }); }}>
                    <Icon name="trash" size={15} />Delete chat
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* ── delete-confirm dialog (styled in-app; replaces the native window.confirm) ── */}
        {confirmDelete && (
          <div className="confirm-overlay" role="presentation" onClick={() => setConfirmDelete(null)}>
            <div
              className="confirm-card"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-del-title"
              aria-describedby="confirm-del-body"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="confirm-del-title" className="confirm-title">Delete this chat?</h3>
              <p id="confirm-del-body" className="confirm-body">
                “{confirmDelete.title}” will be permanently deleted. This can’t be undone.
              </p>
              <div className="confirm-actions">
                {/* Cancel is the autofocused default — the safe choice for a destructive action. */}
                <button type="button" className="confirm-cancel" autoFocus onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button type="button" className="confirm-del" onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); void handleDeleteChat(id); }}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* ── account overlays (Settings / Profile / Billing) — portaled, so they sit above everything ── */}
        <AppModal open={overlay === "settings"} onClose={() => setOverlay(null)} title="Settings" sub="Appearance, account, billing, and preferences." wide>
          <SettingsSurface />
        </AppModal>
      </div>
    </AppChromeContext.Provider>
  );
}
