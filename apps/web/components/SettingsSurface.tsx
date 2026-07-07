"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme, type ThemePreference } from "@/components/theme-provider";
import { Icon } from "@/components/icons";
import { ProfilePanel } from "@/components/ProfilePanel";
import { BillingPanel } from "@/components/BillingPanel";
import { DataSourcesPanel } from "@/components/DataSourcesPanel";
import { CreditsBreakdown } from "@/components/CreditsPanel";
import { buildCreditsSummary, type CreditsSummary } from "@pharmabro/shared";
import { fetchEntitlements, fetchMissions, fetchUsage, fetchWatches } from "@/lib/api";

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export type SettingsSection = "general" | "account" | "billing" | "usage" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "account", label: "Account", icon: "user" },
  { id: "billing", label: "Billing", icon: "card" },
  { id: "usage", label: "Usage", icon: "card" },
  { id: "about", label: "About", icon: "shield" },
];

/**
 * The single Settings surface (Anthropic-style: a left section nav + the active section's content).
 * Consolidates what used to be three separate panels/overlays/routes — Settings, Profile, Billing —
 * into one place. Account = the existing ProfilePanel; Billing = the existing BillingPanel; General
 * holds appearance (theme); About is the disclaimer. Rendered both in the account-menu modal
 * (AppShell) and on the /app/settings route.
 */
export function SettingsSurface({ initialSection = "general", checkoutStatus }: { initialSection?: SettingsSection; checkoutStatus?: string }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Credits summary for the Usage section. Fetched when that section is shown; each call degrades to
  // null/empty so one failure never blanks the panel (same graceful pattern as the topbar modal).
  const [credits, setCredits] = useState<CreditsSummary | null>(null);

  useEffect(() => {
    if (section !== "usage") return;
    let alive = true;
    setCredits(null);
    void Promise.all([
      fetchEntitlements().catch(() => null),
      fetchUsage().catch(() => null),
      fetchWatches().catch(() => null),
      fetchMissions().catch(() => null),
    ]).then(([snapshot, usage, watches, missions]) => {
      if (!alive) return;
      setCredits(
        buildCreditsSummary({
          snapshot,
          usage,
          watchCount: watches ? watches.length : null,
          missionCount: missions ? missions.length : null,
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [section]);
  const { preference, setTheme } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <div className="settings-surface">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? "active" : ""}
            aria-current={section === s.id ? "page" : undefined}
            onClick={() => setSection(s.id)}
          >
            <Icon name={s.icon} size={16} />
            {s.label}
          </button>
        ))}
      </nav>

      <div className="settings-body">
        {section === "general" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>Appearance</h2>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>Choose how PharmaOrb looks. Saved on this device.</p>
            <div className="theme-grid">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-card${preference === t.id ? " active" : ""}`}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={preference === t.id}
                >
                  <span className="theme-swatch" data-theme-preview={t.id} aria-hidden="true">
                    <span className="tp-rail" />
                    <span className="tp-page"><span className="tp-line" /><span className="tp-line short" /><span className="tp-dot" /></span>
                  </span>
                  <span className="theme-card-foot">
                    {t.label}
                    {preference === t.id ? <Icon name="check" size={14} /> : null}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {section === "account" ? (
          <>
            <ProfilePanel />
            <div className="action-row">
              <button className="secondary" onClick={() => void signOut().then(() => router.replace("/sign-in"))}>Sign out</button>
            </div>
          </>
        ) : null}

        {section === "billing" ? <BillingPanel checkoutStatus={checkoutStatus} /> : null}

        {section === "usage" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>Usage</h2>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>What you've used today and the slots you hold. Display only — nothing here charges you.</p>
            {credits ? <CreditsBreakdown summary={credits} /> : <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
          </section>
        ) : null}

        {section === "about" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>About</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              PharmaOrb gives source-grounded, cited answers. Every medical claim traces to a real source. Educational use only — not a substitute for professional medical advice.
            </p>
            <button type="button" className="mode watch-add-btn" style={{ marginTop: 12 }} onClick={() => setSourcesOpen(true)}>
              <Icon name="shield" size={14} /> View data sources
            </button>
            <DataSourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
