/**
 * After Explain (canvas ExplainSheet): a sheet over the card with a short answer, where it came from, two
 * explain-again chips, a follow-up box, and a way back to the card. Answers are one-off calls
 * (api/chat.ts completeOnce), written only from the card, in any subject.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SkelBody, SkelGroup } from '../Skeleton';
import { NxSheet } from '../motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completeOnce } from '@/api/chat';
import { useAuth } from '@/auth/AuthProvider';
import { NxIcon } from '@/components/nx/NxIcon';
import { NxSparkChip, useFloat } from '@/components/nx/study';
import { useNx } from '@/theme/nx';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

const SYSTEM =
  "You help a student understand one of their own flashcards. It can be from any subject. " +
  'Use only what a careful teacher would say about this card. Write plain English in short sentences. ' +
  'No headings, no lists, no markdown, no dashes between clauses. Keep it under 80 words unless asked for more detail.';

export function ExplainSheet({
  visible,
  onClose,
  front,
  back,
  initial,
  source,
}: {
  visible: boolean;
  onClose: () => void;
  front: string;
  back: string;
  /** An explanation already written for this card (the quiz keeps one on the card). */
  initial?: string | null;
  /** The page the set was made from. */
  source?: { title: string; onPress: () => void } | null;
}) {
  const c = useNx();
  const float = useFloat();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const history = useRef<Msg[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');

  const ask = useCallback(
    async (prompt: string, shown: string | null) => {
      if (!uid) return;
      const next: Msg[] = [...history.current, { role: 'user', content: prompt }];
      setBusy(true);
      setFailed(false);
      setAsked(shown);
      const text = await completeOnce(uid, next).catch(() => null);
      setBusy(false);
      if (!text?.trim()) {
        setFailed(true);
        return;
      }
      history.current = [...next, { role: 'assistant', content: text.trim() }];
      setAnswer(text.trim());
    },
    [uid],
  );

  // Each time it opens on a card, start from that card.
  useEffect(() => {
    if (!visible) return;
    const card = `Flashcard question: ${front}\nAnswer on the card: ${back}`;
    setDraft('');
    setAsked(null);
    setFailed(false);
    if (initial?.trim()) {
      history.current = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${card}\n\nIn two or three short sentences, explain why this is the answer.` },
        { role: 'assistant', content: initial.trim() },
      ];
      setAnswer(initial.trim());
    } else {
      history.current = [{ role: 'system', content: SYSTEM }];
      setAnswer(null);
      if (uid) void ask(`${card}\n\nIn two or three short sentences, explain why this is the answer.`, null);
    }
  }, [visible, front, back, initial, uid, ask]);

  const send = () => {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft('');
    void ask(q, q);
  };

  return (
    <NxSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      closeLabel="Back to the card"
      style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom - 8, 26) }]}
    >
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <View style={styles.titleRow}>
            <Text style={{ flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '600', color: c.t1 }}>Why this is the answer</Text>
            <Pressable onPress={onClose} hitSlop={6} style={styles.close} accessibilityLabel="Close">
              <NxIcon name="x" size={20} color={c.t1} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {asked ? <Text style={{ fontSize: 14, lineHeight: 20, color: c.t2 }}>{asked}</Text> : null}
            {busy ? (
              <View style={styles.busy}>
                <Text style={{ fontSize: 15, color: c.t2 }}>Writing an explanation</Text>
                <SkelGroup style={{ alignSelf: 'stretch' }}>
                  <SkelBody lines={[92, 78, 86]} />
                </SkelGroup>
              </View>
            ) : failed ? (
              <Text style={{ fontSize: 16, lineHeight: 26, color: c.t2 }}>Nemesis could not answer just now. Check your connection and try a chip again.</Text>
            ) : (
              <Text style={{ fontSize: 16, lineHeight: 26, color: c.t1 }}>{answer ?? back}</Text>
            )}
          </ScrollView>

          {source ? (
            <Pressable onPress={source.onPress} style={({ pressed }) => [styles.source, { borderColor: c.ring, opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.dot, { backgroundColor: c.sel }]}>
                <NxIcon name="notes" size={12} color={c.t2} strokeWidth={1.6} />
              </View>
              <Text numberOfLines={1} style={{ fontSize: 14, color: c.t1, flexShrink: 1 }}>
                {source.title}
              </Text>
            </Pressable>
          ) : null}

          {uid ? (
            <>
              <View style={styles.chips}>
                <NxSparkChip height={36} label="Explain like I'm 5" onPress={() => void ask('Explain it again as if I were five years old, in two or three short sentences.', null)} />
                <NxSparkChip height={36} label="Explain in more detail" onPress={() => void ask('Explain it in more detail, in one short paragraph.', null)} />
              </View>
              <View style={[styles.follow, float]}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Ask a follow-up"
                  placeholderTextColor={c.t3}
                  returnKeyType="send"
                  onSubmitEditing={send}
                  style={{ flex: 1, fontSize: 16, color: c.t1, paddingVertical: 8 }}
                />
                <Pressable onPress={send} disabled={!draft.trim() || busy} style={styles.ib} accessibilityLabel="Send">
                  <View style={[styles.send, { backgroundColor: c.acc, opacity: draft.trim() && !busy ? 1 : 0.45 }]}>
                    <NxIcon name="arrow_up" size={18} color="#ffffff" strokeWidth={2} />
                  </View>
                </Pressable>
              </View>
            </>
          ) : null}

          <Pressable onPress={onClose} style={({ pressed }) => [styles.txt, pressed && { opacity: 0.5 }]}>
            <Text style={{ fontSize: 15, color: c.t2 }}>Back to the card</Text>
          </Pressable>
    </NxSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 20, gap: 12 },
  grab: { width: 36, height: 5, borderRadius: 9999, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  source: { alignSelf: 'flex-start', height: 36, paddingLeft: 5, paddingRight: 13, borderRadius: 9999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  follow: { borderRadius: 24, paddingVertical: 5, paddingRight: 5, paddingLeft: 16, flexDirection: 'row', alignItems: 'center' },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  txt: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
