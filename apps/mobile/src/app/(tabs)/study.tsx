import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SkelList } from "@/components/nx/Skeleton";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Deck } from "@/api/study";
import { NoteAskBar } from "@/components/nx/NoteAskBar";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxButton, NxChevron, NxSection } from "@/components/nx/primitives";
import { tint } from "@/components/nx/study";
import { useDecks } from "@/hooks/useSpace";
import { nxType, useNx } from "@/theme/nx";

// Study: every flashcard set in one plain list, newest first (owner, canvas comment 2026-09-16: "make study
// page only show decks, remove the page folder format"). Each row carries Anki's three numbers, and New set
// opens a page for writing cards by hand.
export default function StudyTab() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const decks = useDecks();
  const [asking, setAsking] = useState(false);

  const sets = decks.data ?? [];
  const loading = decks.isLoading;
  const empty = !loading && !decks.error && sets.length === 0;
  const newSet = () => router.push("/new-set" as Href);

  if (empty) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={styles.center}>
          <View style={[styles.circle, { backgroundColor: c.sel }]}>
            <NxIcon name="book" size={40} color={c.t1} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: c.t1 }]}>Nothing to study yet</Text>
          <Text style={[styles.emptyText, { color: c.t2 }]}>Write a set yourself, or open a note and use Create to have Nemesis write one from it.</Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 34), gap: 10 }}>
          <NxButton label="New set" icon="plus" onPress={newSet} />
          <Pressable onPress={() => router.replace("/")} hitSlop={8} style={styles.quiet} accessibilityRole="button">
            <Text style={{ fontSize: 15, color: c.t2 }}>Or start from a note</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={decks.isRefetching} onRefresh={() => void decks.refetch()} tintColor={c.t3} />}
      >
        <NxSection
          label="Sets"
          right={
            <Pressable onPress={newSet} hitSlop={8} accessibilityRole="button" accessibilityLabel="New set" style={({ pressed }) => [styles.newPill, { borderColor: c.ring, backgroundColor: pressed ? c.soft : "transparent" }]}>
              <NxIcon name="plus" size={15} color={c.t1} strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: "500", color: c.t1 }}>New set</Text>
            </Pressable>
          }
        />
        {loading ? (
          <SkelList rows={6} lead="emoji" />
        ) : decks.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>Your flashcards could not be loaded. Pull down to try again.</Text>
        ) : (
          sets.map((d) => <SetRow key={d.id} deck={d} onPress={() => router.push({ pathname: "/set/[id]", params: { id: d.id } })} />)
        )}
      </ScrollView>
      <NxBottomBar ask="Ask Nemesis" onAsk={() => setAsking(true)} onSearch={() => router.push("/search")} />
      {/* Owner 2026-09-15: the question is typed here; only sending opens the chat. */}
      <NoteAskBar visible={asking} onClose={() => setAsking(false)} page={null} onSend={(q) => { setAsking(false); router.push({ pathname: "/c/[id]", params: { id: "new", q } }); }} />
    </View>
  );
}

/** One set: its name, how many cards it holds, and what is waiting (owner: "like in anki"). */
function SetRow({ deck, onPress }: { deck: Deck; onPress: () => void }) {
  const c = useNx();
  const counts: { label: string; value: number; color: string }[] = [
    { label: "due", value: deck.due, color: c.acc },
    { label: "new", value: deck.fresh, color: c.t2 },
    { label: "in review", value: deck.review, color: c.t3 },
  ];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.soft }]}>
      <View style={[styles.set, { backgroundColor: tint(c.acc, 0.14) }]}>
        <NxIcon name="cards" size={16} color={c.acc} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, color: c.t1 }}>
          {deck.name.split("::").pop() || deck.name}
        </Text>
        <View style={styles.counts}>
          {counts.map((n) => (
            <View key={n.label} style={styles.count}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: n.value ? n.color : c.t3 }}>{n.value}</Text>
              <Text style={[nxType.rowMeta, { color: c.t3 }]}>{n.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <NxChevron />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingLeft: 16, paddingRight: 16 },
  set: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  counts: { flexDirection: "row", gap: 12 },
  count: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  newPill: { flexDirection: "row", alignItems: "center", gap: 5, height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 9999, borderWidth: 1 },
  quiet: { height: 44, alignItems: "center", justifyContent: "center" },
  note: { paddingHorizontal: 20, paddingTop: 24, fontSize: 15, lineHeight: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  circle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, textAlign: "center" },
  emptyText: { fontSize: 16, lineHeight: 24, textAlign: "center" },
});
