/**
 * Two sheets the chat opens: the numbered source list (AISources, tap the pill) and the "+" menu
 * (turn on web search, or add a page so the answer reads it).
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PageSummary } from '@/api/space';
import type { ChatSource } from '@/lib/chat-thread';
import { useNx } from '@/theme/nx';
import { NxIcon } from '../NxIcon';
import { NxEmoji, NxRow, NxSection } from '../primitives';
import { SourceMark, domainOf, isNoteSource } from './parts';

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const c = useNx();
  return (
    <View style={styles.head}>
      <View style={styles.ib} />
      <Text style={{ flex: 1, textAlign: 'center', color: c.t1, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      <Pressable onPress={onClose} hitSlop={6} style={styles.ib} accessibilityLabel="Close">
        <NxIcon name="x" size={20} color={c.t1} />
      </Pressable>
    </View>
  );
}

export function SourcesSheet({ sources, visible, onClose, onOpen }: { sources: ChatSource[]; visible: boolean; onClose: () => void; onOpen: (s: ChatSource) => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SheetHeader title={sources.length === 1 ? '1 source' : `${sources.length} sources`} onClose={onClose} />
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.grp, { backgroundColor: c.sunk }]}>
            {sources.map((s, i) => (
              <Pressable
                key={`${s.url}-${i}`}
                onPress={() => onOpen(s)}
                style={({ pressed }) => [styles.gr, { borderTopColor: c.ln, borderTopWidth: i ? 1 : 0 }, pressed && { backgroundColor: c.soft }]}
              >
                <Text style={{ width: 18, color: c.t3, fontSize: 13, fontWeight: '600' }}>{i + 1}</Text>
                <SourceMark source={s} size={24} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c.t1, fontSize: 15, lineHeight: 20 }}>
                    {s.title || domainOf(s.url)}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c.t2, fontSize: 12, lineHeight: 18 }}>
                    {isNoteSource(s) ? 'Your notes' : domainOf(s.url)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function PlusSheet({
  visible,
  onClose,
  web,
  onWeb,
  pages,
  onPage,
}: {
  visible: boolean;
  onClose: () => void;
  web: boolean;
  onWeb: (on: boolean) => void;
  pages: PageSummary[];
  onPage: (p: PageSummary) => void;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SheetHeader title="Add to your question" onClose={onClose} />
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.grp, { backgroundColor: c.sunk }]}>
            <View style={styles.gr}>
              <NxIcon name="globe" size={20} color={c.t2} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.t1, fontSize: 16, lineHeight: 22 }}>Search the web</Text>
                <Text style={{ color: c.t2, fontSize: 13, lineHeight: 18 }}>Look things up before answering</Text>
              </View>
              <Switch value={web} onValueChange={onWeb} trackColor={{ true: c.acc, false: c.ring }} />
            </View>
          </View>
          <NxSection label="Ask about a page" />
          {pages.length ? (
            pages.map((p) => (
              <NxRow key={p.id} lead={<NxEmoji />} title={p.props?.title || 'Untitled'} onPress={() => onPage(p)} />
            ))
          ) : (
            <Text style={{ color: c.t2, fontSize: 15, lineHeight: 22, paddingHorizontal: 16 }}>You have no pages yet.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grp: { marginHorizontal: 16, marginTop: 8, borderRadius: 10, overflow: 'hidden' },
  gr: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 4, paddingHorizontal: 14 },
});
