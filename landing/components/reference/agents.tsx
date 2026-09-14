import type { CSSProperties } from "react";

/**
 * Who is on the page: the student, the outside agents and Nemesis, drawn the same way everywhere.
 *
 * 🔴 NO LOGOS FOR OTHER COMPANIES, AND NOT THEIR BRAND COLOURS EITHER. Outside agents are an initial
 * on a tone from our own palette (owner, 2026-09-10: names, no logos). Nemesis is the character:
 * the squircle from lib/bloub/skins.ts (superellipse n = 4.2), eyes stood upright.
 */

export const TONE = { violet: "#8A63F0", azure: "#2A8CCD", emerald: "#17B87A", ink: "#0E1116", you: "#111110", orange: "#FF6A1A" } as const;

export type Agent = { name: string; label: string; tone: string; character?: boolean };

export const AGENT = {
  claude: { name: "Claude", label: "C", tone: TONE.violet },
  chatgpt: { name: "ChatGPT", label: "G", tone: TONE.azure },
  cursor: { name: "Cursor", label: "C", tone: TONE.emerald },
  nemesis: { name: "Nemesis", label: "N", tone: TONE.ink, character: true },
  you: { name: "You", label: "Y", tone: TONE.you },
} satisfies Record<string, Agent>;

/** The body's outline: a superellipse, sampled finely enough that no facet shows at 400px. */
export function squirclePath(cx: number, cy: number, a: number, b: number, n = 4.2, steps = 96): string {
  let d = "";
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + b * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

const BODY = squirclePath(20.5, 18, 20.5, 18);

/** The character as a still mark: 41 wide by 36 tall, ink body, paper eyes. */
export function CharacterMark({ size = 20, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 41 36" width={size} height={(size * 36) / 41} aria-hidden="true">
      <path d={BODY} fill={TONE.ink} />
      <rect x="13.2" y="10" width="4.4" height="11" rx="2.2" fill="#F9F9F9" />
      <rect x="23.4" y="10" width="4.4" height="11" rx="2.2" fill="#F9F9F9" />
    </svg>
  );
}

/** An agent's avatar: the character for Nemesis, an initial on a tone for everyone else. */
export function Avatar({ agent, size = 20, className }: { agent: Agent; size?: number; className?: string }) {
  if (agent.character) return <CharacterMark size={size} className={className} />;
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: 9999,
        background: agent.tone,
        color: "#fff",
        fontSize: Math.round(size * 0.46),
        fontWeight: 600,
        flex: "0 0 auto",
      }}
    >
      {agent.label}
    </span>
  );
}
