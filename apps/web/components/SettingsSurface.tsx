"use client";

import { MemorySettings } from "@/components/settings/memory-settings";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BillingSettings } from "@/components/workspace/shell/billing-settings";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SecuritySettings } from "@/components/workspace/shell/security-settings";
import { VoiceSettings } from "@/components/workspace/shell/voice-settings";
import { ACCENT_COLORS, DEFAULT_ACCENT_SWATCH, useTheme, type AccentPreference, type DarkTone, type ThemePreference } from "@/components/theme-provider";
import { BloubBot } from "@/components/bloub/bloub-bot";
import { loadUsageBars, type UsageBar } from "@/lib/workspace/usage-summary";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "general"
  | "notifications"
  | "appearance"
  | "usage"
  | "memory"
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
};

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings-gear" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "appearance", label: "Appearance", icon: "symbol-color" },
  { id: "usage", label: "Usage", icon: "pulse" },
  // 🔴 A TOP-LEVEL SECTION, NOT A ROW INSIDE "General". What Nemesis remembers about a person has
  // to be findable by someone looking for it without knowing our menu — burying it two levels down
  // is how a privacy surface becomes technically-present and practically-hidden.
  { id: "memory", label: "Memory", icon: "history" },
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

// The swatch is the tone's actual page background, same honesty rule as the
// accent dots below.
const DARK_TONE_OPTIONS: { id: DarkTone; label: string; color: string }[] = [
  { id: "black", label: "Black", color: "#000000" },
  { id: "charcoal", label: "Charcoal", color: "#212121" },
];

// Order and names come from the owner's screenshot (2026-07-28). The swatches
// are the same values the accent actually applies, so the dot never lies about
// what you are picking — except "Default", whose real accent is a light/dark
// pair of greys that one dot cannot show.
const ACCENT_OPTIONS: { id: AccentPreference; label: string; color: string }[] = [
  { id: "default", label: "Default", color: DEFAULT_ACCENT_SWATCH },
  { id: "blue", label: "Blue", color: ACCENT_COLORS.blue },
  { id: "green", label: "Green", color: ACCENT_COLORS.green },
  { id: "yellow", label: "Yellow", color: ACCENT_COLORS.yellow },
  { id: "pink", label: "Pink", color: ACCENT_COLORS.pink },
  { id: "orange", label: "Orange", color: ACCENT_COLORS.orange },
  { id: "purple", label: "Purple", color: ACCENT_COLORS.purple },
];

const SELECT_CLASS = "h-9 min-w-44 rounded-lg border border-(--ui-stroke-secondary) bg-background px-3 text-xs text-foreground outline-none focus:border-(--theme-primary)";
// Discrete scale presets replace the old slider (owner 2026-07-20 evening).
const SCALE_PRESETS = [50, 75, 90, 100, 110, 125, 150] as const;
const KEYBOARD_SHORTCUTS: Array<[string, string]> = [
  ["New chat", "⌘ N"],
  ["Search", "⌘ K"],
  ["Send message", "Return"],
  ["New line", "Shift Return"],
  ["Toggle sidebar", "⌘ \\"],
  ["Open settings", "⌘ ,"],
];

