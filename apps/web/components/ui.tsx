import Link from "next/link";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card as ShadcnCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <ShadcnCard className={cn("card", className)}>{children}</ShadcnCard>;
}

export function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}

export function SourceAnchor({ sourceId, label = "Source" }: { sourceId?: string | null; label?: string }) {
  if (!sourceId) return null;
  return <Link className="source-link" href={`/app/source/${sourceId}`}>{label}</Link>;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <ShadcnBadge variant="secondary" className="badge">{children}</ShadcnBadge>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="error">{children}</p>;
}

export { Button };
