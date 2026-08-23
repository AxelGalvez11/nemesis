"use client";

// Settings.
//
// ── AUDITED 2026-08-20, AND THE PAGE LOST A THIRD OF ITSELF ──────────────────
//
// 🔴 EVERY CONTROL HERE MUST REACH SOMETHING. The owner asked what on this page was
// still relevant to a canvas-centred product; the answer was that eleven controls
// across three sections wrote to `localStorage` under "nemesis.web.settings" and NOT
// ONE FILE IN THE APP EVER OPENED THAT KEY. They were not stale, or half-wired, or
// waiting on a backend — the choice was recorded and then nothing read it, which is
// indistinguishable from a preference the product is quietly ignoring. So the whole
// blob is gone, along with the machinery around it.
//
// What was removed, so it does not get rebuilt by someone reading a gap as an omission:
//
//   VOICE (the entire section). Offered four voices — Juniper, Maple, Vale, Cove —
//   none of which appear anywhere else in this repo. The canvas speaks through xAI via
//   `nemesis-speak`, which `lib/learn/speech-route.ts` describes as "one voice, no
//   locale decision to make", and that same file carries a red warning about exactly
//   this: a list of vendor names "with no integration behind them reads as a working
//   multi-provider router to the next person, and this repo has been burned by exactly
//   that gap once already". The speaking-speed slider was the same shape — the canvas
//   sends `CANVAS_SPEED = 0.95`, a constant with its own written rationale, and never
//   consulted the slider. 🔴 IF VOICE CHOICE EVER SHIPS, IT COMES BACK FROM THE
//   PROVIDER'S OWN CATALOGUE, not from a hand-typed list of names.
//
//   NOTIFICATIONS (the entire section). Two toggles, "Study reminders" and "Product
//   updates", against a web app with no notification system of any kind: no push, no
//   email preference, no scheduled job reading a flag. "Study reminders" also named the
//   retired Study surface.
//
//   GENERAL, seven of its eight rows. Language, base style and tone, headers and lists,
//   emoji, pet, nickname, occupation. Language was the worst of them: five languages
//   offered by an app with no translation system at all — no next-intl, no message
//   catalogue, nothing. 🔴 THE STYLE ROWS ARE THE TEMPTING ONES TO KEEP, and they are
//   still wrong to keep: the canvas answer is composed in `nemesis-llm`, which cannot
//   see a browser's localStorage, so an assistant-style preference is a SERVER feature
//   wearing a client control. It returns when the prompt honours it.
//
//   STORAGE (the section). Real — `navigator.storage.estimate()` genuinely measures —
//   but a whole page and a progress bar for a number a student cannot act on, described
//   as "cached study data" from the retired Study surface. Folded into General as one
//   line, which is all it was ever worth.
//
// What stayed, and why it is not the same judgement: Appearance, Usage, Billing and
// Security every one of them reaches a real system — the theme tokens and the character
// skins, the live meters the edge functions enforce, Stripe, Supabase MFA. Keyboard
// stayed but was rewritten; see KEYBOARD_SHORTCUTS.

import { useEffect, useState } from "react";

import { BillingSettings } from "@/components/workspace/shell/billing-settings";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SecuritySettings } from "@/components/workspace/shell/security-settings";
import { ACCENT_COLORS, DEFAULT_ACCENT_SWATCH, useTheme, type AccentPreference, type DarkTone, type ThemePreference } from "@/components/theme-provider";
import { BloubBot } from "@/components/bloub/bloub-bot";
import { SHAPES } from "@nemesis/shared/bloub/skins";
import { loadUsageBars, type UsageBar } from "@/lib/workspace/usage-summary";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "general"
  | "appearance"
  | "usage"
  | "billing"
  | "security"
  | "keyboard";

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings-gear" },
  { id: "appearance", label: "Appearance", icon: "symbol-color" },
  { id: "usage", label: "Usage", icon: "pulse" },
  { id: "billing", label: "Billing", icon: "credit-card" },
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

/**
 * The shortcuts the canvas actually binds. All four, and only these four.
 *
 * 🔴 THIS LIST WAS FOUR-SIXTHS WRONG AND THAT IS WORSE THAN HAVING NO PAGE. It advertised
 * "New chat ⌘N" for a surface that is retired, "Search ⌘K" whose only handler lives in
 * `components/AppShell.tsx` — a file NOTHING IMPORTS any more — and "Toggle sidebar ⌘\"
 * and "Open settings ⌘," which have never been bound anywhere in this repo. Meanwhile the
 * two shortcuts the canvas really does own were both missing. A learner who trusts a
 * shortcut page and finds the key dead concludes the app is broken, not the page.
 *
 * 🔴 SO THE RULE IS: A ROW HERE MUST NAME A LIVE `keydown` PATH. The bottom two come from
 * `lib/learn/canvas-hotkeys.ts`, which decides them and is tested; `canvas-composer.tsx`
 * and `learning-canvas.tsx` are what listen. The top two are the composer's textarea.
 * Anything added later gets the same standard — find the listener before writing the row.
 */
