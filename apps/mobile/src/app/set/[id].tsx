import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NxSheet } from "@/components/nx/motion";
import { NxPressable } from "@/components/nx/NxPressable";
import { SkelBar, SkelGroup } from "@/components/nx/Skeleton";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deckCards, isDue } from "@/api/study";
import { NxIcon, type NxIconName } from "@/components/nx/NxIcon";
import { NxIconButton } from "@/components/nx/primitives";
import { NxFootButton, NxModeCard } from "@/components/nx/study";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { nxType, useNx } from "@/theme/nx";

type Mode = "quiz" | "cards";

// A flashcard set (canvas StudySet, StudyChooser). Study asks how: active recall quiz or flashcards.
export default function SetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [choosing, setChoosing] = useState(false);
  const [mode, setMode] = useState<Mode>("quiz");
  const decks = useDecks();
  const space = useSpacePages();
  const cards = useQuery({ queryKey: ["study-cards", id], queryFn: () => deckCards(id), enabled: !!id });

  const deck = decks.data?.find((d) => d.id === id);
  const page = deck?.page_id ? space.byId.get(deck.page_id) : undefined;
  const due = (cards.data ?? []).filter((card) => isDue(card)).length;

  const openPage = () => {
    if (page) router.push({ pathname: "/page/[id]", params: { id: page.id } });
  };
  const more = () => {
    const label = "Open the page it came from";
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: [label, "Cancel"], cancelButtonIndex: 1 }, (i) => i === 0 && openPage());
    } else {
      Alert.alert(deck?.name.split("::").pop() ?? "", undefined, [{ text: label, onPress: openPage }, { text: "Cancel", style: "cancel" }]);
    }
  };

  const start = () => {
    setChoosing(false);
    router.push({ pathname: mode === "quiz" ? "/quiz/[id]" : "/flashcards/[id]", params: { id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 3 }]}>
        <NxIconButton icon="chev_l" size={22} label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        {/* Only drawn when it has something to offer. */}
        {page ? <NxIconButton icon="dots" size={20} label="More" onPress={more} /> : <View style={{ width: 44 }} />}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {deck ? (
          <Text style={[nxType.pageTitle, { color: c.t1, paddingHorizontal: 20, paddingTop: 14 }]}>{deck.name.split("::").pop()}</Text>
        ) : (
          <SkelGroup style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            <SkelBar width="70%" height={26} radius={6} />
          </SkelGroup>
        )}
        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <Prop icon="cards" label="Cards" value={String(cards.data?.length ?? deck?.cards ?? "")} />
          <Prop icon="clock" label="Due today" value={String(due)} />
          {page ? <Prop icon="notes" label="From page" value={page.props.title || "Untitled"} onPress={openPage} /> : null}
        </View>
        <View style={[styles.rule, { backgroundColor: c.ln }]} />
        <Text style={[nxType.section, { color: c.t2, paddingHorizontal: 20, paddingTop: 18 }]}>Cards</Text>
        {cards.isLoading ? (
          <SkelGroup style={{ paddingHorizontal: 20 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.qa, { borderBottomColor: c.ln, gap: 8 }]}>
                <SkelBar width={i % 2 ? "58%" : "74%"} height={13} />
                <SkelBar width={i % 2 ? "82%" : "46%"} height={11} />
              </View>
            ))}
          </SkelGroup>
        ) : null}
        {cards.error ? <Text style={{ paddingHorizontal: 20, paddingTop: 12, fontSize: 15, color: c.t2 }}>These cards could not be loaded.</Text> : null}
        <View style={{ paddingHorizontal: 20 }}>
          {(cards.data ?? []).map((card) => (
            <View key={card.id} style={[styles.qa, { borderBottomColor: c.ln }]}>
              <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: "500", color: c.t1 }}>{card.front}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: c.t2 }}>{card.back}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <NxFootButton label="Study" disabled={!cards.data?.length} onPress={() => setChoosing(true)} />

      <NxSheet visible={choosing} onClose={() => setChoosing(false)} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 30) }]}>
          <View style={[styles.grab, { backgroundColor: c.ring }]} />
          <Text style={{ paddingTop: 8, fontSize: 22, lineHeight: 28, fontWeight: "600", color: c.t1 }}>How do you want to study?</Text>
          <NxModeCard icon="bulb" title="Active recall quiz" sub="Think first, then multiple choice, matching and more" on={mode === "quiz"} onPress={() => setMode("quiz")} />
          <NxModeCard icon="cards" title="Flashcards" sub="Flip each card, then mark X or check" on={mode === "cards"} onPress={() => setMode("cards")} />
          <View style={{ paddingTop: 6 }}>
            <NxPressable onPress={start} style={({ pressed }) => [styles.start, { backgroundColor: c.inv, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={{ color: c.onInv, fontSize: 16, fontWeight: "500" }}>Start</Text>
            </NxPressable>
          </View>
      </NxSheet>
    </View>
  );
}

function Prop({ icon, label, value, onPress }: { icon: NxIconName; label: string; value: string; onPress?: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.prop, pressed && { opacity: 0.6 }]}>
      <View style={styles.propLabel}>
        <NxIcon name={icon} size={16} color={c.t2} />
        <Text style={{ fontSize: 15, color: c.t2 }}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: c.t1 }}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 2 },
  prop: { flexDirection: "row", alignItems: "center", minHeight: 36, gap: 8 },
  propLabel: { width: 128, flexDirection: "row", alignItems: "center", gap: 8 },
  rule: { height: 1, marginHorizontal: 20, marginTop: 10 },
  qa: { paddingVertical: 12, gap: 2, borderBottomWidth: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  grab: { width: 36, height: 5, borderRadius: 9999, alignSelf: "center" },
  start: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
