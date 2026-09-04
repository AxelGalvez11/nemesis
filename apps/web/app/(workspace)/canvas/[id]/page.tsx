// /canvas/<id> — a saved board. Thin like /projects/<id>: the route reads the id, the component
// owns the page.

"use client";

import { useParams } from "next/navigation";

import { BoardPage } from "@/components/workspace/board/board-page";

export default function SavedCanvasRoute() {
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  return <BoardPage boardId={raw ?? null} />;
}
