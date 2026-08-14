"use client";

// ChatSidebar — desktop app/chat/sidebar/index.tsx, student-build render path.
// Nav (New chat / Study / Library / Calendar), search, Pinned +
// Sessions sections, account footer. Class strings are verbatim transplants.

import { usePathname, useRouter } from "next/navigation";
import { IconSearch, IconX } from "@tabler/icons-react";
import { PanelLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { SearchField } from "@/components/desktop-ui/search-field";
import { useAuth } from "@/components/AuthProvider";
import type { SettingsSection } from "@/components/SettingsSurface";
import { useSessions } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

// SidebarBlankState is no longer imported: it existed to offer "New chat" when the rail had no
// threads, and starting a chat is not something this product does any more. The component stays
// in section-states.tsx — unused, not deleted — because the rail's own history section is one
// constant away from coming back.
import { SidebarNoMatchState, SidebarSessionsEmptyState } from "./section-states";
import { useSettingsModal } from "./settings-modal";
import { SidebarSessionRow } from "./session-row";
import {
  countLabel,
  GROUP_BODY,
  SCROLL_Y,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRowStack,
  SidebarSectionHeader,
} from "./sidebar-primitives";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";

interface NavItem {
  id: string;
  label: string;
  codicon: string;
  route?: string;
  action?: "new-session";
}

// 🔴 THE SIDEBAR REPRESENTS DESTINATIONS, NOT CONTENT (owner 2026-08-13, §L). It is almost
// static, and that is the design rather than an unfinished state.
//
// No `Recent`. No folder tree. No canvas names. No growing list. The owner's reason is the
// constraint, not a preference: "eventually the sidebar becomes a giant chronological dump.
// Nemesis users aren't primarily trying to recover a conversation from three weeks ago. They're
// managing BODIES OF KNOWLEDGE." A rail that grows with history optimises for the wrong verb.
//
// The mental model each row answers:
//
//   New canvas  →  learn                                    (the front door)
//   Library     →  find and organise what you have learned
//   Calendar    →  when things happen / when reviews are due
//   Stats       →  what Nemesis knows about your cognition
//
// 🔴 LIBRARY IS BACK WITH A DIFFERENT MEANING. The two-surface retirement removed it as a FILE
// manager. It returns as a CANVAS manager, which is a different object: Library's primary
// objects are canvases, and a Folder organises CANVASES, not files. Restoring the row is not
// undoing that decision.
//
// Superseded: "TWO SURFACES. Canvas is what am I learning or doing; Calendar is when does it
// matter." That model had no home for managing bodies of knowledge, which is what this adds.
//
// 🔴 THE OLD LIST WAS THE OLD MENTAL MODEL (owner 2026-08-10). New chat / Study / Library /
// Calendar / Chill said "Nemesis is a suite of five tools", and made the learner's first
// decision "which tool do I want?" — a question they are not equipped to answer and should
// never be asked. Studying is not a place you go; it is what the canvas does when the evidence
// says retrieval is what this objective needs next.
//
// 🔴 THE ROWS ARE REMOVED. THE PAGES ARE NOT. Every route still resolves, every API under
// /api/library/* still serves, and no data is touched — retiring a surface and deleting an
// implementation are different operations with very different blast radii, and the audit found
// live callers that would break if they were confused:
//
//   • the SHIPPED browser extension hardcodes app.enternemesis.com/library?import=coursework
//   • /slides and the graph both navigate back to /library?note=…
//   • reader-anchor.ts documents /library/source/<id>?page=…&q=… as its deep-link format
//   • the iOS app has its own /study and /library, and push.ts routes notifications to /study
//
// Bringing any surface back is putting its row back here.
//
// Notebooks was retired the same way on 2026-07-23 and is still serving
// /api/notebooks/extract/* today, which is the precedent this follows.
const SIDEBAR_NAV: NavItem[] = [
  // The front door. `/learn` IS the minimal composer — "What do you want to learn?" with upload,
  // record and dictate — and the canvas is created automatically once the learner starts, landing
  // in `Unfiled` for them to file later. It is deliberately not a "new session" action: nothing is
  // created by pressing this, only by beginning.
  { id: "new-canvas", label: "New canvas", codicon: "add", route: "/learn" },
  { id: "library", label: "Library", codicon: "library", route: "/library" },
  { id: "calendar", label: "Calendar", codicon: "calendar", route: "/calendar" },
  { id: "stats", label: "Stats", codicon: "graph", route: "/stats" },
];

interface ChatSidebarProps {
  sidebarOpen: boolean;
  accountEmail: string;
  onCollapse: () => void;
  onNavigate?: () => void;
}

export function ChatSidebar({ sidebarOpen, accountEmail, onCollapse, onNavigate }: ChatSidebarProps) {
  const confirm = useConfirm();
  const router = useRouter();
  const { openSettings } = useSettingsModal();
  const pathname = usePathname();
  const navigationRoot = pathname.startsWith("/dev-preview/workspace/") ? "/dev-preview/workspace" : "";
  const { pinned, recents, sessions, selectedId, working, select, rename, remove, togglePin } = useSessions();

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(true);

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    if (!trimmedQuery) return null;
    const q = trimmedQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, trimmedQuery]);

  const startNewSession = () => {
    select(null);
    router.push(`${navigationRoot}/sessions`);
    onNavigate?.();
  };

  const resume = (id: string) => {
    select(id);
    router.push(`${navigationRoot}/sessions`);
    onNavigate?.();
  };

  const navigate = (destination: string) => {
    router.push(destination);
    onNavigate?.();
  };

  const confirmRemoveSession = async (id: string, title: string) => {
    if (await confirm({ body: `“${title || "New chat"}” is deleted. This can't be undone.`, title: "Delete this chat?" })) remove(id);
  };

  // 🔴 THE SIDEBAR NO LONGER LISTS CHAT THREADS (owner 2026-08-10, §31/§32).
  //
  // A chat is not a first-class object any more — a Canvas session is — and a rail full of chat
  // history says the opposite in the most visible place in the app. It also duplicated the
  // Canvas home, which reveals the learner's sessions on scroll and is where organising them
  // (pin, rename, folders, delete, search) actually lives.
  //
  // 🔴 NOTHING IS DELETED. `useSessions()` still loads, every thread still exists, and the
  // chat surface at /sessions still renders them — this is the rail declining to advertise a
  // retired object, not a migration. §26: historical data may still be needed.
  //
  // Turning this back on is changing this one constant.
  const showSessionSections = false;

  return (
    <Sidebar
      aria-hidden={!sidebarOpen}
      className={cn(
        "relative h-full min-w-0 overflow-hidden border-t-0 border-b-0 text-foreground transition-none",
        "border-r border-l-0",
        sidebarOpen
          ? "border-(--sidebar-edge-border) bg-(--ui-sidebar-surface-background) opacity-100"
          : "pointer-events-none border-transparent bg-transparent opacity-0",
      )}
      inert={!sidebarOpen}
    >
      <SidebarContent className="gap-0 overflow-hidden bg-transparent px-2.5">
        <div className="flex h-9 shrink-0 items-center gap-1 px-2 pt-1">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[0.13em] text-foreground">NEMESIS</span>
          <Button
            aria-label={searchOpen ? "Close chat search" : "Search chats"}
            onClick={() => {
              setSearchOpen((value) => !value);
              if (searchOpen) setQuery("");
            }}
            size="icon-xs"
            variant="ghost"
          >
            {searchOpen ? <IconX /> : <IconSearch />}
          </Button>
          {/* Same panel-left glyph as the reopen toggle (UX brief §27.1): one icon means "the
              sidebar", and the direction is carried by where the control is, not by the drawing. */}
          <Button aria-label="Collapse sidebar" onClick={onCollapse} size="icon-xs" variant="ghost">
            <PanelLeft size={16} strokeWidth={2} />
          </Button>
        </div>
        {searchOpen && showSessionSections && (
          <div className="shrink-0 px-2 pb-1">
            <SearchField aria-label="Search chats" onChange={setQuery} placeholder="Search chats…" value={query} />
          </div>
        )}

        {/* Nav list — starts below the brand band. */}
        <SidebarGroup className="shrink-0 p-0 pb-2 pt-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {SIDEBAR_NAV.map((item) => {
                const destination = item.route ? `${navigationRoot}${item.route}` : null;
                const active = destination ? pathname === destination || pathname.startsWith(`${destination}/`) : false;
                const isNewSession = item.action === "new-session";

                return (
                  <SidebarMenuItem className="flex items-center gap-0.5" key={item.id}>
                    <SidebarMenuButton
                      className={cn(
                        "flex h-8 min-w-0 flex-1 justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium text-foreground transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:transition-none",
                        active &&
                          "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground shadow-none hover:border-(--ui-stroke-tertiary)!",
                      )}
                      onClick={() => {
                        if (isNewSession) startNewSession();
                        else if (destination) navigate(destination);
                      }}
                    >
                      <Codicon
                        className="leading-none size-4 shrink-0 text-[color-mix(in_srgb,currentColor_72%,transparent)]"
                        name={item.codicon}
                        size="1em"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showSessionSections ? (
          <>
            <div className={cn("flex min-h-0 flex-1 flex-col pb-1.75", SCROLL_Y)}>
              {trimmedQuery && filtered ? (
                filtered.length === 0 ? (
                  <SidebarNoMatchState query={trimmedQuery} />
                ) : (
                  <SidebarRowStack className={cn("flex min-h-0 flex-1 flex-col gap-px pb-1.75", SCROLL_Y)}>
                    {filtered.map((session) => (
                      <SidebarSessionRow
                        isPinned={Boolean(session.pinned)}
                        isSelected={session.id === selectedId}
                        isWorking={Boolean(working[session.id])}
                        key={session.id}
                        onDelete={() => confirmRemoveSession(session.id, session.title)}
                        onPin={() => togglePin(session.id)}
                        onRename={(title) => rename(session.id, title)}
                        onResume={() => resume(session.id)}
                        session={session}
                      />
                    ))}
                  </SidebarRowStack>
                )
              ) : (
                <>
                  {/* Pinned */}
                  {pinned.length > 0 && <SidebarGroup className="shrink-0 p-0 pb-1">
                    <SidebarSectionHeader
                      label="Pinned"
                      onToggle={() => setPinnedOpen((v) => !v)}
                      open={pinnedOpen}
                    />
                    {pinnedOpen && (
                      <SidebarGroupContent
                        className={cn("flex max-h-44 flex-col gap-px rounded-lg pb-2 pt-1", GROUP_BODY)}
                      >
                        {pinned.map((session) => (
                            <SidebarSessionRow
                              isPinned
                              isSelected={session.id === selectedId}
                              isWorking={Boolean(working[session.id])}
                              key={session.id}
                              onDelete={() => confirmRemoveSession(session.id, session.title)}
                              onPin={() => togglePin(session.id)}
                              onRename={(title) => rename(session.id, title)}
                              onResume={() => resume(session.id)}
                              session={session}
                            />
                          ))}
                      </SidebarGroupContent>
                    )}
                  </SidebarGroup>}

                  {/* Sessions */}
                  <SidebarGroup className="min-h-32 flex-1 overflow-hidden p-0">
                    <SidebarSectionHeader
                      label="Chats"
                      meta={countLabel(recents.length, recents.length)}
                      onToggle={() => setSessionsOpen((v) => !v)}
                      open={sessionsOpen}
                    />
                    {sessionsOpen && (
                      <SidebarGroupContent className={cn("flex min-h-0 flex-1 flex-col gap-px pb-1.75", SCROLL_Y)}>
                        {recents.length === 0 ? (
                          <SidebarSessionsEmptyState allPinned={pinned.length > 0} />
                        ) : (
                          recents.map((session) => (
                            <SidebarSessionRow
                              isPinned={false}
                              isSelected={session.id === selectedId}
                              isWorking={Boolean(working[session.id])}
                              key={session.id}
                              onDelete={() => confirmRemoveSession(session.id, session.title)}
                              onPin={() => togglePin(session.id)}
                              onRename={(title) => rename(session.id, title)}
                              onResume={() => resume(session.id)}
                              session={session}
                            />
                          ))
                        )}
                      </SidebarGroupContent>
                    )}
                  </SidebarGroup>
                </>
              )}
            </div>
          </>
        ) : null}
      </SidebarContent>

      <StudentSidebarFooter accountEmail={accountEmail} onOpenSettings={openSettings} />
    </Sidebar>
  );
}

