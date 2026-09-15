/**
 * The chat composer from the canvas (gen.py composer / composer_web / stop_composer): a floating card,
 * an optional attached-page chip, the text, then + , the "Search the web" pill when it is on, mic, send.
 * While a turn runs the send button becomes Stop.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useNx } from '@/theme/nx';
import { NxIcon } from '../NxIcon';

export type ComposerChip = { title: string };

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardWillShow', () => setOpen(true));
    const b = Keyboard.addListener('keyboardWillHide', () => setOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return open;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  sending,
  chip,
  onRemoveChip,
  web,
  onWebOff,
  onPlus,
  onPress,
  onLayoutHeight,
  placeholder = 'Ask about your notes',
}: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onStop?: () => void;
  sending?: boolean;
  chip?: ComposerChip | null;
  onRemoveChip?: () => void;
  web?: boolean;
  onWebOff?: () => void;
  onPlus?: () => void;
  /** When set the whole card is a button (the Chats tab uses it to open a new chat). */
  onPress?: () => void;
  onLayoutHeight?: (h: number) => void;
  placeholder?: string;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardOpen();
  const input = useRef<TextInput>(null);
  const before = useRef('');
  const speech = useSpeechInput(
    useCallback(
      (heard: string) => {
        const lead = before.current.trim();
        onChange(lead ? `${lead} ${heard}` : heard);
      },
      [onChange],
    ),
  );

  const mic = async () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    before.current = value;
    await speech.start();
  };

  const send = () => {
    if (speech.listening) speech.stop();
    if (!value.trim()) {
      input.current?.focus();
      return;
    }
    onSend();
  };

  const float = { backgroundColor: c.card, borderColor: c.ring, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#2a1c00', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };
  const bottom = kb ? 8 : Math.max(insets.bottom, 12) - 4;

  const Card = onPress ? Pressable : View;
  return (
    <Card
      onPress={onPress}
      onLayout={(e) => onLayoutHeight?.(e.nativeEvent.layout.height + bottom)}
      style={[styles.card, float, { bottom, paddingTop: chip ? 10 : 12, paddingLeft: chip ? 14 : 16 }]}
      accessibilityLabel={onPress ? 'Ask Nemesis' : undefined}
    >
      {chip ? (
        <View style={{ flexDirection: 'row' }}>
          <View style={[styles.chip, { borderColor: c.ring }]}>
            <NxIcon name="notes" size={14} color={c.t2} strokeWidth={1.6} />
            <Text numberOfLines={1} style={{ color: c.t1, fontSize: 13, maxWidth: 220 }}>
              {chip.title}
            </Text>
            {onRemoveChip ? (
              <Pressable onPress={onRemoveChip} hitSlop={10} accessibilityLabel="Remove page">
                <NxIcon name="x" size={12} color={c.t3} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {onPress ? (
        <Text style={[styles.text, { color: c.t3 }]}>{placeholder}</Text>
      ) : (
        <TextInput
          ref={input}
          value={value}
          onChangeText={onChange}
          placeholder={speech.listening ? 'Listening' : placeholder}
          placeholderTextColor={c.t3}
          selectionColor={c.acc}
          multiline
          style={[styles.text, styles.input, { color: c.t1 }]}
        />
      )}
      <View style={styles.bar}>
        <Pressable onPress={onPress ?? onPlus} hitSlop={4} style={[styles.ib, { marginLeft: -12 }]} accessibilityLabel="Add">
          <NxIcon name="plus" size={20} color={c.t1} />
        </Pressable>
        {web ? (
          <Pressable onPress={onWebOff} style={styles.webWrap} accessibilityLabel="Stop searching the web">
            <View style={[styles.web, { backgroundColor: c.inv }]}>
              <NxIcon name="globe" size={14} color={c.onInv} />
              <Text style={{ color: c.onInv, fontSize: 13, fontWeight: '500' }}>Search the web</Text>
            </View>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onPress ?? mic} style={styles.ib} accessibilityLabel={speech.listening ? 'Stop dictation' : 'Dictate'}>
          <NxIcon name="mic" size={20} color={speech.listening ? c.acc : c.t2} />
        </Pressable>
        <Pressable onPress={onPress ?? (sending ? onStop : send)} style={styles.ib} accessibilityLabel={sending ? 'Stop' : 'Send'}>
          <View style={[styles.send, { backgroundColor: sending ? c.inv : c.acc }]}>
            {sending ? <NxIcon name="stop" size={16} color={c.onInv} strokeWidth={2} /> : <NxIcon name="arrow_up" size={18} color="#ffffff" strokeWidth={2} />}
          </View>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 12, right: 12, borderRadius: 24, paddingRight: 8, paddingBottom: 6, gap: 6 },
  text: { fontSize: 16, lineHeight: 24 },
  input: { maxHeight: 132, padding: 0, paddingTop: 0 },
  bar: { flexDirection: 'row', alignItems: 'center' },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 8, paddingRight: 10, borderRadius: 9999, borderWidth: 1 },
  webWrap: { height: 44, justifyContent: 'center' },
  web: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 10, paddingRight: 12, borderRadius: 9999 },
});
