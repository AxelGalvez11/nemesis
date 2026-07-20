import type { StudyReview } from "@/lib/workspace/study-cloud-store";
import { retentionRate, retentionSeries } from "@/lib/workspace/study-stats";

import { StudyHeatmap } from "./heatmap";

function RetentionGraph({ reviews }: { reviews: StudyReview[] }) {
  const points = retentionSeries(reviews);
  const plotted = points
    .map((point, index) => ({ ...point, index }))
    .filter((point): point is typeof point & { retention: number } => point.retention !== null);
  const x = (index: number) => 42 + (index / Math.max(1, points.length - 1)) * 626;
  const y = (value: number) => 178 - (value / 100) * 132;
  const path = plotted.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.index).toFixed(1)},${y(point.retention).toFixed(1)}`).join(" ");
  const overall = retentionRate(reviews);

  return (
    <section className="rounded-3xl bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] px-6 py-7 sm:px-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><h2 className="text-base font-semibold tracking-tight">Retention</h2><p className="mt-1 text-xs text-muted-foreground">Daily successful recalls over the last 30 days.</p></div>
        <div className="text-right"><p className="text-2xl font-semibold tabular-nums">{overall === null ? "—" : `${overall}%`}</p><p className="text-[0.6875rem] text-(--ui-text-tertiary)">{reviews.length} review{reviews.length === 1 ? "" : "s"}</p></div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-(--ui-stroke-tertiary) bg-background p-3">
        <svg aria-label="Thirty-day study retention graph" className="h-auto min-w-[38rem]" role="img" viewBox="0 0 700 220">
          {[0, 50, 100].map((value) => (
            <g key={value}>
              <line stroke="var(--ui-stroke-tertiary)" strokeDasharray={value === 0 ? undefined : "3 5"} x1="42" x2="668" y1={y(value)} y2={y(value)} />
              <text fill="var(--ui-text-quaternary)" fontSize="10" textAnchor="end" x="34" y={y(value) + 3}>{value}%</text>
            </g>
          ))}
          {path && <path d={path} fill="none" stroke="var(--theme-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />}
          {plotted.map((point) => <circle cx={x(point.index)} cy={y(point.retention)} fill="var(--theme-primary)" key={point.day} r={point.reviews > 5 ? 4 : 3}><title>{point.label}: {point.retention}% across {point.reviews} reviews</title></circle>)}
          <text fill="var(--ui-text-quaternary)" fontSize="10" x="42" y="205">{points[0]?.label}</text>
          <text fill="var(--ui-text-quaternary)" fontSize="10" textAnchor="end" x="668" y="205">{points.at(-1)?.label}</text>
          {plotted.length === 0 && <text fill="var(--ui-text-tertiary)" fontSize="12" textAnchor="middle" x="355" y="112">Complete reviews to build your retention trend.</text>}
        </svg>
      </div>
    </section>
  );
}

export function StatsTab({ reviews }: { reviews: StudyReview[] }) {
  return (
    <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-10">
      <div className="grid w-full max-w-4xl gap-5">
        <section className="rounded-3xl bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] px-6 py-7 sm:px-8">
          <div className="mb-7">
            <h2 className="text-base font-semibold tracking-tight">Study activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">Every review adds to your activity map, so consistency stays visible over time.</p>
          </div>
          <StudyHeatmap reviews={reviews} />
        </section>
        <RetentionGraph reviews={reviews} />
      </div>
    </main>
  );
}
