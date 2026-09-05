"use client";

import { ConnectionsSettings } from "@/components/settings/connections-settings";
import { MemorySettings } from "@/components/settings/memory-settings";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BillingSettings } from "@/components/workspace/shell/billing-settings";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SecuritySettings } from "@/components/workspace/shell/security-settings";
import { VoiceSettings } from "@/components/workspace/shell/voice-settings";
import { ACCENT_COLORS, ACCENT_LABELS, ACCENT_PREFERENCES, DEFAULT_ACCENT_SWATCH, useTheme, type AccentPreference, type DarkTone, type ThemePreference } from "@/components/theme-provider";
import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { CHARACTER_SILHOUETTE } from "@/lib/character/body";
import { loadUsageBars, type UsageBar } from "@/lib/workspace/usage-summary";
import { FRAME_COLUMN_PX, FRAME_HEADING_TEXT, FRAME_ROW_PX, FRAME_SECTION_GAP_PX, FRAME_TITLE_TEXT, FRAME_TOP_PX } from "@/components/workspace/shell/page-frame";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "general"
  | "notifications"
  | "appearance"
  | "usage"
  | "memory"
  | "connections"
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

// 🔴 EACH SECTION CARRIES THE WORDS FOR WHAT IS *INSIDE* IT, NOT JUST ITS OWN NAME. The search
// field in the rail matches against `keywords`, and this is the whole reason it is trustworthy:
// a box that only matched the eleven labels would answer "accent colour" with nothing, because
// that control lives inside Appearance and the word never appears in a section name. A search
// that silently misses what it is standing on is worse than no search — the learner concludes
// the setting does not exist. Anything added to a section belongs in its keyword list.
const SECTIONS: { id: SettingsSection; label: string; icon: string; keywords: string }[] = [
  { id: "general", label: "General", icon: "settings-gear", keywords: "language tone style headers lists emoji library pet nickname occupation" },
  { id: "notifications", label: "Notifications", icon: "bell", keywords: "reminders alerts email push product updates study" },
  { id: "appearance", label: "Appearance", icon: "symbol-color", keywords: "theme light dark mode contrast accent colour color scale font size character" },
  { id: "usage", label: "Usage", icon: "pulse", keywords: "allowance limits quota credits" },
  // 🔴 A TOP-LEVEL SECTION, NOT A ROW INSIDE "General". What Nemesis remembers about a person has
  // to be findable by someone looking for it without knowing our menu — burying it two levels down
  // is how a privacy surface becomes technically-present and practically-hidden.
  { id: "memory", label: "Memory", icon: "history", keywords: "remember forget facts privacy what nemesis knows deadlines subjects" },
  // 🔴 "Apps", NOT "Connected apps" OR "Integrations" — owner 2026-08-24, asking for the word
  // ChatGPT uses. It is also the better word on its own terms: "integrations" is what an engineer
  // calls it, and §38's copy rule is that a control names what the learner gets.
  { id: "connections", label: "Apps", icon: "plug", keywords: "connect google drive gmail calendar docs integrations composio" },
  { id: "voice", label: "Voice", icon: "unmute", keywords: "speech dictation read aloud microphone speak" },
  { id: "billing", label: "Billing", icon: "credit-card", keywords: "plan subscription payment invoice upgrade card" },
  { id: "storage", label: "Storage", icon: "database", keywords: "space disk cache browser data" },
  { id: "security", label: "Security & login", icon: "lock", keywords: "password sign in sessions devices two factor account delete" },
  { id: "keyboard", label: "Keyboard (shortcuts)", icon: "keyboard", keywords: "shortcuts keys hotkeys command" },
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

// 🔴 BUILT FROM THE PALETTE, NOT RETYPED BESIDE IT. This list used to name each accent and
// its hex by hand, so the picker was a second copy of the table in lib/accent.ts and the
// day a colour moved they disagreed — with the dot showing one thing and the button doing
// another. Twelve entries is enough hand-typing to guarantee that eventually. Order comes
// from ACCENT_PREFERENCES, which is the owner's screenshot order (2026-08-25).
//
// The swatch is the hue AS CHOSEN, never the adjusted fill: `accentFill` nudges three of
// the twelve so they can carry a control, and a picker that showed the nudged value would
// be answering a question nobody asked. "Default" is the exception it always was — its
// real accent is a light/dark pair one dot cannot show, so it gets the grey swatch.
const ACCENT_OPTIONS: { id: AccentPreference; label: string; color: string }[] =
  ACCENT_PREFERENCES.map((id) => ({
    id,
    label: ACCENT_LABELS[id],
    color: id === "default" ? DEFAULT_ACCENT_SWATCH : ACCENT_COLORS[id],
  }));

// 🔴 TWO CONTROL SHAPES, NOT ONE — AND SPLITTING THEM IS WHY THE CHOOSER CAN GO BARE.
// Measured off ChatGPT's settings 2026-08-24 (owner: "look at the ChatGPT settings… the spacing,
// the color, and etcetera"): a chooser there is a 36px button, radius 8, `border: 1px rgba(0,0,0,0)`
// and no fill — the value and its chevron read as text until the row is hovered. One class was
// dressing both the choosers AND the three text fields, so taking the border off would have left
// Pet/Nickname/Occupation as invisible boxes. A picker announces itself with a chevron and a value;
// an empty text field has nothing to announce itself with, so it keeps its edge.
//
// 🔴 BOTH TAKE THE NAV ROW'S HEIGHT AND CORNER, NOT Tailwind's `h-9`/`rounded-[8px]`. Those two are
// rem-based, so under the app's own font-scale setting they resolved to 40.5px and 13.5px here —
// a control taller and rounder than the 36px/10px rows sitting a few pixels to its left, inside
// one panel. `--nav-row-height` and `--nav-row-radius` are fixed px and are what the shell rail
// already uses, so every row-shaped thing in Settings now agrees at any scale.
const SELECT_CLASS = "h-[var(--nav-row-height)] cursor-pointer rounded-[var(--nav-row-radius)] border border-transparent bg-transparent px-[8px] text-[length:var(--canvas-text-small)] text-foreground outline-none transition-colors hover:bg-(--ui-control-hover-background) focus:border-(--theme-primary)";
const INPUT_CLASS = "h-[var(--nav-row-height)] min-w-[176px] rounded-[var(--nav-row-radius)] border border-(--ui-stroke-secondary) bg-background px-[12px] text-[length:var(--canvas-text-small)] text-foreground outline-none focus:border-(--theme-primary)";
/** The rail scrolls on its own once the section list outgrows a short window; the content pane
 *  beside it already did. Without this the whole modal grew a single outer scrollbar and the
 *  section you were reading slid away with the list. */
const SCROLL_RAIL = "overflow-y-auto overflow-x-hidden overscroll-contain";
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
  const [query, setQuery] = useState("");
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

  // Matching is on the label AND on what the section contains, so "accent" reaches Appearance.
  // The needle is trimmed and lowercased once; an empty box matches everything.
  const needle = query.trim().toLowerCase();
  const matchedSections = needle
    ? SECTIONS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(needle))
    : SECTIONS;

  return (
    <div className="grid h-full min-h-0 grid-cols-[14rem_minmax(0,1fr)] bg-background max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
      <aside
        className="flex min-h-0 flex-col border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-[12px] pb-[12px] max-md:border-b max-md:border-r-0 max-md:p-[8px]"
        style={{ paddingTop: FRAME_TOP_PX }}
      >
        {/* The rail's name is a HEADING, not a title: the pane beside it carries the 24px title
            of whichever section is open, the way the Library's title sits over its sections. */}
        <h1 className={cn("mb-[12px] flex items-center px-[8px] max-md:sr-only", FRAME_HEADING_TEXT)} style={{ height: FRAME_ROW_PX }}>
          Settings
        </h1>
        {/* The rail's own search, as ChatGPT's has. It filters the list rather than jumping, so
            an empty result is visible as an empty list instead of as a section that silently
            failed to open. */}
        <label className="relative mb-[8px] block max-md:hidden">
          <Codicon className="pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-(--ui-text-tertiary)" name="search" size="14px" />
          <input
            aria-label="Search settings"
            className="h-[var(--nav-row-height)] w-full rounded-[var(--nav-row-radius)] border border-(--ui-stroke-secondary) bg-background pr-[8px] pl-[32px] text-[length:var(--canvas-text-small)] text-foreground outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--theme-primary)"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
            type="search"
            value={query}
          />
        </label>
        <nav aria-label="Settings pages" className={cn("flex min-h-0 flex-col gap-0 max-md:flex-row max-md:overflow-x-auto max-md:pb-[4px]", SCROLL_RAIL)}>
          {matchedSections.map((item) => (
            <button
              aria-current={section === item.id ? "page" : undefined}
              className={cn(
                // Row geometry is the shell sidebar's, which was already measured against the
                // same reference: 36px tall, 10px radius, 14px label. It read a size smaller
                // than every other list in the product for no reason anyone had chosen.
                "flex h-[var(--nav-row-height)] shrink-0 items-center gap-[8px] rounded-[var(--nav-row-radius)] px-[10px] text-left text-[length:var(--canvas-text-small)] text-foreground transition-colors hover:bg-(--ui-control-hover-background) max-md:shrink-0",
                section === item.id && "bg-(--ui-control-active-background)",
              )}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              {/* 🔴 THE ACTIVE ICON IS NOT TINTED. It used to turn --theme-primary, which made the
                  selected row the loudest thing in a panel whose job is to be scaffolding, and
                  contradicted the same owner's ruling for the shell rail (2026-08-15: icons read
                  at full strength, matching their label, not as a second colour). */}
              <Codicon className="shrink-0 text-(--ui-text-secondary)" name={item.icon} size="16px" />
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          ))}
          {matchedSections.length === 0 && (
            <p className="px-[10px] py-[8px] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">No setting matches “{query.trim()}”.</p>
          )}
        </nav>
      </aside>

      <main className="min-h-0 overflow-y-auto px-[24px] pb-[24px] max-sm:px-[16px]" style={{ paddingTop: FRAME_TOP_PX }}>
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
              <SettingsRow description="Optional. Used when examples involve pets." label="Pet"><input className={INPUT_CLASS} onChange={(event) => updatePreferences({ pet: event.target.value })} placeholder="e.g. Luna, a cat" value={preferences.pet} /></SettingsRow>
              <SettingsRow label="Nickname"><input className={INPUT_CLASS} onChange={(event) => updatePreferences({ nickname: event.target.value })} placeholder="What should Nemesis call you?" value={preferences.nickname} /></SettingsRow>
              <SettingsRow label="Occupation"><input className={INPUT_CLASS} onChange={(event) => updatePreferences({ occupation: event.target.value })} placeholder="Student, researcher…" value={preferences.occupation} /></SettingsRow>
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
            <SettingsCard title="Theme"><div className="grid grid-cols-3 gap-[8px] max-sm:grid-cols-1">{THEME_OPTIONS.map((item) => <button aria-pressed={preference === item.id} className={cn("rounded-[12px] border border-(--ui-stroke-secondary) bg-background p-[8px] text-left text-[length:var(--canvas-text-small)] font-medium hover:bg-(--ui-control-hover-background)", preference === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)")} key={item.id} onClick={() => setTheme(item.id)} type="button"><span className="theme-swatch mb-[8px]" data-theme-preview={item.id} aria-hidden="true"><span className="tp-rail" /><span className="tp-page"><span className="tp-line" /><span className="tp-line short" /><span className="tp-dot" /></span></span>{item.label}</button>)}</div></SettingsCard>
            <SettingsCard title="Dark tone"><div className="flex flex-wrap gap-[8px]">{DARK_TONE_OPTIONS.map((item) => <button aria-pressed={darkTone === item.id} className={cn("flex items-center gap-[8px] rounded-[12px] border border-(--ui-stroke-secondary) bg-background px-[12px] py-[8px] text-[length:var(--canvas-text-small)] font-medium hover:bg-(--ui-control-hover-background)", darkTone === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)")} key={item.id} onClick={() => setDarkTone(item.id)} type="button"><span aria-hidden className="size-[16px] rounded-full border border-(--ui-stroke-secondary)" style={{ backgroundColor: item.color }} />{item.label}</button>)}</div><p className="mt-[12px] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">How surfaces look while the theme is dark: Black is pure black, Charcoal is a softer dark gray.</p></SettingsCard>
            <SettingsCard title="Accent color"><div className="flex flex-wrap gap-[8px]">{ACCENT_OPTIONS.map((item) => <button aria-label={item.label} aria-pressed={accent === item.id} className={cn("grid size-[40px] place-items-center rounded-full border border-(--ui-stroke-secondary)", accent === item.id && "ring-2 ring-offset-[2px] ring-offset-background")} key={item.id} onClick={() => setAccent(item.id)} style={{ color: item.color }} title={item.label} type="button"><span className="size-[24px] rounded-full" style={{ backgroundColor: item.color }} /></button>)}</div></SettingsCard>
            <SettingsCard title="Your character">
              {/* 🔴 NO SECOND PALETTE, AND NO SHAPE PICKER (owner 2026-08-20). The character used
                  to carry twelve colours and eight silhouettes of its own, right below the accent
                  picker that also changes "the colour" — two controls that could disagree, and a
                  per-device choice about what the product's character IS. It follows the accent
                  above and rests as a circle; this card exists to SHOW that, not to re-ask it.

                  The preview is the real engine frozen, not a picture of it. */}
              <div className="flex items-center gap-[16px]">
                <div className="grid size-[92px] shrink-0 place-items-center rounded-[16px] border border-(--ui-stroke-secondary)">
                  <NemesisAvatar accent={accent} animation="idle" frozenAt={900} silhouette={CHARACTER_SILHOUETTE} size={76} />
                </div>
                <p className="text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
                  It sits above the composer while you work, comes forward to the middle of the page
                  while Nemesis is thinking, and follows your cursor. Click it and it reacts.
                  <br />
                  Its colour is the accent colour above.
                </p>
              </div>
            </SettingsCard>
            <SettingsCard title="Scaling"><div className="flex flex-wrap gap-[8px]">{SCALE_PRESETS.map((preset) => <button aria-pressed={scale === preset} className={cn("min-w-[64px] rounded-[12px] border border-(--ui-stroke-secondary) bg-background px-[12px] py-[8px] text-[length:var(--canvas-text-small)] font-semibold tabular-nums hover:bg-(--ui-control-hover-background)", scale === preset && "border-(--theme-primary) text-(--theme-primary) ring-1 ring-(--theme-primary)")} key={preset} onClick={() => setScale(preset)} type="button">{preset}%</button>)}</div><p className="mt-[12px] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">Everything in the app grows or shrinks together. Currently {scale}%.</p></SettingsCard>
          </SettingsPage>
        )}

        {section === "usage" && <UsageSettings bars={usageBars} />}
        {section === "connections" && (
          <SettingsPage
            description="Apps Nemesis can reach for you, and what it must ask about before doing."
            title="Apps"
          >
            <ConnectionsSettings />
          </SettingsPage>
        )}
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
            <SettingsCard><StorageMeter storage={storage} /><Button className="mt-[16px]" onClick={() => router.refresh()} size="sm" variant="secondary"><Codicon name="refresh" size="13px" /> Refresh estimate</Button></SettingsCard>
          </SettingsPage>
        )}

        {section === "security" && (
          <SettingsPage title="Security & login" description="Your password and the extra checks that protect sign-in.">
            <SecuritySettings />
          </SettingsPage>
        )}

        {section === "keyboard" && (
          <SettingsPage title="Keyboard shortcuts" description="Move through Nemesis without leaving the keyboard.">
            <SettingsCard>{KEYBOARD_SHORTCUTS.map(([label, shortcut]) => <SettingsRow key={label} label={label}><kbd className="rounded-[6px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-[8px] py-[4px] font-mono text-[length:var(--canvas-text-meta)]">{shortcut}</kbd></SettingsRow>)}</SettingsCard>
          </SettingsPage>
        )}
      </main>
    </div>
  );
}

// 🔴🔴 THE CARDS ARE GONE, AND THAT IS THE WHOLE REDESIGN (owner 2026-08-24: *"look at the ChatGPT
// settings… so that you can implement that to Nemesis as well. The spacing, the color, and
// etcetera."*). Every group used to be a `rounded-[16px]` panel with a border AND a shadow, stacked
// with gaps — so a page of six preferences drew six boxes, six borders and six shadows around
// twelve words. Measured off the reference the same day, there is no box at all: a setting is one
// 52px row (8px pad, 36px control, 8px pad) with a 1px hairline under it, and the ONLY separator
// on the page is that hairline.
//
// 🔴 THE PALETTE WAS ALREADY RIGHT AND DID NOT MOVE. `--ui-stroke-tertiary` resolves to 5% of the
// base colour; the reference's divider is `rgba(0,0,0,0.05)`. Same for the active row wash. So
// nothing here hardcodes a colour — which is also what keeps dark mode correct, since a literal
// `rgba(0,0,0,.05)` would vanish against a black page. What diverged was never the colour; it was
// the structure and the type scale.
function SettingsPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full gap-0 [&>section:last-of-type>*:last-child]:border-b-0" style={{ maxWidth: FRAME_COLUMN_PX }}>
      {/* The frame's title row: the section's name at the 24px every page title uses, on the
          40px line every page title sits on. The description is the one line under it. */}
      <header>
        <h2 className={cn("flex items-center truncate", FRAME_TITLE_TEXT)} style={{ height: FRAME_ROW_PX }}>{title}</h2>
        <p className="mt-[4px] text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-tertiary)">{description}</p>
      </header>
      {children}
    </div>
  );
}

function SettingsCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col" style={{ marginTop: FRAME_SECTION_GAP_PX }}>
      {/* A group's name is the frame's heading — the same 16px/500 the Library puts over a shelf —
          on the frame's 40px row. No box, no fill: the hairline under each row is the separator. */}
      {title && <h3 className={cn("flex items-center", FRAME_HEADING_TEXT)} style={{ height: FRAME_ROW_PX }}>{title}</h3>}
      {children}
    </section>
  );
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-[24px] border-b border-(--ui-stroke-tertiary) py-[8px] max-sm:flex-col max-sm:items-start max-sm:gap-[8px]">
      <div className="min-w-0">
        <p className="text-[length:var(--canvas-text-small)] text-foreground">{label}</p>
        {description && <p className="mt-[2px] max-w-[448px] text-[length:var(--canvas-text-meta)] leading-4 text-(--ui-text-tertiary)">{description}</p>}
      </div>
      <div className="shrink-0 max-sm:w-full">{children}</div>
    </div>
  );
}

function FrequencyControl({ value, onChange }: { value: Frequency; onChange: (value: Frequency) => void }) {
  return <div className="flex rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-[2px]">{(["more", "default", "less"] as const).map((option) => <button aria-pressed={value === option} className={cn("rounded-[6px] px-[10px] py-[4px] text-[length:var(--canvas-text-meta)] capitalize text-(--ui-text-secondary)", value === option && "bg-background text-foreground shadow-sm")} key={option} onClick={() => onChange(option)} type="button">{option}</button>)}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  // Knob travel: 40px track − 2px borders − 16px knob − 2px gap = 20px (translate-x-[20px]).
  // The old translate-x-4 left the knob mid-track, so "on" and "off" looked alike.
  // Off-track rides --dt-input (a fixed elevated grey), not the accent-tinted
  // --ui-bg-quaternary: that tint is ~9% alpha, so against the pure-black page
  // it collapsed to near-black and the track read as part of the background.
  return <button aria-checked={checked} className={cn("relative h-[24px] w-[40px] cursor-pointer rounded-full border transition-colors", checked ? "border-(--theme-primary) bg-(--theme-primary)" : "border-(--ui-stroke-secondary) bg-(--dt-input)")} onClick={() => onChange(!checked)} role="switch" type="button"><span className={cn("absolute top-[2px] left-0 size-[16px] rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[20px]" : "translate-x-[2px]")} /></button>;
}

