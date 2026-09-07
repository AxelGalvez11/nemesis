"use client";

// /canvas — the front door.
//
// 🔴🔴 THE CANVAS IS THE LANDING PAGE NOW. Owner, 2026-09-07: *"get rid of the chat as landing page
// in webapp, the canvas should be landing page"*, and, asked which board a person should be looking
// at when they sign in, *"Most recent canvas"*. Asked in the same breath whether a plain full-screen
// chat should survive on its own he chose *"No, chats only live on boards"* — so this is not one of
// two doors any more, it is the door. A conversation is a card on a board and entering it makes it
// full screen (board-thread.tsx).
//
// Three arrivals, one route:
//
//   /canvas          sign in, or press the logo: the board you were last working on.
//   /canvas?new=1    "New canvas" in the rail: always a fresh, unsaved board.
//   /canvas/<id>     that board. Its own page; the first save rewrites the address to it.
//
// 🔴 `replace`, NOT `push`. The redirect must not leave a step in the history that Back returns to,
// or Back from your most recent canvas lands on the thing that sent you there and forward again.
//
// 🔴 A NEW BOARD IS RENDERED WHILE THE LOOK-UP RUNS, NOT A SPINNER. Someone signing in with no
// boards at all is the common first case, and the answer for them is the empty board's own landing
// ("What are you studying?"). Showing a spinner first would put a blank screen in front of every
// new account for the length of a round trip.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { BoardPage } from "@/components/workspace/board/board-page";
import { listBoards } from "@/lib/board/board-store";

function CanvasFrontDoor() {
  const { session, loading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const wantsNew = params.get("new") !== null;
  const uid = session?.user?.id ?? null;
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (wantsNew || loading || !uid || checked) return;
    let cancelled = false;
    void (async () => {
      try {
        // `listBoards` orders by `updated_at` descending, so the first row is the last one touched.
        const boards = await listBoards();
        const recent = boards[0];
        if (!cancelled && recent) router.replace(`/canvas/${recent.id}`);
      } catch {
        /* offline, or the session died: the empty board below is a working front door either way */
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checked, loading, router, uid, wantsNew]);

  return <BoardPage boardId={null} />;
}

export default function NewCanvasPage() {
  return (
    <Suspense fallback={<BoardPage boardId={null} />}>
      <CanvasFrontDoor />
    </Suspense>
  );
}
