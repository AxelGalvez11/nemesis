/**
 * A chat, full screen (canvas AIChat, AIThinking, AISearching, AISources, AISourcesOpen, DarkAI).
 *
 * /c/new starts a chat; the thread id is made on the first send and the address switches to it.
 * /c/new?page=<pageId> starts a chat about that page: the page's text rides every turn as context and
 * the page shows as a chip in the composer (tap x to drop it). /c/new?q=<text> sends that text at once.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { deleteThread, listThreads, loadThreadMessages, newMessageId, newThreadId, pinThread, renameThread, saveThreadMessages, sendChat } from '@/api/chat';
import { loadPage, pageBlocks, recordText, type PageSummary } from '@/api/space';
import { useAuth } from '@/auth/AuthProvider';
import { Composer } from '@/components/nx/chat/Composer';
import { SkelBar, SkelBody, SkelGroup } from '@/components/nx/Skeleton';
import { ChatHero, ChatHeader, CobaltGlow, AnswerText, SourcesPill, UserBubble, isNoteSource } from '@/components/nx/chat/parts';
import { PlusSheet, SourcesSheet } from '@/components/nx/chat/Sheets';
import { LiveSteps, SettledSteps, type TurnTrail } from '@/components/nx/chat/Steps';
import { useSpacePages } from '@/hooks/useSpace';
import { ATTACHMENT_CONTEXT_MAX_CHARS, type ChatMsg, type ChatSource } from '@/lib/chat-thread';
import { deriveThreadTitle } from '@/lib/chat-threads';
import { iconOf } from '@/lib/fresh';
import { reasoningGlimpse } from '@/lib/reasoning-preview';
import type { ThinkingPhase } from '@/lib/thinking-phase';
import { useNx } from '@/theme/nx';

type Attached = { pageId: string; title: string; emoji: string; content: string };

const EMPTY_TRAIL: TurnTrail = { queries: [], thoughtMs: 0, found: 0 };

export default function ChatScreen() {
  const c = useNx();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; page?: string; q?: string }>();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { pages } = useSpacePages();

  const threadRef = useRef<string | null>(params.id && params.id !== 'new' ? params.id : null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  // An existing chat draws a skeleton while its messages load, instead of flashing the empty-chat hero.
  const [loadingThread, setLoadingThread] = useState(threadRef.current !== null);
  const messagesRef = useRef<ChatMsg[]>([]);
  messagesRef.current = messages;
  const [title, setTitle] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [phase, setPhase] = useState<ThinkingPhase>({ kind: 'routing' });
  const [trail, setTrail] = useState<TurnTrail>(EMPTY_TRAIL);
  const [streaming, setStreaming] = useState('');
  const streamRef = useRef('');
  const reasoningRef = useRef('');
  const [glimpse, setGlimpse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [web, setWeb] = useState(false);
  const [attached, setAttached] = useState<Attached | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [sheetSources, setSheetSources] = useState<ChatSource[] | null>(null);
  const [composerH, setComposerH] = useState(120);
  const abortRef = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
    abortRef.current?.abort();
  }, []);

  // An existing chat: its messages, title and pin.
  useEffect(() => {
    const id = threadRef.current;
    if (!uid || !id || messagesRef.current.length) {
      if (!id) setLoadingThread(false);
      return;
    }
    void loadThreadMessages(uid, id)
      .then((loaded) => {
        if (alive.current && !messagesRef.current.length) setMessages(loaded);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setLoadingThread(false);
      });
    void listThreads(uid)
      .then((list) => {
        const t = list.find((x) => x.id === id);
        if (t && alive.current) {
          setTitle(t.title);
          setPinned(t.pinned);
        }
      })
      .catch(() => undefined);
  }, [uid]);

  const attachPage = useCallback(async (pageId: string) => {
    try {
      const loaded = await loadPage(pageId);
      const text = pageBlocks(loaded)
        .map((b) => [b.text, b.transcript].filter(Boolean).join('\n'))
        .filter((t) => t.trim())
        .join('\n');
      if (!alive.current) return null;
      const next: Attached = {
        pageId,
        title: recordText(loaded.page.props.title) || 'Untitled',
        emoji: iconOf(loaded.page.props.icon),
        content: text.slice(0, ATTACHMENT_CONTEXT_MAX_CHARS),
      };
      setAttached(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  // Where the reasoning preview reaches the screen: a few times a second, not on every token.
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => setGlimpse(reasoningGlimpse(reasoningRef.current)), 250);
    return () => clearInterval(t);
  }, [sending]);

  const send = useCallback(
    async (override?: string, withPage?: Attached | null) => {
      const text = (override ?? input).trim();
      if (!text || !uid || sendingRef.current) return;
      sendingRef.current = true;
      let id = threadRef.current;
      if (!id) {
        id = newThreadId();
        threadRef.current = id;
        router.setParams({ id });
      }
      const page = withPage === undefined ? attached : withPage;
      const history = messagesRef.current;
      const base: ChatMsg[] = [...history, { at: new Date().toISOString(), content: text, role: 'user', id: newMessageId() }];
      setMessages(base);
      setInput('');
      setError(null);
      setSending(true);
      setStreaming('');
      setPhase({ kind: 'routing' });
      setTrail(EMPTY_TRAIL);
      setGlimpse('');
      streamRef.current = '';
      reasoningRef.current = '';
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void saveThreadMessages(uid, id, base);
      const started = Date.now();
      let firstWordMs = 0;
      const controller = new AbortController();
      abortRef.current = controller;
      const reply = await sendChat(uid, history, text, {
        signal: controller.signal,
        forceResearch: web,
        attachedDoc: page ? { title: page.title, content: page.content, kind: 'note' } : undefined,
        onDelta: (_d, acc) => {
          if (!alive.current) return;
          if (!firstWordMs) firstWordMs = Date.now() - started;
          streamRef.current = acc;
          setStreaming(acc);
        },
        onPhase: (p) => {
          if (!alive.current) return;
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
      sendingRef.current = false;
      if (!alive.current) return;
      const noteSource: ChatSource[] = page ? [{ title: page.title, url: `nemesis://page/${page.pageId}`, description: page.emoji }] : [];
      const partial = streamRef.current.trim();
      let next: ChatMsg[] | null = null;
      if (reply.errorKind === 'aborted') {
        if (partial) next = [...base, { at: new Date().toISOString(), content: partial, role: 'assistant', id: newMessageId() }];
      } else if (reply.text || reply.outputs?.length) {
        const sources = [...noteSource, ...reply.sources];
        next = [
          ...base,
          {
            at: new Date().toISOString(),
            content: reply.text ?? '',
            role: 'assistant',
            id: newMessageId(),
            ...(sources.length ? { sources } : {}),
            ...(reply.outputs?.length ? { outputs: reply.outputs } : {}),
            thinking: { ms: Math.max(1, firstWordMs || Date.now() - started), text: reasoningRef.current.trim() },
          },
        ];
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError(reply.errorText ?? 'Something went wrong. Try again.');
      }
      if (next) {
        setMessages(next);
        void saveThreadMessages(uid, id, next);
      }
      setSending(false);
      setStreaming('');
      setPhase({ kind: 'routing' });
    },
    [input, uid, attached, web, router],
  );

  // ?page= and ?q= are read once, when the person is known.
  const started = useRef(false);
  useEffect(() => {
    if (!uid || started.current) return;
    started.current = true;
    void (async () => {
      const page = params.page ? await attachPage(params.page) : null;
      if (params.q) void send(params.q, page);
    })();
  }, [uid, params.page, params.q, attachPage, send]);

  const openSource = (s: ChatSource) => {
    setSheetSources(null);
    if (isNoteSource(s)) router.push(`/page/${s.url.slice('nemesis://page/'.length)}` as Href);
    else void WebBrowser.openBrowserAsync(s.url);
  };

  const retry = () => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (!last || last.role !== 'user') return;
    const rest = messagesRef.current.slice(0, -1);
    messagesRef.current = rest;
    setMessages(rest);
    void send(last.content);
  };

  const shownTitle = title || (messages.length ? deriveThreadTitle(messages) : 'New chat');
  const id = threadRef.current;

  const more = () => {
    if (!uid || !id) return;
    const doRename = () =>
      Alert.prompt('Rename chat', undefined, (t) => {
        const name = t?.trim();
        if (!name) return;
        setTitle(name);
        void renameThread(uid, id, name);
      }, 'plain-text', shownTitle);
    const doPin = () => {
      setPinned(!pinned);
      void pinThread(uid, id, !pinned);
    };
    const doDelete = () =>
      Alert.alert('Delete this chat?', 'It is removed from all your devices.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            abortRef.current?.abort();
            await deleteThread(uid, id).catch(() => undefined);
            router.back();
          },
        },
      ]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Rename', pinned ? 'Unpin' : 'Pin', 'Delete', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (i) => (i === 0 ? doRename() : i === 1 ? doPin() : i === 2 ? doDelete() : undefined),
      );
    } else {
      Alert.alert(shownTitle, undefined, [
        { text: pinned ? 'Unpin' : 'Pin', onPress: doPin },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const empty = !messages.length && !sending && !loadingThread;
  const skeleton = loadingThread && !messages.length && !sending;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ChatHeader title={shownTitle} onBack={() => (router.canGoBack() ? router.back() : router.replace('/chats' as Href))} onMore={id && messages.length ? more : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {sending ? <CobaltGlow /> : empty ? <CobaltGlow height={300} opacity={0.1} solid={0.2} breathe={false} /> : null}
        <ScrollView
          ref={scroll}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: sending })}
          contentContainerStyle={
            empty
              ? { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: composerH + 30 }
              : { paddingTop: 20, paddingHorizontal: 20, paddingBottom: composerH + 28, gap: 14 }
          }
        >
          {skeleton ? (
            <SkelGroup style={{ gap: 18 }}>
              <SkelBar width="58%" height={44} radius={16} style={{ alignSelf: 'flex-end' }} />
              <SkelBody lines={[94, 88, 90, 62]} />
              <SkelBar width="46%" height={40} radius={16} style={{ alignSelf: 'flex-end', marginTop: 8 }} />
              <SkelBody lines={[90, 76]} />
            </SkelGroup>
          ) : empty ? (
            <ChatHero hasNotes={pages.length > 0} onSuggest={(s) => setInput(s)} />
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <UserBubble key={m.id ?? `u${i}`} text={m.content} />
              ) : (
                <View key={m.id ?? `a${i}`} style={{ gap: 12 }}>
                  <SettledSteps msg={m} onOpenSource={openSource} />
                  {m.content ? <AnswerText text={m.content} sources={(m.sources ?? []).filter((s) => !isNoteSource(s))} /> : null}
                  <SourcesPill sources={m.sources ?? []} onPress={() => setSheetSources(m.sources ?? [])} />
                </View>
              ),
            )
          )}
          {sending ? (
            <View style={{ gap: 12, paddingTop: 2 }}>
              {!streaming ? <LiveSteps phase={phase} trail={trail} glimpse={glimpse} /> : null}
              {streaming ? <AnswerText text={streaming} /> : null}
            </View>
          ) : null}
          {error ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: c.t2, fontSize: 15, lineHeight: 22 }}>{error}</Text>
              <Pressable onPress={retry} hitSlop={8} style={{ alignSelf: 'flex-start', height: 44, justifyContent: 'center' }}>
                <Text style={{ color: c.t1, fontSize: 15, fontWeight: '500' }}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          onStop={() => abortRef.current?.abort()}
          sending={sending}
          chip={attached ? { emoji: attached.emoji, title: attached.title } : null}
          onRemoveChip={() => setAttached(null)}
          web={web}
          onWebOff={() => setWeb(false)}
          onPlus={() => setPlusOpen(true)}
          onLayoutHeight={setComposerH}
        />
      </KeyboardAvoidingView>
      <PlusSheet
        visible={plusOpen}
        onClose={() => setPlusOpen(false)}
        web={web}
        onWeb={setWeb}
        pages={pages}
        onPage={(p: PageSummary) => {
          setPlusOpen(false);
          void attachPage(p.id);
        }}
      />
      <SourcesSheet visible={!!sheetSources} sources={sheetSources ?? []} onClose={() => setSheetSources(null)} onOpen={openSource} />
    </View>
  );
}