const KEYBOARD_SHORTCUTS: { label: string; keys: string; note: string }[] = [
  { label: "Send", keys: "Return", note: "From the composer, whatever you have typed or attached." },
  { label: "New line", keys: "Shift Return", note: "Keeps the composer open instead of sending." },
  {
    label: "Talk",
    keys: "Hold Space",
    note: "Anywhere outside the typing box. Let go to stop. Needs a browser with speech recognition — Firefox does not have it.",
  },
  {
    label: "Continue",
    keys: "⌘ Return",
    note: "Presses the Continue on screen when there is one. Ctrl Return on Windows and Linux.",
  },
];

export function SettingsSurface({ initialSection = "general" }: { initialSection?: SettingsSection; checkoutStatus?: string }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [usageBars, setUsageBars] = useState<UsageBar[] | null>(null);
  // Tri-state on purpose: a browser without the Storage API used to sit on
  // "Calculating available storage…" forever, which reads as a hang rather than
  // as an answer. "unsupported" is a real outcome and says so.
  const [storage, setStorage] = useState<{ used: number } | "unsupported" | null>(null);
  const { preference, accent, scale, darkTone, libraryFullScreen, bloubShape, setTheme, setAccent, setScale, setDarkTone, setLibraryFullScreen, setBloubShape } = useTheme();

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
    if (section !== "general") return;
    if (!navigator.storage?.estimate) {
      setStorage("unsupported");
      return;
    }
    let alive = true;
    void navigator.storage.estimate().then((estimate) => {
      if (alive) setStorage({ used: estimate.usage ?? 0 });
    });
    return () => { alive = false; };
  }, [section]);

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
          <SettingsPage title="General" description="How the workspace arranges itself on this device.">
            <SettingsCard>
              <SettingsRow
                // 🔴 THE PROSE NAMES NO DESTINATIONS, AND THAT IS THE POINT. It used to say
                // "leaves the Study/Library/Calendar rail in place" — written when Study was
                // a destination, still on screen long after it stopped being one. The rail is
                // drawn from `lib/workspace/sidebar-nav.ts`; any sentence here that lists its
                // rows is a second copy of that list which nobody will remember to update.
                description="Full screen gives Library the whole window, with a Back button to leave it. Keep Nemesis sidebar leaves the workspace navigation in place alongside it."
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
              {/* One line, not a page. See the file header. */}
              <SettingsRow
                description="What this browser is holding on to: your appearance choices, and previews it has already drawn once."
                label="Browser storage"
              >
                <span className="text-xs tabular-nums text-(--ui-text-secondary)">
                  {storage === null
                    ? "Checking…"
                    : storage === "unsupported"
                      ? "Not available in this browser"
                      : `${(storage.used / 1024 / 1024).toFixed(1)} MB`}
                </span>
              </SettingsRow>
            </SettingsCard>
          </SettingsPage>
        )}

        {section === "appearance" && (
          <SettingsPage title="Appearance" description="Saved on this device and applied immediately.">
            <SettingsCard title="Theme"><div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">{THEME_OPTIONS.map((item) => <button aria-pressed={preference === item.id} className={cn("rounded-xl border border-(--ui-stroke-secondary) bg-background p-2 text-left text-xs font-medium hover:bg-(--ui-control-hover-background)", preference === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)")} key={item.id} onClick={() => setTheme(item.id)} type="button"><span className="theme-swatch mb-2" data-theme-preview={item.id} aria-hidden="true"><span className="tp-rail" /><span className="tp-page"><span className="tp-line" /><span className="tp-line short" /><span className="tp-dot" /></span></span>{item.label}</button>)}</div></SettingsCard>
            <SettingsCard title="Dark tone"><div className="flex flex-wrap gap-2">{DARK_TONE_OPTIONS.map((item) => <button aria-pressed={darkTone === item.id} className={cn("flex items-center gap-2 rounded-xl border border-(--ui-stroke-secondary) bg-background px-3 py-2 text-xs font-medium hover:bg-(--ui-control-hover-background)", darkTone === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)")} key={item.id} onClick={() => setDarkTone(item.id)} type="button"><span aria-hidden className="size-4 rounded-full border border-(--ui-stroke-secondary)" style={{ backgroundColor: item.color }} />{item.label}</button>)}</div><p className="mt-3 text-[0.7rem] text-(--ui-text-tertiary)">How surfaces look while the theme is dark: Black is pure black, Charcoal is a softer dark gray.</p></SettingsCard>
            <SettingsCard title="Accent color">
              <div className="flex flex-wrap gap-2">{ACCENT_OPTIONS.map((item) => <button aria-label={item.label} aria-pressed={accent === item.id} className={cn("grid size-10 place-items-center rounded-full border border-(--ui-stroke-secondary)", accent === item.id && "ring-2 ring-offset-2 ring-offset-background")} key={item.id} onClick={() => setAccent(item.id)} style={{ color: item.color }} title={item.label} type="button"><span className="size-6 rounded-full" style={{ backgroundColor: item.color }} /></button>)}</div>
              {/* Owner 2026-08-20: "the send button is hardcoded green and does not change with
                  the other color changes". It does now — see applyAccent in theme-provider.tsx.
                  Saying so here because the send button is the most visible thing this control
                  moves, and it is off screen while you are looking at these dots. */}
              <p className="mt-3 text-[0.7rem] text-(--ui-text-tertiary)">Tints the workspace and colours the send button. Default is the app&rsquo;s own quiet green.</p>
            </SettingsCard>
            <SettingsCard title="Your character">
              {/* 🔴 THE PREVIEW IS THE REAL THING, FROZEN — not a picture of it. The engine is a
                  pure function of time, so a still costs one paint and no animation loop, and it
                  cannot drift out of date with what the canvas actually renders. */}
              <div className="flex items-center gap-5 max-sm:flex-col max-sm:items-start">
                <div className="grid size-[92px] shrink-0 place-items-center rounded-2xl border border-(--ui-stroke-secondary)">
                  <BloubBot frozenAt={1} shape={bloubShape} size={76} state="idle" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="mb-1.5 text-[0.7rem] text-(--ui-text-tertiary)">Shape</p>
                    <div className="flex flex-wrap gap-2">
                      {SHAPES.map((item) => (
                        <button
                          aria-label={item.id}
                          aria-pressed={bloubShape === item.id}
                          className={cn(
                            "grid size-11 place-items-center rounded-xl border border-(--ui-stroke-secondary) bg-background hover:bg-(--ui-control-hover-background)",
                            bloubShape === item.id && "border-(--theme-primary) ring-1 ring-(--theme-primary)",
                          )}
                          key={item.id}
                          onClick={() => setBloubShape(item.id)}
                          type="button"
                        >
                          {/* Drawn in the accent, like every other character on screen — so the
                              swatch is answering "what shape", which is the only thing left to ask. */}
                          <BloubBot frozenAt={1} shape={item.id} size={28} state="idle" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* 🔴 THE COLOUR PICKER IS GONE, AND THE COPY SAYS WHERE THE COLOUR WENT (owner
                  2026-08-21: "make the character follow the accent color"). A removed control
                  that is not accounted for reads as a control that broke, and this one sat
                  directly under Accent colour — the setting that now governs it. */}
              <p className="mt-3 text-[0.7rem] text-(--ui-text-tertiary)">
                The character sits above the composer while you work, and comes forward to the
                middle of the page while Nemesis is thinking. Some animations draw their own
                body — the shape you pick is the one it returns to at rest. Its colour is the
                accent colour above.
              </p>
            </SettingsCard>
            <SettingsCard title="Scaling"><div className="flex flex-wrap gap-2">{SCALE_PRESETS.map((preset) => <button aria-pressed={scale === preset} className={cn("min-w-16 rounded-xl border border-(--ui-stroke-secondary) bg-background px-3 py-2 text-xs font-semibold tabular-nums hover:bg-(--ui-control-hover-background)", scale === preset && "border-(--theme-primary) text-(--theme-primary) ring-1 ring-(--theme-primary)")} key={preset} onClick={() => setScale(preset)} type="button">{preset}%</button>)}</div><p className="mt-3 text-[0.7rem] text-(--ui-text-tertiary)">Everything in the app grows or shrinks together. Currently {scale}%.</p></SettingsCard>
          </SettingsPage>
        )}

        {section === "usage" && <UsageSettings bars={usageBars} />}

        {section === "billing" && <SettingsPage title="Billing" description="Manage your plan and payment details."><BillingSettings /></SettingsPage>}

        {section === "security" && (
          <SettingsPage title="Security & login" description="Your password and the extra checks that protect sign-in.">
            <SecuritySettings />
          </SettingsPage>
        )}

        {section === "keyboard" && (
          <SettingsPage title="Keyboard shortcuts" description="Every key the canvas listens for. There are four.">
            <SettingsCard>
              {KEYBOARD_SHORTCUTS.map((shortcut) => (
                <SettingsRow description={shortcut.note} key={shortcut.label} label={shortcut.label}>
                  <kbd className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 py-1 font-mono text-[0.7rem]">{shortcut.keys}</kbd>
                </SettingsRow>
              ))}
            </SettingsCard>
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
