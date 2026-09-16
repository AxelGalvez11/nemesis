import { useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Animated, Image, InputAccessoryView, Keyboard, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { applyPageTemplate, type PageTemplate } from "@/api/pageTemplates";
import { setFavorite, trashPage, visitPage } from "@/api/pageMenu";
import { BlurView } from "expo-blur";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeFlashcards } from "@/api/makeCards";
import { settlePageRecordings } from "@/api/recording";
import { addFileSource, addLinkSource, addNoteSource, addPhotoSource, removeSource } from "@/api/pageSources";
import { PhotoCaptureSheet } from "@/components/PhotoCaptureSheet";
import { loadPage, pageBlocks, pageSources, type Block, type PageSource, type PageSummary } from "@/api/space";
import { addBlockAfter, insertBlockAfter, setBlockText, setBlockType, setChecked, setPageTitle } from "@/api/spaceWrite";
import { NoteAskBar } from "@/components/nx/NoteAskBar";
import { PageMenu } from "@/components/nx/PageMenu";
import { embedUrl, openEmbed } from "@/api/noteMedia";
import { BlockEditor, turnIntoProps, type NewBlockType, type SaveResult, type TurnIntoType } from "@/components/nx/editor/BlockEditor";
import { BookmarkEmbed, FileEmbed } from "@/components/nx/editor/FileEmbed";
import { InlineImage } from "@/components/nx/editor/InlineImage";
import { SkelBar, SkelBody, SkelGroup, SkelList, SkelPage } from "@/components/nx/Skeleton";
import Reanimated from "react-native-reanimated";
import { NxDim, NxSheet, nxHaptic, useNxPopStyle, useNxPresence } from "@/components/nx/motion";
import { NxPressable } from "@/components/nx/NxPressable";
import { createDatabase, databasePageIdsOf, isDatabasePage } from "@/api/database";
import { DatabaseBlock } from "@/components/nx/db/DatabaseBlock";
import { addCard, deckCards, deleteCard, updateCard } from "@/api/study";
import { useAuth } from "@/auth/AuthProvider";
import { CardEditor, type CardDraft } from "@/components/nx/CardEditor";
import { NxIcon, type NxIconName } from "@/components/nx/NxIcon";
import { NxBottomBar, NxButton, NxChevron, NxEmoji, NxIconButton, NxIconTile, NxPill, NxRow, NxSection } from "@/components/nx/primitives";
import { NxAddPill, NxPageTitle, NxWorkspaceTabs, type WsTab } from "@/components/nx/workspace";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { ago } from "@/lib/ago";
import { nxType, useNx } from "@/theme/nx";

const cobalt = require("../../../assets/images/nx/cobalt-hd.jpg");

