import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchCloudStudy, loadCachedStudy, countsForCards, type CloudStudyCard, type CloudStudyDeck } from "@/api/cloudStudy";
import { CloseIcon } from "@/components/icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

export default function StudyStatsScreen() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [decks, setDecks] = useState<CloudStudyDeck[]>([]);
  const [cards, setCards] = useState<CloudStudyCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const fresh = await fetchCloudStudy(uid);
    setDecks(fresh.decks);
    setCards(fresh.cards);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      let alive = true;
      void loadCachedStudy(uid).then((cached) => {
        if (!alive) return;
        setDecks(cached.decks);
        setCards(cached.cards);
      });
      void refresh().catch(() => {});
      return () => {
        alive = false;
      };
    }, [uid, refresh]),
  );

  const counts = countsForCards(cards);
  const reviewed = cards.filter((card) => card.repetitions > 0);
  const remembered = reviewed.reduce((sum, card) => sum + Math.max(0, card.repetitions - card.lapses), 0);
  const attempts = reviewed.reduce((sum, card) => sum + card.repetitions, 0);
  const retention = attempts > 0 ? Math.round((remembered / attempts) * 100) : null;
  const tiles = [
    { label: "Due now", value: String(counts.dueCount) },
    { label: "New", value: String(counts.newCount) },
    { label: "Total cards", value: String(cards.length) },
    { label: "Decks", value: String(decks.length) },
  ];

  return (
    <View style={styles.root} testID="study-stats-page">
      <View style={[styles.header, { paddingTop: insets.top + space(1.5) }]}>
        <Text style={styles.title}>Study stats</Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/study"))}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityLabel="Close study stats"
          testID="study-stats-close"
        >
          <CloseIcon size={17} color={c.text} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(8) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <View key={tile.label} style={styles.tile}>
              <Text style={styles.value}>{tile.value}</Text>
              <Text style={styles.label}>{tile.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Retention</Text>
            <Text style={styles.rowValue}>{retention === null ? "Not enough reviews" : `${retention}%`}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Streak</Text>
            <Text style={styles.rowValue}>Not tracked yet</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      minHeight: 64,
      paddingHorizontal: space(4),
      paddingBottom: space(2),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    title: { ...type.h1, color: c.text },
    close: {
      width: control.sm,
      height: control.sm,
      borderRadius: control.sm / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    pressed: { opacity: 0.65 },
    body: { padding: space(4), gap: space(5) },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
    tile: {
      width: "48%",
      minHeight: 112,
      padding: space(4),
      justifyContent: "flex-end",
      backgroundColor: c.raised,
      borderRadius: 16,
    },
    value: { fontSize: 34, lineHeight: 40, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] },
    label: { ...type.small, color: c.text2, marginTop: space(1) },
    section: { backgroundColor: c.raised, borderRadius: 16, overflow: "hidden" },
    row: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    rowLabel: { ...type.body, color: c.text },
    rowValue: { ...type.small, color: c.text2 },
  });
