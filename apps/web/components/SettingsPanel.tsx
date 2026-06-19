"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/icons";
import { fetchEntitlements, fetchUsage } from "@/lib/api";

const MODES = ["Evidence", "Deep research", "Literature review", "Meta-analysis"] as const;

/**
 * Settings content (Appearance / Answer preferences / Account / About), with NO page header — the host
 * supplies the heading (the route page's <h1>, or the AppModal's title bar). Cross-links go through
 * `onNavigate`: in a modal the shell switches overlays; on the route page it router.push-es. Reused by
 * both /app/settings (full page) and the account-menu Settings overlay.
 */
export function SettingsPanel({ onNavigate }: { onNavigate: (target: "profile" | "billing") => void }) {
  const { session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [plan, setPlan] = useState<{ plan: string; used: number; limit: number } | null>(null);
  const [defaultMode, setDefaultMode] = useState<string>("Evidence");
  const [healthContext, setHealthContext] = useState(false);

  useEffect(() => {
    if (!session) return;
    void Promise.all([fetchEntitlements(), fetchUsage()])
      .then(([ent, usage]) => {
        const ask = usage.counters.ask_daily;
        setPlan({ plan: ent.plan, used: ask?.used ?? 0, limit: ask?.limit ?? Number(ent.entitlements.ask_daily_limit ?? 10) });
      })
      .catch(() => {});
  }, [session]);

  const email = session?.user.email ?? "preview@pharmaorb.app";

  return (
    <>
      {/* Appearance */}
      <section className="card">
        <h3 style={{ marginBottom: 4 }}>Appearance</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Choose how PharmaOrb looks. Your choice is saved on this device.</p>
        <div style={{ display: "flex", gap: 10 }}>
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

      {/* Answer preferences */}
      <section className="card">
        <h3 style={{ marginBottom: 4 }}>Answer preferences</h3>
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

      {/* Account */}
      <section className="card">
        <h3 style={{ marginBottom: 12 }}>Account</h3>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{email}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {plan ? `${plan.plan} plan · ${plan.used}/${plan.limit} questions today` : "Loading plan…"}
            </div>
          </div>
          <button className="button-link" onClick={() => onNavigate("billing")}>{plan?.plan === "plus" ? "Manage plan" : "Upgrade"}</button>
        </div>
        <div className="action-row">
          <button className="secondary" onClick={() => onNavigate("profile")}>Profile &amp; data</button>
          <button className="secondary" onClick={() => void signOut().then(() => router.replace("/sign-in"))}>Sign out</button>
        </div>
      </section>

      {/* About */}
      <section className="card">
        <h3 style={{ marginBottom: 4 }}>About</h3>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          PharmaOrb gives source-grounded, cited answers. Every medical claim traces to a real source. Educational use only — not a substitute for professional medical advice.
        </p>
      </section>
    </>
  );
}
