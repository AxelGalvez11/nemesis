"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/icons";
import { ProfilePanel } from "@/components/ProfilePanel";
import { BillingPanel } from "@/components/BillingPanel";

const MODES = ["Evidence", "Deep research", "Literature review", "Meta-analysis"] as const;

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
 * holds appearance + answer preferences; About is the disclaimer. Rendered both in the account-menu
 * modal (AppShell) and on the /app/settings route.
 */
export function SettingsSurface({ initialSection = "general" }: { initialSection?: SettingsSection }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const [defaultMode, setDefaultMode] = useState<string>("Evidence");
  const [healthContext, setHealthContext] = useState(false);

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
          <>
            <section className="card">
              <h2 style={{ marginBottom: 4 }}>Appearance</h2>
              <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Choose how PharmaOrb looks. Your choice is saved on this device.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(["light", "grey", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={theme === t ? "" : "secondary"}
                    style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "capitalize" }}
                  >
                    <Icon name={t === "light" ? "sun" : "moon"} size={15} />{t}
                    {theme === t ? <Icon name="check" size={14} /> : null}
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 style={{ marginBottom: 4 }}>Answer preferences</h2>
              <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Default mode for new questions. Advanced modes are rolling out.</p>
              <div className="chip-row">
                {MODES.map((m) => (
                  <button key={m} className={m === defaultMode ? "chip-action active" : "chip-action"} onClick={() => setDefaultMode(m)}>
                    {m}{m === "Evidence" ? "" : " · soon"}
                  </button>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, cursor: "pointer", width: "fit-content" }}>
                <input type="checkbox" checked={healthContext} onChange={(e) => setHealthContext(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--acid)" }} />
                <span style={{ fontSize: 13 }}>Use my health context to tailor answers (when provided)</span>
              </label>
            </section>
          </>
        ) : null}

        {section === "account" ? (
          <>
            <ProfilePanel />
            <div className="action-row">
              <button className="secondary" onClick={() => void signOut().then(() => router.replace("/sign-in"))}>Sign out</button>
            </div>
          </>
        ) : null}

        {section === "billing" ? <BillingPanel /> : null}

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
