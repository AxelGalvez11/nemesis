import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { GlassSurface } from "@/components/GlassSurface";
import { Composer } from "@/components/Composer";
import { MessageBody } from "@/components/MessageBody";
import { ThinkingDots } from "@/components/ThinkingDots";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { Skeleton } from "@/components/Skeleton";
import { SlideUpSheet } from "@/components/StudySheet";
import { useKeyboardVisible } from "@/components/shell-chrome";
import { FileIcon, LibraryIcon, SearchIcon } from "@/components/icons";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import {
  addLibrarySourceToNotebook,
  appendNotebookChatMessage,
  createNotebookChat,
  deleteNotebookById,
  deleteNotebookSource,
  getNotebookById,
  listNotebookChatMessages,
  listNotebookChats,
  listNotebookOutputs,
  listNotebookSources,
  renameNotebookById,
  sendNotebookMessage,
  toChatEntries,
  touchNotebookChat,
  type Notebook,
  type NotebookChat,
  type NotebookChatEntry,
  type NotebookOutput,
  type NotebookSource,
  type NotebookWireSource,
} from "@/api/notebooks";
import { titleFromPrompt } from "@/lib/notebook-model";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// Notebook detail (phone port of the web Notebooks feature — apps/web/components/workspace/
// notebooks/notebook-home.tsx + notebook-chat-view.tsx): a notebook's own grounded chat,
// its Sources, and its Outputs, in one pushed screen (follows app/note.tsx's back-header
// idiom). "Home" (chats/sources/outputs tabs) and an open chat are both in-screen state —
// mirrors the web store's activeChatId, kept local since this is the only screen that needs
// it. Chat is GROUNDED: the model answers only from this notebook's sources + instructions,
// never the web — see lib/notebook-model.ts's NOTEBOOK_SYSTEM_PROMPT (mirrored verbatim from
// apps/web/lib/notebooks/chat.ts) and api/notebooks.ts's sendNotebookMessage.
//
// v1 scope (owner/task call): Outputs and Sources are READ-ONLY here — generating a
// deliverable and extracting url/pdf/docx/pptx sources both need the web app's Node routes,
// which the phone can't call. The one source type the phone CAN add is a Library note (a
// straightforward insert against notebook_sources — see the "from Library" picker below).

type HomeTab = "chats" | "sources" | "outputs";
type ScreenView = "home" | "chat";

function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SOURCE_KIND_LABEL: Record<NotebookSource["kind"], string> = {
  docx: "Word document",
  library: "Library note",
  pdf: "PDF",
  pptx: "PowerPoint",
  text: "Pasted text",
  url: "Link",
  youtube: "YouTube",
};

const OUTPUT_KIND_LABEL: Record<NotebookOutput["kind"], string> = {
  flashcards: "Flashcards",
  slides: "Slides",
  test: "Test",
};

