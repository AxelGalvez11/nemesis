"use client";

// React's view of the account-wide recording watch.
//
// The store underneath is a plain module (recording-jobs-store.ts) so that it
// keeps running across route changes; this is only the binding that lets a
// component read it. Every caller shares the one watch — the shell starts it,
// and the chat card, the Library and the processing indicator all read the same
// snapshot rather than each polling for themselves.

import { useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import type { RecordingJob } from "@/lib/workspace/recording-job";
import {
  recordingJobsSnapshot,
  startRecordingJobsWatch,
  subscribeRecordingJobs,
} from "@/lib/workspace/recording-jobs-store";

/** Stable empty array for the server snapshot — a fresh `[]` on each call makes
 *  useSyncExternalStore throw about an infinite render loop. */
const NONE: RecordingJob[] = [];

/**
 * Every recording this account has not finished, live.
 *
 * Safe to call from as many components as you like: `startRecordingJobsWatch` is
 * idempotent, and the watch is deliberately NOT stopped on unmount — a component
 * unmounting is a route change, and a recording does not stop processing because
 * the student opened their Library.
 */
export function useRecordingJobs(): RecordingJob[] {
  const { session } = useAuth();
  const preview = useWorkspacePreview();
  // Preview surfaces (/dev-preview/...) render with fixture data and no account,
  // so there is nothing to watch and no token to watch it with.
  const uid = preview ? null : session?.user.id ?? null;

  useEffect(() => {
    startRecordingJobsWatch(uid);
  }, [uid]);

  return useSyncExternalStore(subscribeRecordingJobs, recordingJobsSnapshot, () => NONE);
}
