"use client";

import { useId, useState } from "react";

import {
  ArrowUp, Bold, Check, FileText, Layers, Mic, MoreHorizontal, Paperclip,
  Plus, Search, Settings, Sparkles, Trash2, X,
} from "lucide-react";

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
  GradientField,
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

/** One hue per gradient. Only lightness and chroma move — that is what makes it read as neon
 *  rather than as a colour blend. Hue 122 is the acid lime; 250 is the product blue. */
const GRADS: { name: string; h: number; c: string }[] = [
  { name: "lime", h: 122, c: ".23" }, { name: "cyan", h: 200, c: ".16" },
  { name: "azure", h: 250, c: ".19" }, { name: "violet", h: 292, c: ".22" },
  { name: "magenta", h: 340, c: ".22" }, { name: "ember", h: 46, c: ".19" },
];
const neonCore = (h: number, c: string) =>
  `radial-gradient(in oklab 42% 38% at 30% 26%, oklch(97% ${c} ${h}) 0%, oklch(88% ${c} ${h}) 26%, transparent 66%),` +
  `radial-gradient(in oklab 34% 30% at 72% 62%, oklch(92% ${c} ${h}) 0%, transparent 62%),` +
  `radial-gradient(in oklab 26% 24% at 52% 88%, oklch(84% ${c} ${h}) 0%, transparent 60%)`;
