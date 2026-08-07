"use client";

/**
 * Where a document is in the read pipeline, and the one action a student can
 * take about it.
 *
 * 🔴 THIS COMPONENT COMPUTES NOTHING. It renders `documentStatusLine(status)`
 * and decides which button to show from `isInFlight`. Every judgement about what
 * a row means lives in `document-status.ts`, because a second opinion written in
 * a component is exactly how a finished lecture came to be reported as lost.
 *
 * Three states matter to a person:
 *
 *   not read yet  — an offer, not a spinner. 16 of 17 real sources are here,
 *                   and a spinner would spin forever for work nobody scheduled.
 *   in flight     — a plain sentence and a poll. No progress bar: the worker
 *                   reports attempts, not percentages, and a bar that moves on
 *                   nothing is a lie with an animation.
 *   failed        — what happened, in the student's words, and a retry.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  documentStatusLine,
  isInFlight,
  type DocumentStatus,
} from "@/lib/notebooks/document-status";

/** How often an in-flight document is re-checked. */
const POLL_MS = 4_000;
/**
 * Polling stops after this long.
 *
 * A tab left open overnight on a job that died would otherwise make one request
 * every four seconds forever. The document is not lost when polling stops — the
 * next page load resolves its real state, and pg_cron is still working on it.
 */
const POLL_CEILING_MS = 10 * 60_000;

interface DocumentParseStatusProps {
  sourceId: string;
  /** The status resolved when the list was loaded. Replaced by polling. */
  initial: DocumentStatus;
  className?: string;
}

export function DocumentParseStatus({ sourceId, initial, className }: DocumentParseStatusProps) {
  const [status, setStatus] = useState<DocumentStatus>(initial);
  const [asking, setAsking] = useState(false);
  const startedAt = useRef(Date.now());

  // A fresh source means a fresh poll window; without this a student who opens
  // three documents in a row gets the first one's expired budget.
  useEffect(() => {
    setStatus(initial);
    startedAt.current = Date.now();
  }, [initial, sourceId]);

  const authHeader = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, []);

  const refresh = useCallback(async () => {
    const headers = await authHeader();
    if (!headers) return;
    try {
      const res = await fetch(`/api/library/sources/${sourceId}/parse`, { headers });
      if (!res.ok) return;
      const body = (await res.json()) as { status?: DocumentStatus };
      if (body.status) setStatus(body.status);
    } catch {
      // A dropped poll is not news. The next tick tries again, and the state on
      // screen is still the last thing the server actually said.
    }
  }, [authHeader, sourceId]);

  useEffect(() => {
    if (!isInFlight(status)) return;
    const timer = setInterval(() => {
      if (Date.now() - startedAt.current > POLL_CEILING_MS) {
        clearInterval(timer);
        return;
      }
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, status]);

  const ask = useCallback(async () => {
    setAsking(true);
    try {
      const headers = await authHeader();
      if (!headers) return;
      await fetch(`/api/library/sources/${sourceId}/parse`, { headers, method: "POST" });
      startedAt.current = Date.now();
      // Show what the server says, not an optimistic "reading now". The request
      // may have been declined — already parsed, already queued — and inventing
      // a state here is how the UI and the database start disagreeing.
      await refresh();
    } finally {
      setAsking(false);
    }
  }, [authHeader, refresh, sourceId]);

  // A completely read document needs no banner. Coverage already speaks for a
  // partial one, in the reader's own note.
  if (status.kind === "parsed" || status.kind === "ready") return null;

  const offersAction = status.kind === "not_queued" || status.kind === "failed";

  return (
    <div
      className={className}
      data-status={status.kind}
      data-testid="document-parse-status"
      role="status"
    >
      <span>{documentStatusLine(status)}</span>
      {offersAction && (
        <Button disabled={asking} onClick={() => void ask()} size="sm" variant="secondary">
          {status.kind === "failed" ? "Try reading it again" : "Read this document"}
        </Button>
      )}
    </div>
  );
}