export function SettingsSurface({ initialSection = "general" }: { initialSection?: SettingsSection; checkoutStatus?: string }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [preferences, setPreferences] = useState<AssistantPreferences>(DEFAULT_PREFERENCES);
  const [usageBars, setUsageBars] = useState<UsageBar[] | null>(null);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const { preference, accent, scale, darkTone, libraryFullScreen, setTheme, setAccent, setScale, setDarkTone, setLibraryFullScreen } = useTheme();
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
    setUsageBars(null);
    void loadUsageBars()
      .then((bars) => {
        if (alive) setUsageBars(bars);
      })
      .catch(() => {
        if (alive) setUsageBars([]);
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
          <SettingsPage title="General" description="Shape how Nemesis writes to you, addresses you, and lays itself out.">
            <SettingsCard>
              <SettingsRow label="Language"><select className={SELECT_CLASS} onChange={(event) => updatePreferences({ language: event.target.value })} value={preferences.language}><option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Portuguese</option></select></SettingsRow>
              <SettingsRow label="Base style and tone"><select className={SELECT_CLASS} onChange={(event) => updatePreferences({ baseStyle: event.target.value })} value={preferences.baseStyle}><option>Clear and direct</option><option>Warm and encouraging</option><option>Academic and precise</option><option>Socratic tutor</option></select></SettingsRow>
              <SettingsRow label="Headers and lists"><FrequencyControl onChange={(value) => updatePreferences({ headersAndLists: value })} value={preferences.headersAndLists} /></SettingsRow>
              <SettingsRow label="Emoji"><FrequencyControl onChange={(value) => updatePreferences({ emoji: value })} value={preferences.emoji} /></SettingsRow>
            </SettingsCard>
            <SettingsCard>
              <SettingsRow
                description="Full screen gives Library the whole left side and offers a Back button to leave. Keep Nemesis sidebar leaves the Study/Library/Calendar rail in place alongside it."
                label="Library mode"
              >
                <select
                  aria-label="Library mode"
                  className={SELECT_CLASS}
                  onChange={(event) => setLibraryFullScreen(event.target.value === "full-screen")}
                  value={libraryFullScreen ? "full-screen" : "keep-sidebar"}
                >
                  <option value="full-screen">Full screen</option>
                  <option value="keep-sidebar">Keep Nemesis sidebar</option>
                </select>
              </SettingsRow>
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
            <SettingsCard title="Dark tone"><div className="flex flex-wrap gap-2">{DARK_TONE_OPTIONS.map((item) => <button aria-pressed={darkTone === item.id} className={cn("flex items-center gap-2 rounded-xl border border-(--ui-stroke-secondary) bg-background px-3 py-2 text-xs font-medium hover:bg-(--ui-control-hover-background)", darkTone === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)")} key={item.id} onClick={() => setDarkTone(item.id)} type="button"><span aria-hidden className="size-4 rounded-full border border-(--ui-stroke-secondary)" style={{ backgroundColor: item.color }} />{item.label}</button>)}</div><p className="mt-3 text-[0.7rem] text-(--ui-text-tertiary)">How surfaces look while the theme is dark: Black is pure black, Charcoal is a softer dark gray.</p></SettingsCard>
            <SettingsCard title="Accent color"><div className="flex flex-wrap gap-2">{ACCENT_OPTIONS.map((item) => <button aria-label={item.label} aria-pressed={accent === item.id} className={cn("grid size-10 place-items-center rounded-full border border-(--ui-stroke-secondary)", accent === item.id && "ring-2 ring-offset-2 ring-offset-background")} key={item.id} onClick={() => setAccent(item.id)} style={{ color: item.color }} title={item.label} type="button"><span className="size-6 rounded-full" style={{ backgroundColor: item.color }} /></button>)}</div></SettingsCard>
            <SettingsCard title="Your character">
              {/* 🔴 NO SECOND PALETTE, AND NO SHAPE PICKER (owner 2026-08-20). The character used
                  to carry twelve colours and eight silhouettes of its own, right below the accent
                  picker that also changes "the colour" — two controls that could disagree, and a
                  per-device choice about what the product's character IS. It follows the accent
                  above and rests as a circle; this card exists to SHOW that, not to re-ask it.

                  The preview is the real engine frozen, not a picture of it. */}
              <div className="flex items-center gap-4">
                <div className="grid size-[92px] shrink-0 place-items-center rounded-2xl border border-(--ui-stroke-secondary)">
                  <BloubBot color={accent} frozenAt={1} size={76} state="idle" />
                </div>
                <p className="text-[0.7rem] leading-relaxed text-(--ui-text-tertiary)">
                  It sits above the composer while you work, comes forward to the middle of the page
                  while Nemesis is thinking, and follows your cursor. Click it and it reacts.
                  <br />
                  Its colour is the accent colour above.
                </p>
              </div>
            </SettingsCard>
            <SettingsCard title="Scaling"><div className="flex flex-wrap gap-2">{SCALE_PRESETS.map((preset) => <button aria-pressed={scale === preset} className={cn("min-w-16 rounded-xl border border-(--ui-stroke-secondary) bg-background px-3 py-2 text-xs font-semibold tabular-nums hover:bg-(--ui-control-hover-background)", scale === preset && "border-(--theme-primary) text-(--theme-primary) ring-1 ring-(--theme-primary)")} key={preset} onClick={() => setScale(preset)} type="button">{preset}%</button>)}</div><p className="mt-3 text-[0.7rem] text-(--ui-text-tertiary)">Everything in the app grows or shrinks together. Currently {scale}%.</p></SettingsCard>
          </SettingsPage>
        )}

        {section === "usage" && <UsageSettings bars={usageBars} />}
        {section === "memory" && (
          <SettingsPage
            description="What Nemesis has picked up about you while you study, and how to remove any of it."
            title="Memory"
          >
            <MemorySettings />
          </SettingsPage>
        )}

        {/* 🔴🔴 THE VOICE PICKER LIVES HERE NOW, AND WHAT WAS HERE BEFORE WAS DECORATION (§48). This
            card used to offer "Juniper / Maple / Vale / Cove" and a speaking-speed slider — four
            names Nemesis cannot produce and a number nothing read. The real picker was buried in a
            Canvas menu, where the owner had to re-find it every session. See `voice-settings.tsx`.

            🔴 NO SPEED CONTROL REPLACED THE SLIDER, DELIBERATELY. Speed is now a property of
            LISTENING — `playbackRate` on the player under an answer, where changing it is instant
            and costs nothing. A second copy in Settings would be a preference for something you can
            only sensibly judge while you are hearing it. */}
        {section === "voice" && (
          <SettingsPage
            title="Voice"
            description="The voice Nemesis reads in. It is used everywhere Nemesis speaks, and it is remembered on this device."
          >
            <VoiceSettings />
          </SettingsPage>
        )}

        {section === "billing" && <SettingsPage title="Billing" description="Manage your plan and payment details."><BillingSettings /></SettingsPage>}

        {section === "storage" && (
          <SettingsPage title="Storage" description="Browser storage used by offline preferences, previews, and cached study data.">
            <SettingsCard><StorageMeter storage={storage} /><Button className="mt-4" onClick={() => router.refresh()} size="sm" variant="secondary"><Codicon name="refresh" size="0.8rem" /> Refresh estimate</Button></SettingsCard>
          </SettingsPage>
        )}

        {section === "security" && (
          <SettingsPage title="Security & login" description="Your password and the extra checks that protect sign-in.">
            <SecuritySettings />
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
  // Knob travel: 40px track − 2px borders − 16px knob − 2px gap = 20px (translate-x-5).
  // The old translate-x-4 left the knob mid-track, so "on" and "off" looked alike.
  // Off-track rides --dt-input (a fixed elevated grey), not the accent-tinted
  // --ui-bg-quaternary: that tint is ~9% alpha, so against the pure-black page
  // it collapsed to near-black and the track read as part of the background.
  return <button aria-checked={checked} className={cn("relative h-6 w-10 cursor-pointer rounded-full border transition-colors", checked ? "border-(--theme-primary) bg-(--theme-primary)" : "border-(--ui-stroke-secondary) bg-(--dt-input)")} onClick={() => onChange(!checked)} role="switch" type="button"><span className={cn("absolute top-0.5 left-0 size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} /></button>;
}

function UsageSettings({ bars }: { bars: UsageBar[] | null }) {
  return (
    <SettingsPage title="Usage" description="How much of this month's and today's allowance you have used.">
      <SettingsCard>
        {bars === null ? (
          <p className="text-xs text-(--ui-text-tertiary)">Loading usage…</p>
        ) : bars.length === 0 ? (
          <p className="text-xs text-(--ui-text-tertiary)">No measured usage is available yet.</p>
        ) : (
          bars.map((bar) => (
            <div className="border-b border-(--ui-stroke-tertiary) py-3 first:pt-1 last:border-b-0 last:pb-1" key={bar.key}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-xs font-medium">{bar.label}</span>
                <span className="text-sm font-semibold tabular-nums">{bar.unlimited ? "Unlimited" : `${bar.percent}%`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-(--ui-bg-quaternary)">
                <div className="h-full rounded-full bg-(--theme-primary)" style={{ width: `${bar.unlimited ? 100 : bar.percent}%`, opacity: bar.unlimited ? 0.25 : 1 }} />
              </div>
            </div>
          ))
        )}
      </SettingsCard>
    </SettingsPage>
  );
}

function StorageMeter({ storage }: { storage: { used: number; quota: number } | null }) {
  const percentage = storage?.quota ? Math.min(100, Math.round((storage.used / storage.quota) * 100)) : 0;
  const usedMb = storage ? storage.used / 1024 / 1024 : 0;
  return <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium">Browser storage</span><span className="text-sm font-semibold tabular-nums">{percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-(--ui-bg-quaternary)"><div className="h-full rounded-full bg-(--theme-primary)" style={{ width: `${percentage}%` }} /></div><p className="mt-2 text-[0.7rem] text-(--ui-text-tertiary)">{storage ? `${usedMb.toFixed(1)} MB currently used.` : "Calculating available storage…"}</p></div>;
}
