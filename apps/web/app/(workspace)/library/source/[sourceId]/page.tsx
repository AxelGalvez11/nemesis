"use client";

// A source file's own page: /library/source/<id>
//
// Every stored document opens here — never in an iframe, never at a storage
// URL. Citations point at this route with ?page= / ?slide= and, when the
// passage was measured, ?q= to highlight it.
//
// A client page reading its own params, the same shape /library/page.tsx uses.
// (The server-component-plus-Suspense form is the documented alternative and it
// hydrates unreliably here: a boundary that stays suspended leaves the server's
// HTML on screen with no effects attached, which looks exactly like a document
// that never finishes opening.)

import { useParams } from "next/navigation";

import { LibrarySourceReader } from "@/components/workspace/reader/library-source-reader";

export default function LibrarySourcePage() {
  const params = useParams<{ sourceId: string }>();
  const sourceId = Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId;
  return <LibrarySourceReader sourceId={sourceId ? decodeURIComponent(sourceId) : ""} />;
}
