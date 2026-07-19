import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Canonical centered empty state (title + description). The default for "no
// results / nothing here yet" page bodies.
export function EmptyState({
  title,
  description,
  className,
  action,
}: {
  title: string;
  description?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("grid min-h-48 place-items-center text-center", className)}>
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
