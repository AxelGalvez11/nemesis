import { redirect } from "next/navigation";

// The front door is the Canvas: an empty board that invites material (board-landing.tsx), with
// Chat one switch away.
//
// Owner, 2026-09-05/06, after a day of brainstorming NotebookLM, ChatGPT's Work rail and Stitch's
// project view: *"the landing page … is a chat composer so it invites chatting, where as notebook
// lm invites dropping in documents"*, then *"essentially we go into full on canvas mode"*, then
// *"Yes make new landing and workspace canvas based on stitch and wondering canvas."* This used to
// send everyone to /learn, the chat's own front door; that page still exists and the Chat | Canvas
// switch on both reaches it.
export default function Home() {
  redirect("/canvas");
}
