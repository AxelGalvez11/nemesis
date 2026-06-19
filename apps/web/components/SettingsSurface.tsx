"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/icons";
import { ProfilePanel } from "@/components/ProfilePanel";
import { BillingPanel } from "@/components/BillingPanel";

const THEME_OPTIONS: { id: "light" | "grey" | "dark"; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "grey", label: "Grey" },
  { id: "dark", label: "Dark" },
];

export type SettingsSection = "general" | "account" | "billing" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "account", label: "Account", icon: "user" },
  { id: "billing", label: "Billing", icon: "card" },
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
  const { theme, setTheme } = useTheme();
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
                  className={`theme-card${theme === t.id ? " active" : ""}`}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={theme === t.id}
                >
                  <span className="theme-swatch" data-theme-preview={t.id} aria-hidden="true">
                    <span className="tp-rail" />
                    <span className="tp-page"><span className="tp-line" /><span className="tp-line short" /><span className="tp-dot" /></span>
                  </span>
                  <span className="theme-card-foot">
                    {t.label}
                    {theme === t.id ? <Icon name="check" size={14} /> : null}
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

        {section === "about" ? (
          <section className="card">
            <h2 style={{ marginBottom: 4 }}>About</h2>
            <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              PharmaOrb gives source-grounded, cited answers. Every medical claim traces to a real source. Educational use only — not a substitute for professional medical advice.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
