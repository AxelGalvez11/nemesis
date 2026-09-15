/**
 * Ask AI on a note (the owner's Notion reference): the bar rises over the keyboard with a pill for the note, so the
 * question is about this page. Removing the pill asks without it. Sending opens the full chat with the answer.
 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNx } from '@/theme/nx';
import { NxIcon } from './NxIcon';
import { NxMark } from './NxMark';
import { NxPressable } from './NxPressable';

export function NoteAskBar({
  visible,
  onClose,
  page,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  page: { emoji: string; title: string } | null;
  onSend: (question: string, withPage: boolean) => void;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [withPage, setWithPage] = useState(true);

  useEffect(() => {
    if (visible) {
      setText('');
      setWithPage(true);
    }
  }, [visible]);

  const float = { backgroundColor: c.card, borderColor: c.ring, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#2a1c00', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };
  const q = text.trim();
  const send = () => {
    if (q) onSend(q, withPage && !!page);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 12), gap: 10 }}>
          <View style={[styles.who, float]}>
            <View style={[styles.logo, { borderColor: c.ring, backgroundColor: c.card }]}>
              <NxMark size={16} color={c.t1} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '500', color: c.t1 }}>Nemesis AI</Text>
          </View>
          <View style={[styles.box, float]}>
            {page && withPage ? (
              <View style={[styles.chip, { borderColor: c.ring }]}>
                <Text style={{ fontSize: 14 }}>{page.emoji}</Text>
                <Text numberOfLines={1} style={{ fontSize: 14, color: c.t1, maxWidth: 200 }}>
                  {page.title}
                </Text>
                <Pressable onPress={() => setWithPage(false)} hitSlop={8} accessibilityLabel="Ask without this note">
                  <NxIcon name="x" size={14} color={c.t2} strokeWidth={2} />
                </Pressable>
              </View>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              multiline
              placeholder="Ask, chat, find with AI…"
              placeholderTextColor={c.t3}
              selectionColor={c.acc}
              style={{ fontSize: 16, lineHeight: 22, color: c.t1, minHeight: 28, maxHeight: 120, padding: 0 }}
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }} />
              <NxPressable onPress={send} disabled={!q} haptic="light" scaleTo={0.9} accessibilityLabel="Send">
                <View style={[styles.send, { backgroundColor: c.acc, opacity: q ? 1 : 0.4 }]}>
                  <NxIcon name="arrow_up" size={18} color="#ffffff" strokeWidth={2} />
                </View>
              </NxPressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  who: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 6, paddingRight: 14, borderRadius: 22 },
  logo: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: 24, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 16, gap: 10 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
