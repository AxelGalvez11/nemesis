import { Pressable, StyleSheet, Text, View } from "react-native";
import { monthMatrix, type AgendaEventKind, type MonthCell, type MonthView } from "@/lib/agenda";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The month calendar that anchors the Calendar page (owner: an agenda list alone
// read as "no calendar"). A Sunday-first grid built from monthMatrix: today gets
// an accent ring, each in-month day with events gets a dot colored by its top
// event kind, and the ‹ › arrows page months. Read-only — the agenda list below
// it is where events are actually read. Self-styled so it renders in isolation
// (used by the Calendar screen and a throwaway preview route during QA).

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function kindColors(c: ThemeColors): Record<AgendaEventKind, string> {
  return { assignment: c.warn, class: c.info, exam: c.danger, other: c.text2, rotation: c.accent };
}

export function MonthGrid({ month, onStep }: { month: MonthView; onStep: (delta: number) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const dotColor = kindColors(c);
  return (
    <View style={styles.month} testID="calendar-month">
      <View style={styles.head}>
        <Pressable onPress={() => onStep(-1)} hitSlop={12} testID="month-prev">
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.label}>{month.label}</Text>
        <Pressable onPress={() => onStep(1)} hitSlop={12} testID="month-next">
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={styles.weekday}>{label}</Text>
        ))}
      </View>
      {month.weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell) => (
            <DayCell key={cell.key} cell={cell} styles={styles} dotColor={dotColor} />
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
}: {
  cell: MonthCell;
  styles: ReturnType<typeof createStyles>;
  dotColor: Record<AgendaEventKind, string>;
}) {
  const showDot = cell.inMonth && cell.eventCount > 0;
  return (
    <View style={styles.dayCell}>
      <View style={[styles.dayInner, cell.isToday && styles.dayToday]}>
        <Text style={[styles.dayNum, !cell.inMonth && styles.dayOut, cell.isToday && styles.dayTodayNum]}>
          {cell.day}
        </Text>
      </View>
      <View
        style={[
          styles.dayDot,
          showDot ? { backgroundColor: cell.topKind ? dotColor[cell.topKind] : "transparent" } : styles.dayDotHidden,
        ]}
      />
    </View>
  );
}

/** Re-export so callers get the grid and the matrix builder from one module. */
export { monthMatrix };

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    month: { marginBottom: space(3) },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(2), paddingHorizontal: space(1) },
    arrow: { fontSize: 26, lineHeight: 30, color: c.text2, paddingHorizontal: space(2) },
    label: { ...type.h2, color: c.text },
    weekdayRow: { flexDirection: "row", marginBottom: space(1) },
    weekday: { flex: 1, textAlign: "center", ...type.micro, color: c.text3, fontWeight: "700" },
    weekRow: { flexDirection: "row" },
    dayCell: { flex: 1, alignItems: "center", paddingVertical: space(0.75) },
    dayInner: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    dayToday: { backgroundColor: c.accent },
    dayNum: { fontSize: 14, color: c.text },
    dayOut: { color: c.text3, opacity: 0.5 },
    dayTodayNum: { color: c.onAccent, fontWeight: "700" },
    dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
    dayDotHidden: { backgroundColor: "transparent" },
  });
