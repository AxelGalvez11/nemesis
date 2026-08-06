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
import {
  recordingJobsSnapshot,
  startRecordingJobsWatch,
  subscribeRecordingJobs,
  type RecordingJobsState,
} from "@/lib/workspace/recording-jobs-store";

/** Stable server snapshot — a fresh object on each call makes
 *  useSyncExternalStore throw about an infinite render loop. `loaded: false`
 *  because on the server nothing has been read, which is exactly what a card
 *  rendered there should assume. */
const SERVER_STATE: RecordingJobsState = { jobs: [], loaded: false };

/**
 * Every recording this account has not finished, live, plus whether they have
 * been read yet.
 *
 * Safe to call from as many components as you like: `startRecordingJobsWatch` is
 * idempotent, and the watch is deliberately NOT stopped on unmount — a component
 * unmounting is a route change, and a recording does not stop processing because
 * the student opened their Library.
 */
export function useRecordingJobs(): RecordingJobsState {
  const { session } = useAuth();
  const preview = useWorkspacePreview();
  // Preview surfaces (/dev-preview/...) render with fixture data and no account,
  // so there is nothing to watch and no token to watch it with.
  const uid = preview ? null : session?.user.id ?? null;

  useEffect(() => {
    startRecordingJobsWatch(uid);
  }, [uid]);

  return useSyncExternalStore(subscribeRecordingJobs, recordingJobsSnapshot, () => SERVER_STATE);
}
