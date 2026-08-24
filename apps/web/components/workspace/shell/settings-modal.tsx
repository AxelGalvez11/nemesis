"use client";

// Settings popup — the sidebar footer gear and the Study-page gear both open the
// full SettingsSurface (appearance/account/billing/usage/about) in a modal over
// the current page, matching how the desktop app opens Settings in-app. The open
// state lives here and is shared across the shell↔page boundary via context.

import { createContext, useContext, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/desktop-ui/dialog";
import { SettingsSurface, type SettingsSection } from "@/components/SettingsSurface";

interface SettingsModalValue {
  openSettings: (section?: SettingsSection) => void;
}

const SettingsModalContext = createContext<SettingsModalValue | null>(null);

/** Open the settings popup from anywhere inside the workspace shell. A no-op
 *  outside the provider (e.g. an isolated component preview) so it never throws. */
export function useSettingsModal(): SettingsModalValue {
  return useContext(SettingsModalContext) ?? { openSettings: () => {} };
}

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<SettingsSection>("general");

  const openSettings = (section: SettingsSection = "general") => {
    setInitialSection(section);
    setOpen(true);
  };

  return (
    <SettingsModalContext.Provider value={{ openSettings }}>
      {children}
      <Dialog onOpenChange={setOpen} open={open}>
        {/* 🔴 SMALLER ON PURPOSE. It was 64rem × 48rem — 1024×768, a window the size of a laptop
            screen holding eleven rows of preferences, so every page opened mostly empty and the
            controls sat a hand's width from their labels. The reference measures 680×600
            (2026-08-24); 48rem × 40rem is that shape with a little more room for the sections
            Nemesis has and ChatGPT does not (Apps, Memory, Usage). */}
        <DialogContent className="h-[min(86dvh,40rem)] w-[min(48rem,calc(100vw-2rem))] max-h-none max-w-none gap-0 overflow-hidden rounded-2xl p-0 max-sm:h-[100dvh] max-sm:w-screen max-sm:rounded-none" showCloseButton>
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">Configure Nemesis preferences, appearance, usage, billing, storage, and security.</DialogDescription>
          <SettingsSurface initialSection={initialSection} />
        </DialogContent>
      </Dialog>
    </SettingsModalContext.Provider>
  );
}
