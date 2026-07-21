import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { CalendarIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { MonthGrid, monthCardHeight, WeekdayStripe } from "@/components/month-grid";
import { useShellPadding } from "@/components/shell-chrome";
import { SlideUpSheet } from "@/components/StudySheet";
import { useAuth } from "@/auth/AuthProvider";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  loadCachedCalendarEvents,
  updateCalendarEvent,
  type CalendarEventInput,
} from "@/api/cloudCalendar";
import {
  dayKeyFromDate,
  eventsForDay,
  labelForDay,
  monthMatrix,
  shiftDayKey,
  stepMonth,
  type AgendaEvent,
  type AgendaEventKind,
} from "@/lib/agenda";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Calendar (cloud-first phone spec §9, 2026-07-20): reads `calendar_events`
// cloud rows directly (same table + RLS the web calendar writes — see
// supabase/migrations/20260720210000_cloud_chat_calendar.sql) instead of the
// old pairing-gated encrypted vault doc. source:'agent' events (written by the
// agent, not this screen) stay read-only — tapping one opens a view-only sheet;
// everything else opens the editable add/edit sheet. No Realtime subscription
// (matches the rest of this round's cloud work): refresh happens on focus and
// pull-to-refresh, not live-push.
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

// The event create/edit/view sheet's state — same three-way dispatch as the web
// calendar's DialogState (calendar-workspace.tsx): agent-authored events only
// ever reach "view" (read-only); everything else is "add" or "edit".
type EventDialogState =
  | { mode: "add"; date: string }
  | { mode: "edit"; event: AgendaEvent }
  | { mode: "view"; event: AgendaEvent }
  | null;

const EVENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same order as the web calendar's KIND_ORDER (kind-meta.ts), so the picker
// reads the same way on both platforms.
const KIND_PICKER_OPTIONS: { value: AgendaEventKind; label: string }[] = [
  { value: "assignment", label: "Assignment" },
  { value: "exam", label: "Exam" },
  { value: "rotation", label: "Rotation" },
  { value: "class", label: "Class" },
  { value: "other", label: "Other" },
];

function kindDotColor(kind: AgendaEventKind, c: ThemeColors): string {
  const map: Record<AgendaEventKind, string> = {
    assignment: c.warn,
    class: c.info,
    exam: c.danger,
    other: c.text2,
    rotation: c.accent,
  };
  return map[kind];
}

// Monthly's continuous scroll: how far the fixed window reaches on first open,
// and how many more months get appended once the student scrolls near the
// future edge.
const MONTHS_BACK = 12;
const MONTHS_FORWARD = 12;
const MONTHS_APPEND_STEP = 6;

