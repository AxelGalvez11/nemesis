"use client";

import { useId, useState } from "react";

import { Bold, Check, Plus, Search, Settings, Trash2 } from "lucide-react";

import {
  Button,
  Checkbox,
  Icon,
  IconButton,
  Input,
  SegmentedControl,
  Text,
  Textarea,
  Toggle,
} from "@/components/design";

import "./system.css";

/**
 * The whole design system on one page.
 *
 * Owner, 2026-09-09: "I want to see everything on one page like the whole design system, the
 * colors, the gradients, etc. Just give me the whole design portfolio."
 *
 * 🔴 THE CONTROLS ARE THE REAL PRIMITIVES, imported from @/components/design. A system page that
 * re-implements its own buttons is a drawing of a design system, not a view of one — it stays
 * pretty while the app drifts underneath it. If a token moves, this page moves.
 *
 * 🔴 EVERY VALUE CARRIES ITS SOURCE, and the source got better. First pass sampled the acid lime
 * out of Sana's product photograph (#CDFD01). Then their APP turned out to declare 831 CSS custom
 * properties, including --color-background-accent: #cdfe00 — the real value, one bit off in two
 * channels from the pixel sample because a WebP is lossy. Their marketing site holds only two
 * saturated colours; their product holds the system. Read the app, not the brochure.
 */

const NEUTRALS = ["--n-2", "--n-4", "--n-6", "--n-10", "--n-14", "--n-20", "--n-30", "--n-45", "--n-60", "--n-80", "--n-100"];

const SEMANTIC: [string, string][] = [
  ["--bg-page", "the ground everything sits on"],
  ["--bg-surface", "a raised sheet"],
  ["--bg-sunken", "a well"],
  ["--bg-hover", "pointer over a target"],
  ["--border-subtle", "a hairline you barely see"],
  ["--border-default", "a hairline you do"],
  ["--text-primary", "reading"],
  ["--text-secondary", "supporting"],
  ["--text-muted", "captions and provenance"],
];

const BRIGHTS = [
  { name: "Acid lime", hex: "#CDFE00", on: "#131313", src: "Their own token: --color-background-accent. Sampling their product photo first gave #CDFD01 — a lossy WebP is one bit off in two channels. The stylesheet is the truth." },
  { name: "Electric", hex: "#0055FF", on: "#FFFFFF", src: "One of exactly two saturated colours in Sana's whole stylesheet." },
  { name: "Ember", hex: "#FF6400", on: "#FFFFFF", src: "The other one. A pair, not a palette." },
  { name: "Indigo", hex: "#4700DE", on: "#FFFFFF", src: "The single real gradient on sanalabs.com, measured at 432x50 on a -45deg linear." },
  { name: "Ground", hex: "#131314", on: "#CDFE00", src: "--color-background-secondary. The near-black the accent is always used against." },
];

const GRADS: [string, string, boolean][] = [
  ["g-deep", "deep", false], ["g-cyan", "cyan", false], ["g-azure", "azure", false],
  ["g-cobalt", "cobalt", false], ["g-dusk", "dusk", false], ["g-ice", "ice", true],
  ["g-acid", "acid", false], ["g-ember", "ember", false],
];

const TYPE: [string, string][] = [
  ["display", "The best code is the code you never wrote"],
  ["title", "The best code is the code you never wrote"],
  ["title-sm", "The best code is the code you never wrote"],
  ["body-lg", "The best code is the code you never wrote"],
  ["body", "The best code is the code you never wrote"],
  ["ui-lg", "The best code is the code you never wrote"],
  ["ui", "The best code is the code you never wrote"],
  ["caption", "The best code is the code you never wrote"],
  ["meta", "The best code is the code you never wrote"],
];

const SPACES = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64];
const RADII = [
  { tok: "--radius-2", label: "2" }, { tok: "--radius-4", label: "4" },
  { tok: "--radius-6", label: "6" }, { tok: "--radius-8", label: "8" },
  { tok: "--radius-10", label: "10" }, { tok: "--radius-12", label: "12" },
  { tok: "--radius-full", label: "full" },
] as const;