// A page is a workspace (canvas: NotePage, NoteReady, NoteSources, AddSource, NoteCreate, CreateSources, SubPage).
// Notes / Sources / Create. Sources flow UP: a page counts its sub-pages' sources; a sub-page only sees its own.
export default function PageScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [tab, setTab] = useState<WsTab>("notes");
  const [editing, setEditing] = useState(false);
  const [toolbarUp, setToolbarUp] = useState(false);
  // The bottom is just the Ask AI bar (owner 2026-09-15): it raises the AI bar with this note's pill.
  // Typing starts by tapping a line; putting the keyboard away ends it.
  const [askOpen, setAskOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: string; at: number } | null>(null);
  const engagedOnce = useRef(false);

  // Scrolled down a long note (canvas NoteScrolled): past the title a slim frosted bar with the page name
  // appears; scrolling down tucks the Ask bar away, scrolling up brings it back.
  const [scrolledPast, setScrolledPast] = useState(false);
  const barShown = useRef(new Animated.Value(1)).current;
  const lastY = useRef(0);
  const barVisible = useRef(true);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    setScrolledPast(y > 170);
    // The rubber-band at the foot of a short note springs back up; that is not the student scrolling up.
    const bottom = Math.max(0, contentSize.height - layoutMeasurement.height);
    if (y > bottom - 2 || y < 0) {
      lastY.current = Math.min(Math.max(y, 0), bottom);
      if (y < 0 && !barVisible.current) {
        barVisible.current = true;
        Animated.timing(barShown, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      }
      return;
    }
    const goingDown = y > lastY.current + 4;
    const goingUp = y < lastY.current - 4;
    lastY.current = y;
    const want = y < 60 || goingUp ? true : goingDown ? false : barVisible.current;
    if (want !== barVisible.current) {
      barVisible.current = want;
      Animated.timing(barShown, { toValue: want ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    }
  };
  const [editError, setEditError] = useState<string | null>(null);

  const page = useQuery({ queryKey: ["ws-page", id], queryFn: () => loadPage(id), enabled: !!id });
  const sources = useQuery({ queryKey: ["ws-sources", id], queryFn: () => pageSources(id), enabled: !!id });
  const children = page.data?.children.filter((p) => p.alive) ?? [];
  const childSources = useQueries({
    queries: children.slice(0, 20).map((ch) => ({ queryKey: ["ws-sources", ch.id], queryFn: () => pageSources(ch.id) })),
  });
  const decks = useDecks();
  const space = useSpacePages();

  const blocks = useMemo(() => (page.data ? pageBlocks(page.data) : []), [page.data]);

  // Notes from a recording that finished while the student was elsewhere are written in when the page opens.
  useEffect(() => {
    if (!id) return;
    void settlePageRecordings(id)
      .then((changed) => {
        if (changed) {
          void qc.invalidateQueries({ queryKey: ["ws-page", id] });
          void qc.invalidateQueries({ queryKey: ["ws-sources", id] });
        }
      })
      .catch(() => undefined);
  }, [id, qc]);
  useEffect(() => {
    if (id) void visitPage(id).catch(() => undefined);
  }, [id]);

  // The dots menu (canvas page_header): favourite and move to trash. Trash is restorable from the web.
  // 🔴 A page opened from a link or a notification has no screen behind it; going back must land on Notes, not throw
  // "The action 'GO_BACK' was not handled".
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // The "..." menu: the app's own pop-up (owner: the iOS action sheet "doesn't have UI").
  const [menuOpen, setMenuOpen] = useState(false);
  const more = () => {
    if (page.data?.space_id) setMenuOpen(true);
  };
  const fav = space.favoriteIds.has(id);
  const runMenu = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "That did not work. Try again.");
    }
  };
  // A function, so canEdit and blocks (declared further down) are read when the menu renders.
  const menuItems = () => [
    {
      icon: "star" as const,
      label: fav ? "Remove from favorites" : "Add to favorites",
      onPress: () =>
        void runMenu(async () => {
          await setFavorite(id, !fav);
          await qc.invalidateQueries({ queryKey: ["ws-bootstrap"] });
        }),
    },
    {
      icon: "share" as const,
      label: "Share",
      onPress: () => void Share.share({ message: `${title || "Untitled"}\n\n${blocks.map((b) => b.text).filter(Boolean).join("\n")}`.trim() }),
    },
    ...(canEdit
      ? [
          {
            icon: "trash" as const,
            label: "Move to trash",
            danger: true,
            onPress: () =>
              void runMenu(async () => {
                await trashPage(page.data!.space_id, id);
                await qc.invalidateQueries({ queryKey: ["ws-all-pages"] });
                await qc.invalidateQueries({ queryKey: ["ws-bootstrap"] });
                goBack();
              }),
          },
        ]
      : []),
  ];
  const record = () => router.push({ pathname: "/record/[pageId]", params: { pageId: id } });

  const startEditing = (blockId: string) => {
    setEditError(null);
    setFocusRequest({ id: blockId, at: Date.now() });
    setEditing(true);
  };
  /** A new line with the cursor already in it, the way a regular notes app behaves (owner 2026-09-15: there is
   *  no "Add a line" row, so an empty note and the space under the last line have to write straight away). */
  const startWriting = async (afterId: string | null) => {
    if (!spaceIdOfPage || !canEdit) return;
    setEditError(null);
    setEditing(true);
    try {
      const after = afterId ? blocks.find((b) => b.id === afterId) : undefined;
      const anchor = after ? { id: after.id, parentId: after.parentId === id ? null : after.parentId } : null;
      await addBlockAfter(spaceIdOfPage, id, pageContent, anchor, "text");
      const fresh = await page.refetch();
      const next = fresh.data ? pageBlocks(fresh.data) : [];
      const last = next[next.length - 1];
      if (last) setFocusRequest({ id: last.id, at: Date.now() });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "The line could not be added.");
    }
  };
  const onEditorEngaged = (on: boolean) => {
    setToolbarUp(on);
    if (on) engagedOnce.current = true;
    else if (engagedOnce.current) {
      engagedOnce.current = false;
      setEditing(false);
    }
  };
  const titles = useMemo(() => new Map(children.map((ch) => [ch.id, ch])), [children]);
  const parent = page.data?.ancestors[page.data.ancestors.length - 1];
  const title = String(page.data?.page.props.title ?? "");
  const cover = typeof page.data?.page.props.cover === "string" && /^#|^rgb/.test(page.data.page.props.cover as string) ? (page.data.page.props.cover as string) : undefined;
  const canEdit = page.data?.role === "full" || page.data?.role === "edit";

  const own = sources.data ?? [];
  const subTotals = children.slice(0, 20).map((ch, i) => ({ page: ch, count: childSources[i]?.data?.length ?? 0 })).filter((x) => x.count > 0);
  const totalSources = own.length + subTotals.reduce((n, x) => n + x.count, 0);
  const recording = blocks.find((b) => b.type === "transcription");

  const spaceIdOfPage = page.data?.space_id ?? null;
  const pageContent = (page.data?.page.props.content as string[] | undefined) ?? [];
  const reloadPage = () => void qc.invalidateQueries({ queryKey: ["ws-page", id] });

  // Databases inside a note (Notion style). On the web a database is its own page linked by a page block; the phone
  // draws those linked pages inline with their views (api/database.ts).
  const databaseIds = useMemo(() => databasePageIdsOf(page.data), [page.data]);
  const addDatabase = async (afterId: string | null) => {
    if (!spaceIdOfPage) return;
    try {
      const after = afterId ? blocks.find((b) => b.id === afterId) : undefined;
      await createDatabase(spaceIdOfPage, id, pageContent, after?.id ?? null, after && after.parentId !== id ? after.parentId : null);
      reloadPage();
      void qc.invalidateQueries({ queryKey: ["ws-all-pages"] });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "The database could not be added.");
    }
  };
  const saveText = async (block: Block, text: string) => {
    if (!spaceIdOfPage) return;
    try {
      const result = await setBlockText(spaceIdOfPage, block.id, text, block.titleVersion);
      if (result === "conflict") setEditError("This line was changed somewhere else, so the newest version is shown.");
      reloadPage();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "That change did not save.");
    }
  };
  const toggle = async (block: Block, checked: boolean) => {
    if (!spaceIdOfPage) return;
    try {
      await setChecked(spaceIdOfPage, block.id, checked);
      reloadPage();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "That change did not save.");
    }
  };
  // The editor saves text itself as you type; the page only reacts to how that went.
  const onSaved = (_block: Block, result: SaveResult) => {
    if (result === "conflict") {
      setEditError("This line was changed somewhere else, so the newest version is shown.");
      reloadPage();
    } else if (result === "failed") {
      setEditError("That line did not save. Check your connection and keep typing to try again.");
    } else {
      setEditError(null);
    }
  };
  const turnInto = async (block: Block, type: TurnIntoType) => {
    if (!spaceIdOfPage) return;
    try {
      await setBlockType(spaceIdOfPage, block.id, type, turnIntoProps(block, type));
      reloadPage();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "That block could not be changed.");
    }
  };
  const addBlock = async (type: NewBlockType, afterId: string | null, props?: Record<string, unknown>) => {
    if (!spaceIdOfPage) return;
    try {
      const after = afterId ? blocks.find((b) => b.id === afterId) : undefined;
      const anchor = after ? { id: after.id, parentId: after.parentId === id ? null : after.parentId } : null;
      if (props) await insertBlockAfter(spaceIdOfPage, id, pageContent, anchor, type, props);
      else await addBlockAfter(spaceIdOfPage, id, pageContent, anchor, type);
      reloadPage();
      if (type === "page") void qc.invalidateQueries({ queryKey: ["ws-all-pages"] });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "The block could not be added.");
    }
  };

  const refreshSources = () => {
    void qc.invalidateQueries({ queryKey: ["ws-sources", id] });
  };

  // ── Sources: the Add pop-up ─────────────────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  // The Add pop-up grows out of its top-right corner and shrinks back on close (canvas AddSource).
  const addMenu = useNxPresence(addOpen);
  const addPop = useNxPopStyle(addMenu.p);
  const [notePicker, setNotePicker] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const submitLink = () => {
    const url = linkText.trim();
    if (!url || !uid) return;
    setLinkOpen(false);
    setLinkText("");
    void runSource("Reading the link", () => addLinkSource(uid, id, url));
  };
  const [sourceBusy, setSourceBusy] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  // Every source row carries the canvas arrow; tapping it offers what the phone can really do with a source.
  // The app's own pop-up rising from the foot (owner: the iOS action sheet has no UI). The source stays set
  // while the menu animates out, so the card does not empty mid-fade.
  const [sourceMenu, setSourceMenu] = useState<PageSource | null>(null);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const sourceOptions = (s: PageSource) => {
    setSourceMenu(s);
    setSourceMenuOpen(true);
  };
  const runSource = async (label: string, work: () => Promise<unknown>) => {
    setAddOpen(false);
    setNotePicker(false);
    setSourceError(null);
    setSourceBusy(label);
    try {
      await work();
      refreshSources();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : "That source could not be added.");
    } finally {
      setSourceBusy(null);
    }
  };

  // ── Create: make flashcards, and the student's own card editing ─────────────────────────────────────────
  const pageDecks = (decks.data ?? []).filter((d) => d.page_id === id);
  const readySources = own.filter((s) => s.status === "ready");
  const [pickOpen, setPickOpen] = useState(false);
  const [useNotes, setUseNotes] = useState(true);
  const [skipped, setSkipped] = useState<string[]>([]);
  const chosen = readySources.filter((s) => !skipped.includes(s.id));
  // Sub-pages are sources too (canvas CreateSources: "Seminar prep, Sub-page, 2 sources" with its own tick).
  const [skippedSubs, setSkippedSubs] = useState<string[]>([]);
  const subChosen = subTotals.filter((x) => !skippedSubs.includes(x.page.id));
  const picked = chosen.length + subChosen.length + (useNotes ? 1 : 0);
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState<string | null>(null);
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ deckId: string; draft: CardDraft } | null>(null);
  const openCards = useQuery({ queryKey: ["study-cards", openDeck], queryFn: () => deckCards(openDeck as string), enabled: !!openDeck });

  const make = async () => {
    if (!uid) return;
    setMaking(true);
    setMakeError(null);
    try {
      const { deckId } = await makeFlashcards(uid, id, { includeNotes: useNotes, sourceIds: chosen.map((s) => s.id), subPageIds: subChosen.map((x) => x.page.id) });
      await qc.invalidateQueries({ queryKey: ["study-decks"] });
      setOpenDeck(deckId);
      nxHaptic("success");
    } catch (e) {
      nxHaptic("error");
      setMakeError(e instanceof Error ? e.message : "The flashcards could not be made.");
    } finally {
      setMaking(false);
    }
  };
  const refreshCards = async (deckId: string) => {
    await qc.invalidateQueries({ queryKey: ["study-cards", deckId] });
    await qc.invalidateQueries({ queryKey: ["study-decks"] });
  };

  const sourceTotal = chosen.length + subChosen.reduce((n, x) => n + x.count, 0);
  const sourcesLabel = `${useNotes ? "Notes and " : ""}${sourceTotal} source${sourceTotal === 1 ? "" : "s"}`;

  // A brand-new page (canvas NewPage): only the title cursor, with Record / Lecture notes / Study guide / More
  // riding on the keyboard. Any of them, or leaving the title, turns it into the normal page.
  const [newDone, setNewDone] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const isNew = fresh === "1" && !newDone && !title && blocks.length === 0 && !page.isLoading;
  const startWith = async (template: PageTemplate) => {
    if (!spaceIdOfPage) return;
    setNewDone(true);
    try {
      await applyPageTemplate(spaceIdOfPage, id, pageContent, template);
      reloadPage();
      setEditing(true);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "That could not be added.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton icon="chev_l" size={22} label="Back" onPress={goBack} />
        <View style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Pressable
            disabled={!parent}
            onPress={() => parent && router.replace({ pathname: "/page/[id]", params: { id: parent.id } })}
            style={styles.crumb}
          >
            <NxIcon name={parent ? "notes" : "lock"} size={14} color={c.t3} strokeWidth={1.6} />
            <Text numberOfLines={1} style={{ fontSize: 14, color: c.t2, maxWidth: 190 }}>
              {parent ? parent.props.title || "Untitled" : "Private"}
            </Text>
          </Pressable>
        </View>
        <NxIconButton
          icon="share"
          label="Share"
          onPress={() => {
            const text = blocks.map((b) => b.text).filter(Boolean).join("\n");
            void Share.share({ message: `${title || "Untitled"}\n\n${text}`.trim() });
          }}
        />
        <NxIconButton icon="dots" label="More" onPress={more} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={page.isRefetching}
            onRefresh={() => {
              void page.refetch();
              refreshSources();
            }}
            tintColor={c.t3}
          />
        }
      >
        {page.isLoading ? (
          <SkelPage />
        ) : page.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>{(page.error as Error).message}</Text>
        ) : (
          <>
            <NxPageTitle
              title={title}
              cover={tab === "notes" && !isNew ? cover : undefined}
              autoFocus={fresh === "1" && !title}
              bare={isNew}
              onRename={
                canEdit
                  ? (next) => {
                      void setPageTitle(page.data!.space_id, id, next)
                        .then(() => {
                          void qc.invalidateQueries({ queryKey: ["ws-page", id] });
                          void qc.invalidateQueries({ queryKey: ["ws-all-pages"] });
                        })
                        .catch(() => undefined);
                    }
                  : undefined
              }
            />
            {isNew ? null : <NxWorkspaceTabs active={tab} sourceCount={totalSources} onChange={setTab} />}

            {tab === "notes" && !isNew ? (
              <>
                <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
                  {/* Canvas WritingNotes / Recording: Date first, then how long the recording ran ("51 min"). The value
                      used to be the block's own title, so the row read "Recording  Recording". */}
                  <Prop icon="calendar" label="Date" value={formatDate(page.data?.page.edited_at)} />
                  {recording ? <Prop icon="mic" label="Recording" value={recordingLength(recording)} /> : null}
                  {/* Owner 2026-09-15: a note with no sources does not say "Sources 0". */}
                  {totalSources > 0 ? <Prop icon="file" label="Sources" value={String(totalSources)} /> : null}
                </View>
                <View style={[styles.rule, { backgroundColor: c.ln }]} />
                <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 6 }}>
                  {editError ? <Text style={{ color: c.danger, fontSize: 14 }}>{editError}</Text> : null}
                  {/* A database opened as its own page ("Open as a full page") shows its views instead of blocks. */}
                  {isDatabasePage(page.data) && spaceIdOfPage ? (
                    <DatabaseBlock spaceId={spaceIdOfPage} pageId={id} block={{ id }} canEdit={canEdit} onChanged={reloadPage} />
                  ) : editing ? (
                    <>
                      <BlockEditor
                        blocks={blocks}
                        spaceId={spaceIdOfPage}
                        pageId={id}
                        onSaveText={(b, t) => void saveText(b, t)}
                        onSaved={onSaved}
                        onToggle={(b, v) => void toggle(b, v)}
                        onAddBlock={(type, after, props) => void addBlock(type, after, props)}
                        onTurnInto={(b, t) => void turnInto(b, t)}
                        onOpenPage={(pid) => router.push({ pathname: "/page/[id]", params: { id: pid } })}
                        onRecord={record}
                        pages={space.pages.filter((p) => p.id !== id).map((p) => ({ id: p.id, title: p.props.title || "Untitled" }))}
                        sources={own}
                        onFlashcards={() => {
                          setEditing(false);
                          setTab("create");
                        }}
                        onChanged={() => {
                          reloadPage();
                          refreshSources();
                        }}
                        onEngaged={onEditorEngaged}
                        focusRequest={focusRequest}
                        onAddDatabase={(after) => void addDatabase(after)}
                        databasePageIds={databaseIds}
                        canEdit={canEdit}
                      />
                      {/* Owner 2026-09-15: no "Add a line" row. Tapping the empty space below starts a new line,
                          the way a regular notes app does. */}
                      <Pressable
                        onPress={() => void startWriting(blocks.length ? blocks[blocks.length - 1]!.id : null)}
                        style={{ height: 220 }}
                        accessibilityLabel="Write another line"
                      />
                    </>
                  ) : (
                    <>
                      {/* A note whose only line is blank looks empty, so it keeps the invitation to write
                          (before this it drew nothing at all and there was no way back into typing). */}
                      {!blocks.some((b) => b.type !== "text" || (b.text ?? "").trim().length > 0) ? (
                        <Pressable disabled={!canEdit} onPress={() => void startWriting(blocks.length ? blocks[blocks.length - 1]!.id : null)}>
                          <Text style={[nxType.body, { color: c.t3 }]}>{canEdit ? "Tap here to start writing." : "This page is empty."}</Text>
                        </Pressable>
                      ) : null}
                      {numbered(blocks).map(({ block, n }) =>
                        block.type === "page" && block.pageId && databaseIds.has(block.pageId) && spaceIdOfPage ? (
                          <DatabaseBlock key={block.id} spaceId={spaceIdOfPage} pageId={id} block={block} canEdit={canEdit} onChanged={reloadPage} />
                        ) : (
                          <Pressable key={block.id} disabled={!canEdit} onPress={() => startEditing(block.id)}>
                            <BlockView block={block} n={n} linked={block.pageId ? titles.get(block.pageId) : undefined} onOpen={(pid) => router.push({ pathname: "/page/[id]", params: { id: pid } })} />
                          </Pressable>
                        ),
                      )}
                      {/* The space under the last line writes, like a regular notes app (owner 2026-09-15). */}
                      {canEdit ? (
                        <Pressable
                          onPress={() => {
                            const last = blocks[blocks.length - 1];
                            if (last && last.type === "text" && !(last.text ?? "").trim()) startEditing(last.id);
                            else void startWriting(last ? last.id : null);
                          }}
                          style={{ height: 220 }}
                          accessibilityLabel="Write another line"
                        />
                      ) : null}
                    </>
                  )}
                </View>
              </>
            ) : null}

            {tab === "sources" ? (
              totalSources === 0 && !sources.isLoading && !sourceBusy ? (
                <View style={styles.fresh}>
                  <View style={[styles.circle, { backgroundColor: c.sel }]}>
                    <NxIcon name="clip" size={36} color={c.t1} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.centerTitle, { color: c.t1 }]}>No sources yet</Text>
                  <Text style={[styles.centerText, { color: c.t2 }]}>
                    {parent
                      ? parent.props.title
                        ? `This page starts fresh. What you add here also counts for ${parent.props.title}, the page above it.`
                        : "This page starts fresh. What you add here also counts for the page above it."
                      : "Add files, photos, links or other notes, then use Create to make flashcards from them."}
                  </Text>
                  {sourceError ? <Text style={{ color: c.danger, fontSize: 14 }}>{sourceError}</Text> : null}
                  {canEdit ? (
                    <View style={{ alignSelf: "stretch", marginTop: 126, alignItems: "center", gap: 14 }}>
                      <View style={{ alignSelf: "stretch" }}>
                        <NxButton label="Add a source" icon="plus" onPress={() => setAddOpen(true)} />
                      </View>
                      {/* Canvas SubPage: a quiet way out to the note itself. */}
                      <Pressable onPress={() => setTab("notes")} hitSlop={8} accessibilityRole="button">
                        <Text style={{ fontSize: 15, color: c.t2 }}>Or start writing in Notes</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  <NxSection label="In this page" right={canEdit ? <NxAddPill onPress={() => setAddOpen(true)} /> : undefined} />
                  {sources.isLoading ? <SkelList rows={3} section={false} /> : null}
                  {sourceBusy ? (
                    <NxRow
                      lead={
                        <SkelGroup>
                          <SkelBar width={36} height={36} radius={10} />
                        </SkelGroup>
                      }
                      title={sourceBusy}
                      meta="Reading…"
                    />
                  ) : null}
                  {sourceError ? <Text style={[styles.note, { color: c.danger, paddingTop: 4 }]}>{sourceError}</Text> : null}
                  {own.map((s) => (
                    <NxRow
                      key={s.id}
                      lead={s.mime === "text/x-nemesis-note" ? <NxEmoji /> : <NxIconTile icon={sourceIcon(s)} />}
                      title={s.name}
                      meta={sourceMeta(s)}
                      trail={canEdit ? <NxChevron /> : undefined}
                      onPress={canEdit ? () => sourceOptions(s) : undefined}
                    />
                  ))}
                  {subTotals.map(({ page: ch, count }) => (
                    <NxRow
                      key={`sub-${ch.id}`}
                      lead={<NxEmoji />}
                      title={ch.props.title || "Untitled"}
                      meta={`Sub-page, ${count} source${count === 1 ? "" : "s"}`}
                      trail={<NxChevron />}
                      onPress={() => router.push({ pathname: "/page/[id]", params: { id: ch.id } })}
                    />
                  ))}
                  <Text style={[styles.foot, { color: c.t3 }]}>Sources in sub-pages count for this page too.</Text>
                </>
              )
            ) : null}

            {tab === "create" ? (
              <>
                <View style={styles.makeCard}>
                  <Image source={cobalt} style={styles.makeArt} resizeMode="cover" />
                  <View style={{ padding: 18, gap: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.makeIcon}>
                        <NxIcon name="cards" size={22} color="#ffffff" />
                      </View>
                      <View style={{ flex: 1, alignItems: "flex-start" }}>
                        <Text style={{ fontSize: 19, lineHeight: 24, fontWeight: "600", color: "#ffffff" }}>Make flashcards</Text>
                        <Pressable onPress={() => setPickOpen(true)} style={styles.sourcesPill} accessibilityLabel="Choose what to make flashcards from">
                          <Text style={{ fontSize: 14, fontWeight: "500", color: "#ffffff" }}>{sourcesLabel}</Text>
                          <NxIcon name="chev_d" size={14} color="#ffffff" strokeWidth={2} />
                        </Pressable>
                      </View>
                    </View>
                    <NxPressable onPress={() => void make()} disabled={making || picked === 0} scaleTo={0.97} style={({ pressed }) => [styles.makeBtn, { opacity: pressed || making ? 0.85 : 1 }]}>
                      {making ? <ActivityIndicator color="#1b2a6b" /> : <Text style={{ fontSize: 16, fontWeight: "600", color: "#1b2a6b" }}>Make flashcards</Text>}
                    </NxPressable>
                  </View>
                </View>
                {makeError ? <Text style={[styles.note, { color: c.danger }]}>{makeError}</Text> : null}

                {pageDecks.length ? <NxSection label="Made in this page" /> : null}
                {pageDecks.map((d) => {
                  const expanded = openDeck === d.id;
                  return (
                    <View key={d.id}>
                      <NxRow
                        lead={<NxIconTile icon="cards" tint="accent" />}
                        title={d.name.split("::").pop() || d.name}
                        meta={`${d.cards} card${d.cards === 1 ? "" : "s"}, ${d.updated_at ? madeWhen(d.updated_at) : "made today"}`}
                        trail={<NxPill label="Study" onPress={() => router.push({ pathname: "/set/[id]", params: { id: d.id } })} />}
                        onPress={() => setOpenDeck(expanded ? null : d.id)}
                      />
                      {expanded ? (
                        <View style={[styles.cards, { borderColor: c.ln }]}>
                          {openCards.isLoading ? (
                            <SkelGroup style={{ paddingVertical: 12 }}>
                              <SkelBody lines={[70, 90, 0, 60, 84]} />
                            </SkelGroup>
                          ) : null}
                          {(openCards.data ?? []).map((card) => (
                            <Pressable
                              key={card.id}
                              onPress={() => setEditor({ deckId: d.id, draft: { id: card.id, front: card.front, back: card.back } })}
                              style={({ pressed }) => [styles.cardRow, { borderBottomColor: c.ln }, pressed && { backgroundColor: c.soft }]}
                            >
                              <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: "500", color: c.t1 }}>{card.front}</Text>
                              <Text style={{ fontSize: 14, lineHeight: 20, color: c.t2 }}>{card.back}</Text>
                            </Pressable>
                          ))}
                          <Pressable onPress={() => setEditor({ deckId: d.id, draft: { front: "", back: "" } })} style={styles.addCard}>
                            <NxIcon name="plus" size={16} color={c.acc} strokeWidth={2.2} />
                            <Text style={{ color: c.acc, fontSize: 15, fontWeight: "500" }}>Add card</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {scrolledPast ? (
        <View style={[StyleSheet.absoluteFill, { bottom: undefined, height: insets.top + 50 }]} pointerEvents="box-none">
          <BlurView intensity={60} tint="systemChromeMaterial" style={[styles.scrollBar, { paddingTop: insets.top + 2, borderBottomColor: c.ln }]}>
            <NxIconButton icon="chev_l" size={22} label="Back" onPress={goBack} />
            <Text numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 16, lineHeight: 22, fontWeight: "600", color: c.t1 }}>
              {title || "Untitled"}
            </Text>
            {/* Canvas NoteScrolled keeps share and ... on the slim bar. */}
            <NxIconButton
              icon="share"
              label="Share"
              onPress={() => {
                const text = blocks.map((b) => b.text).filter(Boolean).join("\n");
                void Share.share({ message: `${title || "Untitled"}\n\n${text}`.trim() });
              }}
            />
            <NxIconButton icon="dots" label="More" onPress={more} />
          </BlurView>
        </View>
      ) : null}

      {/* While the typing toolbar is up the Ask bar steps aside (canvas NoteTyping shows only the toolbar). */}
      {isNew || (editing && toolbarUp) ? null : <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { top: undefined, height: insets.bottom + 90, opacity: barShown, transform: [{ translateY: barShown.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }] }]}
      >
      {/* Owner 2026-09-15: the note's bottom is just the Ask AI bar (the ≡ Recents and pencil buttons are gone). */}
      <NxBottomBar ask="Ask AI" onAsk={() => setAskOpen(true)} />
      </Animated.View>}

      {/* 🔴 NOT an InputAccessoryView: that only draws while a software keyboard is up, so with a hardware keyboard
          (or the keyboard tucked away) the chips vanished and a new page read as blank. The bar follows the keyboard. */}
      {isNew ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { top: undefined, bottom: kbHeight ? kbHeight : Math.max(insets.bottom, 12) }]}>
          <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
            <View style={[styles.chipBar, { backgroundColor: c.card, borderColor: c.ring }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ alignItems: "center", gap: 6, paddingLeft: 8 }}>
                <Chip icon="mic" label="Record" onPress={() => { setNewDone(true); record(); }} />
                <Chip icon="notes" label="Lecture notes" onPress={() => void startWith("lecture")} />
                <Chip icon="book" label="Study guide" onPress={() => void startWith("study")} />
                <Chip icon="dots" label="More" onPress={() => { setNewDone(true); setEditing(true); }} />
              </ScrollView>
              <View style={{ width: 1, height: 24, backgroundColor: c.ln }} />
              <Pressable onPress={() => Keyboard.dismiss()} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Hide the keyboard">
                <NxIcon name="kbd_down" size={21} color={c.t2} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Add a source (canvas AddSource): only the ways that work from the phone today. */}
      <Modal visible={addMenu.mounted} transparent animationType="none" onRequestClose={() => setAddOpen(false)}>
        <View style={StyleSheet.absoluteFill} pointerEvents={addOpen ? "box-none" : "none"}>
          <NxDim p={addMenu.p} onPress={() => setAddOpen(false)} />
          <Reanimated.View style={[styles.popup, { top: insets.top + 290, backgroundColor: c.card, borderColor: c.ring, transformOrigin: "top right" }, addPop]}>
            <MenuOption icon="file" label="Files" onPress={() => uid && void runSource("Adding a file", () => addFileSource(uid, id))} />
            <MenuOption icon="image" label="Photo or scan" onPress={() => { setAddOpen(false); setTimeout(() => setCameraOpen(true), 320); }} />
            <MenuOption icon="mic" label="Record" onPress={() => { setAddOpen(false); record(); }} />
            <MenuOption icon="link" label="Link" onPress={() => { setAddOpen(false); setTimeout(() => setLinkOpen(true), 320); }} />
            {/* iOS will not present a second modal while this one is still leaving, so the sheet waits for it. */}
            <MenuOption icon="notes" label="Another note" onPress={() => { setAddOpen(false); setTimeout(() => setNotePicker(true), 320); }} />
          </Reanimated.View>
        </View>
      </Modal>

      {/* Photo or scan: the camera; the picture's text becomes a source (the same photo reader the chat uses). */}
      <PhotoCaptureSheet
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={(uri) => {
          setCameraOpen(false);
          if (uid) void runSource("Reading the photo", () => addPhotoSource(uid, id, uri));
        }}
      />

      {/* Link: a web page, read to text on the server. */}
      <NxSheet visible={linkOpen} avoidKeyboard onClose={() => setLinkOpen(false)} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.grab, { backgroundColor: c.ring }]} />
        <Text style={[styles.sheetTitle, { color: c.t1 }]}>Add a link</Text>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <TextInput
            value={linkText}
            onChangeText={setLinkText}
            placeholder="Paste a web link"
            placeholderTextColor={c.t3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitLink}
            style={{ fontSize: 16, color: c.t1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.ring, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}
          />
          <NxPressable onPress={submitLink} disabled={!linkText.trim()} scaleTo={0.98} style={{ borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: linkText.trim() ? c.t1 : c.sel }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: linkText.trim() ? c.bg : c.t3 }}>Add link</Text>
          </NxPressable>
        </View>
      </NxSheet>

      {/* Another note: pick one of your pages. */}
      <NxSheet visible={notePicker} onClose={() => setNotePicker(false)} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 12, maxHeight: "70%" }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <Text style={[styles.sheetTitle, { color: c.t1 }]}>Add a note</Text>
          <ScrollView>
            {space.pages
              .filter((p) => p.id !== id)
              .map((p: PageSummary) => (
                <NxRow key={p.id} lead={<NxEmoji />} title={p.props.title || "Untitled"} meta={ago(p.edited_at)} onPress={() => void runSource(p.props.title || "Adding a note", () => addNoteSource(id, p.id))} />
              ))}
            {space.pages.length <= 1 ? <Text style={[styles.note, { color: c.t2 }]}>You have no other notes yet.</Text> : null}
          </ScrollView>
      </NxSheet>

      {/* Create, choose sources (canvas CreateSources). */}
      <NxSheet visible={pickOpen} onClose={() => setPickOpen(false)} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <View style={styles.sheetHead}>
            {/* The header row carries the padding; the title's own top padding pushed it below Select all. */}
            <Text style={[styles.sheetTitle, { color: c.t1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }]}>Make flashcards from</Text>
            <Pressable
              onPress={() => {
                setUseNotes(true);
                setSkipped([]);
                setSkippedSubs([]);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: c.acc }}>Select all</Text>
            </Pressable>
          </View>
          <NxRow lead={<NxEmoji />} title="Notes on this page" meta={title || "Untitled"} trail={<Tick on={useNotes} />} onPress={() => setUseNotes((v) => !v)} />
          {readySources.map((s) => {
            const on = !skipped.includes(s.id);
            return (
              <NxRow
                key={s.id}
                lead={s.mime === "text/x-nemesis-note" ? <NxEmoji /> : <NxIconTile icon={sourceIcon(s)} />}
                title={s.name}
                meta={sourceMeta(s)}
                trail={<Tick on={on} />}
                onPress={() => setSkipped((list) => (on ? [...list, s.id] : list.filter((x) => x !== s.id)))}
              />
            );
          })}
          {subTotals.map(({ page: ch, count }) => {
            const on = !skippedSubs.includes(ch.id);
            return (
              <NxRow
                key={`pick-${ch.id}`}
                lead={<NxEmoji />}
                title={ch.props.title || "Untitled"}
                meta={`Sub-page, ${count} source${count === 1 ? "" : "s"}`}
                trail={<Tick on={on} />}
                onPress={() => setSkippedSubs((list) => (on ? [...list, ch.id] : list.filter((x) => x !== ch.id)))}
              />
            );
          })}
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <NxButton
              label={`Use ${picked} source${picked === 1 ? "" : "s"}`}
              disabled={picked === 0}
              onPress={() => setPickOpen(false)}
            />
          </View>
      </NxSheet>

      <PageMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems()} />
      <PageMenu
        anchor="bottom"
        visible={sourceMenuOpen}
        onClose={() => setSourceMenuOpen(false)}
        title={sourceMenu ? `${sourceMenu.name} · ${sourceMeta(sourceMenu)}` : undefined}
        items={
          sourceMenu
            ? [{ icon: "trash", label: "Remove from this page", danger: true, onPress: () => void runSource("Removing", () => removeSource(sourceMenu.id)) }]
            : []
        }
      />

      <NoteAskBar
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        page={page.data ? { emoji: "", title: title || "Untitled" } : null}
        onSend={(q, withPage) => {
          setAskOpen(false);
          router.push({ pathname: "/c/[id]", params: withPage ? { id: "new", page: id, q } : { id: "new", q } });
        }}
      />

      <CardEditor
        visible={!!editor}
        initial={editor?.draft ?? null}
        onClose={() => setEditor(null)}
        onSave={async (draft) => {
          if (!editor) return;
          if (draft.id) await updateCard(draft.id, draft.front, draft.back);
          else await addCard(editor.deckId, draft.front, draft.back);
          await refreshCards(editor.deckId);
        }}
        onDelete={async (cardId) => {
          if (!editor) return;
          await deleteCard(cardId);
          await refreshCards(editor.deckId);
        }}
      />
    </View>
  );
}

