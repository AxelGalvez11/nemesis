/**
 * Search (canvas "Search"): one field, filter chips, and results grouped as Notes, Flashcards, Chats,
 * with the matched words highlighted. Only what the new app shows is searched (lib/fresh.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listThreads, loadThreadMessages } from '@/api/chat';
import { searchNotes } from '@/api/space';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { NxIcon } from '@/components/nx/NxIcon';
import { NxEmoji, NxSection } from '@/components/nx/primitives';
import { useDecks, useSpacePages } from '@/hooks/useSpace';
import { iconOf, isFresh } from '@/lib/fresh';
import { useNx } from '@/theme/nx';

type Filter = 'all' | 'notes' | 'cards' | 'chats';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'cards', label: 'Flashcards' },
  { key: 'chats', label: 'Chats' },
];

type NoteHit = { id: string; title: string; emoji: string; snippet: string };
type CardHit = { id: string; deckId: string; front: string; deck: string; emoji: string };
type ChatHit = { id: string; title: string; snippet: string };
type ChatDoc = { id: string; title: string; text: string };

function snippet(text: string, q: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return flat.slice(0, 80);
  const start = Math.max(0, at - 32);
  const end = Math.min(flat.length, at + q.length + 32);
  return `${start > 0 ? '...' : ''}${flat.slice(start, end)}${end < flat.length ? '...' : ''}`;
}

function Hl({ text, q, style }: { text: string; q: string; style: object }) {
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let from = 0;
  let i = 0;
  if (needle) {
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
      if (at > from) parts.push(text.slice(from, at));
      parts.push(
        <Text key={i++} style={{ backgroundColor: 'rgba(255,203,0,0.28)' }}>
          {text.slice(at, at + needle.length)}
        </Text>,
      );
      from = at + needle.length;
    }
  }
  parts.push(text.slice(from));
  return (
    <Text numberOfLines={1} style={style}>
      {parts}
    </Text>
  );
}

export default function SearchScreen() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { spaceId, byId, pages } = useSpacePages();
  const decks = useDecks().data ?? [];
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [notes, setNotes] = useState<NoteHit[]>([]);
  const [cards, setCards] = useState<CardHit[]>([]);
  const [chatDocs, setChatDocs] = useState<ChatDoc[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Chats are few in the new app, so their text is read once and searched here.
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void (async () => {
      try {
        const threads = (await listThreads(uid)).filter((t) => isFresh((t as { createdAt?: string }).createdAt ?? t.updatedAt)).slice(0, 40);
        const docs = await Promise.all(
          threads.map(async (t) => {
            const msgs = await loadThreadMessages(uid, t.id).catch(() => []);
            return { id: t.id, title: t.title || 'New chat', text: msgs.map((m) => m.content).join('\n') };
          }),
        );
        if (live) setChatDocs(docs);
      } catch {
        // No chats to search is the empty result, not an error.
      }
    })();
    return () => {
      live = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!dq || !spaceId) {
      setNotes([]);
      return;
    }
    let live = true;
    searchNotes(spaceId, dq)
      .then((hits) =>
        hits
          .filter((h) => byId.has(h.page_id))
          .map((h) => ({ id: h.page_id, title: h.title || byId.get(h.page_id)?.props.title || 'Untitled', emoji: iconOf(byId.get(h.page_id)?.props.icon), snippet: snippet(h.passages?.[0] ?? '', dq) })),
      )
      .catch(() =>
        pages
          .filter((p) => (p.props.title ?? '').toLowerCase().includes(dq.toLowerCase()))
          .map((p) => ({ id: p.id, title: p.props.title || 'Untitled', emoji: iconOf(p.props.icon), snippet: '' })),
      )
      .then((list) => {
        if (live) setNotes(list);
      });
    return () => {
      live = false;
    };
    // byId and pages are rebuilt each render; the space and query decide the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, spaceId]);

  const deckKey = decks.map((d) => d.id).join(',');
  useEffect(() => {
    const safe = dq.replace(/[,()%*\\]/g, ' ').trim();
    if (!safe || !decks.length) {
      setCards([]);
      return;
    }
    let live = true;
    void supabase
      .from('study_cards')
      .select('id,deck_id,front')
      .in('deck_id', decks.map((d) => d.id))
      .or(`front.ilike.%${safe}%,back.ilike.%${safe}%`)
      .limit(20)
      .then(({ data }) => {
        if (!live) return;
        setCards(
          (data ?? []).map((r: { id: string; deck_id: string; front: string }) => {
            const deck = decks.find((d) => d.id === r.deck_id);
            const page = deck?.page_id ? byId.get(deck.page_id) : undefined;
            return { id: r.id, deckId: r.deck_id, front: r.front, deck: page?.props.title || deck?.name || 'Flashcards', emoji: page ? iconOf(page.props.icon) : '📚' };
          }),
        );
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, deckKey]);

  const chats: ChatHit[] = useMemo(() => {
    if (!dq) return [];
    const n = dq.toLowerCase();
    return chatDocs
      .filter((d) => d.title.toLowerCase().includes(n) || d.text.toLowerCase().includes(n))
      .map((d) => ({ id: d.id, title: d.title, snippet: d.text.toLowerCase().includes(n) ? snippet(d.text, dq) : '' }));
  }, [chatDocs, dq]);

  const show = (k: Filter) => filter === 'all' || filter === k;
  const nothing = dq && !notes.length && !cards.length && !chats.length;

  const Row = ({ lead, title, meta, onPress }: { lead: React.ReactNode; title: string; meta?: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.soft }]}>
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Hl text={title} q={dq} style={{ color: c.t1, fontSize: 16, lineHeight: 22 }} />
        {meta ? <Hl text={meta} q={dq} style={{ color: c.t2, fontSize: 13, lineHeight: 18 }} /> : null}
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={[styles.field, { backgroundColor: c.sel }]}>
          <NxIcon name="search" size={18} color={c.t2} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="Search notes, flashcards and chats"
            placeholderTextColor={c.t3}
            selectionColor={c.acc}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1, color: c.t1, fontSize: 16, padding: 0 }}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear">
              <NxIcon name="xcirc" size={18} color={c.t3} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} style={styles.cancel}>
          <Text style={{ color: c.t1, fontSize: 15 }}>Cancel</Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, on ? { backgroundColor: c.acc } : { borderColor: c.ring, borderWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: on ? '#ffffff' : c.t1 }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {show('notes') && notes.length ? (
          <>
            <NxSection label="Notes" />
            {notes.map((n) => (
              <Row key={n.id} lead={<NxEmoji emoji={n.emoji} />} title={n.title} meta={n.snippet} onPress={() => router.push(`/page/${n.id}` as Href)} />
            ))}
          </>
        ) : null}
        {show('cards') && cards.length ? (
          <>
            <NxSection label="Flashcards" />
            {cards.map((k) => (
              <Row key={k.id} lead={<NxEmoji emoji={k.emoji} />} title={k.front} meta={k.deck} onPress={() => router.push(`/set/${k.deckId}` as Href)} />
            ))}
          </>
        ) : null}
        {show('chats') && chats.length ? (
          <>
            <NxSection label="Chats" />
            {chats.map((h) => (
              <Row
                key={h.id}
                lead={
                  <View style={[styles.icbox, { backgroundColor: c.soft }]}>
                    <NxIcon name="comment" size={18} color={c.t2} />
                  </View>
                }
                title={h.title}
                meta={h.snippet}
                onPress={() => router.push(`/c/${h.id}` as Href)}
              />
            ))}
          </>
        ) : null}
        {nothing ? <Text style={{ color: c.t2, fontSize: 15, textAlign: 'center', paddingTop: 48, paddingHorizontal: 32 }}>Nothing matches “{dq}”</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  field: { flex: 1, height: 40, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  cancel: { height: 44, justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, paddingTop: 6, paddingHorizontal: 16 },
  chip: { height: 44, paddingHorizontal: 14, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  icbox: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
