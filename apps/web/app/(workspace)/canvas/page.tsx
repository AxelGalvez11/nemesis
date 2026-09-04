// /canvas — a new, empty board. Its first send creates the row and moves the URL to /canvas/<id>.
import { BoardPage } from "@/components/workspace/board/board-page";

export default function NewCanvasPage() {
  return <BoardPage boardId={null} />;
}
