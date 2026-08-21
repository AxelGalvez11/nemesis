// The study numbers themselves — tiles and rows, with their own loading.
//
// 🔴 EXTRACTED THE DAY STATS BECAME A DESTINATION. These numbers used to live only inside
// `app/study-stats.tsx`, a modal opened from Study. Stats is now one of the four destinations
// the product has (`lib/nav-destinations.ts`, matching the web app's `SIDEBAR_NAV`), so a
// second screen renders them. Copying the tiles would mean two places computing "how is this
// student doing" and eventually disagreeing — silently, since each looks right on its own.
//
// This component owns the DATA and the numbers. It owns no chrome: no header, no title, no
// close button, no safe-area handling. Its two callers each supply their own frame — the
// destination uses the app shell's padding, the modal uses its own header and insets — which
// is the only thing that differs between them.

import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { fetchCloudStudy, loadCachedStudy, countsForCards, type CloudStudyCard, type CloudStudyDeck } from "@/api/cloudStudy";
import { listStudyArtifacts, type StudyArtifact } from "@/api/studyArtifacts";
import { computeStudyStats, relativeDay } from "@/lib/study-stats";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

export function StudyStatsBody({
  paddingTop = 0,
  paddingBottom = 0,
  testID,
}: {
  paddingTop?: number;
  paddingBottom?: number;
  testID?: string;
}) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [decks, setDecks] = useState<CloudStudyDeck[]>([]);
  const [cards, setCards] = useState<CloudStudyCard[]>([]);
  // Practice tests, the OTHER way a student revises. Their attempts were being
  // written to the artifact payload all along and nothing read them, so a student
  // who revises by testing saw an empty page.
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
    <ScrollView
      testID={testID}
      contentContainerStyle={[styles.body, { paddingTop: paddingTop + space(4), paddingBottom: paddingBottom + space(8) }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={c.text2}
          progressViewOffset={paddingTop}
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
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { paddingHorizontal: space(4), gap: space(5) },
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
