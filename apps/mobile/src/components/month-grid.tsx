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
export function monthCardHeight(weeksCount: number): number {
  return LARGE_LABEL_H + LARGE_WEEKDAY_H + weeksCount * LARGE_ROW_H + LARGE_CARD_GAP;
}

function kindColors(c: ThemeColors): Record<AgendaEventKind, string> {
  return { assignment: c.warn, class: c.info, exam: c.danger, other: c.text2, rotation: c.accent };
}

export type MonthGridSize = "large" | "mini";

export function MonthGrid({
  month,
  size = "large",
  onSelectDay,
  onSelectMonth,
}: {
  month: MonthView;
  /** "large" (Monthly's scroll, bigger cells) | "mini" (Yearly's 12-up grid). */
  size?: MonthGridSize;
  /** Jump to a day's agenda — wired into every cell when provided. */
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

      {mini ? null : (
        <View style={styles.weekdayRowLarge}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.weekdayLarge}>{label}</Text>
          ))}
        </View>
      )}

      {month.weeks.map((week, wi) => (
        <View key={wi} style={mini ? styles.weekRowMini : styles.weekRowLarge}>
          {week.map((cell) => (
            <DayCell key={cell.key} cell={cell} styles={styles} dotColor={dotColor} mini={mini} onSelectDay={onSelectDay} />
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
  onSelectDay,
}: {
  cell: MonthCell;
  styles: ReturnType<typeof createStyles>;
  dotColor: Record<AgendaEventKind, string>;
  mini: boolean;
  onSelectDay?: (dayKey: string) => void;
}) {
  const showDot = cell.inMonth && cell.eventCount > 0;
  const inner = (
    <>
      <View style={[mini ? styles.dayInnerMini : styles.dayInnerLarge, cell.isToday && styles.dayToday]}>
        <Text
          style={[
            mini ? styles.dayNumMini : styles.dayNumLarge,
            !cell.inMonth && styles.dayOut,
            cell.isToday && styles.dayTodayNum,
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
export function WeekdayStripe({ activeIndex }: { activeIndex?: number }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.weekdayStripe} testID="calendar-weekday-stripe">
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
    weekdayStripeLabel: { flex: 1, textAlign: "center", fontSize: type.micro.fontSize, fontWeight: "700", color: c.text3 },
    weekdayStripeActive: { color: c.accent },

    // Shared across both sizes.
    dayToday: { backgroundColor: c.accent },
    dayOut: { color: c.text3, opacity: 0.5 },
    dayTodayNum: { color: c.onAccent, fontWeight: "700" },
    dayDot: { borderRadius: 3, marginTop: 2 },
    dayDotLarge: { width: 6, height: 6 },
    dayDotMini: { width: 3, height: 3, borderRadius: 1.5 },
    dayDotHidden: { backgroundColor: "transparent" },
  });