function bytesLabel(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ViewerContent {
  title: string;
  meta: string;
  body: string;
}

export default function NotebookScreen() {
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const { colors: c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const params = useLocalSearchParams<{ id?: string }>();
  const notebookId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [notebook, setNotebook] = useState<Notebook | null | undefined>(undefined);
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [chats, setChats] = useState<NotebookChat[]>([]);
  const [outputs, setOutputs] = useState<NotebookOutput[]>([]);

  const [view, setView] = useState<ScreenView>("home");
  const [homeTab, setHomeTab] = useState<HomeTab>("chats");
  const [composerText, setComposerText] = useState("");
  const [startError, setStartError] = useState<string | null>(null);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NotebookChatEntry[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const [viewer, setViewer] = useState<ViewerContent | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingSourcePath, setAddingSourcePath] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const epochRef = useRef(0);
  const sendingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const renameInputRef = useRef<TextInput>(null);

  // The rename sheet is always mounted (SlideUpSheet keeps children rendered
  // for its close animation), so `autoFocus` would fire at SCREEN mount and
  // pop the keyboard the moment the page opens. Focus when the sheet actually
  // opens instead (same pattern as NoteListSheet).
  useEffect(() => {
    if (!renameOpen) return;
    const timer = setTimeout(() => renameInputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, [renameOpen]);

  // ── Initial load: the notebook row + its sources/chats/outputs, in parallel. Sources
  // (with content) are ready by the time `notebook` resolves, so a grounded turn is never
  // sent before the source text it depends on has loaded — see app/note.tsx for the same
  // "undefined = loading, null = not found" shape this mirrors.
  useEffect(() => {
    epochRef.current += 1;
    sendingRef.current = false;
    setNotebook(undefined);
    setSources([]);
    setChats([]);
    setOutputs([]);
    setView("home");
    setHomeTab("chats");
    setActiveChatId(null);
    setMessages([]);
    setSending(false);
    setStreamingText("");
    setStartError(null);
    if (!userId || !notebookId) {
      setNotebook(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [nb, srcs, chatRows, outputRows] = await Promise.all([
          getNotebookById(notebookId),
          listNotebookSources(notebookId),
          listNotebookChats(notebookId),
          listNotebookOutputs(notebookId),
        ]);
        if (!alive) return;
        setNotebook(nb);
        setSources(srcs);
        setChats(chatRows);
        setOutputs(outputRows);
      } catch {
        if (alive) setNotebook(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, notebookId]);

  // Auto-scroll to the newest message as the transcript grows or streams.
  useEffect(() => {
    if (view === "chat") scrollRef.current?.scrollToEnd({ animated: true });
  }, [view, messages.length, streamingText]);

  const switchToChat = useCallback((chat: NotebookChat) => {
    epochRef.current += 1;
    const epoch = epochRef.current;
    sendingRef.current = false;
    setSending(false);
    setStreamingText("");
    setActiveChatId(chat.id);
    setMessages([]);
    setMessagesLoading(true);
    setView("chat");
    void listNotebookChatMessages(chat.id)
      .then((rows) => {
        if (epochRef.current === epoch) setMessages(toChatEntries(rows));
      })
      .catch(() => {})
      .finally(() => {
        if (epochRef.current === epoch) setMessagesLoading(false);
      });
  }, []);

  const backToHome = useCallback(() => {
    epochRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setStreamingText("");
    setActiveChatId(null);
    setMessages([]);
    setView("home");
    setHomeTab("chats");
  }, []);

  // One grounded turn: creates a chat first if none is active (the home composer's role),
  // appends the user turn, streams the reply, then persists both turns — mirrors
  // apps/web/lib/notebooks/chat.ts's sendNotebookTurn, split into a pure network call
  // (api/notebooks.ts's sendNotebookMessage) plus this screen's own persistence, the same
  // split app/(tabs)/chat.tsx uses between sendChat() and saveThreadMessages().
  const sendTurn = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !notebook || !userId || sendingRef.current) return;
      sendingRef.current = true;
      setStartError(null);
      const startEpoch = epochRef.current;

      let chatId = activeChatId;
      let history = messages;

      if (!chatId) {
        const created = await createNotebookChat(notebook.id, titleFromPrompt(trimmed));
        if (epochRef.current !== startEpoch) return; // navigated away while creating — abandon
        if (!created) {
          setStartError("Couldn't start a chat — check your connection and that you're signed in.");
          sendingRef.current = false;
          return;
        }
        epochRef.current += 1;
        chatId = created.id;
        history = [];
        setChats((prev) => [created, ...prev]);
        setActiveChatId(created.id);
        setMessages([]);
        setView("chat");
      }
      const epoch = epochRef.current;
      const activeChat = chatId;

      setMessages((prev) => [...prev, { at: new Date().toISOString(), content: trimmed, role: "user" }]);
      setComposerText("");
      setSending(true);
      setStreamingText("");
      void appendNotebookChatMessage({ chatId: activeChat, content: trimmed, notebookId: notebook.id, role: "user" }).catch(() => {});

      const wireSources: NotebookWireSource[] = sources.map((s) => ({ content: s.content, name: s.name }));
      try {
        const reply = await sendNotebookMessage({
          history,
          instructions: notebook.instructions,
          onDelta: (_delta, accumulated) => {
            if (epochRef.current === epoch) setStreamingText(accumulated);
          },
          sources: wireSources,
          uid: userId,
          userText: trimmed,
        });
        if (epochRef.current !== epoch) return;
        const replyText = reply.text ?? reply.errorText ?? "Something went wrong. Try again.";
        setMessages((prev) => [...prev, { at: new Date().toISOString(), content: replyText, role: "assistant" }]);
        if (reply.text) {
          void appendNotebookChatMessage({ chatId: activeChat, content: reply.text, notebookId: notebook.id, role: "assistant" }).catch(() => {});
          void touchNotebookChat(activeChat).catch(() => {});
          setChats((prev) => {
            const idx = prev.findIndex((chat) => chat.id === activeChat);
            if (idx === -1) return prev;
            return [{ ...prev[idx], updatedAt: new Date().toISOString() }, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
          });
        }
      } finally {
        if (epochRef.current === epoch) {
          sendingRef.current = false;
          setSending(false);
          setStreamingText("");
        }
      }
    },
    [activeChatId, messages, notebook, sources, userId],
  );

  const openSourceViewer = useCallback((source: NotebookSource) => {
    setViewer({
      body: source.content?.trim() || "No extracted text is stored for this source.",
      meta: [SOURCE_KIND_LABEL[source.kind], bytesLabel(source.bytes), source.sourceUrl].filter(Boolean).join(" · "),
      title: source.name,
    });
  }, []);

  const openOutputViewer = useCallback((output: NotebookOutput) => {
    setViewer({
      body: output.content.trim() || (output.status === "pending" ? "Still generating…" : "No content yet."),
      meta: `${OUTPUT_KIND_LABEL[output.kind]} · ${output.status}`,
      title: output.title,
    });
  }, []);

  const removeSource = useCallback((source: NotebookSource) => {
    Alert.alert("Delete source?", `Are you sure you want to delete "${source.name}"? This can't be undone.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void deleteNotebookSource(source.id)
            .then(() => setSources((prev) => prev.filter((s) => s.id !== source.id)))
            .catch(() => Alert.alert("Couldn't delete", "Check your connection and try again."));
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }, []);

  const onLibraryPicked = useCallback(
    async (note: CloudLibraryNote) => {
      if (!notebook || addingSourcePath) return;
      setAddingSourcePath(note.path);
      try {
        const created = await addLibrarySourceToNotebook(notebook.id, { content: note.content, path: note.path, title: note.title });
        if (created) {
          setSources((prev) => [created, ...prev]);
          setPickerOpen(false);
        } else {
          Alert.alert("Couldn't add source", "Sign in and try again.");
        }
      } catch {
        Alert.alert("Couldn't add source", "Check your connection and try again.");
      } finally {
        setAddingSourcePath(null);
      }
    },
    [addingSourcePath, notebook],
  );

  const handleRename = useCallback(async () => {
    if (!notebook) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      await renameNotebookById(notebook.id, name);
      setNotebook({ ...notebook, name });
      setRenameOpen(false);
    } catch {
      Alert.alert("Couldn't rename", "Check your connection and try again.");
    } finally {
      setRenaming(false);
    }
  }, [notebook, renameValue]);

  const handleDelete = useCallback(() => {
    if (!notebook) return;
    setActionsOpen(false);
    Alert.alert(
      "Delete notebook?",
      `Are you sure you want to delete "${notebook.name}"? Its sources and chats are removed. This can't be undone.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => {
            void deleteNotebookById(notebook.id)
              .then(() => router.replace("/notebooks"))
              .catch(() => Alert.alert("Couldn't delete", "Check your connection and try again."));
          },
          style: "destructive",
          text: "Delete",
        },
      ],
    );
  }, [notebook]);

  const headerTitle = view === "chat" ? (chats.find((chat) => chat.id === activeChatId)?.title ?? "Chat") : (notebook?.name ?? "Notebook");

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="notebook-screen">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topRow}>
        <Pressable
          onPress={() => (view === "chat" ? backToHome() : router.back())}
          hitSlop={10}
          testID="notebook-back"
          accessibilityRole="button"
          accessibilityLabel={view === "chat" ? "Back to notebook" : "Back to notebooks"}
        >
          <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel} shadow>
            <Text style={styles.backChevron}>‹</Text>
          </GlassSurface>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{headerTitle}</Text>
        {view === "home" && notebook ? (
          <Pressable
            onPress={() => setActionsOpen(true)}
            hitSlop={10}
            testID="notebook-menu-btn"
            accessibilityRole="button"
            accessibilityLabel="Notebook actions"
          >
            <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel} shadow>
              <DotsIcon size={19} color={c.text} />
            </GlassSurface>
          </Pressable>
        ) : (
          <View style={styles.iconGlass} />
        )}
      </View>

      {notebook === undefined ? (
        <NotebookSkeleton />
      ) : notebook === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock title="Notebook unavailable" body="It may have been deleted, or hasn't reached this phone yet." />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
          {view === "home" ? (
            <>
              <HomeTabs value={homeTab} onChange={setHomeTab} />
              {homeTab === "chats" ? (
                <ChatsHome
                  chats={chats}
                  composerText={composerText}
                  onChangeText={setComposerText}
                  onOpenChat={switchToChat}
                  onSend={() => void sendTurn(composerText)}
                  sending={sending}
                  startError={startError}
                />
              ) : homeTab === "sources" ? (
                <SourcesHome
                  contentBottom={insets.bottom + space(6)}
                  onAdd={() => setPickerOpen(true)}
                  onOpen={openSourceViewer}
                  onRemove={removeSource}
                  sources={sources}
                />
              ) : (
                <OutputsHome contentBottom={insets.bottom + space(6)} onOpen={openOutputViewer} outputs={outputs} />
              )}
            </>
          ) : (
            <ChatThread
              composerText={composerText}
              keyboardUp={keyboardUp}
              markdownStyles={markdownStyles}
              messages={messages}
              messagesLoading={messagesLoading}
              onChangeText={setComposerText}
              onSend={() => void sendTurn(composerText)}
              scrollRef={scrollRef}
              sending={sending}
              streamingText={streamingText}
            />
          )}
        </KeyboardAvoidingView>
      )}

      <SlideUpSheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={notebook?.name ?? "Notebook"} testID="notebook-actions-sheet">
        <Pressable
          style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
          onPress={() => {
            setActionsOpen(false);
            setRenameValue(notebook?.name ?? "");
            setRenameOpen(true);
          }}
          testID="notebook-action-rename"
        >
          <Text style={styles.sheetRowLabel}>Rename</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.sheetRow, styles.sheetDivider, pressed && styles.sheetRowPressed]}
          onPress={handleDelete}
          testID="notebook-action-delete"
        >
          <Text style={[styles.sheetRowLabel, styles.sheetRowDanger]}>Delete</Text>
        </Pressable>
      </SlideUpSheet>

      <SlideUpSheet visible={renameOpen} onClose={() => setRenameOpen(false)} title="Rename notebook" testID="notebook-rename-sheet">
        <TextInput
          ref={renameInputRef}
          style={styles.promptInput}
          value={renameValue}
          onChangeText={setRenameValue}
          placeholder="Notebook title"
          placeholderTextColor={c.textHint}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={() => void handleRename()}
          testID="notebook-rename-input"
        />
        <View style={styles.promptRow}>
          <View style={styles.promptBtn}>
            <MissionButton label="Cancel" variant="secondary" onPress={() => setRenameOpen(false)} testID="notebook-rename-cancel" />
          </View>
          <View style={styles.promptBtn}>
            <MissionButton label="Save" variant="primary" busy={renaming} disabled={!renameValue.trim()} onPress={() => void handleRename()} testID="notebook-rename-confirm" />
          </View>
        </View>
      </SlideUpSheet>

      <LibraryPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onLibraryPicked}
        userId={userId}
        busyPath={addingSourcePath}
        existingPaths={new Set(sources.filter((s) => s.libraryPath).map((s) => s.libraryPath as string))}
      />

      <ContentViewerOverlay content={viewer} markdownStyles={markdownStyles} onClose={() => setViewer(null)} />
    </View>
  );
}

