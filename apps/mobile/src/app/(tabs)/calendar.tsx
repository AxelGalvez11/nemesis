import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { CalendarIcon } from "@/components/icons";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { MonthGrid, monthCardHeight } from "@/components/month-grid";
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
  type AgendaEvent,
  type CalendarDoc,
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
// owner call 2026-07-18 — this tab is just the agenda now.
//
// View-switcher rework (owner call 2026-07-18): the old top Month/Week/Day
// segmented control is gone, and Week goes away entirely. A single liquid-glass
// button in the lower-left opens a small popup to pick Daily / Monthly / Yearly.
// Monthly is now a continuous vertical scroll of month cards (bigger day cells;
// no more tap-to-page arrows — scrolling IS the pager). It opens centered on
// today's month and grows further into the future as the student nears the
// edge (append-only — growing into the past would jump the scroll position
// around, so that direction stays a generous fixed window instead). Yearly
// lays the whole year out as 12 mini month grids, with its own ‹ year › pager.
// Daily is unchanged: one day's agenda with its own ‹ › pager. Every day cell,
// in either grid size, jumps straight to that day in Daily view; a mini
// month's own name in Yearly jumps to Monthly centered on that month — so the
// three views read as one system instead of three unrelated screens.

type CalendarView = "daily" | "monthly" | "yearly";

const VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];
const VIEW_LABEL: Record<CalendarView, string> = { daily: "Daily", monthly: "Monthly", yearly: "Yearly" };

type MonthKey = { year: number; month: number };

// Monthly's continuous scroll: how far the fixed window reaches on first open,
// and how many more months get appended once the student scrolls near the
// future edge.
const MONTHS_BACK = 12;
const MONTHS_FORWARD = 12;
const MONTHS_APPEND_STEP = 6;

// Floating view-switcher geometry (lower-left liquid-glass button + its popup).
const FAB_HEIGHT = 44;
const FAB_BOTTOM = space(3);
const MENU_GAP = space(3);
// Keeps scrollable content clear of the floating button, so the last row is
// never hidden behind it.
const FAB_CLEARANCE = 76;

function buildMonthWindow(anchor: MonthKey, back: number, forward: number): MonthKey[] {
  const items: MonthKey[] = [];
  for (let i = -back; i <= forward; i++) items.push(stepMonth(anchor.year, anchor.month, i));
  return items;
}

function appendFutureMonths(current: MonthKey[], count: number): MonthKey[] {
  const last = current[current.length - 1];
  if (!last) return current;
  const extra = Array.from({ length: count }, (_, i) => stepMonth(last.year, last.month, i + 1));
  return [...current, ...extra];
}

function cumulativeOffsets(lengths: number[]): number[] {
  const offsets: number[] = [];
  let sum = 0;
  for (const len of lengths) {
    offsets.push(sum);
    sum += len;
  }
  return offsets;
}

