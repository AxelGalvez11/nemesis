import { Pressable, StyleSheet, Text, View } from "react-native";
import { monthMatrix, type AgendaEventKind, type MonthCell, type MonthView } from "@/lib/agenda";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The month grid, in two sizes: "large" powers Monthly's continuous vertical
// scroll (calendar.tsx stacks many of these in a FlatList); "mini" powers
// Yearly's 12-up grid. Sunday-first, built from monthMatrix: today gets an
// accent ring, each in-month day with events gets a dot colored by its top
// event kind. Read-only data, but every day cell is tappable (onSelectDay) —
// owner ask: tapping any day, in either size, jumps straight to that day's
// Daily agenda. Mini cards also accept onSelectMonth so tapping a month's own
// name zooms into its full-size Monthly card. Self-styled so it renders in
// isolation (used by the Calendar screen).
//
// The "large" block below uses EXPLICIT fixed heights everywhere (no
// intrinsic/padding-derived sizing) so calendar.tsx's FlatList can compute
// each card's exact height via monthCardHeight() and jump straight to today's
// month on open — no on-device measurement pass, no scroll jank.

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const LARGE_LABEL_H = 40;
const LARGE_WEEKDAY_H = 24;
const LARGE_ROW_H = 58;
const LARGE_CARD_GAP = space(8);

/** Total rendered height of one "large" month card, given its week-row count
 *  (4, 5, or 6 — monthMatrix decides). Must stay in lockstep with the
 *  `*Large` styles below; calendar.tsx uses this for FlatList's getItemLayout. */
export function monthCardHeight(weeksCount: number, showWeekdays = true): number {
  return LARGE_LABEL_H + (showWeekdays ? LARGE_WEEKDAY_H : 0) + weeksCount * LARGE_ROW_H + LARGE_CARD_GAP;
}

function kindColors(c: ThemeColors): Record<AgendaEventKind, string> {
  return { assignment: c.warn, class: c.info, exam: c.danger, other: c.text2, rotation: c.accent };
}

export type MonthGridSize = "large" | "mini";

