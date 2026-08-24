"use client";

// Sidebar shell primitives — the desktop's `collapsible="none"` render path
// (components/ui/sidebar.tsx early-return branch) plus the shared row chrome
// from app/chat/sidebar/chrome.tsx and the panel label from
// app/shell/sidebar-label.tsx. Class strings are verbatim transplants.

import type * as React from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { DisclosureCaret } from "@/components/desktop-ui/disclosure-caret";
import { RowButton } from "@/components/desktop-ui/row-button";
import { cn } from "@/lib/utils";

// ── Sidebar container primitives (collapsible="none" branch) ────────────────

export function Sidebar({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground", className)}
      data-slot="sidebar"
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto", className)}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-2 p-2", className)} data-sidebar="footer" data-slot="sidebar-footer" {...props} />
  );
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full text-[length:var(--canvas-text-small)]", className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

// Desktop sidebarMenuButtonVariants base + default size — ChatSidebar's row
// className merges over this exactly like the desktop (twMerge semantics), so
// surviving base classes (items-center, overflow-hidden, py-2, active:*) match.
const SIDEBAR_MENU_BUTTON_BASE = cn(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-[length:var(--canvas-text-small)] ring-sidebar-ring outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  "h-8 text-[length:var(--canvas-text-small)]",
);

/** Nav-row button — the desktop base merged under the caller's className. */
export function SidebarMenuButton({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(SIDEBAR_MENU_BUTTON_BASE, className)}
      data-sidebar="menu-button"
      data-slot="sidebar-menu-button"
      type={type}
      {...props}
    />
  );
}

// ── Panel label (app/shell/sidebar-label.tsx) ───────────────────────────────

export function SidebarPanelLabel({ children }: { children: React.ReactNode }) {
  return (
    // Sentence case, normal letter spacing (owner 2026-07-31, ChatGPT as the
    // reference). UPPERCASE at 0.16em tracking is louder than the chat titles
    // underneath it, which inverts the hierarchy: the label is scaffolding,
    // the titles are the content.
    //
    // 🔴 THE SIZE IS MEASURED, NOT CHOSEN. Same reference, read off the live page 2026-08-24:
    // 14px / weight 500 / rgb(143,143,143) — the SAME size as the rows beneath it, held back to
    // scaffolding by colour and weight alone. This was 12px, which is a size below anything else
    // in the rail and read as fine print rather than as a quiet heading. Keeping the tertiary
    // grey is what stops 14px from competing with the titles.
    <span className="flex min-w-0 items-center gap-2 pl-2 text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-tertiary)">
      <span className="min-w-0 truncate leading-none">{children}</span>
    </span>
  );
}

// ── Row chrome (app/chat/sidebar/chrome.tsx) ────────────────────────────────

/** `loaded/total` when there's more on the server, else just the loaded count. */
export const countLabel = (loaded: number, total: number): string =>
  total > loaded ? `${loaded}/${total}` : String(loaded);

/** The muted count chip next to a section/workspace label. */
export function SidebarCount({ children }: { children: React.ReactNode }) {
  return <span className="text-[length:var(--canvas-text-meta)] font-medium text-(--ui-text-tertiary)">{children}</span>;
}

// Row geometry (session row is canonical — everything composes these).
const rowMinH = "min-h-[2rem]";
const rowPadX = "pl-2 pr-1";
const rowGap = "gap-1.5";
const rowLead = "grid size-3.5 shrink-0 place-items-center";
const rowInset = cn(rowPadX, rowGap, "flex h-full min-w-0 items-center self-stretch py-0.5");
/* Session titles read at full text color (owner 2026-08-05: "the text on
   sidebar is gray") — hierarchy comes from the quiet section labels, not
   from dimming every row. */
const rowLabel = "min-w-0 truncate text-[length:var(--canvas-text-small)] leading-none text-foreground";

/** Codicon size in sidebar row leads. */
export const SIDEBAR_LEAD_ICON_SIZE = "0.875rem" as const;

/** Vertical stack of rows (gap-px, single column). */
export function SidebarRowStack({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-px", className)} {...props} />;
}

/** Outer grid — sole owner of row height. */
export function SidebarRowShell({
  actions,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { actions?: React.ReactNode }) {
  return (
    <div className={cn(rowMinH, "grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md", className)} {...props}>
      {children}
      {actions ? <div className="flex shrink-0 items-center self-center">{actions}</div> : null}
    </div>
  );
}

/** Session row main tap target. */
export function SidebarRowBody({ className, ...props }: React.ComponentProps<"button">) {
  return <RowButton className={cn(rowInset, "bg-transparent text-left", className)} {...props} />;
}

/** Fixed leading column (dot, icon, drag handle). */
export function SidebarRowLead({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(rowLead, className)} {...props} />;
}

/** Standard row label typography. */
export function SidebarRowLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(rowLabel, className)} {...props} />;
}

// ── Section header (app/chat/sidebar/sessions-section.tsx) ──────────────────

// Section-header action icons stay hidden until the whole header row is
// hovered; focus-visible keeps them keyboard-reachable.
export const HEADER_ACTION_BTN =
  "text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/section:opacity-100 focus-visible:opacity-100";

interface SidebarSectionHeaderProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  collapsible?: boolean;
  /** Extra spacing for a header that follows another section rather than opening the list. */
  className?: string;
}

export function SidebarSectionHeader({
  label,
  open,
  onToggle,
  action,
  meta,
  icon,
  collapsible = true,
  className,
}: SidebarSectionHeaderProps) {
  const labelBody = (
    <>
      {icon}
      <SidebarPanelLabel>{label}</SidebarPanelLabel>
      {meta && <SidebarCount>{meta}</SidebarCount>}
    </>
  );

  return (
    <div className={cn("group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5", className)}>
      {collapsible ? (
        <button
          className="group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none"
          onClick={onToggle}
          type="button"
        >
          {labelBody}
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      ) : (
        <div className="flex w-fit items-center gap-1 leading-none">{labelBody}</div>
      )}
      {action}
    </div>
  );
}

// Scroll-behavior class tokens (app/chat/sidebar/index.tsx).
export const COMPACT_FLAT = "compact:max-h-none compact:overflow-visible";
export const SCROLL_Y = "overflow-y-auto overflow-x-hidden overscroll-contain";
export const GROUP_BODY = cn(SCROLL_Y, COMPACT_FLAT);

export { Codicon };
