"use client";

// A source file's own page: /library/source/<id>
//
// Rendered by the Library page itself, in source mode. That is deliberate: the
// left sidebar is the Library's (owner 2026-08-05), so a document has to open
// INSIDE the Library rather than on a surface of its own, or opening a file
// costs you the tree it was filed in. The reader takes the middle and puts its
// own contents rail on the right, where a note's "On this page" sits.
//
// Citations point here with ?page= / ?slide= and, when the passage was
// measured, ?q= to highlight it.

import { useParams } from "next/navigation";

import { LibraryDocsPage } from "@/components/workspace/library-v2/library-docs-page";

export default function LibrarySourcePage() {
  const params = useParams<{ sourceId: string }>();
  const raw = Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId;
  return <LibraryDocsPage sourceId={raw ? decodeURIComponent(raw) : ""} />;
}
