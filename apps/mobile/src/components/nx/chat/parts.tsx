/**
 * Chat pieces from the canvas (gen.py ai_chat, user_bubble, note_pill, srow, res_row, cite, glow_plum):
 * header, bubble, answer text with numbered citations, the one "N sources" pill, the steps row and the
 * faint cobalt glow behind a working turn.
 */
import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { NxPressable } from '../NxPressable';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatSource } from '@/lib/chat-thread';
import { nxType, useNx, type NxColors } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';

const cobalt = require('../../../../assets/images/nx/cobalt-hd.jpg');

// ---------- header (page_header with a centred title and one action) ----------

export function ChatHeader({ title, onBack, onMore }: { title: string; onBack: () => void; onMore?: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={onBack} hitSlop={6} style={styles.ib} accessibilityLabel="Back">
        <NxIcon name="chev_l" size={22} color={c.t1} />
      </Pressable>
      <View style={styles.headerTitle}>
        <Text numberOfLines={1} style={{ color: c.t1, fontSize: 16, lineHeight: 22, fontWeight: '600' }}>
          {title}
        </Text>
      </View>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={6} style={styles.ib} accessibilityLabel="Chat options">
          <NxIcon name="dots" size={20} color={c.t1} />
        </Pressable>
      ) : (
        <View style={styles.ib} />
      )}
    </View>
  );
}

// ---------- bubble and answer ----------

/** The question, with the note that was attached when it was sent shown as a chip above it (tap opens the note). */
export function UserBubble({ text, note }: { text: string; note?: { title: string; onPress: () => void } | null }) {
  const c = useNx();
  const bubble = (
    <View style={[styles.bubble, { backgroundColor: c.acc }, note && { maxWidth: '100%' }]}>
      <Text style={{ color: '#ffffff', fontSize: 16, lineHeight: 24 }}>{text}</Text>
    </View>
  );
  if (!note) return bubble;
  return (
    <View style={styles.withNote}>
      <NxPressable onPress={note.onPress} scaleTo={0.97} style={[styles.noteChip, { borderColor: c.ln, backgroundColor: c.bg }]} accessibilityLabel={`Open ${note.title}`}>
        <NxIcon name="notes" size={14} color={c.t2} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, color: c.t1 }}>
          {note.title}
        </Text>
      </NxPressable>
      {bubble}
    </View>
  );
}

function Cite({ n, c }: { n: number; c: NxColors }) {
  return (
    <View style={[styles.cite, { backgroundColor: c.sel }]}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: c.t2 }}>{n}</Text>
    </View>
  );
}

/** Inline runs: **bold**, [n] citations, markdown links (a link to a known source becomes its number). */
function inline(text: string, sources: ChatSource[], c: NxColors, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[(\d{1,2})\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<Text key={k} style={{ fontWeight: '600' }}>{m[1]}</Text>);
    else if (m[2]) {
      const n = Number(m[2]);
      out.push(n >= 1 && n <= Math.max(sources.length, 99) ? <Text key={k}> <Cite n={n} c={c} /></Text> : `[${m[2]}]`);
    } else if (m[3]) {
      const at = sources.findIndex((s) => s.url === m![4]);
      out.push(at >= 0 ? <Text key={k}>{m[3]} <Cite n={at + 1} c={c} /></Text> : m[3]);
    } else if (m[5]) out.push(<Text key={k} style={{ fontFamily: 'Menlo', fontSize: 14 }}>{m[5]}</Text>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The answer in the canvas body style (16/26). Light markdown only: headings, bullets, numbers, bold. */
export function AnswerText({ text, sources = [] }: { text: string; sources?: ChatSource[] }) {
  const c = useNx();
  const blocks = text.replace(/\r/g, '').split('\n');
  const nodes: React.ReactNode[] = [];
  blocks.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) return;
    const k = `b${i}`;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (heading) {
      nodes.push(
        <Text key={k} style={{ color: c.t1, fontSize: 17, lineHeight: 26, fontWeight: '600', marginTop: nodes.length ? 6 : 0 }}>
          {inline(heading[1], sources, c, k)}
        </Text>,
      );
    } else if (bullet || num) {
      nodes.push(
        <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={[nxType.body, { color: c.t3 }]}>{bullet ? '•' : `${num![1]}.`}</Text>
          <Text style={[nxType.body, { color: c.t1, flex: 1 }]}>{inline(bullet ? bullet[1] : num![2], sources, c, k)}</Text>
        </View>,
      );
    } else {
      nodes.push(
        <Text key={k} style={[nxType.body, { color: c.t1 }]}>
          {inline(line, sources, c, k)}
        </Text>,
      );
    }
  });
  return <View style={{ gap: 6 }}>{nodes}</View>;
}

