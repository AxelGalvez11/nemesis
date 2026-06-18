"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SettingsPanel } from "@/components/SettingsPanel";

// Full-page Settings (direct URL). The same SettingsPanel also renders inside the account-menu overlay
// (AppShell); here cross-links route, in the overlay they switch overlays.
export default function SettingsPage() {
  const router = useRouter();
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
      <PageHeader title="Settings" eyebrow="Preferences">
        Appearance, account, and answer preferences.
      </PageHeader>
      <SettingsPanel onNavigate={(t) => router.push(`/app/${t}`)} />
    </div>
  );
}
