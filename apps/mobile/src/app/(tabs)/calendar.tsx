import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { useShellPadding } from "@/components/shell-chrome";
import {
  currentUserId,
  decryptLibrary,
  loadCachedRows,
  loadVaultKey,
  pullLibraryRows,
  subscribeLibrary,
} from "@/api/librarySync";
import { agendaDays, dayKeyFromDate, parseCalendarDoc, type AgendaEvent, type CalendarDoc } from "@/lib/agenda";
import type { SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Calendar (Phase 2): the agenda the Mac renders from School/calendar.json,
// shipped through the encrypted pipe as the kind:"calendar" document. Read-only
// here — the agent (and the desktop calendar page) own the events. The one
// button hands the tokenized ICS feed to the iPhone's built-in Calendar app.

export default function CalendarScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);

  const pull = useCallback(async (base: SyncCache) => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const merged = await pullLibraryRows(base);
      setCache(merged);
    } catch {
      // offline — the cached agenda still renders
    } finally {
      pulling.current = false;
    }
  }, []);

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
        void pull(cached);
      })();
      return () => {
        alive = false;
      };
    }, [pull]),
  );

  // Live refresh while foregrounded (the Mac republishes the calendar doc as
  // the agent updates School/calendar.json) — same pattern as Library/Study.
  useEffect(() => {
    if (!key) return;
    let unsubscribe: (() => void) | undefined;
    let alive = true;
    void currentUserId().then((uid) => {
      if (!alive || !uid) return;
      unsubscribe = subscribeLibrary(uid, () => {
        setCache((current) => {
          void pull(current);
          return current;
        });
      });
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [key, pull]);

  if (!keyChecked) return <View style={styles.flex} testID="calendar-loading" />;

  if (!key) {
    return (
      <View
        style={[styles.pairWrap, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
        testID="calendar-unpaired"
      >
        <EmptyBlock
          title="Pair with your Mac"
          body="Your schedule lives on your Mac. Pair once and every deadline the agent tracks shows up here."
        />
        <MissionButton label="Scan pairing code" variant="primary" testID="goto-pair" onPress={() => router.push("/pair")} />
        <Text style={styles.pairHint}>On your Mac: Settings → Phone sync → Pair phone.</Text>
      </View>
    );
  }

  const { docs } = decryptLibrary(cache, key);
  const calendarDoc: CalendarDoc | null = (() => {
    const doc = docs.find((d) => d.kind === "calendar");
    return doc ? parseCalendarDoc(doc.content) : null;
  })();
  const days = calendarDoc ? agendaDays(calendarDoc.events, dayKeyFromDate(new Date())) : [];
  const sections = days.map((day) => ({ data: day.events, key: day.key, title: day.label }));

  return (
    <View style={styles.flex} testID="calendar-screen">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.listBody, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void pull(cache).finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          calendarDoc?.feedUrl ? (
            <Pressable
              testID="calendar-subscribe"
              style={({ pressed }) => [styles.subscribeRow, pressed && styles.subscribePressed]}
              onPress={() => {
                // webcal:// hands the feed straight to the built-in Calendar's
                // subscribe flow (dates + titles only — never note contents).
                void Linking.openURL(calendarDoc.feedUrl!.replace(/^https:/, "webcal:")).catch(() => {});
              }}
            >
              <Text style={styles.subscribeText}>Add to iPhone Calendar</Text>
              <Text style={styles.subscribeHint}>deadlines in your built-in Calendar app</Text>
            </Pressable>
          ) : null
        }
        renderSectionHeader={({ section }) => <Text style={styles.dayHead}>{section.title}</Text>}
        renderItem={({ item }) => <EventRow event={item} styles={styles} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title="No upcoming events"
              body="The agent fills this from your syllabus and school portals. Ask it on your Mac to set up your semester."
            />
          </View>
        }
      />
    </View>
  );
}

const KIND_LABEL: Record<AgendaEvent["kind"], string> = {
  assignment: "Due",
  class: "Class",
  exam: "Exam",
  other: "",
  rotation: "Rotation",
};

function EventRow({ event, styles }: { event: AgendaEvent; styles: Styles }) {
  const { colors: c } = useTheme();
  const kindColor: Record<AgendaEvent["kind"], string> = {
    assignment: c.warn,
    class: c.info,
    exam: c.danger,
    other: c.text2,
    rotation: c.accent,
  };

  return (
    <Surface style={styles.eventCard} testID={`event-${event.id}`}>
      <View style={[styles.kindDot, { backgroundColor: kindColor[event.kind] }]} />
      <View style={styles.eventText}>
        <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.eventMeta} numberOfLines={1}>
          {[event.time, KIND_LABEL[event.kind], event.course].filter(Boolean).join(" · ")}
        </Text>
        {event.note ? <Text style={styles.eventNote} numberOfLines={2}>{event.note}</Text> : null}
      </View>
    </Surface>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },
    listBody: { paddingHorizontal: space(4), flexGrow: 1 },
    subscribeRow: {
      borderWidth: 1,
      borderColor: c.accentLine,
      backgroundColor: c.accentFaint,
      borderRadius: radius.sm,
      paddingVertical: space(3),
      paddingHorizontal: space(3.5),
      marginBottom: space(2),
      gap: 2,
    },
    subscribePressed: { opacity: 0.8 },
    subscribeText: { ...type.bodyStrong, color: c.accent },
    subscribeHint: { ...type.micro, color: c.text2 },
    dayHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(4), marginBottom: space(1.5) },
    eventCard: { flexDirection: "row", alignItems: "flex-start", gap: space(3), marginBottom: space(1.5) },
    kindDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
    eventText: { flex: 1, minWidth: 0, gap: 2 },
    eventTitle: { ...type.bodyStrong, color: c.text },
    eventMeta: { ...type.small, color: c.text2 },
    eventNote: { ...type.small, color: c.text3 },
    emptyWrap: { paddingTop: space(10) },
  });

type Styles = ReturnType<typeof createStyles>;