function Prop({ icon, label, value }: { icon: NxIconName; label: string; value: string }) {
  const c = useNx();
  return (
    <View style={styles.prop}>
      <View style={styles.propLabel}>
        <NxIcon name={icon} size={16} color={c.t2} />
        <Text style={{ fontSize: 15, color: c.t2 }}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: c.t1 }}>
        {value}
      </Text>
    </View>
  );
}

function MenuOption({ icon, label, onPress }: { icon: NxIconName; label: string; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.opt, pressed && { backgroundColor: c.soft }]}>
      <View style={[styles.optTile, { backgroundColor: c.sel }]}>
        <NxIcon name={icon} size={19} color={c.t1} strokeWidth={1.8} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "500", color: c.t1 }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ icon, label, onPress }: { icon: NxIconName; label: string; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, { backgroundColor: c.sunk, opacity: pressed ? 0.7 : 1 }]}>
      <NxIcon name={icon} size={16} color={c.t2} />
      <Text style={{ fontSize: 15, color: c.t2 }}>{label}</Text>
    </Pressable>
  );
}

function Tick({ on }: { on: boolean }) {
  const c = useNx();
  return on ? (
    <View style={[styles.tick, { backgroundColor: c.acc }]}>
      <NxIcon name="check" size={15} color="#ffffff" strokeWidth={2.6} />
    </View>
  ) : (
    <View style={[styles.tick, { borderWidth: 1.5, borderColor: c.ring }]} />
  );
}

