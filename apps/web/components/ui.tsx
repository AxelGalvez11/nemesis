import Link from "next/link";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
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
  return <span className="badge">{children}</span>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="error">{children}</p>;
}