// Floating view-switcher geometry (lower-left liquid-glass button + its popup).
const FAB_HEIGHT = 44;
// Sits just above the home-indicator safe area (owner 2026-07-19: near the bottom).
const FAB_BOTTOM = space(1);
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
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);
  const [view, setView] = useState<CalendarView>("monthly");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<EventDialogState>(null);

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

  // Quick zoom-in + fade whenever the mode changes (Daily↔Monthly↔Yearly), so the
  // three views settle into place as one system instead of hard-cutting. Runs on
  // reanimated's UI thread. Opacity floors at 0.5 (not 0): on a mode switch the
  // new content commits at full opacity for a frame before this reset lands, and
  // a 1→0.5 blink is imperceptible where a 1→0 one would flicker.
  const zoom = useSharedValue(0.96);
  const fade = useSharedValue(0.5);
  useEffect(() => {
    zoom.value = 0.96;
    fade.value = 0.5;
    zoom.value = withTiming(1, { duration: 180, easing: ReEasing.out(ReEasing.cubic) });
    fade.value = withTiming(1, { duration: 180, easing: ReEasing.out(ReEasing.cubic) });
  }, [view, zoom, fade]);
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: zoom.value }],
  }));

  // Cloud fetch — no Realtime subscription this round (matches the rest of the
  // cloud-first phone work): refresh on focus + pull-to-refresh only.
  const pull = useCallback(async (uid: string) => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const rows = await listCalendarEvents(uid);
      setEvents(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message); // offline/error — the last-cached agenda still renders
    } finally {
      pulling.current = false;
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      // Instant open from the on-device cache (offline-safe), then a live pull
      // in the background — never lets a slower cache read clobber a faster
      // network result that already landed.
      void loadCachedCalendarEvents(userId).then((cached) => {
        if (!alive) return;
        setEvents((prev) => (prev.length > 0 ? prev : cached));
        setLoaded((prevLoaded) => prevLoaded || cached.length > 0);
      });
      void pull(userId);
      return () => {
        alive = false;
      };
    }, [userId, pull]),
  );

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

  // Opens the add sheet for a brand-new event on the given date (the FAB passes
  // "today"; a day cell passes its own date).
  const openAdd = useCallback((date: string) => setDialog({ mode: "add", date }), []);

  // Agent-authored events are read-only — same source:'agent' dispatch the web
  // calendar's openEvent uses.
  const openEvent = useCallback((event: AgendaEvent) => {
    setDialog(event.source === "agent" ? { mode: "view", event } : { mode: "edit", event });
  }, []);

  const handleSaveEvent = useCallback(
    async (input: CalendarEventInput) => {
      if (!userId || !dialog || dialog.mode === "view") return;
      const saved =
        dialog.mode === "edit"
          ? await updateCalendarEvent(userId, dialog.event.id, input)
          : await createCalendarEvent(userId, input);
      setEvents((prev) => [...prev.filter((e) => e.id !== saved.id), saved]);
      setDialog(null);
    },
    [userId, dialog],
  );

  const handleDeleteEvent = useCallback(async () => {
    if (!userId || dialog?.mode !== "edit") return;
    const id = dialog.event.id;
    await deleteCalendarEvent(userId, id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setDialog(null);
  }, [userId, dialog]);

  if (!userId) {
    return (
      <View
        style={[styles.pairWrap, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
        testID="calendar-signed-out"
      >
        <EmptyBlock
          title="Sign in to see your calendar"
          body="Your schedule lives in your account now — no Mac needed once you're signed in."
        />
        <MissionButton
          label="Sign in"
          variant="primary"
          testID="calendar-goto-signin"
          onPress={() => router.push("/sign-in")}
        />
      </View>
    );
  }

  if (!loaded) return <View style={styles.flex} testID="calendar-loading" />;

  const todayKey = dayKeyFromDate(new Date());
  const dayEvents = eventsForDay(events, shownDay);
  // Weekday (0 = Sunday) the shown day falls on, to accent its column in the
  // Daily view's letter stripe. Parses the yyyy-mm-dd key as a LOCAL date.
  const [sdY, sdM, sdD] = shownDay.split("-").map(Number);
  const shownWeekday = new Date(sdY, (sdM || 1) - 1, sdD || 1).getDay();

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
        void pull(userId).finally(() => setRefreshing(false));
      }}
    />
  );

  return (
    <View style={styles.flex} testID="calendar-screen">
      {/* Background refresh failed (e.g. offline) — the last-loaded events still
          render underneath; this just says why nothing newer showed up. */}
      {error ? (
        <View style={[styles.errorBanner, { top: contentTop + space(1) }]} pointerEvents="none" testID="calendar-error">
          <Text style={styles.errorBannerText} numberOfLines={2}>Couldn't refresh: {error}</Text>
        </View>
      ) : null}
      <Reanimated.View style={[styles.zoomWrap, contentAnimStyle]}>
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
            <View style={styles.dayWeekdayWrap}>
              <WeekdayStripe activeIndex={shownWeekday} />
            </View>
          </View>
          <FlatList
            data={dayEvents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listBody, { paddingBottom: contentBottom + FAB_CLEARANCE }]}
            refreshControl={refreshControl}
            renderItem={({ item }) => <EventRow event={item} styles={styles} onPress={openEvent} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyBlock
                  title="No events"
                  body="Ask Nemesis to fill in your semester, or tap + to add an event yourself."
                />
              </View>
            }
          />
        </View>
      ) : null}
      </Reanimated.View>

      <ViewSwitcher
        view={view}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onSelect={(v) => {
          setView(v);
          setMenuOpen(false);
        }}
        onClose={() => setMenuOpen(false)}
        insetBottom={insets.bottom}
        styles={styles}
      />

      <AddEventFab
        insetBottom={insets.bottom}
        onPress={() => openAdd(view === "daily" ? shownDay : todayKey)}
      />

      <EventSheet
        dialog={dialog}
        todayKey={todayKey}
        onClose={() => setDialog(null)}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
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

