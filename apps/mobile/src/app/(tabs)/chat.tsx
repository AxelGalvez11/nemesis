import { useCallback, useEffect, useRef, useState } from "react";
import { studyCreationPreferencePrompt } from "@nemesis/shared";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Reanimated, { FadeIn, FadeOut } from "react-native-reanimated";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import {
  deleteThread,
  hasCachedThread,
  isThreadPinned,
  listThreads,
  loadThreadMessages,
  loadThreadOutputs,
  newThreadId,
  pinThread,
  saveThreadMessages,
  sendChat,
} from "@/api/chat";
import { createNoteWithContent, type CloudLibraryNote } from "@/api/cloudLibrary";
import { storeAndReadPhoto, type ReadPhoto } from "@/api/photos";
import { drawerOpenGuard, useShell } from "@/components/AppDrawer";
import { AttachLibrarySheet } from "@/components/AttachLibrarySheet";
import { Composer, COMPOSER_COMPACT_HEIGHT, COMPOSER_PILL_HEIGHT, type ComposerMode } from "@/components/Composer";
import { ComposerPlusMenu } from "@/components/ComposerPlusMenu";
import { DocumentError, pickAndReadDocument } from "@/api/documents";
import { BottomFadeBlur, BOTTOM_FADE_SPAN } from "@/components/BottomFadeBlur";
import { EffortPopup } from "@/components/ComposerEffortMenu";
import { DeliverableCardStack, DeliverableSheet } from "@/components/DeliverableSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { ArrowDownIcon, CloseIcon, SearchIcon, SparkleIcon, StudyIcon } from "@/components/icons";
import { ThoughtTrail } from "@/components/ThoughtTrail";
import { MessageBody } from "@/components/MessageBody";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { NoteListSheet, type NoteSheetRow } from "@/components/NoteListSheet";
import { PhotoCaptureSheet } from "@/components/PhotoCaptureSheet";
import { importChatThreadIntoNotebook, listNotebooks, type Notebook } from "@/api/notebooks";
import { NOTEBOOKS_RETIRED } from "@/lib/notebooks-retired";
import { RecordSession, type RecordingSessionState, type RecordSessionHandle } from "@/components/RecordSession";
import { Skeleton } from "@/components/Skeleton";
import { SourcesPill, SourcesSheet } from "@/components/SourcesSheet";
import { ThinkingLine } from "@/components/ThinkingLine";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { withAttachmentNote, type BudgetResetKind, type ChatMsg, type ChatOutput, type ChatSource } from "@/lib/chat-thread";
import { DEFAULT_CHAT_EFFORT, isChatEffort, type ChatEffort } from "@/lib/chat-effort";
import { hapticAnswerReady, hapticThinkingStarted } from "@/lib/haptics";
import { photoAttachmentTitle, photoNoteBody } from "@/lib/photo-note";
import { GENERATED_NOTES_FOLDER } from "@/lib/academic-skills";
import { settledLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// Chat (cloud-first pivot, P1a): the phone's standalone surface — straight to the
// metered cloud engine, no Mac in the path. Conversations now PERSIST as separate
// threads that show up in the drawer (ChatGPT-style history); the active thread is
// carried in the route param `c` so tapping a chat in the sidebar reopens it and
// "New chat" opens a fresh one. Opening the tab with no param resumes the most
// recent thread. User turns render as bubbles; the assistant renders as full-width
// markdown with NO bubble (owner call — reads like Claude/ChatGPT).
//
// State rules (review findings): everything is keyed to the signed-in user; an
// epoch guard means a user switch, a thread switch, or an unmount can never
// resurrect a stale thread's messages onto the screen.
//
// Record mode: entered and left from the ONE round accent button on the
// composer (owner 2026-07-22 — it started as a toggle pill, spent a morning as
// a "+"-menu row, and landed here where ChatGPT's voice button sits). That
// same button wears an ✕ once record mode is on; the composer's "+" slot turns
// into start/stop, which reaches into RecordSession through recordRef below.
// Record mode swaps this screen's whole messages/thread area for
// RecordSession.tsx inline — mirrors web's record-workspace.tsx. `composerMode`
// never persists (always starts "chat", same as web's per-tab default) and,
// per the epoch-guard discipline above, resets alongside everything else on a
// thread/user switch — flipping composerMode back to "chat" unmounts
// RecordSession, which is what actually stops the mic (see its cleanup
// effect); leaving it mounted across a thread switch would keep recording
// into a thread the user isn't even looking at anymore.

const THINKING_ID = "__thinking__";

/** How far from the end the transcript has to be before the jump-to-bottom arrow
 *  appears, in points. Roughly one line of prose plus the fade: close enough that
 *  a small overscroll or the tail of a momentum fling never flashes the button,
 *  far enough that it shows up as soon as there is genuinely something below. */
const JUMP_TO_BOTTOM_AT = 160;

/** The question a photo asks when the student has not typed one. Written as a
 *  student would ask it, because it is shown in the transcript as their own
 *  message — so it has to read like something a person would say, not a system
 *  instruction. Deliberately open: the photo could be a slide, a page, a
 *  whiteboard or a piece of equipment, and naming the wrong one would steer the
 *  answer. */
const PHOTO_ANALYSIS_ASK = "Read this photo and explain what it shows.";

// Where the remembered intelligence dial lives, per signed-in account. Same
// SecureStore idiom as the General settings screen (app/profile/general.tsx),
// so the choice survives app launches and chat switches.
const effortStoreKey = (uid: string) => `nemesis_chat_effort_v1_${uid}`;

interface Row {
  id: string;
  kind: "error" | "msg" | "thinking";
  msg?: ChatMsg;
  errorText?: string;
  /** Set only on the row that is streaming RIGHT NOW: how long this turn spent
   *  working before its first word, shown as a small "Thought for Xs" note. It
   *  is deliberately not part of ChatMsg — nothing is written to the saved
   *  conversation for it, so the note belongs to the live turn only. */
  thoughtMs?: number;
}

export default function ChatScreen() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { setHeaderTitle, setHeaderRight, setImmersive } = useShell();
  const insets = useSafeAreaInsets();

  // The active thread rides in the route param so the drawer/TopBar can steer it.
  const params = useLocalSearchParams<{ c?: string }>();
  const routeThreadId = Array.isArray(params.c) ? params.c[0] : params.c;

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  // True while the active thread's history is being fetched — messages alone
  // can't tell "genuinely empty" apart from "not loaded yet" since it starts at
  // [] either way (see the load effect below and its ListEmptyComponent).
  const [messagesLoading, setMessagesLoading] = useState(false);
  // What the in-flight turn is actually doing, for the thinking line. Reset to
  // "routing" per send so a new question never inherits the last one's stage.
  const [phase, setPhase] = useState<ThinkingPhase>({ kind: "routing" });
  const [lastError, setLastError] = useState<null | string>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // The in-flight assistant reply's text so far — rendered live into the same
  // "msg" row shape as a finished answer (owner: streaming §6), so it gets the
  // exact same FadeIn + markdown treatment with no separate render path.
  const [streamingText, setStreamingText] = useState("");
  // Raw reasoning stays in a ref while the quiet phase/timer preview renders.
  // Once the answer lands it is attached to ThoughtTrail for deliberate review.
  const reasoningRef = useRef("");
  // When the current turn was sent, and how long it spent working before its
  // first word landed — the "Thought for Xs" note above a streaming answer.
  const turnStartedAtRef = useRef(0);
  const thoughtMsRef = useRef(0);
  const [thoughtMs, setThoughtMs] = useState(0);
  // Pinned state of the active thread (drives the "…" menu's Pin/Unpin label) and
  // whether that menu is open.
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [upgrade, setUpgrade] = useState<null | { message: string | null; reset: BudgetResetKind | null }>(null);
  // Session-level deliverables (chat_threads.meta.outputs — e.g. a web
  // Record-mode recording) for the open thread; chip row at the top of the
  // transcript. See api/chat.ts's loadThreadOutputs doc for why the phone
  // only ever reads these, never creates them.
  const [threadOutputs, setThreadOutputs] = useState<ChatOutput[]>([]);
  // Composer "+" mini menu (owner: attach a Library doc, or toggle deep
  // research) and the two things it opens/toggles.
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  // One Library doc attached as context for the NEXT send only — cleared once
  // that turn is sent (see send()'s attachedDoc capture). Deep research is the
  // opposite: a persistent toggle the student switches off themselves.
  const [attachedDoc, setAttachedDoc] = useState<{ title: string; content: string } | null>(null);
  // "Add a file": the entry point the phone never had. Everything downstream already
  // existed -- the reader handles PDF/Word/PowerPoint, and the result is the same
  // one-shot attachment a Library note or a photograph makes. A refusal (wrong kind,
  // too big, unreadable) arrives already written for the student, so it is shown
  // verbatim rather than wrapped in a second sentence.
  const [fileLoading, setFileLoading] = useState(false);
  const addFileFromDevice = useCallback(async () => {
    if (!uid || fileLoading) return;
    setFileLoading(true);
    try {
      const doc = await pickAndReadDocument(uid);
      if (doc) setAttachedDoc({ content: doc.text, title: doc.title });
    } catch (cause) {
      Alert.alert(
        "Couldn't add that file",
        cause instanceof DocumentError ? cause.message : "Something went wrong reading it. Try again.",
      );
    } finally {
      setFileLoading(false);
    }
  }, [fileLoading, uid]);
  // The camera (owner 2026-07-24). A photograph becomes an attachment through
  // exactly the lane above — once the server has read it, a picture of a slide
  // and an attached Library note are the same thing: text for one turn.
  // `photo` is kept BESIDE attachedDoc rather than folded into it because the
  // picture itself is only needed for the two things text can't do: show a
  // thumbnail on the chip, and put the image in the note if it gets saved.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photo, setPhoto] = useState<ReadPhoto | null>(null);
  const [photoSaved, setPhotoSaved] = useState<"idle" | "saving" | "saved">("idle");
  // "Move to notebook" (owner 2026-07-22) — the destination list, fetched only
  // when the picker actually opens.
  const [notebookPickerOpen, setNotebookPickerOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  // Instant/Medium/High — the composer's intelligence dial. A per-USER working
  // preference (owner 2026-07-23: "the chat should remember which intelligence
  // mode has been picked because it always defaults to medium"): remembered
  // across chats AND app launches in SecureStore, hydrated by the effect below,
  // and deliberately NOT reset by the thread-load effect. DEFAULT_CHAT_EFFORT is
  // only the fallback before the stored value loads / for a signed-out user.
  const [effort, setEffort] = useState<ChatEffort>(DEFAULT_CHAT_EFFORT);
  // The uid whose stored effort has finished loading — guards the write-through
  // so switching accounts can't persist one user's dial under another's key
  // before the new user's value has been read.
  const effortHydratedFor = useRef<string | null>(null);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  // How tall the floating composer block is (starter rows / attached-doc chip
  // included). The transcript reserves exactly this much at its foot so it can
  // scroll all the way under the composer without the last line hiding behind
  // it — see composerFloat and BottomFadeBlur.
  const [composerBlockH, setComposerBlockH] = useState(0);
  // Chat/Record mode pill: which area fills the screen (messages vs. the
  // inline RecordSession) and the three-state UI RecordSession last reported
  // — mirrored here only so the composer can lock the pill mid-recording
  // (see handleComposerModeChange below); RecordSession itself owns the real
  // recording state.
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  const [recordingState, setRecordingState] = useState<RecordingSessionState>("idle");
  // Start/stop now live on the composer, but the transcription hook still
  // belongs to RecordSession — commands go DOWN this ref, state comes back UP
  // through setRecordingState above.
  const recordRef = useRef<RecordSessionHandle>(null);
  // Which message's sources/deliverable is showing in its bottom-up sheet, if any.
  const [sourcesSheetFor, setSourcesSheetFor] = useState<ChatSource[] | null>(null);
  const [deliverableSheetFor, setDeliverableSheetFor] = useState<ChatOutput | null>(null);
  const openDeliverable = useCallback((output: ChatOutput) => {
    if (output.route) {
      router.push(output.route as never);
      return;
    }
    setDeliverableSheetFor(output);
  }, []);
  // Epoch bumps on user change AND thread change; in-flight sends compare before
  // touching state. sendingRef is the synchronous re-entrancy lock.
  const epochRef = useRef(0);
  const sendingRef = useRef(false);
  const listRef = useRef<FlatList<Row>>(null);
  const composerRef = useRef<TextInput>(null);
  // The newest user-message row index — the row we pin to the top after a send / on
  // thread open. Set during render below, read by the scroll effect (kept out of its
  // deps this way).
  const lastUserRowIndexRef = useRef(-1);
  // Bottom-spacer measurement (owner 2026-07-22: "chats should not be able to be
  // scrolled down beyond the answer prompt"). The spacer exists so the newest
  // question can scroll up to the TOP of the viewport — but it used to be a flat
  // half-screen, so once an answer was long you could keep dragging into empty
  // space below it. Now it's only ever the shortfall: measure the list's own
  // height and the height of the last turn (question + everything after it), and
  // pad by the difference, which is zero as soon as the turn fills the screen.
  const rowHeights = useRef(new Map<string, number>());
  const rowIdsRef = useRef<string[]>([]);
  const [listHeight, setListHeight] = useState(0);
  // "Jump to the newest message" (owner 2026-07-24). Only meaningful when the
  // transcript is actually scrolled up away from the end, so the control is
  // absent — not disabled — the rest of the time. A long answer plus the
  // scroll-the-question-to-the-top spacer means it is easy to end up a long way
  // from the newest text with no quick way back.
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [lastTurnHeight, setLastTurnHeight] = useState(0);

  const measureLastTurn = useCallback(() => {
    const from = lastUserRowIndexRef.current;
    const ids = rowIdsRef.current;
    if (from < 0) {
      setLastTurnHeight(0);
      return;
    }
    let total = 0;
    for (let i = from; i < ids.length; i += 1) total += rowHeights.current.get(ids[i]) ?? 0;
    // Sub-pixel churn while an answer streams would re-render on every chunk.
    setLastTurnHeight((prev) => (Math.abs(prev - total) > 1 ? total : prev));
  }, []);

  // Load the active thread: the route's `c` if present, else the most recent
  // thread (resume), else a brand-new empty thread. Re-runs on user/thread change.
  useEffect(() => {
    epochRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setStreamingText("");
    // The thinking preview belongs to the turn that was in flight, so it dies
    // with it — an in-flight reply whose thread was switched away keeps writing
    // into reasoningRef until its epoch check fails, and none of that belongs to
    // whatever thread is on screen now.
    reasoningRef.current = "";
    thoughtMsRef.current = 0;
    setThoughtMs(0);
    setMessages([]);
    // Uncertain until the load below resolves one way or the other. Starting
    // true (not false) means a thread switch never has a frame where messages
    // is [] and loading is false at once — that gap is exactly the false-empty
    // "Welcome back" flash this fixes.
    setMessagesLoading(true);
    setLastError(null);
    setInput("");
    setPinned(false);
    setMenuOpen(false);
    setThreadOutputs([]);
    setPlusMenuOpen(false);
    setLibraryPickerOpen(false);
    setAttachedDoc(null);
    // NB: effort is intentionally NOT reset here — it's a per-user preference
    // remembered across chats (see the hydrate/persist effects below).
    setEffortMenuOpen(false);
    setSourcesSheetFor(null);
    setDeliverableSheetFor(null);
    // A thread/user switch must not leave RecordSession mounted against the
    // thread that's no longer open — that would keep the mic running and,
    // on Save, write into the wrong thread. Flipping back to "chat" unmounts
    // it, which is what actually stops recognition (see its cleanup effect).
    setComposerMode("chat");
    setRecordingState("idle");
    if (!uid) {
      setThreadId(null);
      setMessagesLoading(false);
      return;
    }
    const epoch = epochRef.current;
    let alive = true;
    void (async () => {
      let id = routeThreadId ?? null;
      // A route id already names an exact thread — either an existing one (its
      // row can only be tapped in the drawer once listThreads has cached its
      // metadata locally) or a just-minted "New chat" id nothing has ever
      // written anywhere (AppDrawer.tsx's newChat). hasCachedThread tells them
      // apart with a local-only read, so a deliberately fresh chat lands on the
      // welcome state immediately instead of skeleton-flashing first.
      let knownExisting: boolean;
      if (id) {
        knownExisting = await hasCachedThread(uid, id);
      } else {
        const summaries = await listThreads(uid);
        if (!alive || epochRef.current !== epoch) return;
        id = summaries[0]?.id ?? newThreadId();
        knownExisting = summaries.length > 0;
      }
      if (!alive || epochRef.current !== epoch) return;
      if (!knownExisting) {
        setThreadId(id);
        setMessages([]);
        setMessagesLoading(false);
        return;
      }
      const loaded = await loadThreadMessages(uid, id);
      if (!alive || epochRef.current !== epoch) return;
      setThreadId(id);
      setMessages(loaded);
      setMessagesLoading(false);
      void isThreadPinned(uid, id).then((p) => {
        if (alive && epochRef.current === epoch) setPinned(p);
      });
      void loadThreadOutputs(uid, id).then((outputs) => {
        if (alive && epochRef.current === epoch) setThreadOutputs(outputs);
      });
    })();
    return () => {
      alive = false;
    };
  }, [uid, routeThreadId]);

  // Refresh the open thread from the cloud when the app returns to the
  // foreground (§6: "list refresh on open + app foreground") — this is what
  // picks up a message sent from web (or another session) while this phone
  // was in the background. The drawer already refreshes the sidebar list
  // every time it opens (see AppDrawer.tsx), so that half needs no change here.
  useEffect(() => {
    if (!uid || !threadId) return;
    const epoch = epochRef.current;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || sendingRef.current) return; // never clobber an in-flight turn
      void loadThreadMessages(uid, threadId).then((loaded) => {
        if (epochRef.current === epoch) setMessages(loaded);
      });
    });
    return () => sub.remove();
  }, [uid, threadId]);

  // Remember the intelligence dial across chats and app launches (owner
  // 2026-07-23). Hydrate the stored value once per signed-in account; a bad or
  // missing value falls back to DEFAULT_CHAT_EFFORT. effortHydratedFor gates the
  // write-through below so this initial load never races the persist effect.
  useEffect(() => {
    effortHydratedFor.current = null;
    if (!uid) {
      setEffort(DEFAULT_CHAT_EFFORT);
      return;
    }
    let alive = true;
    void SecureStore.getItemAsync(effortStoreKey(uid))
      .then((raw) => {
        if (alive) setEffort(isChatEffort(raw) ? raw : DEFAULT_CHAT_EFFORT);
      })
      .catch(() => {
        if (alive) setEffort(DEFAULT_CHAT_EFFORT);
      })
      .finally(() => {
        if (alive) effortHydratedFor.current = uid;
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  // Write the dial through on change — but only once the current user's stored
  // value has loaded, so a fresh mount / account switch can't clobber storage
  // with the in-memory default before the read resolves.
  useEffect(() => {
    if (!uid || effortHydratedFor.current !== uid) return;
    void SecureStore.setItemAsync(effortStoreKey(uid), effort).catch(() => {});
  }, [effort, uid]);

  // TopBar: no centered chat/session title in a chat (owner 2026-07-20 — "remove
  // the centered top chat/session title in a chat"). Always blank; only the "…"
  // actions menu (see the setHeaderRight effect below) occupies the header.
  // headerTitle itself is still driven by OTHER screens (Library/Study/
  // Notebooks tabs, notebook.tsx's own header) — this only clears what THIS
  // screen contributes, on mount and again on unmount.
  useEffect(() => {
    setHeaderTitle(null);
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);


  // "…and even saved to library if it's a note" (owner). Deliberately a TAP,
  // not a guess: a photo of a slide is a note and a photo of a broken pipette
  // is not, and no classifier should be deciding that on the student's behalf.
  const savePhotoToLibrary = useCallback(async () => {
    if (!uid || !photo || photoSaved !== "idle") return;
    setPhotoSaved("saving");
    try {
      await createNoteWithContent(
        uid,
        photo.title,
        photoNoteBody(photo.text, photo.imageUrl, photo.storagePath),
        GENERATED_NOTES_FOLDER,
      );
      setPhotoSaved("saved");
    } catch (cause) {
      setPhotoSaved("idle");
      setLastError(cause instanceof Error ? cause.message : "Couldn't save that to your library.");
    }
  }, [photo, photoSaved, uid]);

  const clearAttachment = useCallback(() => {
    setAttachedDoc(null);
    setPhoto(null);
    setPhotoSaved("idle");
  }, []);

  /** Send a turn.
   *
   *  `override` exists for the camera: a photo has to go straight out for
   *  analysis, and the question plus the attachment are known at that moment but
   *  are NOT yet in state — a setState in the same tick would not have flushed, so
   *  reading them from state here would send an empty turn with no picture. The
   *  composer passes nothing and everything comes from state as before. */
  const send = useCallback((override?: { text?: string; doc?: { content: string; title: string }; keepPhoto?: boolean }) => {
    const text = (override?.text ?? input).trim();
    if (!text || !uid || !threadId || sendingRef.current) return;
    const doc = override?.doc ?? attachedDoc;
    const preferenceQuestion = doc ? null : studyCreationPreferencePrompt(text);
    if (preferenceQuestion) {
      const userMsg: ChatMsg = {
        at: new Date().toISOString(),
        content: text,
        role: "user",
      };
      const next: ChatMsg[] = [
        ...messages,
        userMsg,
        {
          at: new Date(Date.now() + 1).toISOString(),
          content: preferenceQuestion,
          role: "assistant",
        },
      ];
      setMessages(next);
      setLastError(null);
      setInput("");
      void saveThreadMessages(uid, threadId, next);
      return;
    }
    sendingRef.current = true;
    const epoch = epochRef.current;
    const history = messages;
    const id = threadId;
    // Captured once at send time — attach is one-shot (cleared right below,
    // same turn), deep research is a persistent toggle the student switches
    // off themselves (NOT cleared here). Both ride into sendChat's options,
    // never into the persisted/displayed ChatMsg.content itself.
    // No Deep research control any more (owner removed the row 2026-07-27). The
    // router still picks the research lane by itself when a question needs current
    // sources; nothing here forces it.
    const research = false;
    const chosenEffort = effort;
    const userMsg: ChatMsg = { at: new Date().toISOString(), content: withAttachmentNote(text, doc?.title ?? null), role: "user" };
    const base = [...history, userMsg];
    setMessages(base);
    setLastError(null);
    setInput("");
    setAttachedDoc(null);
    // The picture normally goes with it: the attachment is one-shot, and a chip
    // left offering "Save to Library" after the turn has gone would be pointing
    // at something that is no longer attached to anything.
    //
    // keepPhoto is the camera's exception. A photo now sends itself the moment it
    // is taken, so the student never gets a beat in which to tap "Save to
    // Library" — clearing here would delete the offer before it was ever on
    // screen. The photo stays available to save while its answer arrives; the
    // ATTACHMENT is still cleared, so it cannot ride a second turn.
    if (!override?.keepPhoto) {
      setPhoto(null);
      setPhotoSaved("idle");
    }
    setSending(true);
    setStreamingText("");
    setPhase({ kind: "routing" });
    // Clear the last turn's thinking preview, or the new question would open on
    // the previous answer's leftover reasoning.
    reasoningRef.current = "";
    thoughtMsRef.current = 0;
    setThoughtMs(0);
    turnStartedAtRef.current = Date.now();
    // The question is away and the model is working — the send's own receipt.
    hapticThinkingStarted();
    // Persist the user turn immediately so the thread shows in the sidebar even
    // if the reply never lands.
    void saveThreadMessages(uid, id, base);
    void sendChat(uid, history, text, {
      attachedDoc: doc ? { content: doc.content, title: doc.title } : undefined,
      effort: chosenEffort,
      forceResearch: research,
      onDelta: (_delta, accumulated) => {
        // Renders live into the assistant row as chunks arrive; stale turns
        // (thread/user switched mid-stream) are dropped by the epoch guard.
        if (epochRef.current !== epoch) return;
        // The first word ends the thinking preview and fixes how long the
        // working-out took. Guarded so later chunks don't keep moving it.
        setThoughtMs((prev) => {
          const next = prev > 0 ? prev : Date.now() - turnStartedAtRef.current;
          thoughtMsRef.current = next;
          return next;
        });
        setStreamingText(accumulated);
      },
      onPhase: (next) => {
        if (epochRef.current === epoch) setPhase(next);
      },
      onReasoning: (_delta, accumulated) => {
        // Ref only — this fires ~80 times a second on a deep turn. The flush
        // effect below is what actually reaches the screen.
        if (epochRef.current === epoch) reasoningRef.current = accumulated;
      },
    })
      .then((reply) => {
        // The epoch guard above is what keeps this quiet when the student has
        // moved to another thread — no buzz for an answer they can't see.
        if (epochRef.current !== epoch) return;
        if (reply.text || reply.outputs?.length) {
          hapticAnswerReady();
          // Keep what it worked through, so the answer can be opened up later
          // (owner 2026-07-24: the thinking preview should be "modern like
          // chatgpt or claude"). Both of those keep a collapsed row you can
          // expand after the fact; ours used to throw the reasoning away the
          // moment the first answer word landed. This is the model's OWN text,
          // never a summary we wrote. An Instant turn runs with thinking off and
          // simply has none.
          const thought = reasoningRef.current.trim();
          const completedThoughtMs = Math.max(
            1,
            thoughtMsRef.current || Date.now() - turnStartedAtRef.current,
          );
          const next: ChatMsg[] = [
            ...base,
            {
              at: new Date().toISOString(),
              content: reply.text ?? "",
              role: "assistant",
              ...(reply.sources.length ? { sources: reply.sources } : {}),
              ...(reply.outputs?.length ? { outputs: reply.outputs } : {}),
              // Keep the settled duration even when the selected model did not
              // expose raw reasoning. Otherwise the preview disappears as soon
              // as the final message replaces the streaming row.
              thinking: { ms: completedThoughtMs, text: thought },
            },
          ];
          setMessages(next);
          void saveThreadMessages(uid, id, next);
        } else {
          // The user's message stays (it IS the conversation); the failure line
          // renders from transient state and never enters history/persistence.
          setLastError(reply.errorText ?? "Something went wrong.");
          // Credits ran dry → the freemium moment: hard stop, upgrade or wait.
          if (reply.errorKind === "budget") {
            setUpgrade({ message: reply.errorText, reset: reply.budgetReset });
          }
        }
      })
      .finally(() => {
        if (epochRef.current === epoch) {
          sendingRef.current = false;
          setSending(false);
          setStreamingText("");
        }
      });
  }, [input, messages, uid, threadId, attachedDoc, effort]);

  // A shot the student accepted: store it, read it, and hand the words to the
  // next turn. The sheet STAYS UP with a spinner until this lands — dropping
  // back to chat first would leave the student watching an empty composer with
  // no sign that a 3 MB upload was in flight.
  const handlePhoto = useCallback(
    async (uri: string) => {
      if (!uid) return;
      setPhotoBusy(true);
      try {
        const read = await storeAndReadPhoto(uid, uri);
        setPhoto(read);
        setPhotoSaved("idle");
        // photoAttachmentTitle prefixes "Photo:" — the model is never told a
        // photograph is a Library note, because where a fact came from changes
        // how much weight it deserves.
        const doc = { content: read.text, title: photoAttachmentTitle(read.title) };
        setAttachedDoc(doc);
        setCameraOpen(false);
        // Straight out for analysis (owner 2026-07-24: "taking a photo should
        // send it to the chat for analysis"). Every piece of this already
        // existed — camera, upload, Gemini read, attachment — but the photo then
        // sat as a silent chip waiting for the student to think of something to
        // type, so taking a picture appeared to do nothing at all.
        //
        // Whatever they had already typed is the question, because their own
        // words beat any default. An empty composer gets PHOTO_ANALYSIS_ASK.
        // Passed explicitly rather than through state: the setAttachedDoc above
        // has not flushed yet, so a send that read state would go out with no
        // picture attached.
        send({ doc, keepPhoto: true, text: input.trim() || PHOTO_ANALYSIS_ASK });
      } catch (cause) {
        // api/photos.ts throws sentences, so this reaches the screen as-is.
        setLastError(cause instanceof Error ? cause.message : "Couldn't use that photo.");
        setCameraOpen(false);
      } finally {
        setPhotoBusy(false);
      }
    },
    // `send` and `input` are read at capture time to build the turn. handlePhoto is
    // only ever called from the camera sheet's shutter, so a re-created callback
    // costs nothing here.
    [uid, send, input],
  );

  // "…" menu actions.
  const handleDelete = useCallback(() => {
    if (!uid || !threadId) return;
    setMenuOpen(false);
    void deleteThread(uid, threadId).then(() => {
      // Leave the just-deleted thread: replace with /chat (no param) so it resumes the
      // most-recent remaining conversation — or a fresh one if none — and Back can't
      // return to the dead thread.
      router.replace("/chat");
    });
  }, [uid, threadId]);

  // Move to notebook (owner 2026-07-22). The two live in different tables, so
  // this copies the conversation across and only then deletes the original —
  // a failure part-way can't lose the chat. Per-message sources and deliverable
  // chips have no column in notebook_chat_messages and don't come along, which
  // is what the confirmation says before anything is written.
  const openNotebookPicker = useCallback(() => {
    setMenuOpen(false);
    setNotebookPickerOpen(true);
    void listNotebooks()
      .then(setNotebooks)
      .catch(() => setNotebooks([]));
  }, []);

  const moveToNotebook = useCallback(
    (notebookId: string, notebookName: string) => {
      if (!uid || !threadId) return;
      const transcript = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ content: m.content, role: m.role as "user" | "assistant" }));
      const hasExtras = messages.some((m) => (m.sources?.length ?? 0) > 0 || (m.outputs?.length ?? 0) > 0);
      Alert.alert(
        `Move to "${notebookName}"?`,
        hasExtras
          ? "The conversation moves into that notebook and leaves your chat list. Its web sources and saved deliverables stay behind — a notebook chat has nowhere to keep them."
          : "The conversation moves into that notebook and leaves your chat list.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Move",
            onPress: () => {
              setNotebookPickerOpen(false);
              void (async () => {
                try {
                  // The chat screen shows no title (owner 2026-07-20 removed it),
                  // so name the notebook chat after the question that started it.
                  const opener = transcript.find((m) => m.role === "user")?.content.trim() ?? "";
                  const title = opener ? opener.replace(/\s+/g, " ").slice(0, 80) : "Chat";
                  await importChatThreadIntoNotebook({ messages: transcript, notebookId, title });
                  await deleteThread(uid, threadId);
                  router.replace("/chat");
                } catch (e) {
                  Alert.alert("Couldn't move that chat", e instanceof Error ? e.message : "Try again in a moment.");
                }
              })();
            },
          },
        ],
      );
    },
    [uid, threadId, messages],
  );

  const handleTogglePin = useCallback(() => {
    if (!uid || !threadId) return;
    const next = !pinned;
    setPinned(next); // optimistic; the store write is best-effort
    void pinThread(uid, threadId, next);
  }, [uid, threadId, pinned]);

  // Leaves record mode: RecordSession's onDone (fires after Save/Discard/
  // Close) and the mode pill's own toggle-back-to-chat path both land here.
  // Resetting recordingState alongside composerMode matters — without it, a
  // stale "reviewable"/"recording" value would leave the pill permanently
  // locked (see Composer's modeLocked) even after RecordSession has unmounted.
  const exitRecordMode = useCallback(() => {
    setComposerMode("chat");
    setRecordingState("idle");
  }, []);

  const handleRecordingSaved = useCallback(
    (output: ChatOutput) => {
      if (!uid || !threadId) return;
      setMessages((current) => {
        const next: ChatMsg[] = [
          ...current,
          {
            at: new Date().toISOString(),
            content: output.route
              ? "Recording saved. Your notes are being prepared in the Library."
              : "Recording saved. Your notes are being prepared.",
            outputs: [output],
            role: "assistant",
          },
        ];
        void saveThreadMessages(uid, threadId, next);
        return next;
      });
    },
    [threadId, uid],
  );

  // While a recording is live (recording OR stopped-but-unsaved), opening the
  // drawer is the one navigation surface that could silently unmount
  // RecordSession and lose the transcript (drawer → tap another thread —
  // review finding 2026-07-21). Install the drawer's confirm-gate for exactly
  // that window; cleared the moment recording ends or this screen unmounts.
  useEffect(() => {
    if (composerMode !== "record" || recordingState === "idle") {
      drawerOpenGuard.current = null;
      return;
    }
    drawerOpenGuard.current = (proceed) => {
      Alert.alert(
        "Recording in progress",
        recordingState === "recording"
          ? "Leaving this chat stops the recording and discards the transcript."
          : "This recording isn't saved yet — leaving discards it. Save it to the chat first if you want to keep it.",
        [
          { style: "cancel", text: "Stay" },
          {
            onPress: () => {
              exitRecordMode();
              proceed();
            },
            style: "destructive",
            text: "Discard and leave",
          },
        ],
      );
    };
    return () => {
      drawerOpenGuard.current = null;
    };
  }, [composerMode, recordingState, exitRecordMode]);

  // Record mode takes the whole screen (owner 2026-07-22): the TopBar and the
  // status-bar blur stop rendering and the drawer's open-swipe switches off, so
  // a lecture can't be swiped away mid-sentence. Cleared on leaving record mode
  // AND on unmount — a stuck `true` would leave every other tab chrome-less.
  useEffect(() => {
    setImmersive(composerMode === "record");
    return () => setImmersive(false);
  }, [composerMode, setImmersive]);

  // The composer's record button, in the "+" slot: start a recording, or stop
  // the running one. Never fires in the reviewable state — the composer keeps
  // that button inert there, since re-starting would clobber a transcript
  // nobody has saved yet (Composer.tsx's recordDisabled).
  const handleRecordToggle = useCallback(() => {
    if (recordingState === "recording") recordRef.current?.stop();
    else recordRef.current?.start();
  }, [recordingState]);

  // Entering and leaving record mode both come from the composer's round accent
  // button. No thread yet means nothing to record into, so the tap is a no-op
  // rather than opening onto nothing. The plus menu is force-closed too: the
  // "+" button becomes start/stop in record mode, so a stale open menu would
  // otherwise hang over the record workspace with no way to have been reopened.
  const handleComposerModeChange = useCallback(
    (next: ComposerMode) => {
      if (next === "record") {
        if (!threadId) return;
        Keyboard.dismiss();
        setPlusMenuOpen(false);
        setComposerMode("record");
        return;
      }
      exitRecordMode();
    },
    [threadId, exitRecordMode],
  );

  // Publish the "…" actions button into the TopBar's right slot once the thread has
  // messages (an empty new chat has nothing to pin/delete). It toggles `menuOpen`; the
  // dropdown itself renders below in the page layer, so it stays crisp under the
  // status-bar blur. Cleared when empty and on unmount.
  useEffect(() => {
    const hasThread = messages.length > 0;
    setHeaderRight(
      hasThread ? (
        <GlassSurface style={styles.actionsBtn} fallbackColor={c.glassPanel} tint={menuOpen ? c.accentFaint : undefined} shadow>
          <Pressable
            style={styles.actionsBtnInner}
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Chat actions"
            accessibilityState={{ expanded: menuOpen }}
            testID="chat-actions-btn"
          >
            <DotsIcon size={20} color={menuOpen ? c.accent : c.text2} />
          </Pressable>
        </GlassSurface>
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [messages.length, menuOpen, c, styles, setHeaderRight]);

  // Pin the newest user question to the top after a send and on thread open (owner
  // 2026-07-18: your prompt sits at the top, the thinking/answer grows below it and to
  // the left). Keyed on the message COUNT so it fires once per turn; scrollToIndex can
  // throw before a row is measured, so the list's onScrollToIndexFailed retries.
  useEffect(() => {
    const idx = lastUserRowIndexRef.current;
    if (idx < 0) return;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ animated: true, index: idx, viewPosition: 0 });
      } catch {
        // list not ready — onScrollToIndexFailed handles the retry
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Spring the keyboard up whenever the chat screen comes into focus (owner 2026-07-19).
  // The short delay lets the screen settle so the focus reliably raises the keyboard.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => composerRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, []),
  );

  // Refresh the deliverable chips when the screen regains focus — a recording
  // saved on the Record modal (or on another device) appears without reopening
  // the thread.
  useFocusEffect(
    useCallback(() => {
      if (uid && threadId) void loadThreadOutputs(uid, threadId).then(setThreadOutputs);
    }, [uid, threadId]),
  );

  // Keep the OPEN thread live-ish without Realtime (owner 2026-07-23: "chats
  // still arent synced with the webapp"). Realtime isn't enabled on these tables
  // in prod, so instead: pull the thread's messages when the screen regains
  // focus, then gently re-pull while it stays focused, so a message sent from
  // web shows up within a few seconds rather than only on a cold reopen. Never
  // runs mid-send (loadThreadMessages merges local+cloud, but skipping avoids
  // churn over the optimistic turn) and the interval stops on blur/unmount.
  useFocusEffect(
    useCallback(() => {
      if (!uid || !threadId) return;
      const epoch = epochRef.current;
      const pull = () => {
        if (sendingRef.current) return;
        void loadThreadMessages(uid, threadId).then((loaded) => {
          if (epochRef.current === epoch) setMessages(loaded);
        });
      };
      pull();
      const timer = setInterval(pull, 30000);
      return () => clearInterval(timer);
    }, [uid, threadId]),
  );

  if (!uid) {
    return (
      <View
        style={[styles.flex, styles.signinWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}
        testID="chat-signin"
      >
        <EmptyBlock title="Sign in to chat" body="Chat answers from the cloud under your own plan — no Mac needed once you're signed in." />
        <MissionButton label="Sign in" variant="primary" testID="chat-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  const rows: Row[] = messages.map((msg, index) => ({ id: `m-${index}`, kind: "msg", msg }));
  if (lastError) rows.push({ errorText: lastError, id: "__error__", kind: "error" });
  if (sending) {
    // Dots until the first chunk lands, then the SAME "msg" row shape as a
    // finished answer — same key throughout, so FadeIn plays once (on that
    // transition) rather than replaying per chunk as the text grows.
    rows.push(
      streamingText
        ? { id: THINKING_ID, kind: "msg", msg: { at: "", content: streamingText, role: "assistant" }, thoughtMs }
        : { id: THINKING_ID, kind: "thinking" },
    );
  }
  const hasContent = rows.length > 0;
  const messageOutputIds = new Set(messages.flatMap((message) => message.outputs?.map((output) => output.id) ?? []));
  const headerOutputs = threadOutputs.filter((output) => !messageOutputIds.has(output.id));
  // Composer size follows the KEYBOARD, not the conversation (owner 2026-07-22:
  // "when users have keyboard open, the chat composer should be the big version,
  // but when keyboard is down the chatcomposer should have the smaller one").
  // It used to key off hasContent, which meant a long chat gave you the cramped
  // single row even while you were typing into it. The landing look is
  // unchanged: focusing the composer on entry (see the useFocusEffect above)
  // raises the keyboard, so an empty chat still opens on the tall card.
  const composerCompact = !keyboardUp;
  // The newest user-message row — what the scroll effect pins to the top. Computed here
  // in render and stashed in a ref so that effect needn't depend on `rows`.
  lastUserRowIndexRef.current = rows.reduce(
    (acc, row, i) => (row.kind === "msg" && row.msg?.role === "user" ? i : acc),
    -1,
  );
  // Row order for the last-turn measurement (see measureLastTurn) — same reason
  // as the ref above: an onLayout handler shouldn't have to close over `rows`.
  rowIdsRef.current = rows.map((row) => row.id);
  // How much padding the last turn still needs to be able to reach the top of
  // the list. contentTop is the glass TopBar's clearance — the question should
  // land just under it, not behind it.
  // What the transcript has to keep clear at its foot: the floating composer,
  // plus the blur's ramp above it so a settled last line never rests inside the
  // fade (see BOTTOM_FADE_SPAN).
  const listBottomInset = composerBlockH + BOTTOM_FADE_SPAN;
  // listHeight is now the WHOLE screen (the composer floats over it — see
  // composerFloat), so the readable transcript is that minus the inset above.
  // Subtracting it here keeps this spacer meaning exactly what it always meant:
  // enough room for the last turn to reach the top, and not one point more.
  const footerSpacer = Math.max(0, listHeight - listBottomInset - contentTop - space(2) - lastTurnHeight);
  // How far the composer row sits off the bottom edge: a small gap once the
  // keyboard has taken the home-indicator space, otherwise the shell's own
  // bottom clearance. ONE constant, because the two composer menus anchor
  // themselves just above the card and have to agree with the padding the card
  // actually renders with — they used to repeat this sum by hand, twice.
  const composerBottomPad = keyboardUp ? space(3) : contentBottom - space(1);
  const composerMenuOffset =
    composerBottomPad + (composerCompact ? COMPOSER_COMPACT_HEIGHT : COMPOSER_PILL_HEIGHT) + space(2);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={styles.flex} testID="chat-screen">
        {composerMode === "record" ? (
          // Inline record workspace (owner 2026-07-21): swaps in for the whole
          // messages area, same spot/size the FlatList fills below — mirrors
          // web's composer.tsx swapping in record-workspace.tsx. Only the
          // status-bar inset here, NOT contentTop: record mode is immersive
          // (see the setImmersive effect), so there's no TopBar left to clear
          // and padding for one would just waste a strip of the transcript.
          <View style={[styles.flex, { paddingBottom: composerBlockH, paddingTop: insets.top }]} testID="chat-record-workspace">
            <RecordSession
              ref={recordRef}
              userId={uid}
              threadId={threadId}
              onDone={exitRecordMode}
              onSaved={handleRecordingSaved}
              onRecordingStateChange={setRecordingState}
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(row) => row.id}
            contentContainerStyle={[styles.listBody, { paddingBottom: listBottomInset, paddingTop: contentTop + space(2) }]}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={(info) => {
              // A row wasn't measured yet: jump near it by estimate, then retry once settled.
              listRef.current?.scrollToOffset({ animated: false, offset: info.averageItemLength * info.index });
              setTimeout(() => {
                try {
                  listRef.current?.scrollToIndex({ animated: true, index: info.index, viewPosition: 0 });
                } catch {
                  // give up quietly — content is still readable, just not auto-pinned
                }
              }, 120);
            }}
            onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
            // Drives the jump-to-bottom button. Compared against a threshold
            // rather than exact equality: momentum and rubber-banding mean the
            // offset is rarely exactly the end, and a button that blinks at the
            // bottom of every scroll is worse than no button.
            scrollEventThrottle={64}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const fromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
              setAwayFromBottom(fromBottom > JUMP_TO_BOTTOM_AT);
            }}
            renderItem={({ item }) => (
              // The wrapper exists to MEASURE: the bottom spacer below is sized
              // from the height of the last turn, so every row reports its own.
              <View
                onLayout={(e) => {
                  rowHeights.current.set(item.id, e.nativeEvent.layout.height);
                  measureLastTurn();
                }}
              >
                {item.kind === "thinking" ? (
                  <View style={styles.assistantRow} testID="chat-thinking">
                    <ThinkingLine
                      phase={phase}
                      testID="chat-thinking-line"
                    />
                  </View>
                ) : item.kind === "error" ? (
                  <View style={styles.errorBubble} testID="chat-error">
                    <Text style={styles.errorText}>{item.errorText}</Text>
                  </View>
                ) : item.msg!.role === "user" ? (
                  <View style={[styles.bubble, styles.userBubble]}>
                    <Text style={styles.userText}>{item.msg!.content}</Text>
                  </View>
                ) : (
                  // Assistant: full-width markdown (with LaTeX/math), NO bubble. Fades in as
                  // it arrives (owner 2026-07-19). A "Sources · N" pill (when the router
                  // grounded this turn with a web search) and any deliverable chips this
                  // turn carries render underneath.
                  <Reanimated.View entering={FadeIn.duration(350)} style={styles.assistantRow}>
                    {/* Only the live turn carries thoughtMs, so this note rides
                        above the answer while it streams and is gone once the
                        finished message re-renders from history. */}
                    {item.thoughtMs && settledLabel(item.thoughtMs) ? (
                      <Text style={styles.thoughtNote} testID="chat-thought-note">
                        {settledLabel(item.thoughtMs)}
                      </Text>
                    ) : null}
                    {/* A finished turn keeps what it worked through, openable —
                        the half ChatGPT and Claude both have that we did not.
                        Above the answer, same place the live line was, so the
                        transcript does not jump as one replaces the other. */}
                    {item.msg!.thinking ? (
                      <ThoughtTrail thinking={item.msg!.thinking} testID="chat-thought-trail" />
                    ) : null}
                    {item.msg!.content.trim() ? (
                      <MessageBody
                        content={item.msg!.content}
                        sources={item.msg!.sources}
                        styles={markdownStyles}
                      />
                    ) : null}
                    {item.id === THINKING_ID && sending ? (
                      <View style={styles.continuedThinking} testID="chat-thinking-continuing">
                        <ThinkingLine phase={phase} testID="chat-thinking-line-continuing" />
                      </View>
                    ) : null}
                    {item.msg!.sources?.length ? (
                      <SourcesPill sources={item.msg!.sources} onPress={() => setSourcesSheetFor(item.msg!.sources ?? null)} />
                    ) : null}
                    {item.msg!.outputs?.length ? <DeliverableCardStack outputs={item.msg!.outputs} onSelect={openDeliverable} /> : null}
                  </Reanimated.View>
                )}
              </View>
            )}
            ListHeaderComponent={
              // Session-level deliverables (e.g. a web Record-mode recording synced
              // onto this thread) — a chip row at the very top of the transcript,
              // separate from any PER-MESSAGE chips rendered in renderItem above.
              headerOutputs.length ? <DeliverableCardStack outputs={headerOutputs} onSelect={openDeliverable} compact /> : null
            }
            ListEmptyComponent={
              messagesLoading ? (
                // History is still being fetched — messages is [] either way (loading or
                // genuinely empty), so without this the greeting below would flash on
                // screen a beat before real history replaces it. See messagesLoading.
                <ChatSkeleton />
              ) : null
            }
            ListFooterComponent={
              // Bottom spacer so the last exchange can scroll up until the question sits at
              // the top of the viewport (ChatGPT-style) — and NOT ONE POINT MORE (owner
              // 2026-07-22). It's the shortfall between the viewport and the last turn, so
              // a long answer that already fills the screen gets no spacer at all and the
              // list simply stops at the end of the text.
              hasContent ? <View style={{ height: footerSpacer }} /> : null
            }
          />
        )}
        <ChatActionsPopup
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          pinned={pinned}
          onDelete={handleDelete}
          onMoveToNotebook={openNotebookPicker}
          onTogglePin={handleTogglePin}
          topInset={insets.top}
        />
        {/* Destination list for "Move to notebook" — reuses the note picker's
            sheet, so it inherits the same drag-to-expand and glass. */}
        <NoteListSheet
          visible={notebookPickerOpen}
          title="Move to notebook"
          rows={notebooks.map<NoteSheetRow>((n) => ({
            key: n.id,
            label: n.name,
            ...(n.description ? { sublabel: n.description } : {}),
          }))}
          emptyText="No notebooks yet — create one on the Notebooks tab first."
          onPick={(id) => {
            const notebook = notebooks.find((n) => n.id === id);
            if (notebook) moveToNotebook(notebook.id, notebook.name);
          }}
          onClose={() => setNotebookPickerOpen(false)}
          testID="chat-notebook-picker"
        />
        <UpgradeSheet
          visible={upgrade !== null}
          message={upgrade?.message ?? null}
          reset={upgrade?.reset ?? null}
          onClose={() => setUpgrade(null)}
        />
        <AttachLibrarySheet
          visible={libraryPickerOpen}
          onClose={() => setLibraryPickerOpen(false)}
          userId={uid}
          onPick={(note: CloudLibraryNote) => {
            setAttachedDoc({ content: note.content, title: note.title });
            setLibraryPickerOpen(false);
          }}
        />
        <PhotoCaptureSheet
          visible={cameraOpen}
          busy={photoBusy}
          onClose={() => setCameraOpen(false)}
          onCaptured={(uri) => void handlePhoto(uri)}
        />
        <SourcesSheet visible={sourcesSheetFor !== null} onClose={() => setSourcesSheetFor(null)} sources={sourcesSheetFor ?? []} />
        <DeliverableSheet visible={deliverableSheetFor !== null} onClose={() => setDeliverableSheetFor(null)} output={deliverableSheetFor} />
        {/* The bottom edge of the transcript, softened (owner 2026-07-23: "in
            chats, remove the bottom border and replace with a fade to blur").
            The list runs under the composer now, so text dissolves into a blur
            on its way down instead of being cut off on a hard line. Sits
            between the list and the composer in the tree, which is exactly
            where it belongs visually. Not in record mode — that screen is
            immersive and has no transcript to fade.

            And NOT on the empty landing screen (owner 2026-07-23, screenshot).
            A blur has to have something behind it to blur; over a blank white
            page a chrome-material blur is just a flat grey wash, and its
            ease-in ramp reads as a hard-edged band floating in mid-air. The
            landing screen is also where the block is TALLEST — composerBlockH
            includes the three starter rows — so the artifact covered the bottom
            third of the screen and washed out the starter rows themselves.
            Nothing to fade means nothing to draw. */}
        {composerMode === "chat" && hasContent ? <BottomFadeBlur height={composerBlockH} /> : null}
        {/* Jump to the newest message (owner 2026-07-24: "add a downward arrow in
            the chat for when conversations get long so users can scroll all the
            way to the bottom (it should disappear if user is already at the
            bottom)").
            Mounted only while it has a job — not rendered-and-faded — so it can
            never sit over the transcript as a dead control, and it fades in so it
            does not pop. It rides ABOVE the composer block, whose measured height
            already tracks the starter rows, an attached chip and a multi-line
            draft, so the arrow moves with the composer instead of guessing. */}
        {composerMode === "chat" && hasContent && awayFromBottom ? (
          <Reanimated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.jumpWrap, { bottom: composerBlockH + space(2) }]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => {
                // The list's footer spacer is part of the content, so scrollToEnd
                // lands where the newest text actually finishes — which is what
                // "all the way to the bottom" means here.
                listRef.current?.scrollToEnd({ animated: true });
                setAwayFromBottom(false);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Jump to the newest message"
              testID="chat-jump-to-bottom"
            >
              {({ pressed }) => (
                <GlassSurface
                  style={[styles.jumpBtn, pressed && styles.jumpBtnPressed]}
                  fallbackColor={c.glassMenu}
                  opaque
                  shadow
                >
                  <ArrowDownIcon size={20} color={c.text} />
                </GlassSurface>
              )}
            </Pressable>
          </Reanimated.View>
        ) : null}
        <View
          style={[styles.composerRow, styles.composerFloat, { paddingBottom: composerBottomPad }]}
          onLayout={(e) => {
            // Drives the list's bottom padding AND the blur's height, so both
            // follow the composer as it grows (starter rows, attached chip, a
            // multi-line draft) rather than guessing at a fixed number.
            const next = e.nativeEvent.layout.height;
            setComposerBlockH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
          }}
        >
          {/* ChatGPT-style landing (owner 2026-07-20): on an empty chat, quiet starter
              rows sit directly above the composer. They vanish the moment the first
              message exists — and, same as the attached-doc chip below, while the
              record workspace has replaced the message area (nothing to prefill
              into a composer that isn't showing its text field right now).

              They also vanish as soon as you START TYPING (owner 2026-07-23).
              They are prefills: tapping one REPLACES whatever is in the composer,
              so once there are words in there the rows have stopped being a
              shortcut and become a way to lose what you wrote. Keyed off the
              typed text rather than focus — tapping in to reposition the caret,
              or the keyboard opening on its own, shouldn't clear the landing. */}
          {composerMode === "chat" && !hasContent && !messagesLoading && input.trim().length === 0 ? (
            <StarterRows
              onPick={(text) => {
                setInput(text);
                composerRef.current?.focus();
              }}
            />
          ) : null}
          {/* `photo` as well as `attachedDoc`: a photo now sends itself, which
              clears the attachment immediately, and the chip is where "Save to
              Library" lives. Without the second condition the offer would vanish
              in the same frame it appeared. Once the attachment is gone the chip
              is purely that offer — the picture is not riding any further turn. */}
          {composerMode === "chat" && (attachedDoc || photo) ? (
            <AttachedDocChip
              title={attachedDoc?.title ?? photoAttachmentTitle(photo?.title ?? "")}
              onRemove={clearAttachment}
              thumbnailUri={photo?.imageUrl ?? null}
              onSave={photo ? () => void savePhotoToLibrary() : undefined}
              saveState={photoSaved}
            />
          ) : null}
          <Composer
            value={input}
            onChangeText={setInput}
            // Wrapped, not passed straight through: the send button hands its
            // press event to onPress, and send() now takes an optional override
            // object — an event arriving in that slot would be read as one.
            onSend={() => send()}
            onPlus={() => {
              setEffortMenuOpen(false);
              setPlusMenuOpen((v) => !v);
            }}
            sending={sending}
            placeholder="Ask Nemesis"
            inputRef={composerRef}
            testID="chat-input"
            mode={composerMode}
            onModeChange={handleComposerModeChange}
            onRecordToggle={handleRecordToggle}
            // Locked mid-recording/reviewable so the ✕ can't strand an unsaved
            // recording. Combined with recordingActive below it also tells the
            // composer which of the three session states it's in.
            modeLocked={recordingState !== "idle"}
            recordingActive={recordingState === "recording"}
            compact={composerCompact}
            effort={effort}
            effortMenuOpen={effortMenuOpen}
            // Opening one composer menu closes the other — they anchor to the
            // same spot, so both open at once would stack.
            onEffortToggle={() => {
              setPlusMenuOpen(false);
              setEffortMenuOpen((v) => !v);
            }}
          />
        </View>
        {/* BOTH composer menus render AFTER the composer row, and that ordering
            is the fix for a real bug (owner 2026-07-23: the intelligence picker
            was "stuck at medium in landing page", and the "+" menu "clashed
            with text behind it"). React Native paints siblings in tree order
            with no z-index in play here, so while these sat above the row the
            row painted over them. On a conversation that was invisible — the
            menus hang over the message list, which is earlier still. On the
            EMPTY-chat landing it was not: the StarterRows band sits inside the
            composer row at exactly the height these menus open to, so the
            starter text drew on top of the opaque panel AND swallowed every tap
            meant for a menu row. Rendering last puts the menus above both. */}
        <ComposerPlusMenu
          visible={plusMenuOpen}
          onClose={() => setPlusMenuOpen(false)}
          bottomOffset={composerMenuOffset}
          onAttach={() => setLibraryPickerOpen(true)}
          onAddFile={() => void addFileFromDevice()}
          onTakePhoto={() => setCameraOpen(true)}
        />
        {/* The intelligence pill's dropdown — anchored above the composer off
            the same measurements the "+" menu uses, so the two hang at exactly
            the same height whichever one is open. */}
        <EffortPopup
          visible={effortMenuOpen}
          effort={effort}
          bottomOffset={composerMenuOffset}
          onSelect={setEffort}
          onClose={() => setEffortMenuOpen(false)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// The chat "…" dropdown (Pin/Unpin · Delete chat). Always mounted so its close fade
// plays; the button that toggles it lives in the TopBar's right slot (see the
// setHeaderRight effect). Same fade+rise + transparent tap-catcher as the app's other
// menus — no whole-screen blur, the menu's own glass is the only blur. Anchored just
// below the "…" button (which sits below the status-bar blur), so it renders crisp.
function ChatActionsPopup({
  visible,
  onClose,
  pinned,
  onDelete,
  onMoveToNotebook,
  onTogglePin,
  topInset,
}: {
  visible: boolean;
  onClose: () => void;
  pinned: boolean;
  onDelete: () => void;
  onMoveToNotebook: () => void;
  onTogglePin: () => void;
  topInset: number;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 170 : 130,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="chat-actions-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View
        style={[
          styles.actionsMenuWrap,
          { top: topInset + space(2) + 44 + space(1.5), opacity: progress, transform: [{ translateY }] },
        ]}
      >
        <GlassSurface style={styles.actionsMenu} fallbackColor={c.glassPanel} opaque>
          <Pressable
            testID="chat-action-pin"
            onPress={() => pick(onTogglePin)}
            style={({ pressed }) => [styles.actionsRow, pressed && styles.actionsRowPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.actionsLabel}>{pinned ? "Unpin" : "Pin"}</Text>
          </Pressable>
          {/* Notebooks retired — see lib/notebooks-retired.ts. Moving a chat
              into a hidden surface would be a one-way trip. */}
          {NOTEBOOKS_RETIRED ? null : (
            <Pressable
              testID="chat-action-move-notebook"
              onPress={() => pick(onMoveToNotebook)}
              style={({ pressed }) => [styles.actionsRow, styles.actionsDivider, pressed && styles.actionsRowPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.actionsLabel}>Move to notebook</Text>
            </Pressable>
          )}
          <Pressable
            testID="chat-action-delete"
            onPress={() => pick(onDelete)}
            style={({ pressed }) => [styles.actionsRow, styles.actionsDivider, pressed && styles.actionsRowPressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionsLabel, styles.actionsLabelDanger]}>Delete chat</Text>
          </Pressable>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Horizontal "…" for the TopBar chat-actions button. */
function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

/** The attached Library document's small removable chip, rendered just above
 *  the composer input while it's staged for the next send (owner spec:
 *  "show a small removable chip above the composer input"). Cleared
 *  automatically once that turn sends (see send()) or manually via the "x". */
// The landing starters — icon + label rows in the ChatGPT reference's language
// (owner 2026-07-20). Tapping one only PREFILLS the composer and focuses it;
// nothing sends until the student does. Each maps to something this phone chat
// genuinely delivers: conversational quizzing, an explanation, or a question the
// router grounds with a live web search.
const STARTERS = [
  { key: "quiz", label: "Quiz me on a topic", prefill: "Quiz me on ", Icon: StudyIcon },
  { key: "explain", label: "Explain a concept", prefill: "Explain ", Icon: SparkleIcon },
  { key: "lookup", label: "Look something up", prefill: "Look up ", Icon: SearchIcon },
] as const;

function StarterRows({ onPick }: { onPick: (text: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.starters} testID="chat-starters">
      {STARTERS.map(({ key, label, prefill, Icon }) => (
        <Pressable
          key={key}
          onPress={() => onPick(prefill)}
          style={({ pressed }) => [styles.starterRow, pressed && styles.starterRowPressed]}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={`chat-starter-${key}`}
        >
          {/* Gray on purpose (owner 2026-07-22) — the other exception to the
              flat text: these are prompts for a question the student hasn't
              asked yet, so they sit back from real conversation text. */}
          <Icon size={19} color={c.textHint} />
          <Text style={styles.starterLabel}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Loading skeleton for ListEmptyComponent (messagesLoading, above) — a couple of
 *  exchanges shaped like the real transcript (user bubble + full-width assistant
 *  block), so it reads as "your history is coming" rather than a generic loader. */
function ChatSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chatSkeletonWrap} testID="chat-skeleton">
      <View style={[styles.bubble, styles.userBubble]}>
        <Skeleton width={150} height={16} />
      </View>
      <View style={styles.assistantRow}>
        <Skeleton width="88%" height={16} style={styles.skeletonLine} />
        <Skeleton width="72%" height={16} style={styles.skeletonLine} />
        <Skeleton width="50%" height={16} />
      </View>
      <View style={[styles.bubble, styles.userBubble]}>
        <Skeleton width={110} height={16} />
      </View>
      <View style={styles.assistantRow}>
        <Skeleton width="80%" height={16} style={styles.skeletonLine} />
        <Skeleton width="60%" height={16} />
      </View>
    </View>
  );
}

/** The one-shot attachment sitting above the composer. A photographed page adds
 *  two things a Library note doesn't have: a thumbnail (so the student can see
 *  WHICH shot is attached without opening anything) and a "Save to Library"
 *  action, which is where "even saved to library if it's a note" actually
 *  lives. Both are optional — an attached note renders exactly as before. */
function AttachedDocChip({
  title,
  onRemove,
  thumbnailUri = null,
  onSave,
  saveState = "idle",
}: {
  title: string;
  onRemove: () => void;
  thumbnailUri?: string | null;
  onSave?: () => void;
  saveState?: "idle" | "saving" | "saved";
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.attachChipRow}>
      <View style={styles.attachChip} testID="chat-attached-doc-chip">
        {thumbnailUri ? <Image source={{ uri: thumbnailUri }} style={styles.attachChipThumb} /> : null}
        <Text style={styles.attachChipText} numberOfLines={1}>{title}</Text>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${title}`} testID="chat-attached-doc-remove">
          <CloseIcon size={12} color={c.text2} />
        </Pressable>
      </View>
      {onSave ? (
        <Pressable
          onPress={saveState === "idle" ? onSave : undefined}
          disabled={saveState !== "idle"}
          hitSlop={8}
          accessibilityRole="button"
          testID="chat-photo-save"
        >
          <Text style={[styles.attachChipAction, saveState === "saved" && styles.attachChipActionDone]}>
            {saveState === "saved" ? "Saved to Library" : saveState === "saving" ? "Saving…" : "Save to Library"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    signinWrap: { alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    listBody: { padding: space(4), gap: space(2), flexGrow: 1 },
    bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5) },
    // Plain gray — no accent fill, no accent border (owner call 2026-07-18: the
    // prompt bubble should read neutral, not tinted).
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: c.surface2,
    },
    userText: { ...type.body, color: c.text },
    // Assistant is not a bubble — it's a full-width block of markdown.
    assistantRow: { alignSelf: "stretch", paddingHorizontal: space(0.5), paddingVertical: space(1) },
    errorBubble: { alignSelf: "flex-start", maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderWidth: 1, borderColor: c.warnLine, backgroundColor: c.warnFaint },
    errorText: { ...type.small, color: c.text2 },
    // "Thought for 12s" above a streaming answer — a quiet footnote, deliberately
    // the dimmest text on the row so it never reads as part of the answer.
    thoughtNote: { ...type.micro, color: c.text3, marginBottom: space(1) },
    continuedThinking: { marginTop: space(1) },
    // No flex:1 — the greeting sizes to its content so it sits at the top of the
    // scroll area (paddingTop places it just below the glass TopBar). Owner
    // 2026-07-20: ONE short line only, muted (text2) — no explainer sentence.
    emptyWrap: { alignItems: "center", gap: space(2), paddingHorizontal: space(6) },
    emptyTitle: { ...type.title, color: c.text2, textAlign: "center" },
    // Loading skeleton (ChatSkeleton, above) — spacing between its two exchanges;
    // skeletonLine spaces an exchange's own wrapped bars.
    chatSkeletonWrap: { gap: space(2) },
    skeletonLine: { marginBottom: space(2) },
    composerRow: { paddingHorizontal: space(3), paddingTop: space(2) },
    // FLOATS over the transcript rather than sitting under it in the flex
    // column. That's what lets messages scroll all the way to the bottom edge
    // and fade out under BottomFadeBlur; with the composer in flow there was
    // nothing below the list to fade INTO, just a hard cut. Deliberately no
    // zIndex — it renders after the blur, and tree order is what puts it on
    // top. Adding one would also lift it over this screen's bottom sheets.
    composerFloat: { position: "absolute", bottom: 0, left: 0, right: 0 },
    // The jump-to-bottom arrow, centred above the composer. `bottom` is applied
    // inline from the composer's measured height. Same reasoning as
    // composerFloat about zIndex: it is rendered AFTER the bottom fade and
    // BEFORE the composer, and tree order is what stacks them on iOS — so it
    // sits over the fading transcript and under the composer, which is the only
    // order that works if a tall draft ever grows up to meet it.
    jumpWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    jumpBtn: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    jumpBtnPressed: { opacity: 0.7 },
    // Landing starter rows — plain (no glass, no borders) so they read as quiet
    // suggestions on the page, not controls; generous air between rows like the
    // ChatGPT reference.
    starters: { paddingHorizontal: space(1), paddingBottom: space(3), gap: space(1.5) },
    starterRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: space(3.5),
      paddingVertical: space(2.5),
      paddingHorizontal: space(2),
      borderRadius: radius.md,
    },
    starterRowPressed: { backgroundColor: c.surface },
    // Muted with its icon — see the StarterRows comment on why these two spots
    // keep gray when the rest of the app went pure black/white.
    starterLabel: { ...type.body, color: c.textHint },
    // The attached-Library-doc chip staged above the composer input. A row
    // rather than a lone pill since the camera landed: a photo chip carries a
    // "Save to Library" action beside it.
    attachChipRow: { alignItems: "center", flexDirection: "row", gap: space(2), marginBottom: space(1.5), paddingHorizontal: space(1) },
    attachChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: space(1.5),
      maxWidth: 260,
      paddingVertical: space(1),
      paddingHorizontal: space(2.5),
      borderRadius: radius.pill,
      backgroundColor: c.surface2,
    },
    attachChipText: { ...type.small, color: c.text, flexShrink: 1 },
    // Small enough to read as provenance rather than as a picture viewer — its
    // job is "which shot is attached", not "look at this photo".
    attachChipThumb: { borderRadius: radius.sm, height: 22, width: 22 },
    attachChipAction: { ...type.small, color: c.accent },
    attachChipActionDone: { color: c.textHint },

    // "…" chat-actions button (rendered into the TopBar's right slot) + its dropdown.
    actionsBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    actionsBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    actionsMenuWrap: { position: "absolute", right: space(3), minWidth: 168 },
    actionsMenu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    actionsRow: { paddingVertical: space(3), paddingHorizontal: space(4) },
    actionsRowPressed: { backgroundColor: c.surface },
    actionsDivider: { borderTopWidth: 1, borderTopColor: c.line },
    actionsLabel: { ...type.body, color: c.text },
    actionsLabelDanger: { color: c.danger },
  });
