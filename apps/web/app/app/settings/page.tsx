import { PageHeader } from "@/components/ui";
import { SettingsSurface, type SettingsSection } from "@/components/SettingsSurface";

const SECTIONS = ["general", "account", "billing", "about"] as const;

// One consolidated Settings surface (Anthropic-style left section nav). The old /app/profile and
// /app/billing routes now redirect here with ?section=, so direct URLs still land on the right place.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string; checkout?: string }> }) {
  const { section, checkout } = await searchParams;
  const initial: SettingsSection = (SECTIONS as readonly string[]).includes(section ?? "")
    ? (section as SettingsSection)
    : "general";
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
      <PageHeader title="Settings">Appearance, account, billing, and answer preferences.</PageHeader>
      <SettingsSurface initialSection={initial} checkoutStatus={checkout} />
    </div>
  );
}
