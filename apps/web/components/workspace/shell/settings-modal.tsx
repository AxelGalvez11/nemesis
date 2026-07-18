"use client";

// Settings popup — the sidebar footer gear and the Study-page gear both open the
// full SettingsSurface (appearance/account/billing/usage/about) in a modal over
// the current page, matching how the desktop app opens Settings in-app. The open
// state lives here and is shared across the shell↔page boundary via context.

import { createContext, useContext, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/desktop-ui/dialog";
import { SettingsSurface } from "@/components/SettingsSurface";

interface SettingsModalValue {
  openSettings: () => void;
}

const SettingsModalContext = createContext<SettingsModalValue | null>(null);

/** Open the settings popup from anywhere inside the workspace shell. A no-op
 *  outside the provider (e.g. an isolated component preview) so it never throws. */
export function useSettingsModal(): SettingsModalValue {
  return useContext(SettingsModalContext) ?? { openSettings: () => {} };
}

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <SettingsModalContext.Provider value={{ openSettings: () => setOpen(true) }}>
      {children}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="w-full max-w-3xl gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <div className="max-h-[85vh] overflow-y-auto">
            <SettingsSurface />
          </div>
        </DialogContent>
      </Dialog>
    </SettingsModalContext.Provider>
  );
}