// Loading skeleton (notebook === undefined, above) — shaped like the default
// landing (HomeTabs + ChatsHome: composer pill + a "Recents" list), since that's
// what a resolved notebook renders into first.
function NotebookSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View testID="notebook-skeleton">
      <View style={styles.tabsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.tabBtn}>
            <Skeleton width="60%" height={12} />
          </View>
        ))}
      </View>
      <View style={styles.homeBody}>
        <Skeleton width="100%" height={48} radius={radius.lg} />
        <View style={{ height: space(2) }} />
        <Skeleton width={110} height={12} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.listRow}>
            <Skeleton width="55%" height={16} />
            <Skeleton width={36} height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Home tabs ──────────────────────────────────────────────────────────────────

function HomeTabs({ value, onChange }: { value: HomeTab; onChange: (tab: HomeTab) => void }) {
  const styles = useThemedStyles(createStyles);
  const tabs: { key: HomeTab; label: string }[] = [
    { key: "chats", label: "Chats" },
    { key: "sources", label: "Sources" },
    { key: "outputs", label: "Outputs" },
  ];
  return (
    <View style={styles.tabsRow} testID="notebook-tabs">
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabBtn, active && styles.tabBtnActive]}
            onPress={() => onChange(tab.key)}
            testID={`notebook-tab-${tab.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Chats tab (composer + Recents) ──────────────────────────────────────────────

function ChatsHome({
  chats,
  composerText,
  onChangeText,
  onOpenChat,
  onSend,
  sending,
  startError,
}: {
  chats: NotebookChat[];
  composerText: string;
  onChangeText: (text: string) => void;
  onOpenChat: (chat: NotebookChat) => void;
  onSend: () => void;
  sending: boolean;
  startError: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.homeBody} keyboardShouldPersistTaps="handled">
      <Composer value={composerText} onChangeText={onChangeText} onSend={onSend} sending={sending} placeholder="Ask a question" testID="notebook-composer-home" />
      {startError ? <Text style={styles.errorText}>{startError}</Text> : null}
      <Text style={styles.sectionHead}>Recents</Text>
      {chats.length === 0 ? (
        <Text style={styles.mutedText}>No chats yet — ask something above to start one.</Text>
      ) : (
        chats.map((chat) => (
          <Pressable
            key={chat.id}
            style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]}
            onPress={() => onOpenChat(chat)}
            testID={`notebook-chat-${chat.id}`}
          >
            <Text style={styles.listRowTitle} numberOfLines={1}>{chat.title}</Text>
            {relativeTime(chat.updatedAt) ? <Text style={styles.listRowMeta}>{relativeTime(chat.updatedAt)}</Text> : null}
          </Pressable>
        ))
      )}
      <View style={{ height: space(4) }} />
    </ScrollView>
  );
}

// ── Sources tab ──────────────────────────────────────────────────────────────

function SourcesHome({
  sources,
  onAdd,
  onOpen,
  onRemove,
  contentBottom,
}: {
  sources: NotebookSource[];
  onAdd: () => void;
  onOpen: (source: NotebookSource) => void;
  onRemove: (source: NotebookSource) => void;
  contentBottom: number;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.homeBody, { paddingBottom: contentBottom }]}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionHead}>Sources · {sources.length}</Text>
        <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.rowPressed]} onPress={onAdd} testID="notebook-add-source">
          <Text style={styles.addBtnText}>Add from Library</Text>
        </Pressable>
      </View>
      {sources.length === 0 ? (
        <Text style={styles.mutedText}>No sources yet — add a note from your Library so the chat has something to answer from.</Text>
      ) : (
        sources.map((source) => (
          <View key={source.id} style={styles.sourceRow}>
            <Pressable style={({ pressed }) => [styles.sourceRowMain, pressed && styles.rowPressed]} onPress={() => onOpen(source)} testID={`notebook-source-${source.id}`}>
              {source.kind === "library" ? <LibraryIcon size={16} color={c.text2} /> : <FileIcon size={16} color={c.text2} />}
              <View style={styles.sourceTextCol}>
                <Text style={styles.listRowTitle} numberOfLines={1}>{source.name}</Text>
                <Text style={styles.sourceSubtitle} numberOfLines={1}>
                  {[SOURCE_KIND_LABEL[source.kind], bytesLabel(source.bytes)].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </Pressable>
            <Pressable style={styles.sourceRemove} onPress={() => onRemove(source)} hitSlop={8} accessibilityLabel={`Remove ${source.name}`} testID={`notebook-source-remove-${source.id}`}>
              <Text style={styles.removeGlyph}>×</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Outputs tab (read-only) ──────────────────────────────────────────────────

function OutputsHome({ outputs, onOpen, contentBottom }: { outputs: NotebookOutput[]; onOpen: (output: NotebookOutput) => void; contentBottom: number }) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.homeBody, { paddingBottom: contentBottom }]}>
      <Text style={styles.sectionHead}>Outputs · {outputs.length}</Text>
      {outputs.length === 0 ? (
        <Text style={styles.mutedText}>Nothing generated yet. Flashcards, tests, and slides made from this notebook's sources on the web app show up here.</Text>
      ) : (
        outputs.map((output) => (
          <Pressable
            key={output.id}
            style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]}
            onPress={() => onOpen(output)}
            testID={`notebook-output-${output.id}`}
          >
            <View style={styles.sourceTextCol}>
              <Text style={styles.listRowTitle} numberOfLines={1}>{output.title || OUTPUT_KIND_LABEL[output.kind]}</Text>
              <Text style={styles.sourceSubtitle}>
                {OUTPUT_KIND_LABEL[output.kind]} · {output.status === "pending" ? "generating…" : output.status === "failed" ? "failed" : relativeTime(output.createdAt)}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

// ── Chat thread (open chat: transcript + bottom composer) ──────────────────────

function ChatThread({
  messages,
  messagesLoading,
  sending,
  streamingText,
  composerText,
  onChangeText,
  onSend,
  markdownStyles,
  scrollRef,
  keyboardUp,
}: {
  messages: NotebookChatEntry[];
  messagesLoading: boolean;
  sending: boolean;
  streamingText: string;
  composerText: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  markdownStyles: ReturnType<typeof createMarkdownStyles>;
  scrollRef: React.RefObject<ScrollView | null>;
  keyboardUp: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.flex}>
      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.chatBody} keyboardShouldPersistTaps="handled">
        {messagesLoading && messages.length === 0 ? (
          <View testID="notebook-chat-skeleton">
            <View style={[styles.bubble, styles.userBubble]}>
              <Skeleton width={160} height={16} />
            </View>
            <View style={styles.assistantRow}>
              <Skeleton width="90%" height={16} style={styles.skeletonLine} />
              <Skeleton width="75%" height={16} style={styles.skeletonLine} />
              <Skeleton width="55%" height={16} />
            </View>
          </View>
        ) : messages.length === 0 ? (
          <Text style={styles.mutedText}>Ask something below — the answer comes from this notebook's sources.</Text>
        ) : (
          messages.map((message, index) =>
            message.role === "user" ? (
              <View key={index} style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{message.content}</Text>
              </View>
            ) : (
              <View key={index} style={styles.assistantRow}>
                <MessageBody content={message.content} styles={markdownStyles} />
              </View>
            ),
          )
        )}
        {sending ? (
          streamingText ? (
            <View style={styles.assistantRow}>
              <MessageBody content={streamingText} styles={markdownStyles} />
            </View>
          ) : (
            <View style={styles.assistantRow} testID="notebook-thinking">
              <ThinkingDots color={c.text2} />
            </View>
          )
        ) : null}
      </ScrollView>
      <View style={[styles.composerRow, { paddingBottom: keyboardUp ? space(3) : space(4) }]}>
        <Composer value={composerText} onChangeText={onChangeText} onSend={onSend} sending={sending} placeholder="Ask about this notebook…" testID="notebook-composer-chat" />
      </View>
    </View>
  );
}

// ── "From Library" source picker ────────────────────────────────────────────

function LibraryPickerSheet({
  visible,
  onClose,
  onPick,
  userId,
  busyPath,
  existingPaths,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (note: CloudLibraryNote) => void;
  userId: string | null;
  /** The library path currently being added, if any — owned by the parent (which also
   *  handles/alerts on failure), so this sheet never gets stuck showing "Adding…" forever
   *  after a failed insert. */
  busyPath: string | null;
  existingPaths: Set<string>;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [notes, setNotes] = useState<CloudLibraryNote[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible || !userId) return;
    let alive = true;
    setQuery("");
    void loadCachedLibrary(userId).then((cached) => {
      if (alive) setNotes(cached.notes);
    });
    void fetchLibrary(userId)
      .then((fresh) => {
        if (alive) setNotes(fresh.notes);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, userId]);

  const needle = query.trim().toLowerCase();
  const available = (notes ?? []).filter((note) => !existingPaths.has(note.path));
  const filtered = needle ? available.filter((note) => note.title.toLowerCase().includes(needle) || note.path.toLowerCase().includes(needle)) : available;

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Add from Library" testID="notebook-source-picker">
      <View style={styles.searchField}>
        <SearchIcon size={15} color={c.text3} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your notes"
          placeholderTextColor={c.textHint}
          autoCorrect={false}
          testID="notebook-source-picker-search"
        />
      </View>
      <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
        {notes === null ? (
          <View testID="notebook-source-picker-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.listRow}>
                <View style={styles.sourceTextCol}>
                  <Skeleton width="55%" height={16} />
                  <Skeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <Text style={styles.mutedText}>{available.length === 0 ? "Every note is already a source, or your library is empty." : "No notes match that search."}</Text>
        ) : (
          filtered.map((note) => (
            <Pressable
              key={note.id}
              style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]}
              disabled={busyPath !== null}
              onPress={() => onPick(note)}
              testID={`notebook-picker-note-${note.id}`}
            >
              <View style={styles.sourceTextCol}>
                <Text style={styles.listRowTitle} numberOfLines={1}>{note.title}</Text>
                <Text style={styles.sourceSubtitle} numberOfLines={1}>{note.path}</Text>
              </View>
              {busyPath === note.path ? <Text style={styles.mutedText}>Adding…</Text> : null}
            </Pressable>
          ))
        )}
        <View style={{ height: space(6) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

// ── Read-only content viewer (source text / output content) ────────────────────

function ContentViewerOverlay({
  content,
  markdownStyles,
  onClose,
}: {
  content: ViewerContent | null;
  markdownStyles: ReturnType<typeof createMarkdownStyles>;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!content) return null;
  return (
    <View style={[styles.viewerOverlay, { paddingTop: insets.top + space(2) }]} testID="notebook-content-viewer">
      <View style={styles.topRow}>
        <Pressable onPress={onClose} hitSlop={10} testID="notebook-viewer-close" accessibilityRole="button" accessibilityLabel="Close">
          <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel} shadow>
            <Text style={styles.backChevron}>‹</Text>
          </GlassSurface>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{content.title}</Text>
        <View style={styles.iconGlass} />
      </View>
      <ScrollView contentContainerStyle={styles.viewerBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.viewerTitle}>{content.title}</Text>
        {content.meta ? <Text style={styles.sourceSubtitle}>{content.meta}</Text> : null}
        <View style={{ height: space(3) }} />
        <MessageBody content={content.body} styles={markdownStyles} />
        <View style={{ height: space(10) }} />
      </ScrollView>
    </View>
  );
}

function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontSize: size * 0.7, fontWeight: "700", marginTop: -size * 0.35 }}>···</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    topRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(3), paddingBottom: space(2) },
    // Round, and the same size as note.tsx's back button (owner 2026-07-23:
    // "make sure there arent any square buttons"). This one was a 40pt rounded
    // SQUARE — the only glass icon button in the app that wasn't a circle.
    iconGlass: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    backChevron: { fontSize: 26, lineHeight: 28, color: c.text, marginTop: -2 },
    topTitle: { ...type.bodyStrong, color: c.text, flex: 1, minWidth: 0, textAlign: "center" },

    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },

    tabsRow: { flexDirection: "row", marginHorizontal: space(4), marginBottom: space(1), backgroundColor: c.surface, borderRadius: radius.md, padding: 3, gap: 3 },
    tabBtn: { flex: 1, paddingVertical: space(2), borderRadius: radius.sm, alignItems: "center" },
    tabBtnActive: { backgroundColor: c.surface2 },
    tabLabel: { ...type.small, color: c.text2 },
    tabLabelActive: { color: c.text, fontWeight: "600" },

    homeBody: { padding: space(4), gap: space(2.5) },
    sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(2) },
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(2) },
    mutedText: { ...type.small, color: c.text3, paddingVertical: space(2) },
    errorText: { ...type.small, color: c.danger },

    addBtn: { paddingVertical: space(1.5), paddingHorizontal: space(3), borderRadius: radius.pill, borderWidth: 1, borderColor: c.line },
    addBtnText: { ...type.small, color: c.accent, fontWeight: "600" },

    listRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2), borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingVertical: space(3), paddingHorizontal: space(3.5) },
    listRowTitle: { ...type.body, color: c.text, flexShrink: 1 },
    listRowMeta: { ...type.micro, color: c.text3, fontVariant: ["tabular-nums"] },
    rowPressed: { backgroundColor: c.surface2 },

    sourceRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
    sourceRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space(2.5), borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingVertical: space(3), paddingHorizontal: space(3.5) },
    sourceTextCol: { flex: 1, minWidth: 0, gap: 2 },
    sourceSubtitle: { ...type.micro, color: c.text3 },
    sourceRemove: { width: control.sm, height: control.sm, borderRadius: control.sm / 2, alignItems: "center", justifyContent: "center" },
    removeGlyph: { fontSize: 20, lineHeight: 22, color: c.text3 },

    chatBody: { padding: space(4), gap: space(2), flexGrow: 1 },
    bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5) },
    userBubble: { alignSelf: "flex-end", backgroundColor: c.surface2 },
    userText: { ...type.body, color: c.text },
    assistantRow: { alignSelf: "stretch", paddingHorizontal: space(0.5), paddingVertical: space(1) },
    composerRow: { paddingHorizontal: space(3), paddingTop: space(2) },
    // Chat-thread loading skeleton (messagesLoading, ChatThread above).
    skeletonLine: { marginBottom: space(2) },

    sheetRow: { paddingVertical: space(3.5), paddingHorizontal: space(1) },
    sheetRowPressed: { backgroundColor: c.surface },
    sheetDivider: { borderTopWidth: 1, borderTopColor: c.line },
    sheetRowLabel: { ...type.body, color: c.text },
    sheetRowDanger: { color: c.danger },

    promptInput: { ...type.body, color: c.text, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: space(3.5), paddingVertical: space(2.5), marginBottom: space(4) },
    promptRow: { flexDirection: "row", gap: space(2.5) },
    promptBtn: { flex: 1 },

    searchField: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(3), height: 40, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, marginBottom: space(3) },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
    pickerList: { maxHeight: 420 },

    viewerOverlay: { ...StyleSheet.absoluteFill, backgroundColor: c.bg, zIndex: 10 },
    viewerBody: { paddingHorizontal: space(5) },
    viewerTitle: { ...type.h2, color: c.text, marginBottom: space(1) },
  });