function StudentSidebarFooter({
  accountEmail,
  onOpenSettings,
}: {
  accountEmail: string;
  onOpenSettings: (section?: SettingsSection) => void;
}) {
  const accountInitial = (accountEmail?.[0] ?? "N").toUpperCase();
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <SidebarFooter className="sticky bottom-0 shrink-0 gap-1 border-t border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Account menu" className="min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-md px-1.5 py-1 text-left text-foreground transition-colors duration-100 ease hover:bg-(--ui-control-hover-background) active:scale-[0.99] motion-reduce:active:scale-100" size="sm" variant="ghost">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--ui-bg-quaternary) text-[0.65rem] font-semibold uppercase text-(--ui-text-secondary) shadow-[inset_0_0_0_1px_var(--ui-stroke-tertiary)]">{accountInitial}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{accountEmail || "Sign in"}</span>
              <span className="max-w-20 shrink truncate rounded-full bg-(--theme-primary)/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-(--theme-primary)">Student</span>
              <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="chevron-up" size="0.8rem" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52" side="top" sideOffset={8}>
            <DropdownMenuItem onSelect={() => router.push("/pricing")}><Codicon name="sparkle" size="0.85rem" /> Upgrade plan</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenSettings("appearance")}><Codicon name="symbol-color" size="0.85rem" /> Appearance</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenSettings("general")}><Codicon name="settings-gear" size="0.85rem" /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Codicon name="question" size="0.85rem" /> Help</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44" sideOffset={6}>
                <DropdownMenuItem onSelect={() => router.push("/legal/terms")}><Codicon name="law" size="0.85rem" /> Terms of service</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/legal/privacy")}><Codicon name="shield" size="0.85rem" /> Privacy policy</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { window.location.href = "mailto:support@enternemesis.com?subject=Nemesis%20bug%20report"; }}><Codicon name="bug" size="0.85rem" /> Report a bug</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => void signOut().then(() => router.replace("/sign-in"))}><Codicon name="sign-out" size="0.85rem" /> Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarFooter>
  );
}
