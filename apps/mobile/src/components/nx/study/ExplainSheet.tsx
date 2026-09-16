/**
 * After Explain (canvas ExplainSheet): a sheet over the card that reads like the regular chat (owner 2026-09-15):
 * the same live steps with the thinking preview, the same answer text and spacing, follow-ups as blue bubbles.
 * It explains why the right answer is right AND why the wrong options are wrong, starting with the one picked.
 * Turns go through sendChat at high effort, which thinks and carries no workspace tools, so an explanation can
 * never save anything by accident.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { newMessageId, sendChat } from '@/api/chat';
import { useAuth } from '@/auth/AuthProvider';
import { NxIcon } from '@/components/nx/NxIcon';
import { AnswerText, UserBubble } from '@/components/nx/chat/parts';
import { LiveSteps, SettledSteps, type TurnTrail } from '@/components/nx/chat/Steps';
import { NxSparkChip, useFloat } from '@/components/nx/study';
import type { ChatMsg } from '@/lib/chat-thread';
import type { ThinkingPhase } from '@/lib/thinking-phase';
import { useNx } from '@/theme/nx';
import { NxSheet } from '../motion';

const EMPTY_TRAIL: TurnTrail = { queries: [], thoughtMs: 0, found: 0 };

/** Explanations already written this session, so reopening the same question does not ask (or bill) again. */
const written = new Map<string, ChatMsg[]>();

function firstAsk(front: string, back: string, options: string[] | undefined, picked: string | null | undefined): string {
  const wrongs = (options ?? []).filter((o) => o !== back);
  const lines = [`Quiz question from my flashcards: ${front}`, `Correct answer: ${back}`];
  if (wrongs.length) lines.push(`Wrong options: ${wrongs.join(' | ')}`);
  if (picked) lines.push(`I picked: ${picked}`);
  lines.push(
    picked
      ? 'Explain why the correct answer is right, then why the one I picked is wrong, then briefly why each other wrong option is wrong.'
      : wrongs.length
        ? 'I got it right. Explain why the correct answer is right, then briefly why each wrong option is wrong.'
        : 'Explain why this is the answer.',
  );
  lines.push('Plain English, short sentences, in any subject. Use only what a careful teacher would say about this card. Keep it under 150 words.');
  return lines.join('\n');
}

