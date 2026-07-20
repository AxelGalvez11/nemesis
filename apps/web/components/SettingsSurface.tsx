"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BillingPanel } from "@/components/BillingPanel";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useAuth } from "@/components/AuthProvider";
import { useTheme, type AccentPreference, type ThemePreference } from "@/components/theme-provider";
import { fetchEntitlements, fetchMissions, fetchUsage, fetchWatches } from "@/lib/api";
import { cn } from "@/lib/utils";
import { buildCreditsSummary, type CreditsSummary } from "@nemesis/shared";

export type SettingsSection =
  | "general"
  | "notifications"
  | "appearance"
  | "usage"
  | "voice"
  | "billing"
  | "storage"
  | "security"
  | "keyboard";

type Frequency = "more" | "default" | "less";

interface AssistantPreferences {
  language: string;
  baseStyle: string;
  headersAndLists: Frequency;
  emoji: Frequency;
  pet: string;
  nickname: string;
  occupation: string;
  studyReminders: boolean;
  productUpdates: boolean;
  voice: string;
  voiceSpeed: number;
}

const PREFERENCES_STORAGE_KEY = "nemesis.web.settings";
const DEFAULT_PREFERENCES: AssistantPreferences = {
  language: "English",
  baseStyle: "Clear and direct",
  headersAndLists: "default",
  emoji: "less",
  pet: "",
  nickname: "",
  occupation: "",
  studyReminders: true,
  productUpdates: false,
  voice: "Juniper",
  voiceSpeed: 1,
};

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings-gear" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "appearance", label: "Appearance", icon: "symbol-color" },
  { id: "usage", label: "Usage", icon: "pulse" },
  { id: "voice", label: "Voice", icon: "unmute" },
  { id: "billing", label: "Billing", icon: "credit-card" },
  { id: "storage", label: "Storage", icon: "database" },
  { id: "security", label: "Security & login", icon: "lock" },
  { id: "keyboard", label: "Keyboard (shortcuts)", icon: "keyboard" },
];

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const ACCENT_OPTIONS: { id: AccentPreference; label: string; color: string }[] = [
  { id: "crimson", label: "Crimson", color: "#e11d48" },
  { id: "blue", label: "Blue", color: "#2563eb" },
  { id: "green", label: "Green", color: "#16865c" },
  { id: "orange", label: "Orange", color: "#d26324" },
  { id: "purple", label: "Purple", color: "#7c4dca" },
];

const SELECT_CLASS = "h-9 min-w-44 rounded-lg border border-(--ui-stroke-secondary) bg-background px-3 text-xs text-foreground outline-none focus:border-(--theme-primary)";
const KEYBOARD_SHORTCUTS: Array<[string, string]> = [
  ["New session", "⌘ N"],
  ["Search", "⌘ K"],
  ["Send message", "Return"],
  ["New line", "Shift Return"],
  ["Toggle sidebar", "⌘ \\"],
  ["Open settings", "⌘ ,"],
];