/** Colour belongs to the cards you BROWSE. Never to the one you study from. */
const CARD_TYPES = [
  { kind: "Deck", tint: "#0055FF", title: "Pulmonary devices", body: "42 cards · 12 due today" },
  { kind: "Study guide", tint: "#4700DE", title: "Deposition mechanisms", body: "6 sections from Lecture 9" },
  { kind: "Test", tint: "#FF6400", title: "Devices, timed", body: "20 questions · 25 minutes" },
  { kind: "Note", tint: "#CDFE00", title: "Aerosol particle size", body: "Written by you, edited yesterday" },
];

export default function DesignSystemPortfolio() {
  const [menu, setMenu] = useState(false);
  const [seg, setSeg] = useState("all");
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [go, setGo] = useState(false);
  const gid = useId().replace(/:/g, "");

  const SECTIONS = [
    ["colour", "Colour"], ["gradients", "Gradients"], ["type", "Typography"],
    ["space", "Spacing & radius"], ["elevation", "Elevation"], ["motion", "Motion"],
    ["controls", "Controls"], ["cards", "Cards"], ["overlays", "Overlays"], ["icons", "Icons"],
  ];

  return (
    <main className="ds">
      <div className="ds-shell">
        <nav className="ds-toc">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>{label}</a>
          ))}
        </nav>

        <div className="ds-main">
          <h1 className="ds-title">The design system</h1>
          <p className="ds-lede">
            Every token, every primitive, every state, on one page. The controls below are the real
            components the app imports, not drawings of them. Each colour says where it came from.
          </p>

          {/* ── COLOUR ─────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="colour">
            <h2>Colour</h2>
            <p className="ds-rule">
              Every neutral is <b>one ink at an alpha step</b>. There is no grey palette. Figma,
              Sana and x.ai all build neutrals this way independently, and we already did — it is
              the only construction all three references agree on.
            </p>
            <div className="ds-ramp">
              {NEUTRALS.map((n) => (
                <div className="ds-chip-c" key={n}>
                  <i style={{ background: `var(${n})` }} />
                  <p>{n.replace("--n-", "n ")}</p>
                </div>
              ))}
            </div>

            <p className="ds-sub">Semantic</p>
            <div className="ds-ramp">
              {SEMANTIC.map(([tok, use]) => (
                <div className="ds-chip-c" key={tok}>
                  <i style={{ background: `var(${tok})` }} />
                  <p>{tok.replace("--", "")}<br /><span style={{ opacity: 0.6 }}>{use}</span></p>
                </div>
              ))}
            </div>

            <p className="ds-sub">Bright — for browsing, never for studying</p>
            <div className="ds-brights">
              {BRIGHTS.map((b) => (
                <div className="ds-bright" key={b.hex}>
                  <i style={{ background: b.hex, color: b.on }}>{b.hex}</i>
                  <p><b>{b.name}</b><br />{b.src}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── GRADIENTS ──────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="gradients">
            <h2>Gradients</h2>
            <p className="ds-rule">
              Meshes, not two-stop ramps: several large radial stops with transparent falloff over a
              linear base, plus a grain layer. The grain is the whole trick — a mathematically smooth
              gradient bands visibly on any 8-bit screen, and dithering it is what separates gradient
              artwork from a gradient in a div.
            </p>
            <p className="ds-src">
              Where they are allowed: <b>inside a frame</b>, where a product screenshot would
              otherwise go, and on the sign-in panel. Never behind reading text. figma.com carries
              exactly one gradient across 8,973px; a wash behind a headline is the single clearest
              signature of a generated interface.
            </p>
            <div className="ds-grads" style={{ marginTop: 16 }}>
              {GRADS.map(([cls, name, light]) => (
                <div className={`ds-grad${light ? " on-light" : ""}`} key={cls}>
                  <div className={`ds-grad-mesh ${cls}`} />
                  <svg className="ds-grad-grain" aria-hidden="true" focusable="false">
                    <filter id={`g-${gid}-${cls}`}>
                      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
                      <feColorMatrix type="saturate" values="0" />
                    </filter>
                    <rect width="100%" height="100%" filter={`url(#g-${gid}-${cls})`} />
                  </svg>
                  <div className="ds-grad-shaft" />
                  <span className="ds-grad-name">{name}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── TYPE ───────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="type">
            <h2>Typography</h2>
            <p className="ds-rule">
              Nine steps, Inter Variable with the optical-size axis live. Tracking crosses zero at
              12px: positive below, increasingly negative above. Weight never reaches 700.
            </p>
            {TYPE.map(([v, sample]) => (
              <div className="ds-type-row" key={v}>
                <code>{v}</code>
                <Text variant={v as never}>{sample}</Text>
              </div>
            ))}
          </section>

          {/* ── SPACE ──────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="space">
            <h2>Spacing &amp; radius</h2>
            <p className="ds-rule">
              Twelve spacing steps and seven radii. The rule that decides which radius: the closer a
              control sits to the learner&apos;s own content, the rounder it gets.
            </p>
            <div className="ds-scale">
              {SPACES.map((s) => (
                <div key={s}>
                  <i style={{ width: s, height: 44 }} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
            <p className="ds-sub">Radius</p>
            <div className="ds-radii">
              {RADII.map((r) => (
                <div key={r.tok}>
                  <i style={{ borderRadius: `var(${r.tok})` }} />
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── ELEVATION ──────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="elevation">
            <h2>Elevation</h2>
            <p className="ds-rule">
              Three levels and no tight shadow anywhere. A <code>0 1px 2px</code> is the clearest
              signature of a generated interface; something that must look raised gets a border.
            </p>
            <div className="ds-elevs">
              <div style={{ boxShadow: "var(--elev-raised)" }}>raised · a border</div>
              <div style={{ boxShadow: "var(--elev-floating)" }}>floating</div>
              <div style={{ boxShadow: "var(--elev-overlay)" }}>overlay</div>
            </div>
          </section>

          {/* ── MOTION ─────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="motion">
            <h2>Motion</h2>
            <p className="ds-rule">
              Two vocabularies, and they do not mix. Marketing surfaces use Figma&apos;s: 0.18s
              ease-out, no spring anywhere on their whole page. App surfaces use Sana&apos;s: 0.3s on
              their signature curve, plus a real spring that overshoots to 1.263 before settling.
            </p>
            <Button variant="secondary" size="md" onClick={() => { setGo(false); requestAnimationFrame(() => setGo(true)); }}>
              Play all three
            </Button>
            <div style={{ marginTop: 16 }}>
              {([["fig", "0.18s ease-out", "Figma · every state change on their site"],
                 ["sana", "0.3s (0.16,1,0.3,1)", "Sana · used 31 times on one page"],
                 ["spr", "1s spring → 1.263", "Sana · the overshoot, for a card turning over"]] as const).map(([cls, code, note]) => (
                <div className="ds-mrow" key={cls}>
                  <code>{code}</code>
                  <div>
                    <div className={`ds-track${go ? " go" : ""}`} style={{ width: "100%" }}>
                      <div className={`ds-dot ${cls}`} style={{ left: 8, right: "auto" }} />
                    </div>
                    <p className="ds-src">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── CONTROLS ───────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="controls">
            <h2>Controls</h2>
            <p className="ds-rule">The real primitives, imported from the same place the app imports them.</p>
            {(["sm", "md", "lg", "content"] as const).map((size) => (
              <div className="ds-shelf" key={size} style={{ marginBottom: 12 }}>
                <Button variant="primary" size={size}>Primary</Button>
                <Button variant="secondary" size={size}>Secondary</Button>
                <Button variant="ghost" size={size}>Ghost</Button>
                <Button variant="danger" size={size}>Danger</Button>
                <Button variant="secondary" size={size} iconStart={Plus}>With icon</Button>
                <Button variant="secondary" size={size} loading>Loading</Button>
                <Button variant="secondary" size={size} disabled>Disabled</Button>
              </div>
            ))}
            <div className="ds-shelf" style={{ marginTop: 20 }}>
              <IconButton icon={Search} label="Search" size={24} />
              <IconButton icon={Settings} label="Settings" size={28} />
              <IconButton icon={Bold} label="Bold" size={32} />
              <IconButton icon={Trash2} label="Delete" size={36} variant="danger" />
            </div>
            <div className="ds-shelf" style={{ marginTop: 24, alignItems: "flex-start" }}>
              <div style={{ width: 260 }}>
                <Input placeholder="name@school.edu" />
                <div style={{ height: 10 }} />
                <Textarea placeholder="A longer answer" rows={3} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Checkbox checked={checked} onChange={setChecked} label="Include figures" />
                <Toggle checked={on} onChange={setOn} label="Shuffle the deck" />
                <SegmentedControl
                  value={seg}
                  onChange={setSeg}
                  options={[
                    { value: "all", label: "All" },
                    { value: "due", label: "Due" },
                    { value: "new", label: "New" },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* ── CARDS ──────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="cards">
            <h2>Cards</h2>
            <p className="ds-rule">
              <b>The flashcard is white and stays white.</b> While you are trying to recall
              something, nothing on screen should compete with the thing you are recalling. Colour
              on a flashcard is decoration during the one moment decoration costs.
            </p>
            <div style={{ maxWidth: 380, marginTop: 4 }}>
              <div className="ds-flash">
                <p className="q">Why does a spacer improve delivery from a metered-dose inhaler?</p>
                <span className="hint">Space to turn over</span>
              </div>
            </div>
            <p className="ds-src">
              Ruled plain three times: &ldquo;plain Anki style with just an X and a check&rdquo;, and
              again on 2026-09-09 — &ldquo;the flash cards are supposed to be like regular white&rdquo;.
            </p>

            <p className="ds-sub">Everything you browse, though, is tinted by type</p>
            <p className="ds-src" style={{ marginBottom: 14 }}>
              A 3px top edge and a 12% wash. In a list of outputs, the tint tells a deck from a study
              guide from a test at a glance. That is work, not decoration.
            </p>
            <div className="ds-cards">
              {CARD_TYPES.map((c) => (
                <div className="ds-card is-typed" key={c.kind} style={{ ["--tint" as string]: c.tint }}>
                  <span className="ds-kind">{c.kind}</span>
                  <h4>{c.title}</h4>
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── OVERLAYS ───────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="overlays">
            <h2>Overlays</h2>
            <p className="ds-rule">
              Measured on figma.com: a menu rises 4px and fades over 0.18s. Nothing scales. A menu
              that scales in reads as a phone app on a desktop.
            </p>
            <div className="ds-overlay-row">
              <div className="ds-pop">
                <Button variant="secondary" size="md" onClick={() => setMenu((m) => !m)}>Actions</Button>
                <div className={`ds-menu${menu ? " is-open" : ""}`} role="menu">
                  {["Open", "Rename", "Move to project", "Export", "Delete"].map((i) => (
                    <button key={i} role="menuitem">{i}</button>
                  ))}
                </div>
              </div>
              <div className="ds-tip-wrap">
                <Button variant="ghost" size="md" iconStart={Settings}>Hover me</Button>
                <span className="ds-tip">Tooltips fade only, 0.15s</span>
              </div>
              <div className="ds-toast">
                <Icon icon={Check} size={16} />
                Deck created from 12 toggles
              </div>
            </div>
          </section>

          {/* ── ICONS ──────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="icons">
            <h2>Icons</h2>
            <p className="ds-rule">
              One library, 1.5px stroke, <code>currentColor</code>, sized with the control they sit
              in. Figma&apos;s own icons are a 24×24 grid at 1px (1.25 for chevrons); ours are 1.5 so
              they hold up against Inter rather than against their proprietary face.
            </p>
            <div className="ds-shelf">
              {[12, 14, 16, 20, 24].map((s) => (
                <div key={s} style={{ textAlign: "center" }}>
                  <Icon icon={Search} size={s as never} />
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>{s}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
