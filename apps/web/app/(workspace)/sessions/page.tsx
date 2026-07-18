// Sessions/Chat page — shell spec §B1. Auth gate + workspace chrome come from
// app/(workspace)/layout.tsx; this renders the chat surface itself.

import { SessionChat } from "@/components/workspace/sessions/session-chat";

export default function SessionsPage() {
  return <SessionChat />;
}
