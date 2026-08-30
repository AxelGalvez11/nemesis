"use client";

// ChatSidebar — desktop app/chat/sidebar/index.tsx, student-build render path.
// Nav (New chat / Study / Library / Calendar), search, Pinned +
// Sessions sections, account footer. Class strings are verbatim transplants.

import { usePathname, useRouter } from "next/navigation";
import { IconSearch, IconX } from "@tabler/icons-react";
import { PanelLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { fetchEntitlements } from "@/lib/api";
import { planLabel } from "@/lib/billing-contract";
import { useAuth } from "@/components/AuthProvider";
import type { SettingsSection } from "@/components/SettingsSurface";
import { cn } from "@/lib/utils";

// SidebarBlankState is no longer imported: it existed to offer "New chat" when the rail had no
// threads, and starting a chat is not something this product does any more. The component stays
// in section-states.tsx — unused, not deleted — because the rail's own history section is one
// constant away from coming back.
import { SidebarNoMatchState, SidebarSessionsEmptyState } from "./section-states";
import { useSettingsModal } from "./settings-modal";
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
import { SidebarCanvases } from "./sidebar-canvases";
import { navigationRootFor, navItemActive, SIDEBAR_NAV, NAV_ICON_PX } from "@/lib/workspace/sidebar-nav";


// 🔴 THE SIDEBAR IS DESTINATIONS **PLUS THE LEARNER'S OWN CANVASES** (owner 2026-08-25:
// "I would like the chats or canvases to accumulate on the left sidebar, like it does in
// ChatGPT… and the user can create folders for the canvases"). This REVERSES §L (owner
// 2026-08-13, "destinations, not content") — deliberately, by the same owner, asked again
// with the old rule read back and confirmed. The 8-13 worry ("a giant chronological dump…
// they're managing BODIES OF KNOWLEDGE") is answered by structure rather than absence:
// pinned first, then the learner's own folders, then recents — the folder tree IS the body
// of knowledge, in the rail. See sidebar-canvases.tsx for the list itself; with the list
// living here, /library stops being the canvas manager and becomes the home of outputs.
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
// 🔴 THE ARRAY ITSELF NOW LIVES IN lib/workspace/sidebar-nav.ts, because the collapsed rail draws
// the same four destinations as icons and a second copy would eventually disagree with this one.
// The reasoning above is why these four; the module is only where they are written down.

interface ChatSidebarProps {
  sidebarOpen: boolean;
  accountEmail: string;
  onCollapse: () => void;
  onNavigate?: () => void;
}

export function ChatSidebar({ sidebarOpen, accountEmail, onCollapse, onNavigate }: ChatSidebarProps) {
  const router = useRouter();
  const { openSettings } = useSettingsModal();
  const pathname = usePathname();
  const navigationRoot = navigationRootFor(pathname);

  const navigate = (destination: string) => {
    router.push(destination);
    onNavigate?.();
  };

  // The list below the nav is CANVASES — the product's real object — not the deleted chat
  // Sessions product this rail listed before 2026-08-10. Same data layer as everything else
  // (canvas-store), no second system.

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
      <SidebarContent className="gap-0 overflow-hidden bg-transparent px-[var(--nav-row-inset)]">
        {/* 🔴 THE BRAND BAND IS 52px AND ITS CONTROLS ARE 36px. It was `h-9` — which reads as 36 and
            is 40.5 at this root font — carrying two `size="icon-xs"` buttons that measured 27×27
            with 13.5px glyphs, against the reference's 36×36 with 20px glyphs. The glyph was the
            worst of it: the code already asked for 20 (`size={NAV_ICON_PX}`) and the `icon-xs`
            variant silently overrode it with `[&_svg:not([class*='size-'])]:size-3`. The explicit
            number never applied, so making it larger would have changed nothing.
            🔴 EVERY ICON HERE CARRIES ITS OWN `size-` CLASS, and that is load-bearing rather than
            stylistic: the Button base ends in `[&_svg:not([class*='size-'])]:size-4`, so an icon
            without one is silently resized to 18px. Naming the size is what opts out of that. */}
        <div className="flex h-[var(--shell-header-height)] shrink-0 items-center gap-0 px-[calc(var(--shell-header-inset)-var(--nav-row-inset))]">
          {/* Sits 10px in from the band, matching a nav row's text, so the wordmark and the labels
              below it share one left edge instead of nearly sharing one. */}
          <span className="min-w-0 flex-1 truncate px-[var(--nav-row-pad-x)] text-[length:var(--brand-wordmark-size)] font-semibold tracking-[0.13em] text-foreground">NEMESIS</span>
          {/* Same panel-left glyph as the reopen toggle (UX brief §27.1): one icon means "the
              sidebar", and the direction is carried by where the control is, not by the drawing. */}
          <Button
            aria-label="Collapse sidebar"
            className="size-[var(--shell-icon-button)] rounded-[var(--shell-icon-button-radius)]"
            onClick={onCollapse}
            size="icon"
            variant="ghost"
          >
            <PanelLeft className="size-[var(--nav-icon-size)]" strokeWidth={2} />
          </Button>
        </div>

        {/* Nav list — starts below the brand band. */}
        <SidebarGroup className="shrink-0 p-0 pb-2 pt-1">
          <SidebarGroupContent>
            {/* Rows stack flush. `gap-px` made the pitch 37px against a 36px row, so a column of
                five drifted a clean 5px away from the reference's rhythm. */}
            <SidebarMenu className="gap-0">
              {SIDEBAR_NAV.map((item) => {
                const destination = item.route ? `${navigationRoot}${item.route}` : null;
                const active = navItemActive(pathname, destination);

                return (
                  <SidebarMenuItem className="flex items-center gap-0" key={item.id}>
                    <SidebarMenuButton
                      className={cn(
                        // 🔴 THESE FOUR NUMBERS PUT THE LABEL AT x=42. Row inset 6 + padding 10
                        // lands the 20px icon at 16, and a 6px gap lands the text at 42 — the
                        // reference's exact text column. It was 11.25 + 9 + 20 + 9 = 50.3, which is
                        // why every label sat visibly further from the edge than it should.
                        // The `-1px` pays for the transparent border on the next line, which is
                        // real layout: it reserves the ring the active state paints, so without
                        // the subtraction every icon and label sat one pixel right of target.
                        "flex h-[var(--nav-row-height)] min-w-0 flex-1 justify-start gap-[var(--nav-icon-gap)] rounded-[var(--nav-row-radius)] border border-transparent px-[calc(var(--nav-row-pad-x)-1px)] text-left text-[length:var(--canvas-text-small)] font-medium text-foreground transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:transition-none",
                        active &&
                          "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground shadow-none hover:border-(--ui-stroke-tertiary)!",
                      )}
                      onClick={() => { if (destination) navigate(destination); }}
                    >
                      <Codicon
                        // Full strength, matching the label beside it (owner 2026-08-15: "icons need
                        // to be full white like chatgpt. its not cloning its just 100% that everyone
                        // uses"). The 72% mix made every destination read as slightly disabled.
                        className="nav-icon-tilt leading-none shrink-0"
                        name={item.codicon}
                        size={`${NAV_ICON_PX}px`}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarCanvases onNavigate={onNavigate} />

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

  // 🔴 THIS BADGE USED TO BE THE LITERAL STRING "Student", AND IT WAS ON EVERY
  // SCREEN. It never read a plan at all, so it went on naming a tier that was
  // withdrawn — to free users, to paying users, and to internal accounts alike.
  // Found on production, in the sidebar, after the pricing page had already been
  // switched over. A hardcoded plan name is not a default; it is a wrong answer
  // that cannot be corrected by fixing billing.
  //
  // Renders nothing until the plan is known, because a placeholder here is
  // indistinguishable from a claim.
  const [plan, setPlan] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchEntitlements()
      .then((snapshot) => { if (alive) setPlan(snapshot.plan); })
      .catch(() => { /* the badge simply stays absent; it is not worth an error */ });
    return () => { alive = false; };
  }, []);

  return (
    <SidebarFooter className="sticky bottom-0 shrink-0 gap-1 border-t border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-[var(--nav-row-inset)] py-2">
      <div className="flex min-w-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Same inset and corner as a nav row, so the account reads as the bottom of the same
                column rather than a differently-shaped control that happens to sit under it. */}
            <Button aria-label="Account menu" className="min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-[var(--nav-row-radius)] px-1.5 py-1 text-left text-foreground transition-colors duration-100 ease hover:bg-(--ui-control-hover-background) active:scale-[0.99] motion-reduce:active:scale-100" size="sm" variant="ghost">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--ui-bg-quaternary) text-[length:var(--canvas-text-meta)] font-semibold uppercase text-(--ui-text-secondary) shadow-[inset_0_0_0_1px_var(--ui-stroke-tertiary)]">{accountInitial}</span>
              <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-meta)] font-medium">{accountEmail || "Sign in"}</span>
              {plan ? (
                <span className="max-w-20 shrink truncate rounded-full bg-(--theme-primary)/15 px-1.5 py-0.5 text-[length:var(--canvas-text-meta)] font-semibold text-(--theme-primary)">{planLabel(plan)}</span>
              ) : null}
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
