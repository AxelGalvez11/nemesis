"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

const KEY = "nemesis.space.enabled";

function remembered(userId: string): boolean | null {
  try {
    const saved = localStorage.getItem(`${KEY}:${userId}`);
    return saved === "1" ? true : saved === "0" ? false : null;
  } catch {
    return null;
  }
}

/**
 * Whether this account gets the Space workspace as its shell (`ws_rollout`, see docs/space/PLAN.md). Null until known.
 *
 * The last answer is remembered on the device, per account, so a reload does not flash the old shell before the new
 * one and someone else signing in on the same device never borrows it. The server has the final say once it replies.
 */
export function useSpaceEnabled(userId: string | null): boolean | null {
  const [answer, setAnswer] = useState<{ userId: string; on: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void supabase.rpc("ws_enabled").then(({ data, error }) => {
      if (!alive || error) return;
      const on = data === true;
      setAnswer({ userId, on });
      try {
        localStorage.setItem(`${KEY}:${userId}`, on ? "1" : "0");
      } catch {
        /* private mode: the server answers every load instead */
      }
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!userId) return null;
  return answer?.userId === userId ? answer.on : remembered(userId);
}
