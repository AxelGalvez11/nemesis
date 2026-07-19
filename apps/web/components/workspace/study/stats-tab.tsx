import type { StudyReview } from "@/lib/workspace/study-cloud-store";

import { StudyHeatmap } from "./heatmap";

export function StatsTab({ reviews }: { reviews: StudyReview[] }) {
  return (
    <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-10">
      <section className="w-full max-w-4xl rounded-3xl bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] px-6 py-7 sm:px-8">
        <div className="mb-7">
          <h2 className="text-base font-semibold tracking-tight">Study activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every review adds to your activity map, so consistency stays visible over time.
          </p>
        </div>
        <StudyHeatmap reviews={reviews} />
      </section>
    </main>
  );
}
