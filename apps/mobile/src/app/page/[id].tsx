import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadPage, pageBlocks, pageSources, type Block, type PageSource } from "@/api/space";
import { NxIcon, type NxIconName } from "@/components/nx/NxIcon";
import { NxBottomBar, NxChevron, NxEmoji, NxIconButton, NxIconTile, NxPill, NxRow, NxSection } from "@/components/nx/primitives";
import { NxPageTitle, NxWorkspaceTabs, type WsTab } from "@/components/nx/workspace";
import { useDecks } from "@/hooks/useSpace";
import { nxType, useNx } from "@/theme/nx";

// A page is a workspace (canvas: NotePage, NoteSources, NoteCreate, SubPage): Notes / Sources / Create.
// Sources flow UP: a page counts its sub-pages' sources too; a sub-page only sees its own.
export default function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<WsTab>("notes");

  const page = useQuery({ queryKey: ["ws-page", id], queryFn: () => loadPage(id), enabled: !!id });
  const sources = useQuery({ queryKey: ["ws-sources", id], queryFn: () => pageSources(id), enabled: !!id });
  const children = page.data?.children.filter((p) => p.alive) ?? [];
  const childSources = useQueries({
    queries: children.slice(0, 20).map((ch) => ({ queryKey: ["ws-sources", ch.id], queryFn: () => pageSources(ch.id) })),
  });
  const decks = useDecks();

  const blocks = useMemo(() => (page.data ? pageBlocks(page.data) : []), [page.data]);
  const titles = useMemo(() => new Map(children.map((ch) => [ch.id, ch])), [children]);
  const parent = page.data?.ancestors[page.data.ancestors.length - 1];
  const title = String(page.data?.page.props.title ?? "");
  const icon = (page.data?.page.props.icon as string | undefined) ?? null;

  const subTotals = children.slice(0, 20).map((ch, i) => ({ page: ch, count: childSources[i]?.data?.length ?? 0 })).filter((x) => x.count > 0);
  const ownCount = sources.data?.length ?? 0;
  const totalSources = ownCount + subTotals.reduce((n, x) => n + x.count, 0);
  const pageDecks = (decks.data ?? []).filter((d) => d.page_id === id);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton icon="chev_l" size={22} label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center" }}>
          {parent ? (
            <Pressable onPress={() => router.replace({ pathname: "/page/[id]", params: { id: parent.id } })} style={styles.crumb}>
              <Text style={{ fontSize: 14 }}>{parent.props.icon || "📄"}</Text>
              <Text numberOfLines={1} style={{ fontSize: 14, color: c.t2, maxWidth: 200 }}>
                {parent.props.title || "Untitled"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={page.isRefetching} onRefresh={() => { void page.refetch(); void sources.refetch(); }} tintColor={c.t3} />}
      >
        {page.isLoading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={c.t3} />
        ) : page.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>{(page.error as Error).message}</Text>
        ) : (
          <>
            <NxPageTitle emoji={icon} title={title} />
            <NxWorkspaceTabs active={tab} sourceCount={totalSources} onChange={setTab} />

            {tab === "notes" ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 6 }}>
                {blocks.length === 0 ? <Text style={[nxType.body, { color: c.t3 }]}>This page is empty.</Text> : null}
                {numbered(blocks).map(({ block, n }) => (
                  <BlockView key={block.id} block={block} n={n} linked={block.pageId ? titles.get(block.pageId) : undefined} onOpen={(pid) => router.push({ pathname: "/page/[id]", params: { id: pid } })} />
                ))}
              </View>
            ) : null}

            {tab === "sources" ? (
              <>
                <NxSection label="In this page" />
                {sources.isLoading ? <ActivityIndicator color={c.t3} /> : null}
                {(sources.data ?? []).map((s) => (
                  <NxRow key={s.id} lead={<NxIconTile icon={sourceIcon(s)} />} title={s.name} meta={sourceMeta(s)} />
                ))}
                {subTotals.map(({ page: ch, count }) => (
                  <NxRow
                    key={`sub-${ch.id}`}
                    lead={<NxEmoji emoji={ch.props.icon} />}
                    title={ch.props.title || "Untitled"}
                    meta={`Sub-page, ${count} source${count === 1 ? "" : "s"}`}
                    trail={<NxChevron />}
                    onPress={() => router.push({ pathname: "/page/[id]", params: { id: ch.id } })}
                  />
                ))}
                {!sources.isLoading && totalSources === 0 ? (
                  <View style={styles.empty}>
                    <View style={[styles.emptyIcon, { backgroundColor: c.sel }]}>
                      <NxIcon name="clip" size={30} color={c.t2} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: c.t1 }]}>No sources yet</Text>
                    <Text style={[styles.emptyText, { color: c.t2 }]}>Files, recordings and links added to this page on the web show up here.</Text>
                  </View>
                ) : (
                  <Text style={[styles.foot, { color: c.t3 }]}>Sources in sub-pages count for this page too.</Text>
                )}
              </>
            ) : null}

            {tab === "create" ? (
              <>
                <NxSection label="Made in this page" />
                {pageDecks.map((d) => (
                  <NxRow
                    key={d.id}
                    lead={<NxIconTile icon="cards" tint="accent" />}
                    title={d.name.split("::").pop() || d.name}
                    meta={`${d.cards} card${d.cards === 1 ? "" : "s"}${d.due ? `, ${d.due} due` : ""}`}
                    trail={<NxPill label="Study" onPress={() => router.push({ pathname: "/set/[id]", params: { id: d.id } })} />}
                    onPress={() => router.push({ pathname: "/set/[id]", params: { id: d.id } })}
                  />
                ))}
                {!decks.isLoading && pageDecks.length === 0 ? (
                  <Text style={[styles.note, { color: c.t2 }]}>No flashcards made in this page yet.</Text>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <NxBottomBar ask="Ask about this page" onAsk={() => router.push("/chat")} />
    </View>
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

function BlockView({ block, n, linked, onOpen }: { block: Block; n: number; linked?: { props: { title?: string; icon?: string | null } }; onOpen: (id: string) => void }) {
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
        <View style={[styles.line, pad]}>
          <NxIcon name="chev_r" size={14} color={c.t2} strokeWidth={2} />
          <Text style={[body, { flex: 1, fontWeight: "500" }]}>{block.text}</Text>
        </View>
      );
    case "page":
      return (
        <Pressable onPress={() => block.pageId && onOpen(block.pageId)} style={[styles.line, { alignItems: "center" }, pad]}>
          <Text style={{ fontSize: 18 }}>{linked?.props.icon || "📄"}</Text>
          <Text style={[body, { textDecorationLine: "underline", textDecorationColor: c.ring }]}>{linked?.props.title || block.text || "Untitled"}</Text>
        </Pressable>
      );
    case "transcription":
      return (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.ln }, pad]}>
          <NxIconTile icon="mic" />
          <View style={{ flex: 1 }}>
            <Text style={[nxType.rowTitle, { color: c.t1, fontWeight: "500" }]}>{block.text || "Recording"}</Text>
            {block.transcript ? (
              <Text numberOfLines={2} style={[nxType.rowMeta, { color: c.t2 }]}>
                {block.transcript}
              </Text>
            ) : null}
          </View>
        </View>
      );
    case "table":
      return (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.ln }, pad]}>
          <NxIconTile icon="hash" />
          <Text style={[nxType.rowTitle, { color: c.t2 }]}>Table (open on the web to see it)</Text>
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
  if (s.status === "failed") return "Could not be read";
  if (s.bytes) return s.bytes > 1_000_000 ? `${(s.bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(s.bytes / 1000))} KB`;
  return "Ready";
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 2 },
  crumb: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10 },
  note: { paddingHorizontal: 20, paddingTop: 16, fontSize: 15, lineHeight: 22 },
  line: { flexDirection: "row", gap: 10 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, marginTop: 4, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginVertical: 4 },
  empty: { alignItems: "center", paddingTop: 36, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 19, fontWeight: "600" },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  foot: { paddingHorizontal: 20, paddingTop: 10, fontSize: 13, lineHeight: 18 },
});
