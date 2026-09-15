import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SkelList } from "@/components/nx/Skeleton";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PageSummary } from "@/api/space";
import type { Deck } from "@/api/study";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxButton, NxSection } from "@/components/nx/primitives";
import { tint } from "@/components/nx/study";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { nxType, useNx } from "@/theme/nx";
import { iconOf } from "@/lib/fresh";

// Study (canvas "Study, filed by page" and "Study, nothing yet"): every flashcard set, filed in folders that
// follow the page tree. Due counts are small grey badges; there is no cards-due card (owner).
type Folder = { page: PageSummary; folders: Folder[]; decks: Deck[]; due: number; sets: number };

export default function StudyTab() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const decks = useDecks();
  const space = useSpacePages();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const roots = useMemo(() => fileByPage(decks.data ?? [], space.byId), [decks.data, space.byId]);

  const deckRow = (d: Deck, level: number) => (
    <Row
      key={d.id}
      level={level}
      state="leaf"
      lead={
        <View style={[styles.set, { backgroundColor: tint(c.acc, 0.14) }]}>
          <NxIcon name="cards" size={16} color={c.acc} />
        </View>
      }
      title={d.name.split("::").pop() || d.name}
      meta={`${d.cards} card${d.cards === 1 ? "" : "s"}`}
      due={d.due}
      onPress={() => router.push({ pathname: "/set/[id]", params: { id: d.id } })}
    />
  );

  // The first page starts open, like the canvas; the rest start folded. A folded page shows its due total.
  const folderRows = (f: Folder, level: number, openByDefault: boolean): React.ReactNode[] => {
    const expanded = open[f.page.id] ?? openByDefault;
    const rows: React.ReactNode[] = [
      <Row
        key={f.page.id}
        level={level}
        state={expanded ? "open" : "closed"}
        lead={
          <View style={styles.emojiBox}>
            <Text style={{ fontSize: 20 }}>{iconOf(f.page.props.icon)}</Text>
          </View>
        }
        title={f.page.props.title || "Untitled"}
        meta={`${f.sets} set${f.sets === 1 ? "" : "s"}`}
        due={expanded ? 0 : f.due}
        onPress={() => setOpen((o) => ({ ...o, [f.page.id]: !expanded }))}
      />,
    ];
    if (expanded) {
      for (const sub of f.folders) rows.push(...folderRows(sub, level + 1, openByDefault));
      for (const d of f.decks) rows.push(deckRow(d, level + 1));
    }
    return rows;
  };

  const loading = decks.isLoading || space.loading;
  const empty = !loading && !decks.error && roots.length === 0;

  if (empty) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={styles.center}>
          <View style={[styles.circle, { backgroundColor: c.sel }]}>
            <NxIcon name="book" size={40} color={c.t1} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: c.t1 }]}>Nothing to study yet</Text>
          <Text style={[styles.emptyText, { color: c.t2 }]}>Open a page, add sources, then use Create to make flashcards. They show up here, filed by page.</Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 34), gap: 8 }}>
          <NxButton label="Go to Notes" icon="notes" onPress={() => router.replace("/")} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={
          <RefreshControl
            refreshing={decks.isRefetching}
            onRefresh={() => {
              void decks.refetch();
              void space.refetch();
            }}
            tintColor={c.t3}
          />
        }
      >
        {loading ? (
          <SkelList rows={6} lead="emoji" />
        ) : decks.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>Your flashcards could not be loaded. Pull down to try again.</Text>
        ) : (
          <>
            <NxSection label="By page" />
            {roots.flatMap((f, i) => folderRows(f, 0, i === 0))}
          </>
        )}
      </ScrollView>
      <NxBottomBar ask="Ask Nemesis" onAsk={() => router.push({ pathname: "/c/[id]", params: { id: "new" } })} onSearch={() => router.push("/search")} />
    </View>
  );
}

function Row({ level, state, lead, title, meta, due, onPress }: { level: number; state: "open" | "closed" | "leaf"; lead: React.ReactNode; title: string; meta?: string; due?: number; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={state === "leaf" ? undefined : { expanded: state === "open" }}
      style={({ pressed }) => [styles.row, { paddingLeft: 6 + level * 20 }, pressed && { backgroundColor: c.soft }]}
    >
      <View style={styles.chev}>{state === "leaf" ? null : <NxIcon name={state === "open" ? "chev_d" : "chev_r"} size={14} color={c.t3} strokeWidth={2} />}</View>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, color: c.t1 }}>
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

/** Files each deck under its page and that page's ancestors, so the Study tab reads like the Notes tree. Decks without a page are not shown. */
function fileByPage(decks: Deck[], byId: Map<string, PageSummary>): Folder[] {
  const folders = new Map<string, Folder>();
  const roots: Folder[] = [];
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
    if (!page) continue;
    folderFor(page).decks.push(d);
    for (let p: PageSummary | undefined = page; p; p = p.parent_id ? byId.get(p.parent_id) : undefined) {
      const f = folders.get(p.id);
      if (!f) break;
      f.sets += 1;
      f.due += d.due;
    }
  }
  return roots;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 50, paddingRight: 16 },
  chev: { width: 24, alignItems: "center" },
  emojiBox: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  set: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999 },
  note: { paddingHorizontal: 20, paddingTop: 24, fontSize: 15, lineHeight: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  circle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, textAlign: "center" },
  emptyText: { fontSize: 16, lineHeight: 24, textAlign: "center" },
});