export default function CalendarScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);
  const [view, setView] = useState<CalendarView>("monthly");
  const [menuOpen, setMenuOpen] = useState(false);

  // Monthly's window of months around an anchor (defaults to today's month;
  // retargeted by goToMonth when the student taps a mini month in Yearly).
  const [monthAnchor, setMonthAnchor] = useState<MonthKey>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [monthWindow, setMonthWindow] = useState<MonthKey[]>(() => buildMonthWindow(monthAnchor, MONTHS_BACK, MONTHS_FORWARD));

  // Yearly's shown year — independent of Monthly's window, pages by whole years.
  const [shownYear, setShownYear] = useState(() => new Date().getFullYear());

  // The day Daily view is showing — starts on today, paged by its ‹ › arrows.
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

  // Jump straight to a day's agenda — wired into every day cell in both
  // Monthly and Yearly grids.
  const goToDay = useCallback((dayKey: string) => {
    setShownDay(dayKey);
    setView("daily");
  }, []);

  // Jump to Monthly, centered on a specific month — wired into Yearly's mini
  // month names, so tapping "Mar" zooms straight into March's full-size grid.
  const goToMonth = useCallback((year: number, month: number) => {
    const anchor = { year, month };
    setMonthAnchor(anchor);
    setMonthWindow(buildMonthWindow(anchor, MONTHS_BACK, MONTHS_FORWARD));
    setView("monthly");
  }, []);

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
  const dayEvents = eventsForDay(events, shownDay);

  // Monthly's rendered months + each card's (deterministic, fixed-height) size.
  // Recomputed fresh each render like the rest of this screen's derived data —
  // monthMatrix is cheap and the window tops out in the low tens of months.
  const monthViews = monthWindow.map((m) => monthMatrix(m.year, m.month, events, todayKey));
  const cardHeights = monthViews.map((mv) => monthCardHeight(mv.weeks.length));
  const cardOffsets = cumulativeOffsets(cardHeights);
  // getItemLayout's offsets are relative to the FlatList's own content origin —
  // RN does NOT fold contentContainerStyle's paddingTop into them automatically
  // (verified against @react-native/virtualized-lists' ListMetricsAggregator:
  // a supplied getItemLayout's offset is used verbatim, then handed straight to
  // the native scrollTo). Every offset needs that same leading pad added, or
  // initialScrollIndex lands short — today's month would open scrolled a bit
  // past where it should sit. One variable, reused below in
  // contentContainerStyle's own paddingTop, so the two can never drift apart.
  const monthListHeaderPad = contentTop + space(2);

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
      {view === "monthly" ? (
        <FlatList
          testID="calendar-monthly-view"
          data={monthWindow}
          keyExtractor={(item) => `${item.year}-${item.month}`}
          renderItem={({ index }) => <MonthGrid month={monthViews[index]} size="large" onSelectDay={goToDay} />}
          getItemLayout={(_data, index) => ({
            length: cardHeights[index],
            offset: cardOffsets[index] + monthListHeaderPad,
            index,
          })}
          initialScrollIndex={MONTHS_BACK}
          extraData={{ events, todayKey }}
          onEndReached={() => setMonthWindow((prev) => appendFutureMonths(prev, MONTHS_APPEND_STEP))}
          onEndReachedThreshold={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.monthListBody,
            { paddingTop: monthListHeaderPad, paddingBottom: contentBottom + FAB_CLEARANCE },
          ]}
          refreshControl={refreshControl}
        />
      ) : null}

      {view === "yearly" ? (
        <ScrollView
          testID="calendar-yearly-view"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.yearBody,
            { paddingTop: contentTop + space(2), paddingBottom: contentBottom + FAB_CLEARANCE },
          ]}
          refreshControl={refreshControl}
        >
          <YearNav year={shownYear} onStep={(delta) => setShownYear((y) => y + delta)} styles={styles} />
          <View style={styles.yearGrid}>
            {Array.from({ length: 12 }, (_, m) => (
              <MonthGrid
                key={m}
                month={monthMatrix(shownYear, m, events, todayKey)}
                size="mini"
                onSelectDay={goToDay}
                onSelectMonth={goToMonth}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}

      {view === "daily" ? (
        <View style={styles.flex} testID="calendar-day-view">
          <View style={{ paddingTop: contentTop + space(2) }}>
            <DayNav
              dayKey={shownDay}
              todayKey={todayKey}
              onStep={(delta) => setShownDay((current) => shiftDayKey(current, delta))}
              styles={styles}
            />
          </View>
          <FlatList
            data={dayEvents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listBody, { paddingBottom: contentBottom + FAB_CLEARANCE }]}
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

      <ViewSwitcher
        view={view}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onSelect={(v) => {
          setView(v);
          setMenuOpen(false);
        }}
        onClose={() => setMenuOpen(false)}
        contentBottom={contentBottom}
        styles={styles}
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

/** Day view's ‹ label › pager. */
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

/** Yearly view's ‹ year › pager — same shape as DayNav, one year at a time. */
function YearNav({ year, onStep, styles }: { year: number; onStep: (delta: number) => void; styles: Styles }) {
  return (
    <View style={styles.dayNav} testID="calendar-year-nav">
      <Pressable onPress={() => onStep(-1)} hitSlop={12} testID="year-prev">
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <Text style={styles.dayNavLabel}>{year}</Text>
      <Pressable onPress={() => onStep(1)} hitSlop={12} testID="year-next">
        <Text style={styles.arrow}>›</Text>
      </Pressable>
    </View>
  );
}

/** Small upward caret for the view-switcher pill — defined inline here rather
 *  than in the shared icons.tsx set, since it's a one-off for this one control. */
function ChevronUpIcon({ size = 10, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 15l7-7 7 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** The lower-left liquid-glass view switcher: a compact pill showing the
 *  active view, tapping it opens a small popup to pick Daily / Monthly /
 *  Yearly. Scrim + fade/slide pattern mirrors AppDrawer's overlay, scaled down
 *  for a small popover instead of a full slide-out panel (no dimming — just an
 *  invisible tap-outside-to-close catcher, which reads lighter for a menu this
 *  small). */
function ViewSwitcher({
  view,
  menuOpen,
  onToggleMenu,
  onSelect,
  onClose,
  contentBottom,
  styles,
}: {
  view: CalendarView;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: (view: CalendarView) => void;
  onClose: () => void;
  contentBottom: number;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: menuOpen ? 1 : 0,
      duration: menuOpen ? 170 : 130,
      easing: menuOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [menuOpen, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <>
      <View style={StyleSheet.absoluteFill} pointerEvents={menuOpen ? "auto" : "none"} testID="calendar-view-menu-scrim">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close view menu" />
      </View>

      <Animated.View
        style={[
          styles.menuPanelWrap,
          { bottom: contentBottom + FAB_BOTTOM + FAB_HEIGHT + MENU_GAP, opacity: progress, transform: [{ translateY }] },
        ]}
        pointerEvents={menuOpen ? "auto" : "none"}
        testID="calendar-view-menu"
      >
        <GlassSurface style={styles.menuPanel}>
          {VIEW_OPTIONS.map((opt) => {
            const active = view === opt.id;
            return (
              <Pressable
                key={opt.id}
                testID={`calendar-view-${opt.id}`}
                onPress={() => onSelect(opt.id)}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>{opt.label}</Text>
                {active ? <View style={styles.menuItemDot} /> : null}
              </Pressable>
            );
          })}
        </GlassSurface>
      </Animated.View>

      <View style={[styles.fabWrap, { bottom: contentBottom + FAB_BOTTOM }]} pointerEvents="box-none">
        <GlassSurface style={styles.fab} testID="calendar-view-fab">
          <Pressable
            style={styles.fabInner}
            onPress={onToggleMenu}
            hitSlop={6}
            accessibilityLabel={`Calendar view: ${VIEW_LABEL[view]}. Tap to change.`}
          >
            <CalendarIcon size={16} color={c.text2} />
            <Text style={styles.fabLabel}>{VIEW_LABEL[view]}</Text>
            <ChevronUpIcon size={10} color={c.text2} />
          </Pressable>
        </GlassSurface>
      </View>
    </>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },
    listBody: { paddingHorizontal: space(4), paddingTop: space(1), flexGrow: 1 },

    monthListBody: { paddingHorizontal: space(4), flexGrow: 1 },
    yearBody: { paddingHorizontal: space(4), flexGrow: 1 },
    yearGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },

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

    // Lower-left liquid-glass view switcher.
    fabWrap: { position: "absolute", left: space(4), alignItems: "flex-start" },
    fab: { borderRadius: radius.pill, borderWidth: 1, borderColor: c.line },
    fabInner: { flexDirection: "row", alignItems: "center", gap: space(1.5), height: FAB_HEIGHT, paddingHorizontal: space(3.5) },
    fabLabel: { ...type.small, fontWeight: "600", color: c.text },

    menuPanelWrap: { position: "absolute", left: space(4), width: 180 },
    menuPanel: { borderRadius: radius.md, borderWidth: 1, borderColor: c.line, paddingVertical: space(1) },
    menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(2.75), paddingHorizontal: space(3.5) },
    menuItemPressed: { backgroundColor: c.surface2 },
    menuItemText: { ...type.body, color: c.text2, fontWeight: "600" },
    menuItemTextActive: { color: c.accent },
    menuItemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
  });

type Styles = ReturnType<typeof createStyles>;
