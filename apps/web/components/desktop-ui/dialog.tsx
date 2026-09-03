"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/desktop-ui/button";
import { X } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-[120] pointer-events-auto bg-black/22 backdrop-blur-[0.125rem] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

type DialogBannerTone = "error" | "warn" | "info";

// Tinted, edge-to-edge bottom banner per tone. Error/warn keep their semantic
// destructive/primary tokens; info derives from the dialog's own bubble
// background so it reads as part of the themed dialog.
const DIALOG_BANNER_TONES: Record<DialogBannerTone, string> = {
  error: "bg-destructive/12 text-destructive",
  warn: "bg-primary/12 text-primary",
  info: "bg-[color-mix(in_srgb,var(--ui-chat-bubble-background),white_30%)] text-[color-mix(in_srgb,var(--ui-chat-bubble-background),black_60%)] dark:bg-[color-mix(in_srgb,var(--ui-chat-bubble-background),black_20%)] dark:text-[color-mix(in_srgb,var(--ui-chat-bubble-background),white_60%)]",
};

function DialogContent({
  className,
  bodyClassName,
  children,
  showCloseButton = true,
  fitContent = false,
  banner,
  bannerTone = "error",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  // Padding and gap for the box the children sit in.
  //
  // 🔴 IT EXISTS BECAUSE THERE ARE TWO OF THAT BOX. With a banner the children
  // are wrapped in an inner scroller that carries its own `p-4 gap-3`, and
  // `className` lands on the OUTER shell where it reaches nothing; without one
  // the padding is on the shell itself. A dialog that wants roomier insides had
  // no way to say so that held in both states, so it tightened by 8px the moment
  // a save failed. This lands on whichever element is actually the body.
  bodyClassName?: string;
  // Size the dialog to its content (capped at the viewport) instead of the
  // default fixed `max-w-lg`.
  fitContent?: boolean;
  // A dialog-level notice rendered as a banner flush to the bottom edge.
  banner?: React.ReactNode;
  bannerTone?: DialogBannerTone;
}) {
  const widthClass = fitContent ? "w-auto max-w-[92vw]" : "w-full max-w-lg";

  const closeButton = showCloseButton ? (
    <DialogPrimitive.Close asChild data-slot="dialog-close-button">
      <Button
        aria-label="Close"
        className="absolute right-2.5 top-2.5 z-20 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
        size="icon-xs"
        variant="ghost"
      >
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </Button>
    </DialogPrimitive.Close>
  ) : null;

  // With a banner, the border can't live on the scroll/clip box (it would draw a
  // line around the banner too). The body keeps its own bottom radius and sits
  // over the tinted footer; the outer shell only clips the banner to the
  // dialog's rounded bottom edge.
  if (banner) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[130] pointer-events-auto flex max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-(--ui-chat-bubble-background) text-[length:var(--conversation-text-font-size)] text-foreground shadow-nous duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            widthClass,
            className,
            // Callers often pass `gap-*` for the no-banner grid layout — suppress
            // it here so the banner can tuck under the body's rounded bottom edge.
            "gap-0",
          )}
          data-slot="dialog-content"
          data-workspace=""
          {...props}
        >
          {/* Scroll lives on an inner box so this shell keeps a painted bottom radius. */}
          <div className="relative z-10 overflow-hidden rounded-xl border border-b-0 border-(--stroke-nous) bg-(--ui-chat-bubble-background)">
            <div className={cn("grid max-h-[calc(85vh-5rem)] min-h-0 gap-3 overflow-y-auto p-4", bodyClassName)}>{children}</div>
          </div>
          <div
            className={cn(
              // Overlap by one corner radius so the bottom lobes read clearly
              // over the tint instead of meeting it on a straight seam.
              "relative z-0 -mt-[var(--radius-xl)] px-4 pb-2.5 pt-[calc(var(--radius-xl)+0.625rem)] text-center text-[length:var(--conversation-tool-font-size)] leading-relaxed shadow-[inset_0_7px_7px_-4px_rgb(0_0_0/0.28)]",
              DIALOG_BANNER_TONES[bannerTone],
            )}
            data-slot="dialog-banner"
            role={bannerTone === "error" ? "alert" : "status"}
          >
            {banner}
          </div>
          {closeButton}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          // Cap height at 85vh and let long content scroll inside the dialog
          // instead of overflowing off-screen.
          "fixed left-1/2 top-1/2 z-[130] pointer-events-auto grid max-h-[85vh] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-xl border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-4 text-[length:var(--conversation-text-font-size)] text-foreground shadow-nous duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          widthClass,
          className,
          bodyClassName,
        )}
        data-slot="dialog-content"
        data-workspace=""
        {...props}
      >
        {children}
        {closeButton}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 text-center sm:text-left", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({
  className,
  icon: Icon,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> & {
  // Pass an icon to get the canonical dialog-header glyph: a plain
  // primary-tinted icon inline with the title (no bg chip / ring).
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "text-[0.9375rem] font-semibold tracking-tight text-foreground",
        Icon && "flex items-center gap-2",
        className,
      )}
      data-slot="dialog-title"
      {...props}
    >
      {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
      {children}
    </DialogPrimitive.Title>
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn(
        "text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)",
        className,
      )}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
