import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeFlashcards } from "@/api/makeCards";
import { addFileSource, addNoteSource } from "@/api/pageSources";
import { loadPage, pageBlocks, pageSources, type Block, type PageSource, type PageSummary } from "@/api/space";
import { setPageTitle } from "@/api/spaceWrite";
import { addCard, deckCards, deleteCard, updateCard } from "@/api/study";
import { useAuth } from "@/auth/AuthProvider";
import { CardEditor, type CardDraft } from "@/components/nx/CardEditor";
import { NxIcon, type NxIconName } from "@/components/nx/NxIcon";
import { NxBottomBar, NxButton, NxChevron, NxEmoji, NxIconButton, NxIconTile, NxPill, NxRow, NxSection } from "@/components/nx/primitives";
import { NxAddPill, NxPageTitle, NxWorkspaceTabs, type WsTab } from "@/components/nx/workspace";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { ago } from "@/lib/ago";
import { iconOf } from "@/lib/fresh";
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

  const page = useQuery({ queryKey: ["ws-page", id], queryFn: () => loadPage(id), enabled: !!id });
  const sources = useQuery({ queryKey: ["ws-sources", id], queryFn: () => pageSources(id), enabled: !!id });
  const children = page.data?.children.filter((p) => p.alive) ?? [];
  const childSources = useQueries({
    queries: children.slice(0, 20).map((ch) => ({ queryKey: ["ws-sources", ch.id], queryFn: () => pageSources(ch.id) })),
  });
  const decks = useDecks();
  const space = useSpacePages();

  const blocks = useMemo(() => (page.data ? pageBlocks(page.data) : []), [page.data]);
  const titles = useMemo(() => new Map(children.map((ch) => [ch.id, ch])), [children]);
  const parent = page.data?.ancestors[page.data.ancestors.length - 1];
  const title = String(page.data?.page.props.title ?? "");
  const icon = iconOf(page.data?.page.props.icon);
  const cover = typeof page.data?.page.props.cover === "string" && /^#|^rgb/.test(page.data.page.props.cover as string) ? (page.data.page.props.cover as string) : undefined;
  const canEdit = page.data?.role === "full" || page.data?.role === "edit";

  const own = sources.data ?? [];
  const subTotals = children.slice(0, 20).map((ch, i) => ({ page: ch, count: childSources[i]?.data?.length ?? 0 })).filter((x) => x.count > 0);
  const totalSources = own.length + subTotals.reduce((n, x) => n + x.count, 0);
  const recording = blocks.find((b) => b.type === "transcription");

  const refreshSources = () => {
    void qc.invalidateQueries({ queryKey: ["ws-sources", id] });
  };

  // ── Sources: the Add pop-up ─────────────────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [notePicker, setNotePicker] = useState(false);
  const [sourceBusy, setSourceBusy] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
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
      const { deckId } = await makeFlashcards(uid, id, { includeNotes: useNotes, sourceIds: chosen.map((s) => s.id) });
      await qc.invalidateQueries({ queryKey: ["study-decks"] });
      setOpenDeck(deckId);
    } catch (e) {
      setMakeError(e instanceof Error ? e.message : "The flashcards could not be made.");
    } finally {
      setMaking(false);
    }
  };
  const refreshCards = async (deckId: string) => {
    await qc.invalidateQueries({ queryKey: ["study-cards", deckId] });
    await qc.invalidateQueries({ queryKey: ["study-decks"] });
  };

  const sourcesLabel = `${useNotes ? "Notes and " : ""}${chosen.length} source${chosen.length === 1 ? "" : "s"}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton icon="chev_l" size={22} label="Back" onPress={() => router.back()} />
        <View style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Pressable
            disabled={!parent}
            onPress={() => parent && router.replace({ pathname: "/page/[id]", params: { id: parent.id } })}
            style={styles.crumb}
          >
            <Text style={{ fontSize: 14 }}>{parent ? iconOf(parent.props.icon) : "🔒"}</Text>
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
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
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
          <ActivityIndicator style={{ marginTop: 48 }} color={c.t3} />
        ) : page.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>{(page.error as Error).message}</Text>
        ) : (
          <>
            <NxPageTitle
              emoji={icon}
              title={title}
              cover={tab === "notes" ? cover : undefined}
              autoFocus={fresh === "1" && !title}
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
            <NxWorkspaceTabs active={tab} sourceCount={totalSources} onChange={setTab} />

            {tab === "notes" ? (
              <>
                <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
                  {recording ? <Prop icon="mic" label="Recording" value={recording.text || "Recorded"} /> : null}
                  <Prop icon="calendar" label="Date" value={formatDate(page.data?.page.edited_at)} />
                  <Prop icon="file" label="Sources" value={String(totalSources)} />
                </View>
                <View style={[styles.rule, { backgroundColor: c.ln }]} />
                <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 6 }}>
                  {blocks.length === 0 ? <Text style={[nxType.body, { color: c.t3 }]}>This page is empty.</Text> : null}
                  {numbered(blocks).map(({ block, n }) => (
                    <BlockView key={block.id} block={block} n={n} linked={block.pageId ? titles.get(block.pageId) : undefined} onOpen={(pid) => router.push({ pathname: "/page/[id]", params: { id: pid } })} />
                  ))}
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
                    {parent ? `This page starts fresh. What you add here also counts for ${parent.props.title || "the page above it"}.` : "Add files or other notes, then use Create to make flashcards from them."}
                  </Text>
                  {sourceError ? <Text style={{ color: c.danger, fontSize: 14 }}>{sourceError}</Text> : null}
                  {canEdit ? (
                    <View style={{ alignSelf: "stretch", marginTop: 8 }}>
                      <NxButton label="Add a source" icon="plus" onPress={() => setAddOpen(true)} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  <NxSection label="In this page" right={canEdit ? <NxAddPill onPress={() => setAddOpen(true)} /> : undefined} />
                  {sourceBusy ? <NxRow lead={<ActivityIndicator color={c.t3} style={{ width: 36 }} />} title={sourceBusy} meta="Reading…" /> : null}
                  {sourceError ? <Text style={[styles.note, { color: c.danger, paddingTop: 4 }]}>{sourceError}</Text> : null}
                  {own.map((s) => (
                    <NxRow key={s.id} lead={s.mime === "text/x-nemesis-note" ? <NxEmoji emoji="📝" /> : <NxIconTile icon={sourceIcon(s)} />} title={s.name} meta={sourceMeta(s)} />
                  ))}
                  {subTotals.map(({ page: ch, count }) => (
                    <NxRow
                      key={`sub-${ch.id}`}
                      lead={<NxEmoji emoji={iconOf(ch.props.icon)} />}
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
                    <Pressable onPress={() => void make()} disabled={making || (!useNotes && chosen.length === 0)} style={({ pressed }) => [styles.makeBtn, { opacity: pressed || making ? 0.85 : 1 }]}>
                      {making ? <ActivityIndicator color="#1b2a6b" /> : <Text style={{ fontSize: 16, fontWeight: "600", color: "#1b2a6b" }}>Make flashcards</Text>}
                    </Pressable>
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
                          {openCards.isLoading ? <ActivityIndicator style={{ margin: 12 }} color={c.t3} /> : null}
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

      <NxBottomBar ask={tab === "notes" ? "Ask about this note" : "Ask about this page"} onAsk={() => router.push("/chat")} />

      {/* Add a source (canvas AddSource): only the ways that work from the phone today. */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={() => setAddOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.popup, { top: insets.top + 290, backgroundColor: c.card, borderColor: c.ring }]}>
          <MenuOption icon="file" label="Files" onPress={() => uid && void runSource("Adding a file", () => addFileSource(uid, id))} />
          <MenuOption icon="notes" label="Another note" onPress={() => { setAddOpen(false); setNotePicker(true); }} />
        </View>
      </Modal>

      {/* Another note: pick one of your pages. */}
      <Modal visible={notePicker} transparent animationType="slide" onRequestClose={() => setNotePicker(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={() => setNotePicker(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 12, maxHeight: "70%" }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <Text style={[styles.sheetTitle, { color: c.t1 }]}>Add a note</Text>
          <ScrollView>
            {space.pages
              .filter((p) => p.id !== id)
              .map((p: PageSummary) => (
                <NxRow key={p.id} lead={<NxEmoji emoji={iconOf(p.props.icon)} />} title={p.props.title || "Untitled"} meta={ago(p.edited_at)} onPress={() => void runSource(p.props.title || "Adding a note", () => addNoteSource(id, p.id))} />
              ))}
            {space.pages.length <= 1 ? <Text style={[styles.note, { color: c.t2 }]}>You have no other notes yet.</Text> : null}
          </ScrollView>
        </View>
      </Modal>

      {/* Create, choose sources (canvas CreateSources). */}
      <Modal visible={pickOpen} transparent animationType="slide" onRequestClose={() => setPickOpen(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={() => setPickOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: c.t1, paddingHorizontal: 0 }]}>Make flashcards from</Text>
            <Pressable
              onPress={() => {
                setUseNotes(true);
                setSkipped([]);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: c.acc }}>Select all</Text>
            </Pressable>
          </View>
          <NxRow lead={<NxEmoji emoji={icon} />} title="Notes on this page" meta={title || "Untitled"} trail={<Tick on={useNotes} />} onPress={() => setUseNotes((v) => !v)} />
          {readySources.map((s) => {
            const on = !skipped.includes(s.id);
            return (
              <NxRow
                key={s.id}
                lead={s.mime === "text/x-nemesis-note" ? <NxEmoji emoji="📝" /> : <NxIconTile icon={sourceIcon(s)} />}
                title={s.name}
                meta={sourceMeta(s)}
                trail={<Tick on={on} />}
                onPress={() => setSkipped((list) => (on ? [...list, s.id] : list.filter((x) => x !== s.id)))}
              />
            );
          })}
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <NxButton
              label={`Use ${chosen.length + (useNotes ? 1 : 0)} source${chosen.length + (useNotes ? 1 : 0) === 1 ? "" : "s"}`}
              disabled={!useNotes && chosen.length === 0}
              onPress={() => setPickOpen(false)}
            />
          </View>
        </View>
      </Modal>

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
          <Text style={{ fontSize: 18 }}>{iconOf(linked?.props.icon)}</Text>
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
  if (s.bytes) return s.bytes > 1_000_000 ? `${(s.bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(s.bytes / 1000))} KB`;
  if (s.chars) return `${Math.max(1, Math.round(s.chars / 1800))} page${s.chars > 1800 * 1.5 ? "s" : ""} of text`;
  return "Ready";
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
  fresh: { alignItems: "center", paddingTop: 48, paddingHorizontal: 32, gap: 14 },
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
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: "center" },
  sheetHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  sheetTitle: { fontSize: 19, lineHeight: 24, fontWeight: "600", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  tick: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});
