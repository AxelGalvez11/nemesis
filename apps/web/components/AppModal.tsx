"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";

/**
 * Shell-styled modal overlay. Built on the Radix Dialog primitive (focus trap, Esc-to-close, scroll
 * lock, portal a11y) but styled entirely with the app's OWN design tokens (var(--raised)/--line-2/…)
 * via .app-modal* in shell.css — NOT the Tailwind `bg-popover` chrome of ui/dialog.tsx — so an app
 * overlay matches the rest of the shell (cards, account menu) instead of clashing.
 *
 * Controlled: the shell owns `open`; Esc, an overlay click, and the × button all route through
 * onOpenChange → onClose. `aria-describedby={undefined}` opts out of Radix's description warning
 * (our panels supply their own copy and don't need a single description node).
 */
export function AppModal({
  open,
  onClose,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="app-modal-overlay" />
        <DialogPrimitive.Content className="app-modal" aria-describedby={undefined}>
          <div className="app-modal-head">
            <div>
              <DialogPrimitive.Title className="app-modal-title">{title}</DialogPrimitive.Title>
              {sub ? <div className="app-modal-sub">{sub}</div> : null}
            </div>
            <DialogPrimitive.Close className="app-modal-close" aria-label="Close">×</DialogPrimitive.Close>
          </div>
          <div className="app-modal-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
