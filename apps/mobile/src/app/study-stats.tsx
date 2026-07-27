import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchCloudStudy, loadCachedStudy, countsForCards, type CloudStudyCard, type CloudStudyDeck } from "@/api/cloudStudy";
import { listStudyArtifacts, type StudyArtifact } from "@/api/studyArtifacts";
import { computeStudyStats, relativeDay } from "@/lib/study-stats";
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
  // Practice tests, the OTHER way a student revises. Their attempts were being
  // written to the artifact payload all along and nothing on this page read them,
  // so a student who revises by testing saw an empty page.
  const [artifacts, setArtifacts] = useState<StudyArtifact[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const [fresh, rows] = await Promise.all([
      fetchCloudStudy(uid),
      // Never let a tests failure blank the card stats: they are independent reads,
      // and half a page beats an empty one.
      listStudyArtifacts().catch(() => [] as StudyArtifact[]),
    ]);
    setDecks(fresh.decks);
    setCards(fresh.cards);
    setArtifacts(rows);
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
  const stats = computeStudyStats(
    cards,
    artifacts.flatMap((artifact) => artifact.attempts ?? []),
  );
  const tiles = [
    { label: "Due now", value: String(counts.dueCount) },
    { label: "New", value: String(counts.newCount) },
    { label: "Total cards", value: String(cards.length) },
    { label: "Decks", value: String(decks.length) },
    { label: "Tests taken", value: String(stats.testsTaken) },
    { label: "Questions answered", value: String(stats.totalAnswered) },
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
            <Text style={styles.rowLabel}>Card retention</Text>
            <Text style={styles.rowValue}>
              {stats.cardRetention === null ? "Not enough reviews" : `${stats.cardRetention}%`}
            </Text>
          </View>
          {/* Reported beside card retention, never averaged with it: "did it stick
              between reviews" and "did you pick the right option" are different
              measurements, and one blended number would move for the wrong reasons. */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Test accuracy</Text>
            <Text style={styles.rowValue}>
              {stats.testAccuracy === null ? "No tests taken yet" : `${stats.testAccuracy}%`}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Best test</Text>
            <Text style={styles.rowValue}>{stats.testBest === null ? "—" : `${stats.testBest}%`}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last test</Text>
            <Text style={styles.rowValue}>
              {stats.lastTestAt === null ? "—" : relativeDay(stats.lastTestAt, new Date())}
            </Text>
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