export function MonthGrid({
  month,
  size = "large",
  selectedKey,
  showWeekdays = true,
  onSelectDay,
  onSelectMonth,
}: {
  month: MonthView;
  /** "large" (Monthly's scroll, bigger cells) | "mini" (Yearly's 12-up grid). */
  size?: MonthGridSize;
  /** The day currently being shown below the grid (owner 2026-07-24: the
   *  calendar "needs to look more like apple calendar"). Apple keeps you in the
   *  month and lists the chosen day's events underneath, so a day has to be able
   *  to look CHOSEN — before this, tapping a day left the month view entirely
   *  and nothing on the grid was ever marked. */
  selectedKey?: string;
  /** Draw this card's own "S M T W T F S" row. Monthly turns it OFF because it
   *  pins ONE such row above the whole scroll (calendar.tsx); leaving both on
   *  put two identical rows on screen at once. Whatever this is set to,
   *  monthCardHeight must be called with the SAME value or the FlatList's
   *  getItemLayout offsets drift a row per month. */
  showWeekdays?: boolean;
  /** Choose a day — wired into every cell when provided. */
  onSelectDay?: (dayKey: string) => void;
  /** Mini only: jump to the full-size Monthly view centered on this month. */
  onSelectMonth?: (year: number, month: number) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const dotColor = kindColors(c);
  const mini = size === "mini";
  const shortLabel = month.label.split(" ")[0].slice(0, 3);
  const testId = mini ? `calendar-mini-month-${month.year}-${month.month}` : "calendar-month";

  return (
    <View style={mini ? styles.cardMini : styles.cardLarge} testID={testId}>
      {mini && onSelectMonth ? (
        <Pressable onPress={() => onSelectMonth(month.year, month.month)} hitSlop={4} testID={`${testId}-label`}>
          <Text style={styles.labelMini}>{shortLabel}</Text>
        </Pressable>
      ) : (
        <View style={mini ? styles.labelWrapMini : styles.labelWrapLarge}>
          <Text style={mini ? styles.labelMini : styles.labelLarge}>{mini ? shortLabel : month.label}</Text>
        </View>
      )}

      {mini || !showWeekdays ? null : (
        <View style={styles.weekdayRowLarge}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.weekdayLarge}>{label}</Text>
          ))}
        </View>
      )}

      {month.weeks.map((week, wi) => (
        <View key={wi} style={mini ? styles.weekRowMini : styles.weekRowLarge}>
          {week.map((cell) => (
            <DayCell
              key={cell.key}
              cell={cell}
              styles={styles}
              dotColor={dotColor}
              mini={mini}
              // inMonth guard: a month grid pads its first and last rows with
              // the neighbouring months' days, so the same date can appear
              // twice on screen — once as its own month's cell and once as a
              // pad cell. Without this, choosing such a day drew TWO filled
              // discs.
              selected={cell.inMonth && cell.key === selectedKey}
              onSelectDay={onSelectDay}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  cell,
  styles,
  dotColor,
  mini,
  selected,
  onSelectDay,
}: {
  cell: MonthCell;
  styles: ReturnType<typeof createStyles>;
  dotColor: Record<AgendaEventKind, string>;
  mini: boolean;
  selected: boolean;
  onSelectDay?: (dayKey: string) => void;
}) {
  const showDot = cell.inMonth && cell.eventCount > 0;
  // Apple's exact three-way treatment, which is what makes the grid readable at
  // a glance: TODAY is an accent-coloured number; the day you have SELECTED is
  // a filled circle; today-while-selected is a filled ACCENT circle. Only one
  // day is ever filled, so "where am I" and "what is today" never compete.
  const filled = selected;
  const inner = (
    <>
      <View
        style={[
          mini ? styles.dayInnerMini : styles.dayInnerLarge,
          filled && (cell.isToday ? styles.dayToday : styles.daySelected),
        ]}
      >
        <Text
          style={[
            mini ? styles.dayNumMini : styles.dayNumLarge,
            !cell.inMonth && styles.dayOut,
            cell.isToday && !filled && styles.dayTodayText,
            filled && (cell.isToday ? styles.dayTodayNum : styles.daySelectedNum),
          ]}
        >
          {cell.day}
        </Text>
      </View>
      <View
        style={[
          styles.dayDot,
          mini ? styles.dayDotMini : styles.dayDotLarge,
          showDot ? { backgroundColor: cell.topKind ? dotColor[cell.topKind] : "transparent" } : styles.dayDotHidden,
        ]}
      />
    </>
  );
  const cellStyle = mini ? styles.dayCellMini : styles.dayCellLarge;
  if (!onSelectDay) return <View style={cellStyle}>{inner}</View>;
  return (
    <Pressable style={cellStyle} onPress={() => onSelectDay(cell.key)} hitSlop={mini ? 3 : 2} testID={`calendar-day-${cell.key}`}>
      {inner}
    </Pressable>
  );
}

/** The Sun→Sat letter stripe (S M T W T F S) as 7 equal, centered columns.
 *  Powers the Daily view's header rule in calendar.tsx (the grid renders its own
 *  height-locked copy inline above). Pass `activeIndex` (0 = Sunday) to accent
 *  the weekday the shown day falls on, so a single-day view still reads as part
 *  of the same week. */
export function WeekdayStripe({ activeIndex, flush = false }: { activeIndex?: number; flush?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    // `flush` drops the stripe's own side padding so its seven columns land on
    // exactly the same centres as a month card's day columns, which have none.
    // 4pt of padding is enough to make every letter sit visibly off its column.
    <View style={[styles.weekdayStripe, flush && styles.weekdayStripeFlush]} testID="calendar-weekday-stripe">
      {WEEKDAY_LABELS.map((label, i) => (
        <Text key={i} style={[styles.weekdayStripeLabel, i === activeIndex && styles.weekdayStripeActive]}>
          {label}
        </Text>
      ))}
    </View>
  );
}

/** Re-export so callers get the grid and the matrix builder from one module. */
export { monthMatrix };

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Large (Monthly) — see the file header: every height below is explicit and
    // must match monthCardHeight()'s formula exactly.
    cardLarge: { paddingBottom: LARGE_CARD_GAP },
    labelWrapLarge: { height: LARGE_LABEL_H, justifyContent: "center", paddingHorizontal: space(1) },
    labelLarge: { ...type.h1, color: c.text },
    weekdayRowLarge: { flexDirection: "row", height: LARGE_WEEKDAY_H, alignItems: "center" },
    weekdayLarge: { flex: 1, textAlign: "center", fontSize: type.micro.fontSize, fontWeight: "700", color: c.text3 },
    weekRowLarge: { flexDirection: "row", height: LARGE_ROW_H },
    dayCellLarge: { flex: 1, height: LARGE_ROW_H, alignItems: "center", justifyContent: "center" },
    dayInnerLarge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    dayNumLarge: { fontSize: type.body.fontSize, color: c.text },

    // Mini (Yearly's 12-up grid) — compact, naturally sized; no scroll-math dependency.
    cardMini: { width: "48%", marginBottom: space(5) },
    labelWrapMini: { marginBottom: 0 },
    labelMini: { ...type.small, fontWeight: "700", color: c.text2, textAlign: "center", marginBottom: space(1.5) },
    weekRowMini: { flexDirection: "row" },
    dayCellMini: { flex: 1, alignItems: "center", paddingVertical: 1.5 },
    dayInnerMini: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    dayNumMini: { fontSize: 8.5, color: c.text },

    // Standalone weekday stripe (Daily view header) — matches the large card's
    // weekday row treatment; active column takes the accent (color only, no
    // size/weight jump, so it stays a quiet cue).
    weekdayStripe: { flexDirection: "row", alignItems: "center", paddingHorizontal: space(1) },
    weekdayStripeFlush: { paddingHorizontal: 0 },
    weekdayStripeLabel: { flex: 1, textAlign: "center", fontSize: type.micro.fontSize, fontWeight: "700", color: c.text3 },
    weekdayStripeActive: { color: c.accent },

    // Shared across both sizes.
    dayToday: { backgroundColor: c.accent },
    // Today, unselected: the number takes the accent rather than a filled ring,
    // so the filled circle can mean "selected" and only that.
    dayTodayText: { color: c.accent, fontWeight: "700" },
    // The selected day on any other date — a solid neutral disc, Apple's own
    // treatment, distinct from today's accent without competing with it.
    daySelected: { backgroundColor: c.text },
    daySelectedNum: { color: c.bg, fontWeight: "700" },
    // Owner 2026-07-22: no faded text anywhere. Neighbouring-month days used to
    // sit at 50% opacity; they now read at full strength like every other
    // number, so the month boundary shows through position alone.
    dayOut: { color: c.text3 },
    dayTodayNum: { color: c.onAccent, fontWeight: "700" },
    dayDot: { borderRadius: 3, marginTop: 2 },
    dayDotLarge: { width: 6, height: 6 },
    dayDotMini: { width: 3, height: 3, borderRadius: 1.5 },
    dayDotHidden: { backgroundColor: "transparent" },
  });
