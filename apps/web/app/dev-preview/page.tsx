import Link from "next/link";

/**
 * One door to every preview surface.
 *
 * Owner, 2026-09-09: "could you show me the actual design system ... so that I can see how the
 * components will look throughout the app." There were 47 routes under /dev-preview and no way in
 * except knowing the URL. This is the way in.
 *
 * Ordered by what is being reviewed right now, not alphabetically. The design-system group is
 * first because that is the live question.
 */

const GROUPS: { title: string; note: string; items: { href: string; name: string; note: string }[] }[] = [
  {
    title: "Design system",
    note: "The measured system and the surfaces built on it. The app follows /design/DESIGN.md; the site, sign-in and pricing follow Sana, measured.",
    items: [
      {
        href: "/dev-preview/system",
        name: "The design system",
        note: "Everything on one page: colour, gradients, type, spacing, radius, elevation, motion, controls, cards, overlays, icons. Every value says where it came from.",
      },
      {
        href: "/dev-preview/design",
        name: "Component gallery",
        note: "Every primitive at every size and state: nine type steps, four button variants, inputs, toggles, surfaces. This is what the app is being migrated onto.",
      },
      {
        href: "/sign-in",
        name: "Sign-in (live)",
        note: "sana.ai's sign-in, one for one: the real page, not a preview.",
      },
      {
        href: "/dev-preview/cards",
        name: "Cards",
        note: "Three card shapes and four accents, with the flip, the grading and the dropdown motion. Every colour measured, with its source.",
      },
      {
        href: "/pricing",
        name: "Pricing (live)",
        note: "sana.ai's pricing panel, the same numbers as the marketing site's pricing page.",
      },
      {
        href: "/dev-preview/design-variations",
        name: "Design variations",
        note: "Earlier explorations, kept for comparison.",
      },
    ],
  },
  {
    title: "Canvas and workspace",
    note: "The surfaces the design system has still to reach.",
    items: [
      { href: "/dev-preview/board", name: "Board", note: "The spatial canvas." },
      { href: "/dev-preview/canvas-home", name: "Canvas home", note: "The front door." },
      { href: "/dev-preview/workspace", name: "Workspace", note: "Shell, sidebar and panels." },
      { href: "/dev-preview/reader", name: "Reader", note: "The document reading pane." },
      { href: "/dev-preview/sources-panel", name: "Sources panel", note: "Attached material." },
      { href: "/dev-preview/dock-tabs", name: "Dock tabs", note: "Panel tab chrome." },
    ],
  },
  {
    title: "Study",
    note: "",
    items: [
      { href: "/dev-preview/flashcards", name: "Flashcards", note: "The Anki-style deck." },
      { href: "/dev-preview/check", name: "Check", note: "Quiz and test cards." },
      { href: "/dev-preview/study-panel", name: "Study panel", note: "Scheduling and review." },
      { href: "/dev-preview/course", name: "Course", note: "Lessons and structure." },
      { href: "/dev-preview/course-map", name: "Course map", note: "The outline view." },
      { href: "/dev-preview/drill", name: "Drill", note: "Practice loop." },
    ],
  },
  {
    title: "Character",
    note: "The mascot's poses, motion and attention.",
    items: [
      { href: "/dev-preview/character-studio", name: "Character studio", note: "Poses and expressions." },
      { href: "/dev-preview/mascot-lab", name: "Mascot lab", note: "Motion sandbox." },
      { href: "/dev-preview/mascot-language", name: "Mascot language", note: "The vocabulary." },
      { href: "/dev-preview/mascot-schedule", name: "Mascot schedule", note: "What plays when." },
      { href: "/dev-preview/avatar", name: "Avatar", note: "The small mark." },
    ],
  },
  {
    title: "Other",
    note: "",
    items: [
      { href: "/dev-preview/library", name: "Library", note: "Shelves and folders." },
      { href: "/dev-preview/calendar-week", name: "Calendar", note: "Week grid." },
      { href: "/dev-preview/visual-lab", name: "Visual lab", note: "Figures and diagrams." },
      { href: "/dev-preview/exports", name: "Exports", note: "Output formats." },
      { href: "/dev-preview/voice-audio-player", name: "Voice", note: "Playback controls." },
    ],
  },
];

export default function DevPreviewIndex() {
  return (
    <main className="dp-index">
      <style>{`
        .dp-index{--ink:#0a1217;--ink-60:rgba(10,18,23,.6);--ink-40:rgba(10,18,23,.4);
          --ink-08:rgba(10,18,23,.08);--ink-04:rgba(10,18,23,.04);--paper:#fff;
          min-height:100svh;background:var(--paper);color:var(--ink);
          font-family:"Inter Variable",Inter,-apple-system,system-ui,sans-serif;
          padding:72px 40px 120px}
        [data-theme="dark"] .dp-index{--ink:#f3f5f6;--ink-60:rgba(243,245,246,.6);
          --ink-40:rgba(243,245,246,.4);--ink-08:rgba(243,245,246,.1);
          --ink-04:rgba(243,245,246,.06);--paper:#0d0f10}
        .dp-index *{box-sizing:border-box}
        .dp-wrap{max-width:920px;margin:0 auto}
        .dp-h1{font-size:44px;font-weight:400;line-height:48.4px;letter-spacing:-.66px;margin:0}
        .dp-sub{font-size:16px;line-height:22.4px;color:var(--ink-60);margin:14px 0 0;max-width:620px}
        .dp-group{margin-top:56px}
        .dp-group h2{font-size:12px;font-weight:500;line-height:12px;letter-spacing:.6px;
          text-transform:uppercase;color:var(--ink-40);margin:0 0 6px;
          font-family:"JetBrains Mono",ui-monospace,monospace}
        .dp-group .dp-note{font-size:14px;line-height:19.6px;color:var(--ink-60);margin:0 0 18px;max-width:620px}
        .dp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:10px}
        .dp-card{display:block;text-decoration:none;color:inherit;border-radius:12px;padding:16px 18px;
          box-shadow:inset 0 0 0 1px var(--ink-08);
          transition:background .18s ease-out,box-shadow .18s ease-out}
        .dp-card:hover{background:var(--ink-04);box-shadow:inset 0 0 0 1px var(--ink-40)}
        .dp-card b{display:block;font-size:16px;font-weight:500;line-height:22.4px;letter-spacing:-.16px}
        .dp-card span{display:block;margin-top:4px;font-size:14px;line-height:19.6px;color:var(--ink-60)}
        @media (max-width:720px){.dp-index{padding:48px 20px 80px}
          .dp-h1{font-size:32px;line-height:35px;letter-spacing:-.5px}}
      `}</style>
      <div className="dp-wrap">
        <h1 className="dp-h1">Previews</h1>
        <p className="dp-sub">
          Every in-progress surface, on one page. Nothing here is live. The landing page lives in
          the other app, at <code>localhost:3340/preview</code>.
        </p>

        {GROUPS.map((group) => (
          <section className="dp-group" key={group.title}>
            <h2>{group.title}</h2>
            {group.note ? <p className="dp-note">{group.note}</p> : null}
            <div className="dp-grid">
              {group.items.map((item) => (
                <Link className="dp-card" href={item.href} key={item.href}>
                  <b>{item.name}</b>
                  <span>{item.note}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
