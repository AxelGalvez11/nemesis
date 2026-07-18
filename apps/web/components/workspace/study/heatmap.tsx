"use client";

// StudyHeatmap — GitHub-style 12-month contribution grid (library-study spec
// §3.4). Fresh install has zero reviews, so every cell renders at level 0;
// the geometry (11x11 cells, 3px gaps, 9px labels) is still built for real so
// the section isn't just a placeholder box.

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const WEEKS_BACK = 53;
const HEAT_MIX = ["8%", "14%", "24%", "38%", "54%"];

function heatColor(level: number) {
  const mix = HEAT_MIX[Math.min(Math.max(level, 0), HEAT_MIX.length - 1)] ?? HEAT_MIX[0];
  return `color-mix(in srgb, var(--ui-text-primary) ${mix}, transparent)`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface HeatmapWeek {
  colIndex: number;
  monthLabel: string | null;
  days: { date: Date; isFuture: boolean }[];
}

function buildWeeks(today: Date): HeatmapWeek[] {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayDow = startOfToday.getDay();
  const gridStart = new Date(startOfToday);
  gridStart.setDate(gridStart.getDate() - todayDow - (WEEKS_BACK - 1) * 7);

  const weeks: HeatmapWeek[] = [];
  let lastLabeledMonth = -1;

  for (let w = 0; w < WEEKS_BACK; w++) {
    const firstDay = new Date(gridStart);
    firstDay.setDate(firstDay.getDate() + w * 7);

    const days: { date: Date; isFuture: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(date.getDate() + w * 7 + d);
      days.push({ date, isFuture: date > startOfToday });
    }
    let monthLabel: string | null = null;
    if (firstDay.getMonth() !== lastLabeledMonth && firstDay <= startOfToday) {
      monthLabel = MONTH_ABBR[firstDay.getMonth()] ?? null;
      lastLabeledMonth = firstDay.getMonth();
    }
    weeks.push({ colIndex: w, monthLabel, days });
  }

  return weeks;
}

export function StudyHeatmap() {
  const today = new Date();
  const weeks = buildWeeks(today);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-[3px] pl-[23px]">
          {weeks.map((week) => (
            <div className="w-[11px] shrink-0 text-[9px] leading-none text-muted-foreground" key={week.colIndex}>
              {week.monthLabel ?? ""}
            </div>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex w-5 shrink-0 flex-col gap-[3px]">
            {WEEKDAY_LABELS.map((label, row) => (
              <div className="h-[11px] text-[9px] leading-[11px] text-muted-foreground" key={row}>
                {label}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week) => (
              <div className="flex flex-col gap-[3px]" key={week.colIndex}>
                {week.days.map(({ date, isFuture }, row) =>
                  isFuture ? (
                    <div className="size-[11px]" key={row} />
                  ) : (
                    <div
                      className="size-[11px] rounded-[2px]"
                      key={row}
                      style={{
                        background: heatColor(0),
                        boxShadow: isSameDay(date, today) ? "inset 0 0 0 1px color-mix(in srgb, var(--ui-text-primary) 60%, transparent)" : undefined,
                      }}
                      title={`0 reviews · ${date.getDate()} ${MONTH_ABBR[date.getMonth()]}`}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span className="size-[10px] rounded-[2px]" key={level} style={{ background: heatColor(level) }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
