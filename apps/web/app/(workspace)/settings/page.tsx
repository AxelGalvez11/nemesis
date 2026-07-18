"use client";

// Workspace Settings route — renders the full settings surface (appearance,
// account, billing, usage, about) inside the desktop-parity shell, so the
// sidebar and Study gears open real settings instead of bouncing to the
// account/billing portal. Mirrors how the desktop app opens Settings in-app.

import { SettingsSurface } from "@/components/SettingsSurface";

export default function WorkspaceSettingsPage() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <SettingsSurface />
    </div>
  );
}