function EventRow({ event, styles, onPress }: { event: AgendaEvent; styles: Styles; onPress: (event: AgendaEvent) => void }) {
  const { colors: c } = useTheme();
  const kindColor: Record<AgendaEvent["kind"], string> = {
    assignment: c.warn,
    class: c.info,
    exam: c.danger,
    other: c.text2,
    rotation: c.accent,
  };

  return (
    <Pressable onPress={() => onPress(event)} testID={`event-${event.id}`}>
      <Surface style={styles.eventCard}>
        <View style={[styles.kindDot, { backgroundColor: kindColor[event.kind] }]} />
        <View style={styles.eventText}>
          <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {[event.time, KIND_LABEL[event.kind], event.course, event.source === "agent" ? "Nemesis" : ""]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {event.note ? <Text style={styles.eventNote} numberOfLines={2}>{event.note}</Text> : null}
        </View>
      </Surface>
    </Pressable>
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
 *  Yearly. The popup's own glass supplies its blur; a transparent full-screen
 *  tap-catcher (mounted only while open) closes it WITHOUT blurring the agenda
 *  behind it (owner 2026-07-18: confine blur to the menu, no whole-screen blur). */
function ViewSwitcher({
  view,
  menuOpen,
  onToggleMenu,
  onSelect,
  onClose,
  insetBottom,
  styles,
}: {
  view: CalendarView;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: (view: CalendarView) => void;
  onClose: () => void;
  insetBottom: number;
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
      {/* Transparent tap-catcher — closes the menu on an outside tap, no page blur. */}
      {menuOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close view menu"
          testID="calendar-view-menu-scrim"
        />
      ) : null}

      <Animated.View
        style={[
          styles.menuPanelWrap,
          { bottom: insetBottom + FAB_BOTTOM + FAB_HEIGHT + MENU_GAP, opacity: progress, transform: [{ translateY }] },
        ]}
        pointerEvents={menuOpen ? "auto" : "none"}
        testID="calendar-view-menu"
      >
        <GlassSurface style={styles.menuPanel} fallbackColor={c.glassPanel} opaque>
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

      <View style={[styles.fabWrap, { bottom: insetBottom + FAB_BOTTOM }]} pointerEvents="box-none">
        <GlassSurface style={styles.fab} fallbackColor={c.glassPanel} testID="calendar-view-fab" shadow>
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

/** Bottom-right liquid-glass "+" — opens the add-event sheet. Sits opposite the
 *  ViewSwitcher's bottom-left button, always visible across all three views. */
function AddEventFab({ insetBottom, onPress }: { insetBottom: number; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={[styles.addFabWrap, { bottom: insetBottom + FAB_BOTTOM }]} pointerEvents="box-none">
      <GlassSurface style={styles.addFab} fallbackColor={c.glassPanel} testID="calendar-add-fab" shadow>
        <Pressable
          style={styles.addFabInner}
          onPress={onPress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Add event"
        >
          <PlusIcon size={19} color={c.text} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

function ViewRow({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.viewRow}>
      <Text style={styles.viewRowLabel}>{label}</Text>
      <Text style={styles.viewRowValue}>{value}</Text>
    </View>
  );
}

/** The add/edit/view sheet — a SlideUpSheet always mounted so its open/close
 *  animation always plays (same convention as StudySheet/StudyModeMenu). Local
 *  field state resets from `dialog` whenever it changes to a NEW open value (a
 *  fresh object reference every openAdd/openEvent call, including reopening
 *  the same event); closing leaves the fields as-is, hidden during the close
 *  animation — same tolerance Study's "coming soon" sheet already relies on. */
function EventSheet({
  dialog,
  todayKey,
  onClose,
  onSave,
  onDelete,
  styles,
}: {
  dialog: EventDialogState;
  todayKey: string;
  onClose: () => void;
  onSave: (input: CalendarEventInput) => Promise<void>;
  onDelete: () => Promise<void>;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<AgendaEventKind>("assignment");
  const [course, setCourse] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog) return; // closing — leave fields as-is for the close animation
    const seed = dialog.mode !== "add" ? dialog.event : null;
    setTitle(seed?.title ?? "");
    setDate(dialog.mode === "add" ? dialog.date : (seed?.date ?? ""));
    setTime(seed?.time ?? "");
    setKind(seed?.kind ?? "assignment");
    setCourse(seed?.course ?? "");
    setNote(seed?.note ?? "");
    setSaving(false);
    setError(null);
  }, [dialog]);

  const editingExisting = dialog?.mode === "edit";
  const sheetTitle = !dialog ? "" : dialog.mode === "view" ? dialog.event.title || "Event" : editingExisting ? "Edit event" : "Add event";
  const canSave = title.trim().length > 0 && EVENT_DATE_RE.test(date) && !saving;

  function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const input: CalendarEventInput = {
      title: title.trim(),
      date,
      kind,
      ...(time.trim() ? { time: time.trim() } : {}),
      ...(course.trim() ? { course: course.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    void onSave(input).catch((e) => {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    });
  }

  function confirmDelete() {
    Alert.alert(
      "Delete event?",
      `Are you sure you want to delete "${title || "this event"}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setSaving(true);
            setError(null);
            void onDelete().catch((e) => {
              setError(e instanceof Error ? e.message : "Couldn't delete. Try again.");
              setSaving(false);
            });
          },
        },
      ],
    );
  }

  return (
    <SlideUpSheet visible={dialog !== null} onClose={onClose} title={sheetTitle} testID="calendar-event-sheet">
      {dialog && dialog.mode === "view" ? (
        <View testID="calendar-event-view">
          <ViewRow
            label="When"
            value={`${labelForDay(dialog.event.date, todayKey)}${dialog.event.time ? ` · ${dialog.event.time}` : ""}`}
            styles={styles}
          />
          <ViewRow
            label="Type"
            value={KIND_PICKER_OPTIONS.find((o) => o.value === dialog.event.kind)?.label ?? "Other"}
            styles={styles}
          />
          {dialog.event.course ? <ViewRow label="Course" value={dialog.event.course} styles={styles} /> : null}
          {dialog.event.note ? <ViewRow label="Notes" value={dialog.event.note} styles={styles} /> : null}
          <Text style={styles.sheetHint}>Added by Nemesis. Ask it to change this, or add your own event alongside it.</Text>
          <MissionButton label="Close" onPress={onClose} testID="calendar-event-view-close" />
        </View>
      ) : (
        <View testID="calendar-event-form">
          {error ? <Text style={styles.sheetError}>{error}</Text> : null}
          <TextInput
            style={styles.sheetInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={c.text3}
            testID="calendar-event-title"
          />
          <View style={styles.sheetRow}>
            <TextInput
              style={[styles.sheetInput, styles.sheetInputFlex]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={c.text3}
              autoCapitalize="none"
              autoCorrect={false}
              testID="calendar-event-date"
            />
            <TextInput
              style={[styles.sheetInput, styles.sheetInputTime]}
              value={time}
              onChangeText={setTime}
              placeholder="HH:MM"
              placeholderTextColor={c.text3}
              autoCapitalize="none"
              autoCorrect={false}
              testID="calendar-event-time"
            />
          </View>
          <View style={styles.kindPickerRow}>
            {KIND_PICKER_OPTIONS.map((opt) => {
              const active = kind === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setKind(opt.value)}
                  style={[styles.kindChip, active && styles.kindChipActive]}
                  testID={`calendar-event-kind-${opt.value}`}
                >
                  <View style={[styles.kindChipDot, { backgroundColor: kindDotColor(opt.value, c) }]} />
                  <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.sheetInput}
            value={course}
            onChangeText={setCourse}
            placeholder="Course (optional)"
            placeholderTextColor={c.text3}
            testID="calendar-event-course"
          />
          <TextInput
            style={[styles.sheetInput, styles.sheetNoteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Notes (optional)"
            placeholderTextColor={c.text3}
            multiline
            testID="calendar-event-note"
          />
          <View style={styles.sheetActions}>
            {editingExisting ? (
              <Pressable onPress={confirmDelete} disabled={saving} style={styles.deleteBtn} testID="calendar-event-delete">
                <TrashIcon size={15} color={c.danger} />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <MissionButton
              label={saving ? "Saving…" : "Save"}
              variant="primary"
              busy={saving}
              disabled={!canSave}
              onPress={submit}
              testID="calendar-event-save"
            />
          </View>
        </View>
      )}
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    // Wraps the active view for the mode-switch zoom/fade; fills the screen so
    // the FlatList/ScrollView inside stays bounded exactly as before.
    zoomWrap: { flex: 1 },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6), gap: space(4), backgroundColor: c.bg },
    listBody: { paddingHorizontal: space(4), paddingTop: space(1), flexGrow: 1 },

    // Background-refresh failure banner (offline/error) — floats above the
    // active view without shifting its layout.
    errorBanner: {
      position: "absolute",
      left: space(4),
      right: space(4),
      zIndex: 5,
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
    },
    errorBannerText: { ...type.small, color: c.text2, textAlign: "center" },

    monthListBody: { paddingHorizontal: space(4), flexGrow: 1 },
    yearBody: { paddingHorizontal: space(4), flexGrow: 1 },
    yearGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },

    dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(4), paddingBottom: space(2) },
    dayWeekdayWrap: { paddingHorizontal: space(4), paddingBottom: space(2.5) },
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

    // Bottom-right "+" — opposite the ViewSwitcher's bottom-left button.
    addFabWrap: { position: "absolute", right: space(4), alignItems: "flex-end" },
    addFab: { width: FAB_HEIGHT, height: FAB_HEIGHT, borderRadius: FAB_HEIGHT / 2, borderWidth: 1, borderColor: c.line },
    addFabInner: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Event view sheet (agent-authored, read-only).
    viewRow: { flexDirection: "row", alignItems: "baseline", gap: space(2), paddingVertical: space(1.5) },
    viewRowLabel: {
      ...type.micro,
      color: c.text2,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      width: 64,
      flexShrink: 0,
    },
    viewRowValue: { ...type.body, color: c.text, flex: 1 },
    sheetHint: { ...type.small, color: c.text3, marginTop: space(3), marginBottom: space(4) },

    // Event add/edit form sheet.
    sheetError: {
      ...type.small,
      color: c.danger,
      backgroundColor: c.surface2,
      borderRadius: radius.sm,
      padding: space(2.5),
      marginBottom: space(2),
    },
    sheetInput: {
      ...type.body,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      marginBottom: space(2.5),
    },
    sheetRow: { flexDirection: "row", gap: space(2.5) },
    sheetInputFlex: { flex: 1 },
    sheetInputTime: { width: 92 },
    sheetNoteInput: { minHeight: 72, textAlignVertical: "top" },
    kindPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginBottom: space(2.5) },
    kindChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      paddingVertical: space(1.75),
      paddingHorizontal: space(3),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
    },
    kindChipActive: { borderColor: c.accent, backgroundColor: c.accentFaint },
    kindChipDot: { width: 7, height: 7, borderRadius: 3.5 },
    kindChipText: { ...type.small, color: c.text2, fontWeight: "600" },
    kindChipTextActive: { color: c.accent },
    sheetActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(1) },
    deleteBtn: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingVertical: space(2), paddingHorizontal: space(1) },
    deleteBtnText: { ...type.small, color: c.danger, fontWeight: "600" },
  });

type Styles = ReturnType<typeof createStyles>;