export function SettingsSurface({ initialSection = "general", checkoutStatus }: { initialSection?: SettingsSection; checkoutStatus?: string }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [preferences, setPreferences] = useState<AssistantPreferences>(DEFAULT_PREFERENCES);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const { preference, accent, scale, setTheme, setAccent, setScale } = useTheme();
  const { session, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null") as Partial<AssistantPreferences> | null;
      if (parsed) setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
    } catch {
      // Keep safe defaults when storage is unavailable or malformed.
    }
  }, []);

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
      setCredits(buildCreditsSummary({ snapshot, usage, watchCount: watches?.length ?? null, missionCount: missions?.length ?? null }));
    });
    return () => { alive = false; };
  }, [section]);

  useEffect(() => {
    if (section !== "storage" || !navigator.storage?.estimate) return;
    let alive = true;
    void navigator.storage.estimate().then((estimate) => {
      if (alive) setStorage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
    });
    return () => { alive = false; };
  }, [section]);

  function updatePreferences(next: Partial<AssistantPreferences>) {
    setPreferences((current) => {
      const updated = { ...current, ...next };
      try { localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated)); } catch { /* best effort */ }
      return updated;
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[13.5rem_minmax(0,1fr)] bg-background max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) p-4 max-md:border-b max-md:border-r-0 max-md:p-2">
        <h1 className="workspace-page-title mb-4 px-2 max-md:sr-only">Settings</h1>
        <nav aria-label="Settings pages" className="flex flex-col gap-1 max-md:flex-row max-md:overflow-x-auto max-md:pb-1">
          {SECTIONS.map((item) => (
            <button
              aria-current={section === item.id ? "page" : undefined}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground max-md:shrink-0",
                section === item.id && "bg-(--ui-control-active-background) text-foreground",
              )}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <Codicon className={cn("text-(--ui-text-tertiary)", section === item.id && "text-(--theme-primary)")} name={item.icon} size="0.9rem" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="min-h-0 overflow-y-auto px-7 py-6 max-sm:px-4 max-sm:py-5">
        {section === "general" && (
          <SettingsPage title="General" description="Shape how Nemesis writes and addresses you.">
            <SettingsCard>
              <SettingsRow label="Language"><select className={SELECT_CLASS} onChange={(event) => updatePreferences({ language: event.target.value })} value={preferences.language}><option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Portuguese</option></select></SettingsRow>
              <SettingsRow label="Base style and tone"><select className={SELECT_CLASS} onChange={(event) => updatePreferences({ baseStyle: event.target.value })} value={preferences.baseStyle}><option>Clear and direct</option><option>Warm and encouraging</option><option>Academic and precise</option><option>Socratic tutor</option></select></SettingsRow>
              <SettingsRow label="Headers and lists"><FrequencyControl onChange={(value) => updatePreferences({ headersAndLists: value })} value={preferences.headersAndLists} /></SettingsRow>
              <SettingsRow label="Emoji"><FrequencyControl onChange={(value) => updatePreferences({ emoji: value })} value={preferences.emoji} /></SettingsRow>
            </SettingsCard>
            <SettingsCard>
              <SettingsRow description="Optional. Used when examples involve pets." label="Pet"><input className={SELECT_CLASS} onChange={(event) => updatePreferences({ pet: event.target.value })} placeholder="e.g. Luna, a cat" value={preferences.pet} /></SettingsRow>
              <SettingsRow label="Nickname"><input className={SELECT_CLASS} onChange={(event) => updatePreferences({ nickname: event.target.value })} placeholder="What should Nemesis call you?" value={preferences.nickname} /></SettingsRow>
              <SettingsRow label="Occupation"><input className={SELECT_CLASS} onChange={(event) => updatePreferences({ occupation: event.target.value })} placeholder="Student, researcher…" value={preferences.occupation} /></SettingsRow>
            </SettingsCard>
          </SettingsPage>
        )}

        {section === "notifications" && (
          <SettingsPage title="Notifications" description="Choose what deserves your attention.">
            <SettingsCard>
              <SettingsRow description="Due cards, upcoming tests, and scheduled work." label="Study reminders"><Toggle checked={preferences.studyReminders} onChange={(checked) => updatePreferences({ studyReminders: checked })} /></SettingsRow>
              <SettingsRow description="Occasional notes about meaningful Nemesis changes." label="Product updates"><Toggle checked={preferences.productUpdates} onChange={(checked) => updatePreferences({ productUpdates: checked })} /></SettingsRow>
            </SettingsCard>
          </SettingsPage>
        )}

        {section === "appearance" && (
          <SettingsPage title="Appearance" description="Saved on this device and applied immediately.">
            <SettingsCard title="Theme"><div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">{THEME_OPTIONS.map((item) => <button aria-pressed={preference === item.id} className={cn("rounded-xl border border-(--ui-stroke-secondary) bg-background p-2 text-left text-xs font-medium hover:bg-(--ui-control-hover-background)", preference === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)")} key={item.id} onClick={() => setTheme(item.id)} type="button"><span className="theme-swatch mb-2" data-theme-preview={item.id} aria-hidden="true"><span className="tp-rail" /><span className="tp-page"><span className="tp-line" /><span className="tp-line short" /><span className="tp-dot" /></span></span>{item.label}</button>)}</div></SettingsCard>
            <SettingsCard title="Accent color"><div className="flex flex-wrap gap-2">{ACCENT_OPTIONS.map((item) => <button aria-label={item.label} aria-pressed={accent === item.id} className={cn("grid size-10 place-items-center rounded-full border border-(--ui-stroke-secondary)", accent === item.id && "ring-2 ring-offset-2 ring-offset-background")} key={item.id} onClick={() => setAccent(item.id)} style={{ color: item.color }} title={item.label} type="button"><span className="size-6 rounded-full" style={{ backgroundColor: item.color }} /></button>)}</div></SettingsCard>
            <SettingsCard title="Scaling"><div className="flex items-center gap-4"><input aria-label="App scaling" className="min-w-0 flex-1 accent-[var(--theme-primary)]" max={125} min={90} onChange={(event) => setScale(Number(event.target.value))} step={5} type="range" value={scale} /><output className="w-12 text-right text-sm font-semibold tabular-nums">{scale}%</output></div></SettingsCard>
          </SettingsPage>
        )}

        {section === "usage" && <UsageSettings credits={credits} />}

        {section === "voice" && (
          <SettingsPage title="Voice" description="Defaults for dictation and future recording playback.">
            <SettingsCard>
              <SettingsRow label="Voice"><select className={SELECT_CLASS} onChange={(event) => updatePreferences({ voice: event.target.value })} value={preferences.voice}><option>Juniper</option><option>Maple</option><option>Vale</option><option>Cove</option></select></SettingsRow>
              <SettingsRow label="Speaking speed"><div className="flex min-w-44 items-center gap-3"><input aria-label="Speaking speed" className="min-w-0 flex-1 accent-[var(--theme-primary)]" max={1.5} min={0.75} onChange={(event) => updatePreferences({ voiceSpeed: Number(event.target.value) })} step={0.05} type="range" value={preferences.voiceSpeed} /><span className="text-xs tabular-nums">{preferences.voiceSpeed.toFixed(2)}×</span></div></SettingsRow>
            </SettingsCard>
          </SettingsPage>
        )}

        {section === "billing" && <SettingsPage title="Billing" description="Manage your plan and payment details."><BillingPanel checkoutStatus={checkoutStatus} /></SettingsPage>}

        {section === "storage" && (
          <SettingsPage title="Storage" description="Browser storage used by offline preferences, previews, and cached study data.">
            <SettingsCard><StorageMeter storage={storage} /><Button className="mt-4" onClick={() => router.refresh()} size="sm" variant="secondary"><Codicon name="refresh" size="0.8rem" /> Refresh estimate</Button></SettingsCard>
          </SettingsPage>
        )}

        {section === "security" && (
          <SettingsPage title="Security & login" description="Review the account currently connected to Nemesis.">
            <SettingsCard>
              <SettingsRow label="Signed in as"><span className="text-xs text-foreground">{session?.user.email ?? "Preview account"}</span></SettingsRow>
              <div className="flex flex-wrap gap-2 pt-3"><Button onClick={() => router.push("/account")} size="sm" variant="secondary">Manage account</Button><Button onClick={() => void signOut().then(() => router.replace("/sign-in"))} size="sm" variant="ghost">Log out</Button></div>
            </SettingsCard>
          </SettingsPage>
        )}

        {section === "keyboard" && (
          <SettingsPage title="Keyboard shortcuts" description="Move through Nemesis without leaving the keyboard.">
            <SettingsCard>{KEYBOARD_SHORTCUTS.map(([label, shortcut]) => <SettingsRow key={label} label={label}><kbd className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 py-1 font-mono text-[0.7rem]">{shortcut}</kbd></SettingsRow>)}</SettingsCard>
          </SettingsPage>
        )}
      </main>
    </div>
  );
}

function SettingsPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="mx-auto grid w-full max-w-3xl gap-4"><header><h2 className="workspace-page-title">{title}</h2><p className="mt-1 text-xs leading-relaxed text-(--ui-text-tertiary)">{description}</p></header>{children}</div>;
}

function SettingsCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">{title && <h3 className="mb-3 text-xs font-semibold text-foreground">{title}</h3>}{children}</section>;
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return <div className="flex min-h-12 items-center justify-between gap-5 border-b border-(--ui-stroke-tertiary) py-2.5 last:border-b-0 max-sm:items-start max-sm:flex-col max-sm:gap-2"><div><p className="text-xs font-medium text-foreground">{label}</p>{description && <p className="mt-0.5 max-w-md text-[0.7rem] leading-relaxed text-(--ui-text-tertiary)">{description}</p>}</div><div className="shrink-0 max-sm:w-full">{children}</div></div>;
}

function FrequencyControl({ value, onChange }: { value: Frequency; onChange: (value: Frequency) => void }) {
  return <div className="flex rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-0.5">{(["more", "default", "less"] as const).map((option) => <button aria-pressed={value === option} className={cn("rounded-md px-2.5 py-1 text-[0.7rem] capitalize text-(--ui-text-secondary)", value === option && "bg-background text-foreground shadow-sm")} key={option} onClick={() => onChange(option)} type="button">{option}</button>)}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button aria-checked={checked} className={cn("relative h-6 w-10 rounded-full border transition-colors", checked ? "border-(--theme-primary) bg-(--theme-primary)" : "border-(--ui-stroke-secondary) bg-(--ui-bg-quaternary)")} onClick={() => onChange(!checked)} role="switch" type="button"><span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} /></button>;
}

function UsageSettings({ credits }: { credits: CreditsSummary | null }) {
  const rows = credits ? [...credits.daily, ...credits.slots] : [];
  return <SettingsPage title="Usage" description="Current plan usage shown as a percentage of each allowance."><SettingsCard>{credits ? rows.length > 0 ? rows.map((row) => { const percentage = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0; return <div className="border-b border-(--ui-stroke-tertiary) py-3 last:border-b-0" key={row.key}><div className="mb-2 flex items-center justify-between gap-4"><span className="text-xs font-medium">{row.label}</span><span className="text-sm font-semibold tabular-nums">{percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-(--ui-bg-quaternary)"><div className="h-full rounded-full bg-(--theme-primary)" style={{ width: `${percentage}%` }} /></div></div>; }) : <p className="text-xs text-(--ui-text-tertiary)">No measured usage is available yet.</p> : <p className="text-xs text-(--ui-text-tertiary)">Loading usage…</p>}</SettingsCard></SettingsPage>;
}

function StorageMeter({ storage }: { storage: { used: number; quota: number } | null }) {
  const percentage = storage?.quota ? Math.min(100, Math.round((storage.used / storage.quota) * 100)) : 0;
  const usedMb = storage ? storage.used / 1024 / 1024 : 0;
  return <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium">Browser storage</span><span className="text-sm font-semibold tabular-nums">{percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-(--ui-bg-quaternary)"><div className="h-full rounded-full bg-(--theme-primary)" style={{ width: `${percentage}%` }} /></div><p className="mt-2 text-[0.7rem] text-(--ui-text-tertiary)">{storage ? `${usedMb.toFixed(1)} MB currently used.` : "Calculating available storage…"}</p></div>;
}
