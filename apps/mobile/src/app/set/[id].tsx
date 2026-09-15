import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deckCards, isDue } from "@/api/study";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxButton, NxIconButton } from "@/components/nx/primitives";
import { NxModeCard } from "@/components/nx/study";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { nxType, useNx } from "@/theme/nx";

// A flashcard set (canvas: StudySet, StudyChooser). Study asks how: active recall quiz or flashcards.
export default function SetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [choosing, setChoosing] = useState(false);
  const decks = useDecks();
  const space = useSpacePages();
  const cards = useQuery({ queryKey: ["study-cards", id], queryFn: () => deckCards(id), enabled: !!id });

  const deck = decks.data?.find((d) => d.id === id);
  const page = deck?.page_id ? space.byId.get(deck.page_id) : undefined;
  const due = (cards.data ?? []).filter((card) => isDue(card)).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton icon="chev_l" size={22} label="Back" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <Text style={[nxType.pageEmoji, { paddingHorizontal: 20, paddingTop: 14 }]}>🗂️</Text>
        <Text style={[nxType.pageTitle, { color: c.t1, paddingHorizontal: 20, paddingTop: 6 }]}>{deck ? deck.name.split("::").pop() : ""}</Text>
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <Prop icon="cards" label="Cards" value={String(cards.data?.length ?? deck?.cards ?? "")} />
          <Prop icon="clock" label="Due today" value={String(due)} />
          {page ? <Prop icon="notes" label="From page" value={`${page.props.icon || "📄"} ${page.props.title || "Untitled"}`} /> : null}
        </View>
        <View style={[styles.rule, { backgroundColor: c.ln }]} />
        <Text style={[nxType.section, { color: c.t2, paddingHorizontal: 20, paddingTop: 18 }]}>Cards</Text>
        {cards.isLoading ? <ActivityIndicator style={{ marginTop: 20 }} color={c.t3} /> : null}
        <View style={{ paddingHorizontal: 20 }}>
          {(cards.data ?? []).map((card) => (
            <View key={card.id} style={[styles.qa, { borderBottomColor: c.ln }]}>
              <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: "500", color: c.t1 }}>{card.front}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: c.t2 }}>{card.back}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.cta, { bottom: insets.bottom + 12 }]}>
        <NxButton label="Study" disabled={!cards.data?.length} onPress={() => setChoosing(true)} />
      </View>

      <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={() => setChoosing(false)} />
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <Text style={{ fontSize: 20, fontWeight: "600", color: c.t1, paddingBottom: 6 }}>How do you want to study?</Text>
          <NxModeCard
            icon="bulb"
            title="Active recall quiz"
            sub="Think first, then multiple choice and matching"
            onPress={() => {
              setChoosing(false);
              router.push({ pathname: "/quiz/[id]", params: { id } });
            }}
          />
          <NxModeCard
            icon="cards"
            on
            title="Flashcards"
            sub="Flip each card, then mark it X or check"
            onPress={() => {
              setChoosing(false);
              router.push({ pathname: "/flashcards/[id]", params: { id } });
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function Prop({ icon, label, value }: { icon: "cards" | "clock" | "notes"; label: string; value: string }) {
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

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  prop: { flexDirection: "row", alignItems: "center", minHeight: 36, gap: 8 },
  propLabel: { width: 128, flexDirection: "row", alignItems: "center", gap: 8 },
  rule: { height: 1, marginHorizontal: 20, marginTop: 10 },
  qa: { paddingVertical: 12, gap: 2, borderBottomWidth: 1 },
  cta: { position: "absolute", left: 16, right: 16 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 8 },
});
