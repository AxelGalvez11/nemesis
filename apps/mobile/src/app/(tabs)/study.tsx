import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PageSummary } from "@/api/space";
import type { Deck } from "@/api/study";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxIconTile, NxSection } from "@/components/nx/primitives";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { nxType, useNx } from "@/theme/nx";
import { iconOf } from "@/lib/fresh";

// Study (canvas artboard "Study, filed by page"): every flashcard set, filed in folders that follow the page tree.
type Folder = { page: PageSummary; folders: Folder[]; decks: Deck[]; due: number; sets: number };

export default function StudyTab() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const decks = useDecks();
  const space = useSpacePages();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { roots } = useMemo(() => fileByPage(decks.data ?? [], space.byId), [decks.data, space.byId]);

  const deckRow = (d: Deck, level: number) => (
    <Row key={d.id} level={level} state="leaf" lead={<NxIconTile icon="cards" tint="accent" />} title={d.name.split("::").pop() || d.name} meta={`${d.cards} card${d.cards === 1 ? "" : "s"}`} due={d.due} onPress={() => router.push({ pathname: "/set/[id]", params: { id: d.id } })} />
  );

  const folderRows = (f: Folder, level: number): React.ReactNode[] => {
    const expanded = open[f.page.id] ?? level === 0;
    const rows: React.ReactNode[] = [
      <Row
        key={f.page.id}
        level={level}
        state={expanded ? "open" : "closed"}
        lead={<Text style={styles.emoji}>{iconOf(f.page.props.icon)}</Text>}
        title={f.page.props.title || "Untitled"}
        meta={`${f.sets} set${f.sets === 1 ? "" : "s"}`}
        due={f.due}
        onPress={() => setOpen((o) => ({ ...o, [f.page.id]: !expanded }))}
      />,
    ];
    if (expanded) {
      for (const sub of f.folders) rows.push(...folderRows(sub, level + 1));
      for (const d of f.decks) rows.push(deckRow(d, level + 1));
    }
    return rows;
  };

  const loading = decks.isLoading || space.loading;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={decks.isRefetching} onRefresh={() => { void decks.refetch(); void space.refetch(); }} tintColor={c.t3} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={c.t3} />
        ) : decks.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>Your flashcards could not be loaded. Pull down to try again.</Text>
        ) : roots.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: c.sel }]}>
              <NxIcon name="cards" size={30} color={c.t2} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.t1 }]}>No flashcards yet</Text>
            <Text style={[styles.emptyText, { color: c.t2 }]}>Open a page and use Create to make flashcards from its notes and sources.</Text>
          </View>
        ) : (
          <>
            {roots.length ? <NxSection label="By page" /> : null}
            {roots.flatMap((f) => folderRows(f, 0))}
          </>
        )}
      </ScrollView>
      <NxBottomBar ask="Ask Nemesis" onAsk={() => router.push("/chat")} />
    </View>
  );
}

function Row({ level, state, lead, title, meta, due, onPress }: { level: number; state: "open" | "closed" | "leaf"; lead: React.ReactNode; title: string; meta?: string; due?: number; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { paddingLeft: 6 + level * 20 }, pressed && { backgroundColor: c.soft }]}>
      <View style={styles.chev}>{state === "leaf" ? null : <NxIcon name={state === "open" ? "chev_d" : "chev_r"} size={14} color={c.t3} strokeWidth={2} />}</View>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[nxType.rowTitle, { color: c.t1 }]}>
          {title}
        </Text>
        {meta ? <Text style={[nxType.rowMeta, { color: c.t2 }]}>{meta}</Text> : null}
      </View>
      {due ? (
        <View style={[styles.badge, { backgroundColor: c.sel }]}>
          <Text style={{ fontSize: 13, fontWeight: "500", color: c.t1 }}>{due} due</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Files each deck under its page and that page's ancestors, so the Study tab reads like the Notes tree. */
function fileByPage(decks: Deck[], byId: Map<string, PageSummary>): { roots: Folder[]; loose: Deck[] } {
  const folders = new Map<string, Folder>();
  const roots: Folder[] = [];
  const loose: Deck[] = [];
  const folderFor = (page: PageSummary): Folder => {
    let f = folders.get(page.id);
    if (f) return f;
    f = { page, folders: [], decks: [], due: 0, sets: 0 };
    folders.set(page.id, f);
    const parent = page.parent_id ? byId.get(page.parent_id) : undefined;
    if (parent) folderFor(parent).folders.push(f);
    else roots.push(f);
    return f;
  };
  for (const d of decks) {
    const page = d.page_id ? byId.get(d.page_id) : undefined;
    if (!page) {
      loose.push(d);
      continue;
    }
    folderFor(page).decks.push(d);
    for (let p: PageSummary | undefined = page; p; p = p.parent_id ? byId.get(p.parent_id) : undefined) {
      const f = folders.get(p.id);
      if (!f) break;
      f.sets += 1;
      f.due += d.due;
    }
  }
  return { roots, loose };
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 50, paddingRight: 16 },
  chev: { width: 24, alignItems: "center" },
  emoji: { width: 32, fontSize: 20, textAlign: "center" },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999 },
  note: { paddingHorizontal: 20, paddingTop: 24, fontSize: 15, lineHeight: 22 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 19, fontWeight: "600" },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: "center" },
});