const neonBase = (h: number) =>
  `linear-gradient(in oklab 152deg, oklch(20% .04 ${h}), oklch(9% .02 ${h}) 62%, oklch(5% .012 ${h}))`;

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
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState("sources");
  const gid = useId().replace(/:/g, "");

  const SECTIONS = [
    ["colour", "Colour"], ["gradients", "Gradients"], ["type", "Typography"],
    ["space", "Spacing & radius"], ["elevation", "Elevation"], ["motion", "Motion"],
    ["controls", "Controls"], ["composer", "Composer"], ["panels", "Panels"],
    ["cards", "Cards"], ["overlays", "Overlays"], ["icons", "Icons"],
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
              <b>Rendered by a WebGL shader, one hue each, and no black anywhere.</b> Lightness
              runs 0.42 to 0.99 and chroma peaks in the mid-lights, all inside a single hue — the
              darkest pixel is a deep saturated version of the colour, not a shadow. Four CSS
              attempts came before this and every one of them reached its dark end by falling to
              black, which quietly makes a single-hue gradient two colours.
            </p>
            <p className="ds-src">
              <b>The references do not use CSS gradients for hero art at all.</b> Measured by
              downloading their assets: x.ai/bot ships 1920×1280 rendered landscape abstractions —
              horizon, atmospheric depth, directional blur, heavy grain — at low chroma, nothing
              like neon. openai.com uses photography. sanalabs.com uses product shots on white. To
              match that we render images; CSS is not in the same medium. These are for surfaces
              where a rendered asset would be overkill, and they still never go behind reading text.
            </p>
            <div className="ds-grads" style={{ marginTop: 16 }}>
              {GRADS.map((g) => (
                <div className="ds-grad" key={g.name}>
                  <GradientField hue={g.h} chroma={Number(g.c) * 4.2} style={{ width: "100%", height: "100%" }} />
                  <span className="ds-grad-name">{g.name} · h{g.h}</span>
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

          {/* ── COMPOSER ───────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="composer">
            <h2>Composer</h2>
            <p className="ds-rule">
              The most-used surface in the product. A well that grows with its content, actions on
              the floor rather than in a toolbar above, and a send control that only reaches full
              contrast once there is something to send.
            </p>
            <p className="ds-src" style={{ marginBottom: 16 }}>
              Body is 16/25.6 at −0.1px, the reading size — a composer set in UI type tells you the
              app thinks your words are metadata. Radius 26 because it sits closest to the
              learner&apos;s own content, and the rule is that the nearer a control is to their
              content, the rounder it gets.
            </p>
            <div className="ds-composer">
              <textarea
                placeholder="Ask anything, or drop a lecture in"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="ds-composer-floor">
                <button className="ds-pill"><Plus size={16} strokeWidth={1.5} /> Add</button>
                <button className="ds-pill is-on"><Sparkles size={16} strokeWidth={1.5} /> Canvas</button>
                <button className="ds-pill"><Paperclip size={16} strokeWidth={1.5} /></button>
                <span className="grow" />
                <button className="ds-pill"><Mic size={16} strokeWidth={1.5} /></button>
                <button
                  className={`ds-send${draft.trim() ? " is-ready" : ""}`}
                  aria-label="Send"
                >
                  <ArrowUp size={17} strokeWidth={2} />
                </button>
              </div>
            </div>
          </section>

          {/* ── PANELS ─────────────────────────────────────────────────────────────────── */}
          <section className="ds-sec" id="panels">
            <h2>Panels &amp; rails</h2>
            <p className="ds-rule">
              Three widths, and the rule that picks one: a panel holding <b>reading</b> is 420, a
              panel holding <b>controls</b> is 320, a rail holding <b>icons</b> is 52.
            </p>
            <p className="ds-src" style={{ marginBottom: 16 }}>
              Inside an elevated panel nothing wears the page ground. And a panel body is
              <code> flex: 1</code> inside a flex column — declared as a block it clips long
              documents and cannot scroll, which short fixtures hide for months.
            </p>
            <div className="ds-panels">
              <div className="ds-rail">
                {[Search, FileText, Layers, Settings].map((I, i) => (
                  <IconButton key={i} icon={I} label={`Rail ${i}`} size={32} />
                ))}
              </div>
              <div className="ds-panel" style={{ width: 320, flex: "0 0 320px" }}>
                <div className="ds-panel-head">
                  <b>Controls</b>
                  <span style={{ marginLeft: "auto" }} />
                  <IconButton icon={MoreHorizontal} label="More" size={24} />
                  <IconButton icon={X} label="Close" size={24} />
                </div>
                <div className="ds-panel-body">
                  {["All material", "Lecture 9.pdf", "Seminar notes", "Reading list"].map((r, i) => (
                    <div className={`ds-row-item${i === 1 ? " is-on" : ""}`} key={r}>
                      <Icon icon={FileText} size={14} />
                      {r}
                    </div>
                  ))}
                </div>
              </div>
              <div className="ds-panel" style={{ flex: 1 }}>
                <div className="ds-tabs">
                  {[["sources", "Sources"], ["notes", "Notes"], ["cards", "Cards"]].map(([v, l]) => (
                    <button key={v} className={`ds-tab${tab === v ? " is-on" : ""}`} onClick={() => setTab(v as string)}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="ds-panel-body">
                  <Text variant="body">
                    A reading panel runs at 420 and sets its text at the reading size. This body
                    scrolls independently of the page, which is the whole reason a panel exists.
                  </Text>
                </div>
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
              {[12, 14, 16, 20, 24].map((sz) => (
                <div key={sz} style={{ textAlign: "center" }}>
                  <Icon icon={Search} size={sz as never} />
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>{sz}</div>
                </div>
              ))}
            </div>

            <p className="ds-sub">Icon buttons — the glyph is derived, never passed</p>
            <p className="ds-src" style={{ marginBottom: 14 }}>
              The glyph is 50–60% of the box, measured on Sana and Figma. It is computed from the
              size so a call site cannot break the ratio, and every one of these requires a label:
              it is the whole accessible name, with no text to fall back on.
            </p>
            <div className="ds-ib-grid">
              {([24, 28, 32, 36] as const).map((sz) => (
                <div className="ds-ib-cell" key={sz}>
                  <IconButton icon={Search} label={`Search ${sz}`} size={sz} />
                  <span>{sz}px</span>
                </div>
              ))}
              {(["ghost", "secondary", "primary", "danger"] as const).map((v) => (
                <div className="ds-ib-cell" key={v}>
                  <IconButton icon={Trash2} label={v} size={32} variant={v} />
                  <span>{v}</span>
                </div>
              ))}
            </div>

            <p className="ds-sub">Avatars &amp; badges</p>
            <div className="ds-avatars">
              {[20, 24, 28, 32, 40].map((sz) => (
                <div className="ds-avatar" key={sz} style={{ width: sz, height: sz, fontSize: sz * 0.4 }}>
                  A
                </div>
              ))}
              <div className="ds-badges" style={{ marginLeft: 16 }}>
                <span className="ds-badge">New</span>
                <span className="ds-badge">12 due</span>
                <span className="ds-badge">Beta</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