function numbered(blocks: Block[]): { block: Block; n: number }[] {
  let run = 0;
  let prevDepth = -1;
  return blocks.map((block) => {
    if (block.type === "numbered_list") {
      run = prevDepth === block.depth ? run + 1 : 1;
      prevDepth = block.depth;
    } else {
      run = 0;
      prevDepth = -1;
    }
    return { block, n: run };
  });
}

function BlockView({ block, n, linked, onOpen }: { block: Block; n: number; linked?: PageSummary; onOpen: (id: string) => void }) {
  const c = useNx();
  const pad = { marginLeft: block.depth * 20 };
  const body = [nxType.body, { color: c.t1 }];
  switch (block.type) {
    case "header":
      return <Text style={[{ fontSize: 24, lineHeight: 32, fontWeight: "700", color: c.t1, marginTop: 14 }, pad]}>{block.text}</Text>;
    case "sub_header":
      return <Text style={[nxType.h2, { color: c.t1, marginTop: 10 }, pad]}>{block.text}</Text>;
    case "sub_sub_header":
      return <Text style={[{ fontSize: 17, lineHeight: 24, fontWeight: "600", color: c.t1, marginTop: 8 }, pad]}>{block.text}</Text>;
    case "bulleted_list":
      return (
        <View style={[styles.line, pad]}>
          <Text style={[body, { color: c.t3 }]}>•</Text>
          <Text style={[body, { flex: 1 }]}>{block.text}</Text>
        </View>
      );
    case "numbered_list":
      return (
        <View style={[styles.line, pad]}>
          <Text style={[body, { color: c.t3, fontVariant: ["tabular-nums"] }]}>{n}.</Text>
          <Text style={[body, { flex: 1 }]}>{block.text}</Text>
        </View>
      );
    case "to_do":
      return (
        <View style={[styles.line, pad]}>
          <View style={[styles.box, block.checked ? { backgroundColor: c.acc, borderColor: c.acc } : { borderColor: c.t3 }]}>
            {block.checked ? <NxIcon name="check" size={13} color="#fff" strokeWidth={2.6} /> : null}
          </View>
          <Text style={[body, { flex: 1 }, block.checked && { color: c.t3, textDecorationLine: "line-through" }]}>{block.text}</Text>
        </View>
      );
    case "quote":
      return <Text style={[body, { borderLeftWidth: 3, borderLeftColor: c.t1, paddingLeft: 14 }, pad]}>{block.text}</Text>;
    case "callout":
      return <Text style={[body, { backgroundColor: c.sunk, borderRadius: 10, padding: 12, overflow: "hidden" }, pad]}>{block.text}</Text>;
    case "toggle":
      return (
        <View style={[styles.line, { alignItems: "center", gap: 8 }, pad]}>
          <NxIcon name="chev_r" size={14} color={c.t2} strokeWidth={2} />
          <Text style={[body, { flex: 1, fontWeight: "500" }]}>{block.text}</Text>
        </View>
      );
    case "page":
      return (
        <Pressable onPress={() => block.pageId && onOpen(block.pageId)} style={[styles.line, { alignItems: "center" }, pad]}>
          <NxIcon name="notes" size={18} color={c.t2} strokeWidth={1.6} />
          <Text style={[body, { textDecorationLine: "underline", textDecorationColor: c.ring }]}>{linked?.props.title || block.text || "Untitled"}</Text>
        </Pressable>
      );
    case "transcription":
      return (
        <View style={[styles.embed, { backgroundColor: c.card, borderColor: c.ln }, pad]}>
          <View style={[styles.embedTile, { backgroundColor: c.sel }]}>
            <NxIcon name="mic" size={18} color={c.t2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: "500", color: c.t1 }}>
              {block.text || "Recording"}
            </Text>
            {block.transcript ? (
              <Text numberOfLines={1} style={[nxType.rowMeta, { color: c.t2 }]}>
                {block.transcript}
              </Text>
            ) : null}
          </View>
        </View>
      );
    case "image": {
      // Pictures show inline like Notion; the file card is only the fallback when the picture cannot load.
      const p = (block.props ?? {}) as { src?: unknown; name?: unknown };
      const src = typeof p.src === "string" ? p.src : undefined;
      if (src) return <InlineImage src={src} name={typeof p.name === "string" ? p.name : "Image"} pad={pad} />;
      return (
        <View style={pad}>
          <FileEmbed name={typeof p.name === "string" ? p.name : "Image"} mime="image/*" />
        </View>
      );
    }
    case "file":
    case "video":
    case "audio": {
      // A file embedded in the note (canvas NoteReady: "Week 7 slides.pdf"). Tapping opens a signed link to it.
      const p = (block.props ?? {}) as { src?: unknown; name?: unknown; mime?: unknown; bytes?: unknown };
      const src = typeof p.src === "string" ? p.src : undefined;
      const name = typeof p.name === "string" && p.name ? p.name : block.text || "File";
      return (
        <View style={pad}>
          <FileEmbed
            name={name}
            mime={typeof p.mime === "string" ? p.mime : null}
            bytes={typeof p.bytes === "number" ? p.bytes : null}
            onPress={src ? () => void openEmbed(src).catch(() => undefined) : undefined}
          />
        </View>
      );
    }
    case "bookmark": {
      const p = (block.props ?? {}) as { src?: unknown; url?: unknown; name?: unknown; title?: unknown };
      const url = typeof p.url === "string" ? p.url : typeof p.src === "string" ? p.src : "";
      if (!url) return null;
      const label = typeof p.title === "string" ? p.title : typeof p.name === "string" ? p.name : block.text || null;
      return (
        <View style={pad}>
          <BookmarkEmbed url={url} title={label} onPress={() => void openEmbed(url).catch(() => undefined)} />
        </View>
      );
    }
    case "table":
      return (
        <View style={[styles.embed, { backgroundColor: c.card, borderColor: c.ln }, pad]}>
          <View style={[styles.embedTile, { backgroundColor: c.sel }]}>
            <NxIcon name="hash" size={18} color={c.t2} />
          </View>
          <Text style={{ fontSize: 15, color: c.t2 }}>Table (open on the web to see it)</Text>
        </View>
      );
    default:
      return block.text ? <Text style={[body, pad]}>{block.text}</Text> : <View style={{ height: 8 }} />;
  }
}

