"use client";

// ChatSidebar — desktop app/chat/sidebar/index.tsx, student-build render path.
// Nav (New chat / Study / Library / Calendar), search, Pinned +
// Sessions sections, account footer. Class strings are verbatim transplants.

import { usePathname, useRouter } from "next/navigation";
import { IconLayoutSidebarLeftCollapse, IconSearch, IconX } from "@tabler/icons-react";
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

import { SidebarBlankState, SidebarNoMatchState, SidebarSessionsEmptyState } from "./section-states";
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

// Student-build nav (STUDENT_HIDDEN_NAV already applied): exact order.
//
// Notebooks is RETIRED (owner 2026-07-23), not deleted: lecture slides and
// school documents belong in the Library, and the chat composer's "+ → Library"
// picker is how a thread reaches them now. The route, its store and both
// /api/notebooks/extract/* endpoints all stay — the extract endpoints are still
// what reads a PDF/DOCX/PPTX dropped straight onto the composer. Bringing the
// surface back is putting this one row back.
const SIDEBAR_NAV: NavItem[] = [
  { id: "new-session", label: "New chat", codicon: "robot", action: "new-session" },
  { id: "study", label: "Study", codicon: "mortar-board", route: "/study" },
  { id: "library", label: "Library", codicon: "book", route: "/library" },
  { id: "calendar", label: "Calendar", codicon: "calendar", route: "/calendar" },
  // Owner 2026-08-04: "brain break" page (named Chill) — daily games,
  // deliberately last so the work surfaces stay first in the eye line.
  { id: "chill", label: "Chill", codicon: "coffee", route: "/chill" },
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

  const showSessionSections = sessions.length > 0;

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
          <Button aria-label="Collapse sidebar" onClick={onCollapse} size="icon-xs" variant="ghost">
            <IconLayoutSidebarLeftCollapse />
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
                        "flex h-7 min-w-0 flex-1 justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium text-(--ui-text-secondary) transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none",
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
        ) : (
          <SidebarBlankState onNewSession={startNewSession} />
        )}
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
            <Button aria-label="Account menu" className="min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-md px-1.5 py-1 text-left text-(--ui-text-secondary) transition-colors duration-100 ease hover:bg-(--ui-control-hover-background) hover:text-foreground active:scale-[0.99] motion-reduce:active:scale-100" size="sm" variant="ghost">
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
