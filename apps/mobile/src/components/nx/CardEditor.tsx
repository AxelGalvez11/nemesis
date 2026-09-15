/**
 * Add or edit one flashcard, from a page's Create tab only (owner, 2026-09-14: students can type cards
 * too, like Gizmo). A bottom sheet with Front and Back fields, Save, and Delete when editing.
 *
 * 🔴 NEVER MOUNT THIS ON A STUDY SCREEN. Flip and quiz stay free of editors (cards-are-output-only lesson).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNx } from '@/theme/nx';
import { NxSheet } from './motion';

export type CardDraft = { id?: string; front: string; back: string };

export function CardEditor({
  visible,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: CardDraft | null;
  onClose: () => void;
  onSave: (draft: CardDraft) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFront(initial?.front ?? '');
    setBack(initial?.back ?? '');
    setError(null);
    setBusy(false);
  }, [visible, initial]);

  const canSave = front.trim().length > 0 && back.trim().length > 0 && !busy;
  const editing = !!initial?.id;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ id: initial?.id, front, back });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The card could not be saved.');
      setBusy(false);
    }
  };

  const remove = () => {
    const id = initial?.id;
    if (!id || !onDelete) return;
    Alert.alert('Delete this card?', 'Its study history is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await onDelete(id);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'The card could not be deleted.');
            setBusy(false);
          }
        },
      },
    ]);
  };

  const field = [styles.field, { backgroundColor: c.sunk, color: c.t1 }];

  return (
    <NxSheet visible={visible} onClose={onClose} avoidKeyboard style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ fontSize: 16, color: c.t2 }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '600', color: c.t1 }}>{editing ? 'Edit card' : 'New card'}</Text>
            <Pressable onPress={() => void save()} disabled={!canSave} hitSlop={8}>
              {busy ? <ActivityIndicator color={c.acc} /> : <Text style={{ fontSize: 16, fontWeight: '600', color: canSave ? c.acc : c.t3 }}>Save</Text>}
            </Pressable>
          </View>
          <Text style={[styles.label, { color: c.t2 }]}>Front</Text>
          <TextInput value={front} onChangeText={setFront} placeholder="The question or prompt" placeholderTextColor={c.t3} multiline autoFocus style={field} />
          <Text style={[styles.label, { color: c.t2 }]}>Back</Text>
          <TextInput value={back} onChangeText={setBack} placeholder="The answer" placeholderTextColor={c.t3} multiline style={field} />
          {error ? <Text style={{ color: c.danger, fontSize: 14 }}>{error}</Text> : null}
          {editing && onDelete ? (
            <Pressable onPress={remove} style={styles.delete} disabled={busy}>
              <Text style={{ color: c.danger, fontSize: 16 }}>Delete card</Text>
            </Pressable>
          ) : null}
    </NxSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 },
  label: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  field: { minHeight: 64, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 16, lineHeight: 22 },
  delete: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
