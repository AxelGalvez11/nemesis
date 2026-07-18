import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import { parseCalendarDoc, type CalendarDoc } from "@/lib/agenda";
import type { SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// Calendar sync — its own page (owner call 2026-07-18), pushed from the Settings
// sheet. The "Add to iPhone Calendar" action used to live as a box on the
// Calendar tab; it moved here so that tab stays just the Month/Week/Day agenda.
// Reads the same encrypted `kind:"calendar"` doc the Mac publishes (see
// (tabs)/calendar.tsx) and hands its tokenized ICS feed to the iPhone's built-in
// Calendar app — read-only, same single-writer rule as the rest of library sync.
//
// Deliberately reads only the LOCAL cache (loadCachedRows), no network pull: this
// is a settings shortcut, not a live view. If the phone hasn't synced a schedule
// yet, visiting the Calendar tab (which does pull) is what fixes that.
export default function CalendarSyncScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const k = await loadVaultKey();
        if (!alive) return;
        setKey(k);
        setKeyChecked(true);
        if (!k) return;
        const cached = await loadCachedRows();
        if (!alive) return;
        setCache(cached);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  // Nothing rendered until we know the pairing state — avoids a flash of the
  // "pair with your Mac" copy for users who are already paired.
  if (!keyChecked) return <View style={styles.root} testID="calendar-sync-loading" />;

  const calendarDoc: CalendarDoc | null = (() => {
    if (!key) return null;
    const { docs } = decryptLibrary(cache, key);
    const doc = docs.find((d) => d.kind === "calendar");
    return doc ? parseCalendarDoc(doc.content) : null;
  })();
  const feedUrl = calendarDoc?.feedUrl;

  return (
    <View style={styles.root} testID="calendar-sync-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="calendar-sync-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>Calendar sync</Text>

        {!key ? (
          <View style={styles.stateBlock} testID="calendar-sync-unpaired">
            <EmptyBlock
              title="Pair with your Mac"
              body="Pair with your Mac to enable calendar sync. Once you're paired, you can add your deadlines straight to your iPhone's Calendar app."
            />
            <MissionButton label="Scan pairing code" variant="primary" testID="goto-pair" onPress={() => router.push("/pair")} />
            <Text style={styles.hint}>On your Mac: Settings → Phone sync → Pair phone.</Text>
          </View>
        ) : feedUrl ? (
          <View style={styles.stateBlock} testID="calendar-sync-ready">
            <MissionButton
              label="Add to iPhone Calendar"
              variant="primary"
              testID="calendar-sync-subscribe"
              onPress={() => {
                // webcal:// hands the feed straight to the built-in Calendar's
                // subscribe flow (dates + titles only — never note contents).
                void Linking.openURL(feedUrl.replace(/^https:/, "webcal:")).catch(() => {});
              }}
            />
            <Text style={styles.hint}>
              Adds your deadlines to your built-in Calendar app — dates and titles only, never your notes.
            </Text>
          </View>
        ) : (
          <View style={styles.stateBlock} testID="calendar-sync-pending">
            <EmptyBlock
              title="Not synced yet"
              body="Open the Calendar tab to sync your schedule from your Mac, then come back here to turn on calendar sync."
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: space(3), paddingBottom: space(1) },
    back: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { fontSize: 16, color: c.accent, fontWeight: "500" },
    body: { paddingHorizontal: space(5), flexGrow: 1 },
    title: { fontSize: 28, fontWeight: "700", color: c.text, marginBottom: space(2), marginTop: space(1) },

    stateBlock: { alignItems: "center", gap: space(3), paddingTop: space(4) },
    hint: { fontSize: 13, lineHeight: 19, color: c.text2, textAlign: "center", maxWidth: 320 },
  });
