"use client";

// AgentEmptyState — the empty state for Study's Tests/Mind maps tabs. Same
// typography as the shared EmptyState primitive, plus an Ask-the-agent CTA
// (library-study spec §3.7/§3.10).

import { IconSparkles } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/desktop-ui/button";

interface AgentEmptyStateProps {
  title: string;
  description: string;
}

export function AgentEmptyState({ title, description }: AgentEmptyStateProps) {
  const router = useRouter();

  return (
    <div className="grid min-h-48 place-items-center text-center">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        <Button className="mt-4" onClick={() => router.push("/sessions")} size="sm" variant="outline">
          <IconSparkles size={13} />
          Ask the agent for one
        </Button>
      </div>
    </div>
  );
}
