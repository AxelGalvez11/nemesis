import { cn } from "@/lib/utils";

// Canonical centered empty state (title + description). The default for "no
// results / nothing here yet" page bodies.
export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-48 place-items-center text-center", className)}>
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
      </div>
    </div>
  );
}
