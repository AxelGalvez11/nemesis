// Quiet empty state for Study's Tests and Mindmaps pages.

interface AgentEmptyStateProps {
  title: string;
  description: string;
}

export function AgentEmptyState({ title, description }: AgentEmptyStateProps) {
  return (
    <div className="grid min-h-48 place-items-center text-center">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}