// ---------- source marks ----------

const FAV = ['#6d7b8f', '#7c7a74', '#8a6d4e', '#5d7f6a'];

export function isNoteSource(s: ChatSource): boolean {
  return s.url.startsWith('nemesis://page/');
}

export function domainOf(url: string): string {
  const m = /^https?:\/\/([^/]+)/i.exec(url);
  return (m?.[1] ?? '').replace(/^www\./, '');
}

function favColor(url: string): string {
  const d = domainOf(url);
  let h = 0;
  for (let i = 0; i < d.length; i += 1) h = (h * 31 + d.charCodeAt(i)) >>> 0;
  return FAV[h % FAV.length];
}

/** fav1 / _srcdot: a note shows its emoji on a soft tile, a site shows its first letter on a muted colour. */
export function SourceMark({ source, size = 20, round = false, ring }: { source: ChatSource; size?: number; round?: boolean; ring?: string }) {
  const c = useNx();
  const note = isNoteSource(source);
  const letter = (domainOf(source.url)[0] ?? source.title[0] ?? '?').toUpperCase();
  return (
    <View
      style={{
        width: size + (ring ? 4 : 0),
        height: size + (ring ? 4 : 0),
        borderRadius: round ? 9999 : 5,
        backgroundColor: note ? c.sel : favColor(source.url),
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {note ? (
        <NxIcon name="notes" size={Math.round(size * 0.65)} color={c.t2} strokeWidth={1.6} />
      ) : (
        <Text style={{ fontSize: 11, fontWeight: '600', color: '#ffffff' }}>{letter}</Text>
      )}
    </View>
  );
}

/** note_pill: ONE outlined pill, up to three overlapping marks, "N sources". Same in chat and Explain. */
export function SourcesPill({ sources, onPress }: { sources: ChatSource[]; onPress: () => void }) {
  const c = useNx();
  if (!sources.length) return null;
  return (
    <View style={{ flexDirection: 'row' }}>
      <NxPressable onPress={onPress} scaleTo={0.96} style={({ pressed }) => [styles.pill, { borderColor: c.ring }, pressed && { backgroundColor: c.soft }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {sources.slice(0, 3).map((s, i) => (
            <View key={`${s.url}-${i}`} style={{ marginLeft: i ? -8 : 0 }}>
              <SourceMark source={s} size={22} round ring={i ? c.bg : undefined} />
            </View>
          ))}
        </View>
        <Text style={{ color: c.t1, fontSize: 14 }}>{sources.length === 1 ? '1 source' : `${sources.length} sources`}</Text>
      </NxPressable>
    </View>
  );
}

// ---------- steps ----------

/** srow: a quiet 15px line, optional lead and trail. `live` makes the words shimmer. */
export function StepLine({ lead, children, trail, onPress }: { lead?: React.ReactNode; children: React.ReactNode; trail?: React.ReactNode; onPress?: () => void }) {
  const body = (
    <View style={styles.srow}>
      {lead}
      {children}
      {trail}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function StepIcon({ name, color, size = 16 }: { name: NxIconName; color: string; size?: number }) {
  return <NxIcon name={name} size={size} color={color} strokeWidth={name.startsWith('chev') ? 2 : 1.6} />;
}

export function StepLabel({ text }: { text: string }) {
  const c = useNx();
  return <Text style={{ fontSize: 13, lineHeight: 18, color: c.t3 }}>{text}</Text>;
}

export function QueryPill({ query, small }: { query: string; small?: boolean }) {
  const c = useNx();
  return (
    <View style={[styles.query, { backgroundColor: c.sel, height: small ? 28 : 30, paddingHorizontal: small ? 10 : 12 }]}>
      <NxIcon name="search" size={small ? 13 : 14} color={c.t1} />
      <Text numberOfLines={1} style={{ color: c.t1, fontSize: small ? 13 : 14, flexShrink: 1 }}>
        {query}
      </Text>
    </View>
  );
}

/** res_row: mark, title (ellipsis), domain on the right. */
export function ResultRow({ source, onPress }: { source: ChatSource; onPress?: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.res, pressed && { opacity: 0.6 }]}>
      <SourceMark source={source} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: c.t1, fontSize: 14, lineHeight: 19 }}>
        {source.title || domainOf(source.url)}
      </Text>
      <Text numberOfLines={1} style={{ color: c.t3, fontSize: 13, flexShrink: 0, maxWidth: 150 }}>
        {isNoteSource(source) ? 'Your notes' : domainOf(source.url)}
      </Text>
    </Pressable>
  );
}

/** Up to four overlapping site marks (favs_html). */
export function MarkStack({ sources }: { sources: ChatSource[] }) {
  const c = useNx();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {sources.slice(0, 4).map((s, i) => (
        <View key={`${s.url}-${i}`} style={{ marginLeft: i ? -7 : 0 }}>
          <SourceMark source={s} size={18} ring={i ? c.bg : undefined} />
        </View>
      ))}
    </View>
  );
}

// ---------- glow ----------

/** glow_plum: the cobalt art at 14% (10% on the empty state), fading out toward the top. */
export function CobaltGlow({ height = 320, opacity = 0.14, solid = 0.25, breathe = true }: { height?: number; opacity?: number; solid?: number; breathe?: boolean }) {
  const c = useNx();
  const o = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!breathe || reduce) {
      o.value = 1;
      return;
    }
    o.value = withRepeat(withTiming(0.08 / 0.14, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(o);
  }, [breathe, reduce, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: undefined, height }, a]}>
      <Image source={cobalt} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity }]} />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.bg} stopOpacity={1} />
            <Stop offset={String(1 - solid)} stopColor={c.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      </Svg>
    </Animated.View>
  );
}

