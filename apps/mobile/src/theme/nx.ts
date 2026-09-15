/**
 * Design tokens for the 2026-09 iPhone app, lifted 1:1 from the Claude Design
 * canvas "Nemesis iPhone Screens" (gen.py `.nx` / `.nx.dark` blocks).
 * Everything in the rebuilt app reads colours, type and motion from here.
 */
import { useColorScheme } from 'react-native';

export type NxColors = {
  bg: string;
  sunk: string;
  card: string;
  t1: string;
  t2: string;
  t3: string;
  ln: string;
  soft: string;
  sel: string;
  ring: string;
  inv: string;
  onInv: string;
  acc: string;
  danger: string;
  ok: string;
  dim: string;
  c1: string;
  c2: string;
  c3: string;
};

export const nxLight: NxColors = {
  bg: '#ffffff',
  sunk: '#f7f6f3',
  card: '#ffffff',
  t1: '#2c2c2b',
  t2: '#7d7a75',
  t3: '#ada9a3',
  ln: '#ebeae7',
  soft: 'rgba(42,28,0,0.045)',
  sel: 'rgba(42,28,0,0.07)',
  ring: 'rgba(42,28,0,0.12)',
  inv: '#2c2c2b',
  onInv: '#ffffff',
  acc: '#3b93f0',
  danger: '#d44c47',
  ok: '#448361',
  dim: 'rgba(15,12,8,0.32)',
  c1: '#ece6db',
  c2: '#dfe8ef',
  c3: '#e8e1ee',
};

export const nxDark: NxColors = {
  bg: '#191919',
  sunk: '#202020',
  card: '#252525',
  t1: '#e3e2e0',
  t2: '#9b9a97',
  t3: '#6b6a67',
  ln: 'rgba(255,255,255,0.08)',
  soft: 'rgba(255,255,255,0.05)',
  sel: 'rgba(255,255,255,0.09)',
  ring: 'rgba(255,255,255,0.14)',
  inv: '#e3e2e0',
  onInv: '#191919',
  acc: '#3b93f0',
  danger: '#e5625c',
  ok: '#5aa57a',
  dim: 'rgba(0,0,0,0.55)',
  c1: '#3a342c',
  c2: '#2b3540',
  c3: '#352f3c',
};

/** Type ramp from the canvas: row title, row meta, section label, h2, body, page title. */
export const nxType = {
  pageTitle: { fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.4 },
  pageEmoji: { fontSize: 40, lineHeight: 48 },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 26 },
  rowTitle: { fontSize: 16, lineHeight: 22 },
  rowMeta: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tab: { fontSize: 15, fontWeight: '500' },
  pill: { fontSize: 14, fontWeight: '500' },
} as const;

/** Sizes shared by rows, buttons and floating bars. */
export const nxSize = {
  row: 52,
  iconButton: 44,
  button: 50,
  buttonRadius: 10,
  pill: 34,
  sheetRadius: 24,
  gutter: 16,
  pageGutter: 20,
} as const;

/** Motion: calm and quick, like Notion. cubic-bezier(.32,.72,0,1). */
export const nxEase = [0.32, 0.72, 0, 1] as const;
export const nxDuration = { fast: 180, base: 280, slow: 420 } as const;

export function useNx(): NxColors {
  return useColorScheme() === 'dark' ? nxDark : nxLight;
}
