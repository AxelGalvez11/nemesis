/**
 * Typing into a page (canvas: NoteTyping, AddBlock). Each text-like block becomes a field; the toolbar that
 * rides on the keyboard carries + (the block panel) and the keyboard-down key. Note tools appear ONLY on top
 * of the keyboard while typing, like Notion (owner ruling); reading shows none.
 *
 * 🔴 SAVED ON LEAVING A FIELD, WITH THE FIELD'S VERSION. setBlockText sends the `fv.title` the phone loaded, so
 * an edit made on the web in the meantime comes back as a conflict and the page reloads instead of being
 * overwritten.
 */
import React, { useEffect, useRef, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNx, nxType } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import type { Block } from '@/api/space';

export const EDITOR_ACCESSORY_ID = 'nx-note-toolbar';

const TEXT_TYPES = new Set(['text', 'header', 'sub_header', 'sub_sub_header', 'bulleted_list', 'numbered_list', 'to_do', 'quote', 'callout', 'toggle']);

export type NewBlockType = 'text' | 'sub_header' | 'bulleted_list' | 'to_do' | 'page';

export function BlockEditor({
  blocks,
  onSaveText,
  onToggle,
  onAddBlock,
  onOpenPage,
  onRecord,
}: {
  blocks: Block[];
  onSaveText: (block: Block, text: string) => void;
  onToggle: (block: Block, checked: boolean) => void;
  onAddBlock: (type: NewBlockType, afterId: string | null) => void;
  onOpenPage: (pageId: string) => void;
  onRecord?: () => void;
}) {
  const c = useNx();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const lastFocused = useRef<string | null>(null);

  useEffect(() => {
    setDrafts((d) => {
      const next: Record<string, string> = {};
      for (const b of blocks) next[b.id] = b.id in d && d[b.id] !== b.text && focused === b.id ? d[b.id]! : b.text;
      return next;
    });
  }, [blocks, focused]);

  let run = 0;
  let prevDepth = -1;

  return (
    <View style={{ gap: 2 }}>
      {blocks.map((b) => {
        let n = 0;
        if (b.type === 'numbered_list') {
          run = prevDepth === b.depth ? run + 1 : 1;
          prevDepth = b.depth;
          n = run;
        } else {
          run = 0;
          prevDepth = -1;
        }
        const pad = { marginLeft: b.depth * 20 };
        if (b.type === 'page' && b.pageId) {
          return (
            <Pressable key={b.id} onPress={() => onOpenPage(b.pageId!)} style={[styles.line, { alignItems: 'center', minHeight: 32 }, pad]}>
              <NxIcon name="notes" size={18} color={c.t2} />
              <Text style={[nxType.body, { color: c.t1, textDecorationLine: 'underline', textDecorationColor: c.ring }]}>{b.text || 'Untitled'}</Text>
            </Pressable>
          );
        }
        if (!TEXT_TYPES.has(b.type)) return null;
        const style = textStyle(b.type, c.t1);
        const field = (
          <TextInput
            value={drafts[b.id] ?? b.text}
            onChangeText={(t) => setDrafts((d) => ({ ...d, [b.id]: t }))}
            onFocus={() => {
              setFocused(b.id);
              lastFocused.current = b.id;
              setPanel(false);
            }}
            onBlur={() => {
              setFocused(null);
              const t = drafts[b.id] ?? b.text;
              if (t !== b.text) onSaveText(b, t);
            }}
            multiline
            scrollEnabled={false}
            placeholder={b.type === 'text' ? 'Type something' : ' '}
            placeholderTextColor={c.t3}
            inputAccessoryViewID={Platform.OS === 'ios' ? EDITOR_ACCESSORY_ID : undefined}
            style={[style, { flex: 1, padding: 0, textDecorationLine: b.type === 'to_do' && b.checked ? 'line-through' : 'none' }]}
          />
        );
        switch (b.type) {
          case 'bulleted_list':
            return (
              <View key={b.id} style={[styles.line, pad]}>
                <Text style={[nxType.body, { color: c.t3 }]}>•</Text>
                {field}
              </View>
            );
          case 'numbered_list':
            return (
              <View key={b.id} style={[styles.line, pad]}>
                <Text style={[nxType.body, { color: c.t3, fontVariant: ['tabular-nums'] }]}>{n}.</Text>
                {field}
              </View>
            );
          case 'to_do':
            return (
              <View key={b.id} style={[styles.line, pad]}>
                <Pressable onPress={() => onToggle(b, !b.checked)} hitSlop={8} style={[styles.box, b.checked ? { backgroundColor: c.acc, borderColor: c.acc } : { borderColor: c.t3 }]}>
                  {b.checked ? <NxIcon name="check" size={13} color="#fff" strokeWidth={2.6} /> : null}
                </Pressable>
                {field}
              </View>
            );
          default:
            return (
              <View key={b.id} style={[styles.line, pad, b.type.endsWith('header') && { marginTop: 8 }]}>
                {field}
              </View>
            );
        }
      })}

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={EDITOR_ACCESSORY_ID} backgroundColor="transparent">
          <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
            {panel ? (
              <View style={[styles.panel, { backgroundColor: c.sunk, borderColor: c.ln }]}>
                <Text style={{ fontSize: 14, color: c.t3, marginBottom: 10 }}>Basic blocks</Text>
                <View style={styles.grid}>
                  {(
                    [
                      ['aa', 'Text', 'text'],
                      ['hash', 'Heading', 'sub_header'],
                      ['bullets', 'Bulleted list', 'bulleted_list'],
                      ['checklist', 'To-do list', 'to_do'],
                      ['compose', 'Page', 'page'],
                    ] as [NxIconName, string, NewBlockType][]
                  ).map(([icon, label, type]) => (
                    <Pressable
                      key={type}
                      onPress={() => {
                        setPanel(false);
                        onAddBlock(type, lastFocused.current);
                      }}
                      style={({ pressed }) => [styles.tile, { backgroundColor: c.card, borderColor: c.ln }, pressed && { opacity: 0.7 }]}
                    >
                      <NxIcon name={icon} size={19} color={c.t2} />
                      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: c.t1 }}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={[styles.toolbar, { backgroundColor: c.card, borderColor: c.ring }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2, paddingLeft: 6 }}>
                <ToolButton icon="plus" on={panel} label="Add a block" onPress={() => setPanel((p) => !p)} />
                {onRecord ? (
                  <ToolButton
                    icon="mic"
                    label="Record"
                    onPress={() => {
                      setPanel(false);
                      Keyboard.dismiss();
                      onRecord();
                    }}
                  />
                ) : null}
              </ScrollView>
              <View style={[styles.divider, { backgroundColor: c.ln }]} />
              <Pressable
                onPress={() => {
                  setPanel(false);
                  Keyboard.dismiss();
                }}
                style={styles.kbd}
                accessibilityLabel={panel ? 'Close the block panel' : 'Hide the keyboard'}
              >
                <NxIcon name={panel ? 'xcirc' : 'kbd_down'} size={21} color={c.t2} />
              </Pressable>
            </View>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

function ToolButton({ icon, on, label, onPress }: { icon: NxIconName; on?: boolean; label: string; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={[styles.tool, on && { backgroundColor: c.sel }]}>
      <NxIcon name={icon} size={20} color={on ? c.t1 : c.t2} />
    </Pressable>
  );
}

function textStyle(type: string, color: string) {
  switch (type) {
    case 'header':
      return { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, color };
    case 'sub_header':
      return { ...nxType.h2, color };
    case 'sub_sub_header':
      return { fontSize: 17, lineHeight: 24, fontWeight: '600' as const, color };
    default:
      return { ...nxType.body, color };
  }
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 10 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  toolbar: { height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', shadowColor: '#2a1c00', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  tool: { width: 40, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, height: 24 },
  kbd: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  panel: { borderRadius: 22, borderWidth: 1, padding: 16, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', height: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
});