// ---------- empty chat (AIEmpty) ----------

export function NemesisTile({ size = 52, radius = 15, mark = 30 }: { size?: number; radius?: number; mark?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Image source={cobalt} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <NxIcon name="mark" size={mark} color="#ffffff" />
    </View>
  );
}

export const SUGGESTIONS = ['Explain a topic simply', 'Quiz me on something', 'Plan my study week'];

export function ChatHero({ hasNotes, onSuggest }: { hasNotes: boolean; onSuggest: (text: string) => void }) {
  const c = useNx();
  return (
    <View style={{ gap: 14 }}>
      <NemesisTile />
      <Text style={{ color: c.t1, fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.4 }}>What do you want to study?</Text>
      <Text style={{ color: c.t2, fontSize: 15, lineHeight: 22 }}>
        {hasNotes
          ? 'Ask anything. Nemesis answers from your own notes first, and searches the web when it needs to.'
          : 'You have no notes yet, so answers come from what Nemesis knows. Record a class and it will answer from your own notes.'}
      </Text>
      <View style={{ alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
        {SUGGESTIONS.map((s) => (
          <NxPressable key={s} onPress={() => onSuggest(s)} scaleTo={0.96} style={({ pressed }) => [styles.chip, { borderColor: c.ring }, pressed && { backgroundColor: c.soft }]}>
            <NxIcon name="spark" size={16} color={c.t1} />
            <Text style={{ color: c.t1, fontSize: 15 }}>{s}</Text>
          </NxPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 2 },
  headerTitle: { flex: 1, minWidth: 0, alignItems: 'center' },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bubble: { alignSelf: 'flex-end', maxWidth: '78%', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 14 },
  withNote: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '78%', gap: 6 },
  noteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  cite: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: 3 }] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingLeft: 5, paddingRight: 13, borderRadius: 9999, borderWidth: 1 },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  query: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9999, maxWidth: '100%' },
  res: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 16, borderRadius: 9999, borderWidth: 1 },
});
