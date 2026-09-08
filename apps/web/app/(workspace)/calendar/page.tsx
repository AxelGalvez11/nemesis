import { CalendarWorkspace } from "@/components/workspace/calendar/calendar-workspace";

import { RetiredSurfaceGuard } from "@/components/workspace/retired-surface-guard";

export default function CalendarPage() {
  return (
    <RetiredSurfaceGuard allowDeepLinks={false}>
      <CalendarWorkspace />
    </RetiredSurfaceGuard>
  );
}
