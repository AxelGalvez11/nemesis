"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookmarkIcon,
  CreditCardIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareTextIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import type { ConversationSummary } from "@pharmabro/shared";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { fetchConversations, fetchEntitlements, fetchUsage, fetchWatchlist } from "@/lib/api";

const nav = [
  { href: "/app", label: "Home", Icon: HomeIcon },
  { href: "/app/ask", label: "Ask", Icon: MessageSquareTextIcon },
  { href: "/app/explore", label: "Explore", Icon: SearchIcon },
  { href: "/app/watchlist", label: "Watchlist", Icon: BookmarkIcon },
  { href: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

function titleForPath(path: string) {
  if (path.includes("/app/ask")) return "Ask";
  if (path.includes("/app/explore")) return "Explore";
  if (path.includes("/app/watchlist")) return "Watchlist";
  if (path.includes("/app/billing")) return "Billing";
  if (path.includes("/app/profile")) return "Profile";
  if (path.includes("/app/settings")) return "Settings";
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
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [planState, setPlanState] = useState({
    plan: "free",
    askUsed: 0,
    askLimit: 10,
    followsUsed: 0,
    followsLimit: 3,
    loaded: false,
  });

  useEffect(() => {
    if (!loading && !session) router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
  }, [loading, session, router, path]);

  useEffect(() => {
    const storedCollapsed = window.localStorage.getItem("pharmaorb-sidebar-collapsed");
    const storedTheme = window.localStorage.getItem("pharmaorb-theme");
    if (storedCollapsed === "true") setCollapsed(true);
    if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("pharmaorb-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("pharmaorb-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void Promise.all([fetchEntitlements(), fetchUsage(), fetchWatchlist(), fetchConversations()])
      .then(([entitlements, usage, watchlist, recentConversations]) => {
        if (!alive) return;
        const ask = usage.counters.ask_daily;
        setPlanState({
          plan: entitlements.plan,
          askUsed: ask?.used ?? 0,
          askLimit: ask?.limit ?? Number(entitlements.entitlements.ask_daily_limit ?? 10),
          followsUsed: watchlist.length,
          followsLimit: Number(entitlements.entitlements.watchlist_limit ?? 3),
          loaded: true,
        });
        setConversations(recentConversations);
      })
      .catch(() => {
        if (alive) setPlanState((current) => ({ ...current, loaded: true }));
      });
    return () => {
      alive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    async function reload() {
      try {
        const recent = await fetchConversations();
        if (alive) setConversations(recent);
      } catch {
        if (alive) setConversations([]);
      }
    }
    window.addEventListener("pharmaorb:conversations-changed", reload);
    return () => {
      alive = false;
      window.removeEventListener("pharmaorb:conversations-changed", reload);
    };
  }, [session]);

  if (loading) return <main className="centered">Loading…</main>;
  if (!session) return <main className="centered">Redirecting…</main>;

  const title = titleForPath(path);
  const wide = path.includes("/app/ask") || path.includes("/app/explore") || path.includes("/app/drugs/");
  const askMeterWidth = planState.loaded && planState.askLimit > 0
    ? `${Math.min(100, Math.round((planState.askUsed / planState.askLimit) * 100))}%`
    : "12%";
  const shellClass = collapsed ? "app-shell sidebar-collapsed" : "app-shell";
  const ThemeIcon = theme === "dark" ? SunIcon : MoonIcon;

  function renderNavLink(item: (typeof nav)[number], mode: "desktop" | "mobile") {
    const link = (
      <Link className={isActive(path, item.href) ? "active" : ""} href={item.href}>
        <item.Icon className="nav-icon" aria-hidden="true" />
        <span className="nav-label">{item.label}</span>
      </Link>
    );

    if (mode === "mobile") {
      return (
        <SheetClose asChild key={item.href}>
          {link}
        </SheetClose>
      );
    }

    return <span key={item.href} className="nav-link-shell">{link}</span>;
  }

  function renderRecentLink(conversation: ConversationSummary, mode: "desktop" | "mobile") {
    const link = (
      <Link
        className="recent-chat"
        href={`/app/ask?c=${conversation.id}`}
      >
        {conversation.title}
      </Link>
    );

    if (mode === "mobile") {
      return (
        <SheetClose asChild key={conversation.id}>
          {link}
        </SheetClose>
      );
    }

    return <span key={conversation.id} className="recent-chat-shell">{link}</span>;
  }

  function renderSidebarContent(mode: "desktop" | "mobile") {
    const isMobile = mode === "mobile";

    return (
      <>
        <div className="brand-row">
          <span className="brand-mark">P</span>
          <Link className="brand" href="/app">Pharma<span>Orb</span></Link>
          <span className="beta-pill">Beta</span>
          {!isMobile ? (
            <button
              type="button"
              className="icon-button collapse-button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((current) => !current)}
            >
              {collapsed ? ">" : "<"}
            </button>
          ) : null}
        </div>
        <nav>
          {nav.map((item) => renderNavLink(item, mode))}
        </nav>
        {!collapsed || isMobile ? (
          <section className="recent-chats">
            <div className="recent-heading">
              <span>Recent chats</span>
              {isMobile ? (
                <SheetClose asChild>
                  <Link href="/app/ask">New</Link>
                </SheetClose>
              ) : (
                <Link href="/app/ask">New</Link>
              )}
            </div>
            {conversations.length ? (
              conversations.slice(0, 8).map((conversation) => renderRecentLink(conversation, mode))
            ) : (
              <p className="recent-empty">No saved chats yet.</p>
            )}
          </section>
        ) : null}
        <section className="sidebar-card">
          <h3>{planState.plan} plan</h3>
          <p>
            {planState.loaded
              ? `${planState.askUsed} / ${planState.askLimit} Ask today. ${planState.followsUsed} / ${planState.followsLimit} follows used.`
              : "Loading current limits..."}
          </p>
          <div className="mini-meter"><span style={{ width: askMeterWidth }} /></div>
        </section>
        <div className="sidebar-footer">
          <Button
            type="button"
            variant="ghost"
            className="theme-toggle"
            title={theme === "dark" ? "Use light mode" : "Use dark mode"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            <ThemeIcon data-icon="inline-start" aria-hidden="true" />
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </Button>
          {isMobile ? (
            <>
              <SheetClose asChild>
                <Link href="/legal/privacy">Privacy</Link>
              </SheetClose>
              <SheetClose asChild>
                <Link href="/legal/terms">Terms</Link>
              </SheetClose>
            </>
          ) : (
            <>
              <Link href="/legal/privacy">Privacy</Link>
              <Link href="/legal/terms">Terms</Link>
            </>
          )}
          <Button type="button" variant="ghost" onClick={() => void signOut().then(() => router.replace("/sign-in"))}>
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
            <span>Sign out</span>
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className={shellClass}>
      <aside className="sidebar">
        {renderSidebarContent("desktop")}
      </aside>
      <main className="app-main">
        <header className="topbar">
          <Sheet>
            <SheetTrigger asChild>
              <Button className="mobile-menu-button" variant="outline" size="icon" aria-label="Open navigation">
                <MenuIcon aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent className="mobile-sidebar-content" side="left">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>Primary app navigation, recent chats, plan status, and account actions.</SheetDescription>
              </SheetHeader>
              <div className="sidebar mobile-sidebar">
                {renderSidebarContent("mobile")}
              </div>
            </SheetContent>
          </Sheet>
          <div className="topbar-title">{title}</div>
          {path.includes("/app/explore") ? <div className="topbar-search">Search drugs, trials...</div> : null}
          {path.includes("/app/ask") ? <Link className="button-link compact" href="/app/ask">New chat</Link> : null}
          <Button
            type="button"
            variant="outline"
            className="topbar-theme"
            title={theme === "dark" ? "Use light mode" : "Use dark mode"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            <ThemeIcon data-icon="inline-start" aria-hidden="true" />
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
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
