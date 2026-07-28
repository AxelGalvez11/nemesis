import { IconChartBar } from "@tabler/icons-react";

import { Button } from "@/components/desktop-ui/button";
import type { StudyReview } from "@/lib/workspace/study-cloud-store";
import { retentionRate, retentionSeries, testPerformance, type AttemptedTest } from "@/lib/workspace/study-stats";

import { AgentEmptyState } from "./agent-empty-state";
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

/** Practice-test results, beside the card retention above. Attempts were always
 *  being recorded; until now nothing on this page read them. */
function TestScores({ tests }: { tests: readonly AttemptedTest[] }) {
  const { averagePercent, sittings, testsSat } = testPerformance(tests);
  if (sittings.length === 0) return null;

  return (
    <section className="rounded-3xl bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] px-6 py-7 sm:px-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Practice tests</h2>
          <p className="mt-1 text-xs text-muted-foreground">Every attempt counts separately, so a retake shows as its own result.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{averagePercent === null ? "—" : `${averagePercent}%`}</p>
          <p className="text-[0.6875rem] text-(--ui-text-tertiary)">{sittings.length} attempt{sittings.length === 1 ? "" : "s"} across {testsSat} test{testsSat === 1 ? "" : "s"}</p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-(--ui-stroke-tertiary) rounded-2xl border border-(--ui-stroke-tertiary) bg-background">
        {sittings.map((sitting) => (
          <li className="flex items-center justify-between gap-4 px-4 py-2.5" key={`${sitting.title}-${sitting.at}`}>
            <div className="min-w-0">
              <p className="truncate text-sm">{sitting.title}</p>
              <p className="text-[0.6875rem] text-(--ui-text-quaternary)">{new Date(sitting.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
            </div>
            <p className="shrink-0 text-sm tabular-nums">
              <span className="font-semibold">{sitting.percent}%</span>
              <span className="ml-2 text-(--ui-text-quaternary)">{sitting.score}/{sitting.total}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StatsTab({ reviews, tests = [], onStartReview }: { reviews: StudyReview[]; tests?: readonly AttemptedTest[]; onStartReview: () => void }) {
  // Sitting a test is studying too. Gating this page on card reviews alone left
  // a student who revises by testing looking at an empty history.
  const hasTestResults = testPerformance(tests).sittings.length > 0;

  if (reviews.length === 0 && !hasTestResults) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <AgentEmptyState
          action={<Button onClick={onStartReview} variant="secondary">Go to cards</Button>}
          description="This page charts what you have actually reviewed and sat—not material you have merely created. Complete a card review or take a practice test and your first result will appear here."
          icon={<IconChartBar size={20} />}
          title="Your study history starts after one review"
        />
      </main>
    );
  }

  return (
    <main className="scrollbar-study flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-10">
      <div className="grid w-full max-w-4xl gap-5">
        {reviews.length > 0 && (
          <section className="rounded-3xl bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] px-6 py-7 sm:px-8">
            <div className="mb-7">
              <h2 className="text-base font-semibold tracking-tight">Study activity</h2>
              <p className="mt-1 text-xs text-muted-foreground">Every review adds to your activity map, so consistency stays visible over time.</p>
            </div>
            <StudyHeatmap reviews={reviews} />
          </section>
        )}
        {reviews.length > 0 && <RetentionGraph reviews={reviews} />}
        <TestScores tests={tests} />
      </div>
    </main>
  );
}
