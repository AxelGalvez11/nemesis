import type { ReactNode } from "react";

interface AgentEmptyStateProps {
  action?: ReactNode;
  title: string;
  description: string;
  icon: ReactNode;
  prompt?: string;
}

/** Study's first-run state: explains what belongs on the current page and gives
 *  the student a real next action instead of presenting an empty table. */
export function AgentEmptyState({ action, title, description, icon, prompt }: AgentEmptyStateProps) {
  return (
    <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_88%,transparent)] px-7 py-9 text-center shadow-[0_16px_55px_rgba(0,0,0,0.06)] sm:px-10">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)] blur-3xl" />
      <div className="relative">
        <div className="mx-auto grid size-11 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--theme-primary)_18%,var(--ui-stroke-tertiary))] bg-[color-mix(in_srgb,var(--theme-primary)_8%,var(--background))] text-(--theme-primary)">
          {icon}
        </div>
        <h2 className="mt-4 text-base font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
        {prompt && (
          <div className="mx-auto mt-5 max-w-md rounded-2xl border border-(--ui-stroke-tertiary) bg-background px-4 py-3 text-left">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">Try asking</p>
            <p className="mt-1 text-xs leading-relaxed text-(--ui-text-secondary)">“{prompt}”</p>
          </div>
        )}
        {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
