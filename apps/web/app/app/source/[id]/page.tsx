"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { SourceDetail } from "@pharmabro/shared";
import { fetchSource } from "@/lib/api";
import { Badge, Card, ErrorText, PageHeader } from "@/components/ui";

export default function SourcePage() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<SourceDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void fetchSource(id).then(setSource).catch((e) => setError(e instanceof Error ? e.message : "Source failed"));
  }, [id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (source === undefined) return <main>Loading source…</main>;
  if (source === null) return <ErrorText>No source found.</ErrorText>;

  return (
    <>
      <PageHeader title={source.title || "Source"} eyebrow="Source Viewer">
        Inspect the provenance behind a citation.
      </PageHeader>
      <Card>
        <div className="row">
          <Badge>{source.provider}</Badge>
          <Badge>{source.is_current ? "current" : "outdated"}</Badge>
        </div>
        <p><strong>License:</strong> {source.license || "unknown"}</p>
        <p><strong>External ID:</strong> {source.external_id || "n/a"}</p>
        <p><strong>Retrieved:</strong> {source.retrieved_at || source.fetched_at || "unknown"}</p>
        {source.url ? <a className="source-link" href={source.url} target="_blank" rel="noreferrer">Open original</a> : null}
        {source.sections?.length ? (
          <>
            <h2>Sections</h2>
            <p className="muted">{source.sections.join(", ")}</p>
          </>
        ) : null}
      </Card>
    </>
  );
}