export function ExplainSheet({
  visible,
  onClose,
  front,
  back,
  initial,
  source,
  options,
  picked,
}: {
  visible: boolean;
  onClose: () => void;
  front: string;
  back: string;
  /** The one-line explanation kept on the card, shown only if Nemesis cannot be reached. */
  initial?: string | null;
  /** The page the set was made from. */
  source?: { title: string; onPress: () => void } | null;
  /** The quiz options, when opened from a quiz question. */
  options?: string[];
  /** The wrong option the student picked, if they missed it. */
  picked?: string | null;
}) {
  const c = useNx();
  const float = useFloat();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const messagesRef = useRef<ChatMsg[]>([]);
  messagesRef.current = messages;
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [phase, setPhase] = useState<ThinkingPhase>({ kind: 'routing' });
  const [trail, setTrail] = useState<TurnTrail>(EMPTY_TRAIL);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const reasoningRef = useRef('');
  const streamRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const key = `${front}\n${back}\n${picked ?? ''}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  /** One turn. `shown` is what the bubble says; the first, automatic turn has no bubble. */
  const ask = useCallback(
    async (prompt: string, shown: string | null) => {
      if (!uid || abortRef.current) return;
      const askedFor = keyRef.current;
      const history = messagesRef.current;
      const base: ChatMsg[] = [
        ...history,
        { at: new Date().toISOString(), role: 'user', id: newMessageId(), content: prompt, ...(shown ? {} : { hidden: true }) } as ChatMsg,
      ];
      setMessages(base);
      setSending(true);
      setFailed(false);
      setStreaming('');
      setPhase({ kind: 'routing' });
      setTrail(EMPTY_TRAIL);
      reasoningRef.current = '';
      streamRef.current = '';
      const started = Date.now();
      let firstWordMs = 0;
      const controller = new AbortController();
      abortRef.current = controller;
      // Follow-ups after the first turn are sent as typed; the model already has the card from the first one.
      const wire = shown ? shownFor(prompt, shown) : prompt;
      const reply = await sendChat(uid, history, wire, {
        signal: controller.signal,
        effort: 'high',
        onDelta: (_d, acc) => {
          if (!firstWordMs) firstWordMs = Date.now() - started;
          streamRef.current = acc;
          setStreaming(acc);
        },
        onPhase: (p) => {
          if (p.kind === 'searching') {
            setTrail((t) => ({
              ...t,
              thoughtMs: t.queries.length ? t.thoughtMs : Date.now() - started,
              queries: t.queries[t.queries.length - 1] === p.query ? t.queries : [...t.queries, p.query],
            }));
          }
          if (p.kind === 'reading') setTrail((t) => ({ ...t, found: p.sources }));
          setPhase(p);
        },
        onReasoning: (_d, acc) => {
          reasoningRef.current = acc;
        },
      });
      if (abortRef.current === controller) abortRef.current = null;
      if (keyRef.current !== askedFor) return;
      const text = (reply.text ?? streamRef.current).trim();
      if (text && reply.errorKind !== 'aborted') {
        const next: ChatMsg[] = [
          ...base,
          {
            at: new Date().toISOString(),
            role: 'assistant',
            id: newMessageId(),
            content: text,
            ...(reply.sources.length ? { sources: reply.sources } : {}),
            thinking: { ms: Math.max(1, firstWordMs || Date.now() - started), text: reasoningRef.current.trim() },
          },
        ];
        setMessages(next);
        written.set(askedFor, next);
      } else if (reply.errorKind !== 'aborted') {
        setFailed(true);
      }
      setSending(false);
      setStreaming('');
    },
    [uid],
  );

  // Each time it opens on a question, start from that question (or from what was already written for it).
  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
      abortRef.current = null;
      setSending(false);
      setStreaming('');
      return;
    }
    setDraft('');
    setFailed(false);
    const kept = written.get(key);
    if (kept) {
      setMessages(kept);
      return;
    }
    setMessages([]);
    messagesRef.current = [];
    if (uid) void ask(firstAsk(front, back, options, picked), null);
    // options is a fresh array each render; the key already names the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key, uid, ask]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    setDraft('');
    void ask(q, q);
  };

  const bubbles = messages.filter((m) => !(m as ChatMsg & { hidden?: boolean }).hidden);

  return (
    <NxSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      closeLabel="Close"
      style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 20) }]}
    >
      <View style={[styles.grab, { backgroundColor: c.ring }]} />
      <View style={styles.titleRow}>
        <Text style={{ flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '600', color: c.t1 }}>Why this is the answer</Text>
        <Pressable onPress={onClose} hitSlop={6} style={styles.close} accessibilityLabel="Close">
          <NxIcon name="x" size={20} color={c.t1} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        style={{ maxHeight: 420 }}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: sending })}
      >
        {bubbles.map((m, i) =>
          m.role === 'user' ? (
            <UserBubble key={m.id ?? `u${i}`} text={m.content} />
          ) : (
            <View key={m.id ?? `a${i}`} style={{ gap: 12 }}>
              <SettledSteps msg={m} onOpenSource={() => undefined} />
              <AnswerText text={m.content} />
            </View>
          ),
        )}
        {sending ? (
          <View style={{ gap: 12, paddingTop: 2 }}>
            {!streaming ? <LiveSteps phase={phase} trail={trail} /> : null}
            {streaming ? <AnswerText text={streaming} /> : null}
          </View>
        ) : null}
        {failed ? (
          <View style={{ gap: 6 }}>
            {!messages.some((m) => m.role === 'assistant') && initial?.trim() ? <AnswerText text={initial.trim()} /> : null}
            <Text style={{ color: c.t2, fontSize: 15, lineHeight: 22 }}>Nemesis could not answer just now. Check your connection and try again.</Text>
          </View>
        ) : null}
        {!uid ? <AnswerText text={initial?.trim() || back} /> : null}
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
            <NxSparkChip height={36} label="Explain like I'm 5" onPress={() => send("Explain like I'm 5")} />
            <NxSparkChip height={36} label="Explain in more detail" onPress={() => send('Explain in more detail')} />
          </View>
          <View style={[styles.follow, float]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask a follow-up"
              placeholderTextColor={c.t3}
              returnKeyType="send"
              onSubmitEditing={() => send(draft)}
              style={{ flex: 1, fontSize: 16, color: c.t1, paddingVertical: 8 }}
            />
            <Pressable onPress={() => send(draft)} disabled={!draft.trim() || sending} style={styles.ib} accessibilityLabel="Send">
              <View style={[styles.send, { backgroundColor: c.acc, opacity: draft.trim() && !sending ? 1 : 0.45 }]}>
                <NxIcon name="arrow_up" size={18} color="#ffffff" strokeWidth={2} />
              </View>
            </Pressable>
          </View>
        </>
      ) : null}
    </NxSheet>
  );
}

/** What a chip or typed follow-up actually asks, kept short and plain. */
function shownFor(prompt: string, shown: string): string {
  if (shown === "Explain like I'm 5") return 'Explain it again as if I were five years old, in two or three short sentences.';
  if (shown === 'Explain in more detail') return 'Explain it in more detail, in one short paragraph.';
  return prompt;
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 20, gap: 12 },
  grab: { width: 36, height: 5, borderRadius: 9999, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  // The chat's own rhythm (c/[id].tsx): 14 between turns, 12 inside a turn.
  thread: { gap: 14, paddingBottom: 6 },
  source: { alignSelf: 'flex-start', height: 36, paddingLeft: 5, paddingRight: 13, borderRadius: 9999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  follow: { borderRadius: 24, paddingVertical: 5, paddingRight: 5, paddingLeft: 16, flexDirection: 'row', alignItems: 'center' },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