function sourceIcon(s: PageSource): NxIconName {
  const m = s.mime ?? "";
  if (m.startsWith("audio/")) return "mic";
  if (m.startsWith("image/")) return "image";
  if (m.includes("html") || m.includes("url")) return "globe";
  return "file";
}

function sourceMeta(s: PageSource): string {
  if (s.status === "reading") return "Reading…";
  if (s.status === "failed") return s.error || "Could not be read";
  if (s.mime === "text/x-nemesis-note") return "Note";
  const host = s.mime?.match(/host=([^;\s]+)/)?.[1];
  if (host) return host;
  if (s.bytes) return s.bytes > 1_000_000 ? `${(s.bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(s.bytes / 1000))} KB`;
  if (s.chars) return `${Math.max(1, Math.round(s.chars / 1800))} page${s.chars > 1800 * 1.5 ? "s" : ""} of text`;
  return "Ready";
}

/** "51 min" once the recording's length is known; while it is still being written, say so. */
function recordingLength(block: Block): string {
  const p = (block.props ?? {}) as { durationSeconds?: unknown; status?: unknown };
  const secs = typeof p.durationSeconds === "number" ? p.durationSeconds : 0;
  if (secs > 0) return `${Math.max(1, Math.round(secs / 60))} min`;
  if (p.status === "uploading" || p.status === "processing") return "Writing notes";
  return "Recorded";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function madeWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "made today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 2 },
  crumb: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10 },
  note: { paddingHorizontal: 20, paddingTop: 16, fontSize: 15, lineHeight: 22 },
  prop: { flexDirection: "row", alignItems: "center", minHeight: 36, gap: 8 },
  propLabel: { width: 128, flexDirection: "row", alignItems: "center", gap: 8 },
  rule: { height: 1, marginHorizontal: 20, marginTop: 10 },
  line: { flexDirection: "row", gap: 10 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, marginTop: 4, alignItems: "center", justifyContent: "center" },
  embed: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginTop: 6 },
  embedTile: { width: 40, height: 40, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  // Measured from canvas SubPage: the circle sits ~160pt below the tabs, the button ~145pt below the text.
  fresh: { alignItems: "center", paddingTop: 140, paddingHorizontal: 32, gap: 14 },
  circle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  centerTitle: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, textAlign: "center" },
  centerText: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  foot: { paddingHorizontal: 20, paddingTop: 10, fontSize: 13, lineHeight: 18 },
  makeCard: { marginTop: 14, marginHorizontal: 16, borderRadius: 20, overflow: "hidden", backgroundColor: "#1d3fbf" },
  makeArt: { position: "absolute", left: "-30%", top: "-40%", width: "160%", height: "180%" },
  makeIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  sourcesPill: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingLeft: 10, paddingRight: 8, borderRadius: 9999, backgroundColor: "rgba(255,255,255,0.2)" },
  makeBtn: { height: 48, borderRadius: 12, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  cards: { marginLeft: 64, marginRight: 16, borderLeftWidth: 1, paddingLeft: 12, marginBottom: 8 },
  cardRow: { paddingVertical: 10, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  addCard: { flexDirection: "row", alignItems: "center", gap: 6, height: 44 },
  popup: { position: "absolute", right: 16, width: 236, borderRadius: 18, padding: 6, borderWidth: StyleSheet.hairlineWidth, shadowColor: "#2a1c00", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: 12 },
  optTile: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  menuPop: { position: "absolute", width: 300, borderRadius: 18, padding: 6, borderWidth: StyleSheet.hairlineWidth, shadowColor: "#2a1c00", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, paddingHorizontal: 12, borderRadius: 12 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: "center" },
  sheetHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  sheetTitle: { fontSize: 19, lineHeight: 24, fontWeight: "600", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  tick: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  chipBar: { height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", overflow: "hidden", shadowColor: "#2a1c00", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  chip: { height: 32, paddingLeft: 10, paddingRight: 12, borderRadius: 9999, flexDirection: "row", alignItems: "center", gap: 6 },
  scrollBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", shadowColor: "#2a1c00", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
});
