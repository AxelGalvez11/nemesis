"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";

import { useSpaceEnabled } from "./use-space-enabled";

/**
 * The page file behind a Space route (/home, /p/<id>, /ai, /tasks, /templates). The Space frontend draws these
 * itself, so this renders nothing. An account without the Space workspace is sent to the canvas instead of an empty
 * column.
 */
export function SpaceRoutePage() {
  const router = useRouter();
  const { session } = useAuth();
  const enabled = useSpaceEnabled(session?.user.id ?? null);
  useEffect(() => {
    if (session && enabled === false) router.replace("/canvas");
  }, [enabled, router, session]);
  return null;
}
