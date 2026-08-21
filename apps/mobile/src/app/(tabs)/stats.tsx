// Stats — the fourth destination, matching the web app's `/stats` row in
// `apps/web/lib/workspace/sidebar-nav.ts`.
//
// The numbers live in `components/StudyStatsBody.tsx`, shared with the older
// `app/study-stats.tsx` modal so the two can never disagree about how a student is doing.
// This file is the DESTINATION frame around them: the shell's padding and the TopBar title,
// and nothing else.

import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { StudyStatsBody } from "@/components/StudyStatsBody";
import { useTheme } from "@/theme/ThemeProvider";

export default function StatsScreen() {
  const { colors: c } = useTheme();
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderTitle } = useShell();

  useEffect(() => {
    setHeaderTitle("Stats");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]} testID="stats-page">
      <StudyStatsBody paddingTop={contentTop} paddingBottom={contentBottom} testID="stats-scroll" />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
