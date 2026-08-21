import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { RefreshControlProps } from "react-native";
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { daySwipeIntent, gridSwipeIntent, type SwipeIntent } from "@/lib/calendar-gestures";
import Svg, { Path } from "react-native-svg";
import { CalendarIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { MonthGrid, WeekdayStripe } from "@/components/month-grid";
import { Skeleton } from "@/components/Skeleton";
import { SlideUpSheet } from "@/components/StudySheet";
import { useShell } from "@/components/AppDrawer";
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
  stepMonth,
  weekDays,
  type AgendaEvent,
  type AgendaEventKind,
} from "@/lib/agenda";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

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
// Monthly shows one focused month with an explicit pager and a selected-day
// agenda. This keeps the page calm and prevents the giant multi-month
// accessibility tree that made VoiceOver lose the entire screen. Yearly lays
// the whole year out as 12 mini month grids, with its own ‹ year › pager.
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

type MonthKey = { year: number; month: number };

// The event create/edit sheet's state — same dispatch as the web calendar's
// DialogState (calendar-workspace.tsx). A third "view" (read-only) arm for
// agent-authored events was removed 2026-07-28; see openEvent.
type EventDialogState =
  | { mode: "add"; date: string }
  | { mode: "edit"; event: AgendaEvent }
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

const FAB_HEIGHT = control.xl;
const FAB_BOTTOM = space(1);
const MENU_GAP = space(3);
const FAB_CLEARANCE = 82;
const DAY_HOUR_HEIGHT = 68;
const CALENDAR_SIDE = space(4);
/** How far a month starts off-centre when it slides in. Deliberately about one
 *  week-row rather than a full grid height: a whole-height throw reads as a page
 *  turn and leaves the card empty for most of the animation, where a short
 *  travel keeps the dates legible the whole way in. */
const MONTH_SLIDE = 64;

function selectedDayForMonth(month: MonthKey): string {
  const now = new Date();
  if (now.getFullYear() === month.year && now.getMonth() === month.month) return dayKeyFromDate(now);
  return `${month.year}-${String(month.month + 1).padStart(2, "0")}-01`;
}

