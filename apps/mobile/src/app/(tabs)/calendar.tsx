import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { MonthGrid } from "@/components/month-grid";
import { useShellPadding } from "@/components/shell-chrome";
import {
  currentUserId,
  decryptLibrary,
  loadCachedRows,
  loadVaultKey,
  pullLibraryRows,
  subscribeLibrary,
} from "@/api/librarySync";
import {
  dayKeyFromDate,
  eventsForDay,
  labelForDay,
  monthMatrix,
  parseCalendarDoc,
  shiftDayKey,
  stepMonth,
  weekDays,
  type AgendaEvent,
  type CalendarDoc,
  type WeekDay,
} from "@/lib/agenda";
import type { SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Calendar (Phase 2): the agenda the Mac renders from School/calendar.json,
// shipped through the encrypted pipe as the kind:"calendar" document. Read-only
// here — the agent (and the desktop calendar page) own the events. The
// "Add to iPhone Calendar" action that hands the tokenized ICS feed to the
// built-in Calendar app moved to Settings → Calendar sync (profile/calendar.tsx),
// owner call 2026-07-18 — this tab is just the Month/Week/Day agenda now.
//
// Full-screen rework: a Month/Week/Day switcher (owner request) replaces the old
// single scrolling "grid + 90-day agenda" layout. Each view is one distinct read
// of the same events — Month = the grid, Week = this week's 7 days, Day = one
// day's agenda with ‹ › paging — so the switcher actually means something instead
// of Month being a superset of the other two.

type CalendarView = "month" | "week" | "day";

const VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

export default function CalendarScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);
  const [view, setView] = useState<CalendarView>("month");
  // The month the grid is showing — starts on the current month, paged by the
  // grid's ‹ › arrows.
  const [shownMonth, setShownMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // The day the Day view is showing — starts on today, paged by its ‹ › arrows.
  // Independent of the month pager and of Week (which always shows THIS week).
  const [shownDay, setShownDay] = useState(() => dayKeyFromDate(new Date()));

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
  const todayKey = dayKeyFromDate(new Date());
  const events = calendarDoc?.events ?? [];
  const month = monthMatrix(shownMonth.year, shownMonth.month, events, todayKey);
  const week = weekDays(events, todayKey, todayKey); // always THIS week — Week doesn't page
  const weekSections = week.map((day) => ({ data: day.events, day, key: day.key }));
  const dayEvents = eventsForDay(events, shownDay);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={c.text2}
      onRefresh={() => {
        setRefreshing(true);
        void pull(cache).finally(() => setRefreshing(false));
      }}
    />
  );

  return (
    <View style={styles.flex} testID="calendar-screen">
      <View style={[styles.switcherWrap, { paddingTop: contentTop + space(2) }]}>
        <View style={styles.segment} testID="calendar-view-switch">
          {VIEW_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              testID={`calendar-view-${opt.id}`}
              onPress={() => setView(opt.id)}
              style={[styles.segmentItem, view === opt.id && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, view === opt.id && styles.segmentTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {view === "month" ? (
        <ScrollView
          testID="calendar-month-view"
          contentContainerStyle={[styles.monthBody, { paddingBottom: contentBottom }]}
          refreshControl={refreshControl}
        >
          <MonthGrid
            month={month}
            onStep={(delta) => setShownMonth((current) => stepMonth(current.year, current.month, delta))}
          />
        </ScrollView>
      ) : null}

      {view === "week" ? (
        <SectionList
          testID="calendar-week-view"
          sections={weekSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.listBody, { paddingBottom: contentBottom }]}
          refreshControl={refreshControl}
          renderSectionHeader={({ section }) => <WeekDayHead day={section.day} styles={styles} />}
          renderItem={({ item }) => <EventRow event={item} styles={styles} />}
        />
      ) : null}

      {view === "day" ? (
        <View style={styles.flex} testID="calendar-day-view">
          <DayNav
            dayKey={shownDay}
            todayKey={todayKey}
            onStep={(delta) => setShownDay((current) => shiftDayKey(current, delta))}
            styles={styles}
          />
          <FlatList
            data={dayEvents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listBody, { paddingBottom: contentBottom }]}
            refreshControl={refreshControl}
            renderItem={({ item }) => <EventRow event={item} styles={styles} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyBlock
                  title="No events"
                  body="The agent fills this from your syllabus and school portals. Ask it on your Mac to set up your semester."
                />
              </View>
            }
          />
        </View>
      ) : null}
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

/** Week view's per-day section header: weekday + day-number bubble (today gets
 *  the accent fill), with a quiet "No events" cue when the day is empty — the
 *  day still gets its row instead of collapsing out of the list. */
function WeekDayHead({ day, styles }: { day: WeekDay; styles: Styles }) {
  return (
    <View style={styles.weekDayHead} testID={`week-day-${day.key}`}>
      <Text style={styles.weekDayLabel}>{day.label}</Text>
      <View style={[styles.weekDayNumWrap, day.isToday && styles.weekDayNumToday]}>
        <Text style={[styles.weekDayNum, day.isToday && styles.weekDayNumTextToday]}>{day.day}</Text>
      </View>
      {day.events.length === 0 ? <Text style={styles.weekEmptyText}>No events</Text> : null}
    </View>
  );
}

/** Day view's ‹ label › pager — same shape as MonthGrid's own header, styled
 *  locally since MonthGrid doesn't export its header pieces. */
function DayNav({
  dayKey,
  todayKey,
  onStep,
  styles,
}: {
  dayKey: string;
  todayKey: string;
  onStep: (delta: number) => void;
  styles: Styles;
}) {
  return (
    <View style={styles.dayNav} testID="calendar-day-nav">
      <Pressable onPress={() => onStep(-1)} hitSlop={12} testID="day-prev">
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <Text style={styles.dayNavLabel}>{labelForDay(dayKey, todayKey)}</Text>
      <Pressable onPress={() => onStep(1)} hitSlop={12} testID="day-next">
        <Text style={styles.arrow}>›</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },
    listBody: { paddingHorizontal: space(4), paddingTop: space(1), flexGrow: 1 },

    switcherWrap: { paddingHorizontal: space(4), paddingBottom: space(1) },
    segment: { flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.sm, padding: 3, gap: 3, marginBottom: space(2) },
    segmentItem: { flex: 1, paddingVertical: space(2.5), alignItems: "center", borderRadius: radius.sm - 2 },
    segmentItemActive: { backgroundColor: c.accentFaint },
    segmentText: { ...type.small, color: c.text2, fontWeight: "600" },
    segmentTextActive: { color: c.accent },

    monthBody: { paddingHorizontal: space(4), paddingTop: space(1), flexGrow: 1 },

    weekDayHead: { flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(4), marginBottom: space(1.5) },
    weekDayLabel: { ...type.micro, color: c.text3, letterSpacing: 1.1, textTransform: "uppercase", width: 34 },
    weekDayNumWrap: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    weekDayNumToday: { backgroundColor: c.accent },
    weekDayNum: { fontSize: 14, fontWeight: "700", color: c.text },
    weekDayNumTextToday: { color: c.onAccent },
    weekEmptyText: { ...type.small, color: c.text3, marginLeft: "auto" },

    dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(4), paddingBottom: space(2) },
    arrow: { fontSize: 26, lineHeight: 30, color: c.text2, paddingHorizontal: space(2) },
    dayNavLabel: { ...type.h2, color: c.text },

    eventCard: { flexDirection: "row", alignItems: "flex-start", gap: space(3), marginBottom: space(1.5) },
    kindDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
    eventText: { flex: 1, minWidth: 0, gap: 2 },
    eventTitle: { ...type.bodyStrong, color: c.text },
    eventMeta: { ...type.small, color: c.text2 },
    eventNote: { ...type.small, color: c.text3 },
    emptyWrap: { paddingTop: space(10) },
  });

type Styles = ReturnType<typeof createStyles>;