function UsageSettings({ bars }: { bars: UsageBar[] | null }) {
  return (
    <SettingsPage title="Usage" description="How much of this month's and today's allowance you have used.">
      <SettingsCard>
        {bars === null ? (
          <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">Loading usage…</p>
        ) : bars.length === 0 ? (
          <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">No measured usage is available yet.</p>
        ) : (
          bars.map((bar) => (
            <div className="border-b border-(--ui-stroke-tertiary) py-[12px] first:pt-[4px] last:border-b-0 last:pb-[4px]" key={bar.key}>
              <div className="mb-[8px] flex items-center justify-between gap-[16px]">
                <span className="text-[length:var(--canvas-text-small)] font-medium">{bar.label}</span>
                <span className="text-[length:var(--canvas-text-small)] font-semibold tabular-nums">{bar.unlimited ? "Unlimited" : `${bar.percent}%`}</span>
              </div>
              <div className="h-[8px] overflow-hidden rounded-full bg-(--ui-bg-quaternary)">
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
  return <div><div className="mb-[8px] flex items-center justify-between"><span className="text-[length:var(--canvas-text-small)] font-medium">Browser storage</span><span className="text-[length:var(--canvas-text-small)] font-semibold tabular-nums">{percentage}%</span></div><div className="h-[8px] overflow-hidden rounded-full bg-(--ui-bg-quaternary)"><div className="h-full rounded-full bg-(--theme-primary)" style={{ width: `${percentage}%` }} /></div><p className="mt-[8px] text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{storage ? `${usedMb.toFixed(1)} MB currently used.` : "Calculating available storage…"}</p></div>;
}