export default function CalendarScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { openDrawer, setImmersive } = useShell();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pullingYears = useRef(new Set<string>());
  const activeUserId = useRef<string | null>(userId);
  const [view, setView] = useState<CalendarView>("monthly");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<EventDialogState>(null);
  activeUserId.current = userId;

  // The one month visible in Monthly.
  const [monthAnchor, setMonthAnchor] = useState<MonthKey>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // Yearly's shown year — independent of Monthly's window, pages by whole years.
  const [shownYear, setShownYear] = useState(() => new Date().getFullYear());

  // The day Daily view is showing — starts on today, paged by its ‹ › arrows.
  const [shownDay, setShownDay] = useState(() => dayKeyFromDate(new Date()));

  // Calendar owns its whole chrome, matching the native iOS app: year/month
  // breadcrumb on the left, search/add on the right, and the bottom Today/view
  // dock. The way back to Nemesis is dragging right, as on every other screen.
  useFocusEffect(
    useCallback(() => {
      setImmersive(true);
      return () => setImmersive(false);
    }, [setImmersive]),
  );

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

  // Monthly's own paging animation, separate from the mode-change zoom above so
  // that stepping month to month never re-plays the whole-view transition.
  // Driven by stepVisibleMonth; the grid's wrapper clips it (monthGridFill has
  // overflow hidden) so a sliding month cannot spill over the weekday stripe.
  const monthSlide = useSharedValue(0);
  const monthFade = useSharedValue(1);
  const monthSlideStyle = useAnimatedStyle(() => ({
    opacity: monthFade.value,
    transform: [{ translateY: monthSlide.value }],
  }));

  const visibleYear =
    view === "yearly"
      ? shownYear
      : view === "monthly"
        ? monthAnchor.year
        : Number(shownDay.slice(0, 4)) || new Date().getFullYear();

  // Fetch only the year on screen. This keeps the indexed query and response
  // bounded even for accounts that accumulate years of courses and deadlines.
  const pull = useCallback(async (uid: string, year: number) => {
    const requestKey = `${uid}:${year}`;
    if (pullingYears.current.has(requestKey)) return;
    pullingYears.current.add(requestKey);
    try {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const rows = await listCalendarEvents(uid, { from, to });
      if (activeUserId.current !== uid) return;
      setEvents((previous) => [
        ...previous.filter((event) => event.date < from || event.date > to),
        ...rows,
      ]);
      setError(null);
    } catch (e) {
      if (activeUserId.current === uid) {
        setError((e as Error).message); // offline/error — the last-cached agenda still renders
      }
    } finally {
      pullingYears.current.delete(requestKey);
      if (activeUserId.current === uid) setLoaded(true);
    }
  }, []);

  // Never carry one account's cached years across an in-place account switch.
  // The subsequent focus/range pulls repopulate only the newly authenticated
  // user's data.
  useEffect(() => {
    setEvents([]);
    setLoaded(false);
    setError(null);
  }, [userId]);

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
      void pull(userId, new Date().getFullYear());
      return () => {
        alive = false;
      };
    }, [userId, pull]),
  );

  useEffect(() => {
    if (!userId) return;
    void pull(userId, visibleYear);
  }, [pull, userId, visibleYear]);

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
    setShownDay(selectedDayForMonth(anchor));
    setView("monthly");
  }, []);

  const stepVisibleMonth = useCallback(
    (delta: number) => {
      // The new month SLIDES in from the side you swiped towards (owner
      // 2026-07-28) instead of hard-cutting. Swiping up asks for the next
      // month, so it enters from below; swiping down brings the previous one
      // down from above. Direction follows the hand, which is what makes a
      // pager feel like paper rather than a slideshow.
      //
      // Set-then-animate on the same shared value is the file's existing idiom
      // (see the mode-change zoom above): the assignment places the grid
      // off-centre for the frame React commits the new month on, and the
      // withTiming carries it home. Opacity floors at 0.4 rather than 0 so the
      // outgoing and incoming months overlap instead of blinking.
      monthSlide.value = delta > 0 ? MONTH_SLIDE : -MONTH_SLIDE;
      monthFade.value = 0.4;
      monthSlide.value = withTiming(0, { duration: 240, easing: ReEasing.out(ReEasing.cubic) });
      monthFade.value = withTiming(1, { duration: 200, easing: ReEasing.out(ReEasing.cubic) });
      setMonthAnchor((current) => {
        const next = stepMonth(current.year, current.month, delta);
        setShownDay(selectedDayForMonth(next));
        return next;
      });
    },
    [monthSlide, monthFade],
  );

  // Opens the add sheet for a brand-new event on the given date (the FAB passes
  // "today"; a day cell passes its own date).
  const openAdd = useCallback((date: string) => setDialog({ mode: "add", date }), []);

  // EVERY event opens the editable sheet, whoever wrote it — same as web. This
  // used to send a source:'agent' row to a read-only sheet that told the student
  // to "ask it to change this", which no tool in AGENT_TOOLS can do. Chat stopped
  // writing that marker on 2026-07-28; rows written before then still carry it,
  // so the read side had to change too or those stay frozen forever.
  const openEvent = useCallback((event: AgendaEvent) => {
    setDialog({ mode: "edit", event });
  }, []);

  const handleSaveEvent = useCallback(
    async (input: CalendarEventInput) => {
      if (!userId || !dialog) return;
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
        style={[styles.pairWrap, { paddingTop: insets.top + space(2), paddingBottom: insets.bottom + space(4) }]}
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

  if (!loaded) {
    return (
      <View style={styles.flex} testID="calendar-loading">
        <CalendarSkeleton
          view={view}
          styles={styles}
          contentTop={insets.top + space(2)}
          contentBottom={insets.bottom + space(4)}
        />
      </View>
    );
  }

  const todayKey = dayKeyFromDate(new Date());
  const dayEvents = eventsForDay(events, shownDay);
  const [sdY, sdM] = shownDay.split("-").map(Number);

  const monthView = monthMatrix(monthAnchor.year, monthAnchor.month, events, todayKey);
  const shownWeek = weekDays(events, shownDay, todayKey);
  const monthRowHeight = Math.max(
    74,
    Math.floor(
      (screenHeight - insets.top - insets.bottom - 56 - 82 - 24 - 74) /
        monthView.weeks.length,
    ),
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = normalizedSearch
    ? events.filter((event) =>
        [event.title, event.course, event.note, event.date, event.time]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
      )
    : [];

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={c.text2}
      onRefresh={() => {
        setRefreshing(true);
        void pull(userId, visibleYear).finally(() => setRefreshing(false));
      }}
    />
  );

  const today = new Date();
  const returnToToday = () => {
    const key = dayKeyFromDate(today);
    setShownDay(key);
    setMonthAnchor({ year: today.getFullYear(), month: today.getMonth() });
    setShownYear(today.getFullYear());
    setView("monthly");
  };
  // Gestures (owner 2026-07-27). Horizontal on the month and year grids is the
  // SIDEBAR now, not the period: dragging rightward used to jump a month and the
  // drawer had no way in from this tab at all. The period moves vertically instead.
  // Day view keeps a horizontal flick because the day IS the thing you page
  // through, but only from the right two thirds -- the left third stays the
  // sidebar's, so there is always a way out. Rules live in lib/calendar-gestures.
  const applyGrid = (intent: SwipeIntent, step: (direction: 1 | -1) => void) => {
    if (intent === "sidebar") openDrawer();
    else if (intent === "next") step(1);
    else if (intent === "prev") step(-1);
  };
  const monthSwipe = Gesture.Pan()
    .runOnJS(true)
    // Both axes activate: horizontal reaches the sidebar, vertical the month.
    .activeOffsetX([-18, 18])
    .activeOffsetY([-18, 18])
    .onEnd((event) => {
      applyGrid(
        gridSwipeIntent(event.translationX, event.translationY, event.velocityX, event.velocityY),
        stepVisibleMonth,
      );
    });
  const yearSwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-18, 18])
    .activeOffsetY([-18, 18])
    .onEnd((event) => {
      applyGrid(
        gridSwipeIntent(event.translationX, event.translationY, event.velocityX, event.velocityY),
        (direction) => setShownYear((year) => year + direction),
      );
    });
  const daySwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onEnd((event) => {
      // Where the finger went DOWN, derived rather than tracked in a ref: the
      // current x minus how far it has travelled is exactly the start.
      const startX = event.x - event.translationX;
      const intent = daySwipeIntent(startX, screenWidth, event.translationX, event.velocityX);
      if (intent === "sidebar") {
        openDrawer();
        return;
      }
      if (intent === "none") return;
      const [year, month, day] = shownDay.split("-").map(Number);
      const next = new Date(year, (month || 1) - 1, (day || 1) + (intent === "next" ? 1 : -1));
      setShownDay(dayKeyFromDate(next));
      setMonthAnchor({ year: next.getFullYear(), month: next.getMonth() });
    });
  const monthName = monthView.label.replace(` ${monthView.year}`, "");
  const shownDayMonthName = new Date(sdY, (sdM || 1) - 1, 1).toLocaleDateString(undefined, { month: "long" });

  return (
    <View style={styles.flex} testID="calendar-screen">
      {/* Background refresh failed (e.g. offline) — the last-loaded events still
          render underneath; this just says why nothing newer showed up. */}
      {error ? (
        <View style={[styles.errorBanner, { top: insets.top + 58 }]} pointerEvents="none" testID="calendar-error">
          <Text style={styles.errorBannerText} numberOfLines={2}>Couldn't refresh: {error}</Text>
        </View>
      ) : null}
      <AppleCalendarHeader
        view={view}
        monthName={view === "daily" ? shownDayMonthName : monthName}
        year={view === "yearly" ? shownYear : view === "monthly" ? monthAnchor.year : sdY}
        onBack={() => {
          if (view === "daily") {
            setMonthAnchor({ year: sdY, month: (sdM || 1) - 1 });
            setView("monthly");
          } else if (view === "monthly") {
            setShownYear(monthAnchor.year);
            setView("yearly");
          }
        }}
        onSearch={() => setSearchOpen((open) => !open)}
        onAdd={() => openAdd(view === "yearly" ? todayKey : shownDay)}
        top={insets.top}
        styles={styles}
      />

      {searchOpen ? (
        <CalendarSearch
          query={searchQuery}
          results={searchResults}
          top={insets.top + 66}
          bottom={insets.bottom + FAB_CLEARANCE}
          onChange={setSearchQuery}
          onOpen={(event) => {
            setShownDay(event.date);
            setMonthAnchor({ year: Number(event.date.slice(0, 4)), month: Number(event.date.slice(5, 7)) - 1 });
            setSearchOpen(false);
            setView("daily");
          }}
          styles={styles}
        />
      ) : (
        <Reanimated.View style={[styles.zoomWrap, contentAnimStyle]}>
          {view === "monthly" ? (
            <View style={[styles.flex, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + FAB_CLEARANCE }]} testID="calendar-monthly-view">
              <View style={styles.monthTitleRow}>
                <Text style={styles.monthTitle}>{monthName}</Text>
              </View>
              <View style={styles.monthWeekdays}>
                <WeekdayStripe flush />
              </View>
              <GestureDetector gesture={monthSwipe}>
                {/* The gesture stays on the OUTER view, which never moves: a
                    detector on the sliding child would be chasing a target that
                    is mid-animation when the next swipe starts. */}
                <View style={styles.monthGridFill} testID="calendar-month-card">
                  <Reanimated.View style={[styles.flex, monthSlideStyle]}>
                    <MonthGrid
                      month={monthView}
                      size="large"
                      events={events}
                      rowHeight={monthRowHeight}
                      showLabel={false}
                      showWeekdays={false}
                      onSelectDay={goToDay}
                    />
                  </Reanimated.View>
                </View>
              </GestureDetector>
            </View>
          ) : null}

          {view === "yearly" ? (
            <GestureDetector gesture={yearSwipe}>
              <ScrollView
                testID="calendar-yearly-view"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.yearBody,
                  { paddingTop: insets.top + 76, paddingBottom: insets.bottom + FAB_CLEARANCE },
                ]}
                refreshControl={refreshControl}
              >
                {/* ‹ 2026 › — the pager this file's header has claimed since
                    the view was built, and which until now did not exist
                    (owner 2026-08-01: "users cannot scroll to other years").
                    Nothing was ever CAPPED: stepMonth rolls the year over in
                    both directions and setShownYear has no bound, so every year
                    forwards and backwards was already reachable. The only way
                    there was a vertical swipe with nothing on screen to suggest
                    it, which is indistinguishable from a wall. The swipe still
                    works; this makes it visible. */}
                <View style={styles.yearHeadRow}>
                  <Pressable
                    style={({ pressed }) => [styles.yearStep, pressed && styles.yearStepPressed]}
                    onPress={() => setShownYear((year) => year - 1)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${shownYear - 1}`}
                    testID="calendar-year-prev"
                  >
                    <BackChevronIcon color={c.text2} />
                  </Pressable>
                  <Text style={styles.yearTitle}>{shownYear}</Text>
                  <Pressable
                    style={({ pressed }) => [styles.yearStep, styles.yearStepNext, pressed && styles.yearStepPressed]}
                    onPress={() => setShownYear((year) => year + 1)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${shownYear + 1}`}
                    testID="calendar-year-next"
                  >
                    <BackChevronIcon color={c.text2} />
                  </Pressable>
                </View>
                <View style={styles.yearRule} />
                <View style={styles.yearGrid}>
                  {Array.from({ length: 12 }, (_, m) => (
                    <MonthGrid
                      key={m}
                      month={monthMatrix(shownYear, m, events, todayKey)}
                      size="mini"
                      miniColumns={3}
                      selectedKey={todayKey}
                      onSelectMonth={goToMonth}
                    />
                  ))}
                </View>
              </ScrollView>
            </GestureDetector>
          ) : null}

          {view === "daily" ? (
            <GestureDetector gesture={daySwipe}>
              <View style={[styles.flex, { paddingTop: insets.top + 64 }]} testID="calendar-day-view">
                <AppleWeekStrip
                  days={shownWeek}
                  selectedKey={shownDay}
                  onSelect={(dayKey) => {
                    setShownDay(dayKey);
                    const [year, month] = dayKey.split("-").map(Number);
                    setMonthAnchor({ year, month: (month || 1) - 1 });
                  }}
                  styles={styles}
                />
                <View style={styles.dailyDateRule}>
                  <Text style={styles.dailyDateTitle}>{fullDayLabel(shownDay)}</Text>
                </View>
                <DayTimeline
                  dayKey={shownDay}
                  events={dayEvents}
                  bottom={insets.bottom + FAB_CLEARANCE}
                  onOpen={openEvent}
                  refreshControl={refreshControl}
                  styles={styles}
                />
              </View>
            </GestureDetector>
          ) : null}
        </Reanimated.View>
      )}

      {menuOpen ? (
        <CalendarViewMenu
          view={view}
          bottom={insets.bottom + FAB_BOTTOM + FAB_HEIGHT + MENU_GAP}
          onSelect={(next) => {
            if (next === "yearly") {
              setShownYear(view === "monthly" ? monthAnchor.year : sdY);
            } else if (next === "monthly" && view === "daily") {
              setMonthAnchor({ year: sdY, month: (sdM || 1) - 1 });
            }
            setView(next);
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
          styles={styles}
        />
      ) : null}

      <CalendarBottomDock
        bottom={insets.bottom + FAB_BOTTOM}
        onToday={returnToToday}
        onViews={() => setMenuOpen((open) => !open)}
        styles={styles}
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

// Loading skeleton (replaces the old blank View while `loaded` is still false —
// see the useFocusEffect above), shaped to whichever view is about to render.
// `view` already carries its default ("monthly") this early — nothing else could
// have switched it yet, since the view-switcher itself only appears once real
// content has rendered.
function CalendarSkeleton({
  view,
  styles,
  contentTop,
  contentBottom,
}: {
  view: CalendarView;
  styles: Styles;
  contentTop: number;
  contentBottom: number;
}) {
  if (view === "daily") {
    return (
      <View style={{ paddingTop: contentTop + space(2) }} testID="calendar-skeleton">
        <View style={styles.dayNav}>
          <Skeleton width={20} height={20} radius={10} />
          <Skeleton width={140} height={22} />
          <Skeleton width={20} height={20} radius={10} />
        </View>
        <View style={[styles.dayWeekdayWrap, styles.skeletonWeekdayRow]}>
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} width={16} height={12} />
          ))}
        </View>
        <View style={[styles.listBody, { paddingBottom: contentBottom }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.eventCard}>
              <Skeleton width={8} height={8} radius={4} style={styles.skeletonDot} />
              <View style={styles.eventText}>
                <Skeleton width="70%" height={16} />
                <Skeleton width="40%" height={12} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (view === "yearly") {
    return (
      <View style={[styles.yearBody, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]} testID="calendar-skeleton">
        <View style={styles.dayNav}>
          <Skeleton width={20} height={20} radius={10} />
          <Skeleton width={70} height={22} />
          <Skeleton width={20} height={20} radius={10} />
        </View>
        <View style={styles.yearGrid}>
          {Array.from({ length: 12 }, (_, i) => (
            <View key={i} style={styles.skeletonMiniCard}>
              <Skeleton width="55%" height={12} style={styles.skeletonMiniLabel} />
              <Skeleton width="100%" height={64} radius={radius.sm} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Monthly (also the default before real data has decided otherwise).
  return (
    <View style={[styles.monthBody, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]} testID="calendar-skeleton">
      {[0, 1].map((i) => (
        <View key={i} style={styles.skeletonMonthCard}>
          <Skeleton width={150} height={26} style={styles.skeletonMonthLabel} />
          <View style={styles.skeletonWeekdayRow}>
            {Array.from({ length: 7 }, (_, wd) => (
              <Skeleton key={wd} width={16} height={12} />
            ))}
          </View>
          {[0, 1, 2, 3, 4].map((week) => (
            <View key={week} style={styles.skeletonDayRow}>
              {Array.from({ length: 7 }, (_, day) => (
                <Skeleton key={day} width={32} height={32} radius={16} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BackChevronIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="m14.8 4.5-7.5 7.5 7.5 7.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}



function AppleCalendarHeader({
  view,
  monthName,
  year,
  onBack,
  onSearch,
  onAdd,
  top,
  styles,
}: {
  view: CalendarView;
  monthName: string;
  year: number;
  onBack: () => void;
  onSearch: () => void;
  onAdd: () => void;
  top: number;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  const backLabel = view === "daily" ? monthName : String(year);
  return (
    <View style={[styles.appleHeader, { paddingTop: top + space(1.5) }]} testID="calendar-apple-header">
      {/* 🔴 NO BREADCRUMB CHIP (owner 2026-08-20, circling it on a screenshot). The top-left used
          to carry a `‹ 2026` / `‹ August` glass pill that zoomed out one level. It is gone in
          every view, not just Yearly: the bottom dock's view button already moves between
          Daily / Monthly / Yearly and NAMES the view you are in, so the chip was a second control
          for a subset of the same job — the same reasoning that removed the two-squares button
          from the right side on 2026-08-01. The spacer stays so the right-hand actions keep the
          exact position they hold today; without it they would slide left into the gap.
          THE CONTROL GOES, NOT THE FEATURE: `onBack` and its zoom-out logic are untouched below. */}
      <View style={styles.headerLeftSpacer} />
      <GlassSurface style={styles.headerActionsGlass} fallbackColor={c.glassPanel} shadow>
        <View style={styles.headerActions}>
          {/* No day/month toggle here (owner 2026-08-01: "remove the upper right
              icon that looks like 2 squares"). THE CONTROL GOES, NOT THE
              FEATURE — the bottom dock's view button opens Daily/Monthly/Yearly,
              which is a superset of what this button did (it only flipped
              between two of the three) and says which view you are in. */}
          <Pressable style={styles.headerIconButton} onPress={onSearch} accessibilityLabel="Search calendar">
            <SearchIcon size={23} color={c.text} strokeWidth={1.9} />
          </Pressable>
          <Pressable style={styles.headerIconButton} onPress={onAdd} accessibilityLabel="Add event">
            <PlusIcon size={24} color={c.text} strokeWidth={1.9} />
          </Pressable>
        </View>
      </GlassSurface>
    </View>
  );
}

function CalendarSearch({
  query,
  results,
  top,
  bottom,
  onChange,
  onOpen,
  styles,
}: {
  query: string;
  results: AgendaEvent[];
  top: number;
  bottom: number;
  onChange: (query: string) => void;
  onOpen: (event: AgendaEvent) => void;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.searchPage, { paddingTop: top, paddingBottom: bottom }]} testID="calendar-search">
      <View style={styles.searchInputWrap}>
        <SearchIcon size={19} color={c.textHint} />
        <TextInput
          value={query}
          onChangeText={onChange}
          autoFocus
          placeholder="Search events"
          placeholderTextColor={c.textHint}
          style={styles.searchInput}
          testID="calendar-search-input"
        />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {results.map((event) => (
          <Pressable key={event.id} style={styles.searchResult} onPress={() => onOpen(event)}>
            <Text style={styles.searchResultTitle}>{event.title}</Text>
            <Text style={styles.searchResultMeta}>{[event.date, event.time, event.course].filter(Boolean).join(" · ")}</Text>
          </Pressable>
        ))}
        {query.trim() && results.length === 0 ? <Text style={styles.searchEmpty}>No matching events.</Text> : null}
      </ScrollView>
    </View>
  );
}

function AppleWeekStrip({
  days,
  selectedKey,
  onSelect,
  styles,
}: {
  days: ReturnType<typeof weekDays>;
  selectedKey: string;
  onSelect: (key: string) => void;
  styles: Styles;
}) {
  return (
    <View style={styles.appleWeekStrip} testID="calendar-day-week">
      {days.map((day) => {
        const selected = day.key === selectedKey;
        return (
          <Pressable key={day.key} style={styles.appleWeekDay} onPress={() => onSelect(day.key)}>
            <Text style={styles.appleWeekdayLetter}>{day.label.slice(0, 1)}</Text>
            <View style={[styles.appleWeekNumberWrap, selected && (day.isToday ? styles.appleWeekToday : styles.appleWeekSelected)]}>
              <Text style={[styles.appleWeekNumber, selected && styles.appleWeekNumberSelected]}>{day.day}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const DAY_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fullDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const value = new Date(year, (month || 1) - 1, day || 1);
  return `${DAY_NAMES[value.getDay()]} – ${DAY_MONTHS[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}`;
}

function minutesForTime(value?: string): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
  const suffix = match[3]?.toLowerCase();
  if (suffix) {
    if (hour > 12 || hour === 0) return null;
    if (hour === 12) hour = 0;
    if (suffix === "pm") hour += 12;
  }
  return hour * 60 + minute;
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "Noon";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function DayTimeline({
  dayKey,
  events,
  bottom,
  onOpen,
  refreshControl,
  styles,
}: {
  dayKey: string;
  events: AgendaEvent[];
  bottom: number;
  onOpen: (event: AgendaEvent) => void;
  refreshControl: ReactElement<RefreshControlProps>;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const positioned = events.flatMap((event) => {
    const minute = minutesForTime(event.time);
    return minute === null ? [] : [{ event, minute }];
  });
  const allDay = events.filter((event) => minutesForTime(event.time) === null);
  const todayKey = dayKeyFromDate(new Date());
  const current = new Date();
  const nowMinutes = current.getHours() * 60 + current.getMinutes();
  const nowHour = current.getHours();
  const eventColor: Record<AgendaEventKind, string> = {
    assignment: c.warn,
    class: c.info,
    exam: c.danger,
    other: c.text2,
    rotation: c.accent,
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const targetHour = dayKey === todayKey ? Math.max(0, nowHour - 2) : 6;
      scrollRef.current?.scrollTo({ y: targetHour * DAY_HOUR_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [dayKey, nowHour, todayKey]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.timelineScroll}
      contentContainerStyle={{ paddingBottom: bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      testID="calendar-day-timeline"
    >
      {allDay.length > 0 ? (
        <View style={styles.allDaySection}>
          <Text style={styles.allDayLabel}>all-day</Text>
          <View style={styles.allDayEvents}>
            {allDay.map((event) => (
              <Pressable key={event.id} onPress={() => onOpen(event)} style={[styles.allDayEvent, { borderLeftColor: eventColor[event.kind] }]}>
                <Text style={styles.allDayEventTitle} numberOfLines={1}>{event.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={[styles.timelineCanvas, { height: DAY_HOUR_HEIGHT * 24 }]}>
        {Array.from({ length: 24 }, (_, hour) => (
          <View key={hour} style={[styles.hourRow, { top: hour * DAY_HOUR_HEIGHT, height: DAY_HOUR_HEIGHT }]}>
            <Text style={styles.hourLabel}>{hourLabel(hour)}</Text>
            <View style={styles.hourRule} />
          </View>
        ))}
        {dayKey === todayKey ? (
          <View style={[styles.nowLine, { top: (nowMinutes / 60) * DAY_HOUR_HEIGHT }]}>
            <View style={styles.nowDot} />
            <View style={styles.nowRule} />
          </View>
        ) : null}
        {positioned.map(({ event, minute }) => (
          <Pressable
            key={event.id}
            onPress={() => onOpen(event)}
            style={[
              styles.timelineEvent,
              {
                top: (minute / 60) * DAY_HOUR_HEIGHT + 2,
                borderLeftColor: eventColor[event.kind],
                backgroundColor: c.surface2,
              },
            ]}
          >
            <Text style={styles.timelineEventTitle} numberOfLines={1}>{event.title}</Text>
            <Text style={styles.timelineEventMeta} numberOfLines={1}>{[event.time, event.course].filter(Boolean).join(" · ")}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function CalendarViewMenu({
  view,
  bottom,
  onSelect,
  onClose,
  styles,
}: {
  view: CalendarView;
  bottom: number;
  onSelect: (view: CalendarView) => void;
  onClose: () => void;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close view menu" />
      <View style={[styles.menuPanelWrap, { bottom }]} testID="calendar-view-menu">
        <GlassSurface style={styles.menuPanel} fallbackColor={c.glassMenu} opaque shadow>
          {VIEW_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={styles.menuItem}
              testID={`calendar-view-${option.id}`}
            >
              <Text style={[styles.menuItemText, view === option.id && styles.menuItemTextActive]}>{option.label}</Text>
              {view === option.id ? <View style={styles.menuItemDot} /> : null}
            </Pressable>
          ))}
        </GlassSurface>
      </View>
    </>
  );
}

function CalendarBottomDock({
  bottom,
  onToday,
  onViews,
  styles,
}: {
  bottom: number;
  onToday: () => void;
  onViews: () => void;
  styles: Styles;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.bottomDock, { bottom }]} pointerEvents="box-none">
      <GlassSurface style={styles.todayGlass} fallbackColor={c.glassPanel} shadow>
        <Pressable style={styles.todayButton} onPress={onToday} accessibilityLabel="Today" testID="calendar-today">
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </GlassSurface>
      <GlassSurface style={styles.bottomActionsGlass} fallbackColor={c.glassPanel} shadow>
        <View style={styles.bottomActions}>
          <Pressable style={styles.bottomAction} onPress={onViews} accessibilityLabel="Change calendar view" testID="calendar-view-fab">
            <CalendarIcon size={21} color={c.text} strokeWidth={1.8} />
          </Pressable>
          {/* No inbox button (owner 2026-08-01: "remove the inbox icon in
              calendar"). THE CONTROL GOES, NOT THE FEATURE — the sidebar still
              opens by dragging right from anywhere on the grid, which is how
              every other screen in the app opens it and what gridSwipeIntent /
              daySwipeIntent already answer "sidebar" for. This button was the
              calendar's own second way in. */}
        </View>
      </GlassSurface>
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
  const sheetTitle = !dialog ? "" : editingExisting ? "Edit event" : "Add event";
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
      <View testID="calendar-event-form">
        {error ? <Text style={styles.sheetError}>{error}</Text> : null}
        <TextInput
          style={styles.sheetInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={c.textHint}
          testID="calendar-event-title"
        />
        <View style={styles.sheetRow}>
          <TextInput
            style={[styles.sheetInput, styles.sheetInputFlex]}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={c.textHint}
            autoCapitalize="none"
            autoCorrect={false}
            testID="calendar-event-date"
          />
          <TextInput
            style={[styles.sheetInput, styles.sheetInputTime]}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor={c.textHint}
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
          placeholderTextColor={c.textHint}
          testID="calendar-event-course"
        />
        <TextInput
          style={[styles.sheetInput, styles.sheetNoteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="Notes (optional)"
          placeholderTextColor={c.textHint}
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
    appleHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: CALENDAR_SIDE,
      paddingBottom: space(1.5),
    },
    headerLeftSpacer: { width: 92, height: control.lg },
    headerBackGlass: { borderRadius: radius.pill },
    headerBack: {
      height: control.lg,
      minWidth: 92,
      paddingHorizontal: space(2.5),
      flexDirection: "row",
      alignItems: "center",
      gap: space(1),
    },
    headerBackText: { ...type.title, color: c.text, fontWeight: "600" },
    headerActionsGlass: { borderRadius: radius.pill },
    headerActions: { flexDirection: "row", alignItems: "center", height: control.lg },
    headerIconButton: { width: control.lg, height: control.lg, alignItems: "center", justifyContent: "center" },

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

    monthBody: { paddingHorizontal: space(4), flexGrow: 1 },
    monthTitleRow: {
      height: 74,
      justifyContent: "flex-end",
      paddingHorizontal: CALENDAR_SIDE,
      paddingBottom: space(2),
    },
    monthTitle: {
      fontSize: 46,
      lineHeight: 52,
      fontWeight: "700",
      letterSpacing: -1.4,
      color: c.text,
    },
    monthWeekdays: { paddingHorizontal: CALENDAR_SIDE, height: 24, justifyContent: "center" },
    // overflow hidden CLIPS the paging slide (monthSlideStyle) — without it the
    // incoming month is visible riding up over the weekday stripe.
    monthGridFill: { flex: 1, overflow: "hidden", paddingHorizontal: CALENDAR_SIDE },
    monthPager: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: space(3),
    },
    monthPagerCenter: { flex: 1, alignItems: "flex-start" },
    monthPagerActions: { flexDirection: "row", alignItems: "center", gap: space(1) },
    monthPagerLabel: { fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.7, color: c.text },
    monthToday: { ...type.small, color: c.danger, fontWeight: "600", paddingHorizontal: space(1.5) },
    monthCard: {
      paddingTop: space(1),
      paddingBottom: 0,
    },
    // The docked day list.
    dayPanel: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
      zIndex: 6,
    },
    dayPanelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingTop: space(3),
      paddingBottom: space(2),
    },
    dayPanelHeaderPressed: { opacity: 0.6 },
    dayPanelTitle: { ...type.bodyStrong, color: c.text },
    dayPanelCount: { ...type.small, color: c.text3 },
    // FAB_CLEARANCE at the foot: the add button and the view switcher float
    // over this panel's lower corners, and an event row hiding behind either
    // one would be unreadable and un-tappable.
    dayPanelBody: { paddingHorizontal: space(4), paddingBottom: FAB_CLEARANCE },
    dayPanelEmpty: { ...type.small, color: c.text3, paddingVertical: space(2) },
    yearBody: { paddingHorizontal: CALENDAR_SIDE, flexGrow: 1 },
    // The year sits between its two chevrons rather than flush left, because a
    // pager whose control is at one end and whose label is at the other reads as
    // two unrelated things.
    yearHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    yearTitle: {
      fontSize: 44,
      lineHeight: 52,
      fontWeight: "700",
      letterSpacing: -1.2,
      color: c.danger,
    },
    yearStep: { paddingHorizontal: space(2), paddingVertical: space(2) },
    // One chevron asset, mirrored — the app ships a back chevron and no forward
    // one, and a scaleX flip is exact where a second hand-drawn path would drift.
    yearStepNext: { transform: [{ scaleX: -1 }] },
    yearStepPressed: { opacity: 0.5 },
    yearRule: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginBottom: space(3) },
    yearGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" },

    searchPage: { flex: 1, paddingHorizontal: CALENDAR_SIDE, backgroundColor: c.bg },
    searchInputWrap: {
      height: control.lg,
      borderRadius: radius.pill,
      backgroundColor: c.surface2,
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      paddingHorizontal: space(3),
      marginBottom: space(3),
    },
    searchInput: { ...type.body, color: c.text, flex: 1, paddingVertical: 0 },
    searchResult: {
      paddingVertical: space(3),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    searchResultTitle: { ...type.bodyStrong, color: c.text },
    searchResultMeta: { ...type.small, color: c.textHint },
    searchEmpty: { ...type.body, color: c.textHint, textAlign: "center", paddingTop: space(10) },

    appleWeekStrip: {
      flexDirection: "row",
      paddingHorizontal: CALENDAR_SIDE,
      paddingBottom: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    appleWeekDay: { flex: 1, alignItems: "center", gap: space(1) },
    appleWeekdayLetter: { ...type.micro, color: c.textHint, fontWeight: "600" },
    appleWeekNumberWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    appleWeekSelected: { backgroundColor: c.text },
    appleWeekToday: { backgroundColor: c.danger },
    appleWeekNumber: { ...type.title, color: c.text, fontWeight: "500" },
    appleWeekNumberSelected: { color: c.bg, fontWeight: "600" },
    dailyDateRule: {
      height: 52,
      justifyContent: "center",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    dailyDateTitle: { ...type.title, color: c.text, fontWeight: "600" },
    timelineScroll: { flex: 1 },
    allDaySection: {
      minHeight: 48,
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
      paddingVertical: space(1),
    },
    allDayLabel: { ...type.micro, color: c.textHint, width: 66, textAlign: "right", paddingRight: space(2), paddingTop: space(1) },
    allDayEvents: { flex: 1, gap: 2, paddingRight: CALENDAR_SIDE },
    allDayEvent: { minHeight: 28, borderLeftWidth: 3, backgroundColor: c.surface2, borderRadius: radius.sm, justifyContent: "center", paddingHorizontal: space(2) },
    allDayEventTitle: { ...type.small, color: c.text, fontWeight: "600" },
    timelineCanvas: { position: "relative" },
    hourRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "flex-start" },
    hourLabel: { ...type.micro, color: c.textHint, width: 66, textAlign: "right", paddingRight: space(2), transform: [{ translateY: -8 }] },
    hourRule: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, flex: 1, marginRight: CALENDAR_SIDE },
    timelineEvent: {
      position: "absolute",
      left: 72,
      right: CALENDAR_SIDE,
      minHeight: 52,
      borderLeftWidth: 4,
      borderRadius: radius.sm,
      paddingHorizontal: space(2),
      paddingVertical: space(1),
    },
    timelineEventTitle: { ...type.small, color: c.text, fontWeight: "700" },
    timelineEventMeta: { ...type.micro, color: c.textHint },
    nowLine: { position: "absolute", left: 61, right: CALENDAR_SIDE, flexDirection: "row", alignItems: "center", zIndex: 3 },
    nowDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: c.danger },
    nowRule: { height: 1.5, backgroundColor: c.danger, flex: 1 },

    // Loading skeleton (CalendarSkeleton) — mirrors monthListBody/yearGrid's own
    // rhythm so the placeholder settles into the exact spot the real grid lands in.
    skeletonMonthCard: { marginBottom: space(6) },
    skeletonMonthLabel: { marginBottom: space(3) },
    skeletonWeekdayRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: space(2.5) },
    skeletonDayRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: space(3) },
    skeletonMiniCard: { width: "48%", marginBottom: space(5) },
    skeletonMiniLabel: { alignSelf: "center", marginBottom: space(1.5) },
    skeletonDot: { marginTop: 7 },

    dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(4), paddingBottom: space(2) },
    dayWeekdayWrap: { paddingHorizontal: space(4), paddingBottom: space(2.5) },
    arrow: { fontSize: 26, lineHeight: 30, color: c.text2, paddingHorizontal: space(2) },
    dayNavLabel: { ...type.h2, color: c.text },

    eventCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(3),
      paddingVertical: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    kindDot: { width: 4, height: 38, borderRadius: 2, marginTop: 1 },
    eventText: { flex: 1, minWidth: 0, gap: 2 },
    eventTitle: { ...type.bodyStrong, color: c.text },
    eventMeta: { ...type.small, color: c.text2 },
    eventNote: { ...type.small, color: c.text3 },
    emptyWrap: { paddingTop: space(10) },

    bottomDock: {
      position: "absolute",
      left: CALENDAR_SIDE,
      right: CALENDAR_SIDE,
      zIndex: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    todayGlass: { borderRadius: radius.pill },
    todayButton: { height: FAB_HEIGHT, minWidth: 92, paddingHorizontal: space(4), alignItems: "center", justifyContent: "center" },
    todayText: { ...type.title, color: c.text, fontWeight: "600" },
    bottomActionsGlass: { borderRadius: radius.pill },
    bottomActions: { height: FAB_HEIGHT, flexDirection: "row", alignItems: "center" },
    bottomAction: { width: 58, height: FAB_HEIGHT, alignItems: "center", justifyContent: "center" },

    menuPanelWrap: { position: "absolute", right: CALENDAR_SIDE, width: 184, zIndex: 40 },
    menuPanel: { borderRadius: radius.lg, paddingVertical: space(1) },
    menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(2.75), paddingHorizontal: space(3.5) },
    menuItemPressed: { backgroundColor: c.surface2 },
    menuItemText: { ...type.body, color: c.text2, fontWeight: "600" },
    menuItemTextActive: { color: c.accent },
    menuItemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },

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
