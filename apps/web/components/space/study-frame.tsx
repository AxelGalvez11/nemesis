"use client";

// The frame around a study screen in the app column: the bar with where you are and the way out, and the states a
// screen shows when it has no cards to put under it.
//
// Canonical source: /design/COMPONENTS.md §3 (TopBar, Breadcrumb) and §4 (EmptyState, ErrorState). The bar is 48px on
// the page ground with a hairline under it and never a shadow; crumbs are `caption`, the last one in the primary tone,
// with a 12px chevron between them at the muted icon tone; its action is a 28px icon button. A notice is a 24px muted
// icon, a `title-sm` heading, one sentence and one action, centred in its container.
//
// 🔴 ONE FRAME FOR EVERY STUDY SCREEN. Review and a single deck both open in the column beside the sidebar
// (docs/space/PLAN.md, "Notes, Flashcards and Nemesis AI"), and a bar each is how two screens start to disagree about
// height, type and where the close button sits.

import type { LucideIcon } from "lucide-react";
import { ChevronRight, X } from "lucide-react";
import { Fragment } from "react";

import { Button, Icon, IconButton, Row, Stack, Text } from "@/components/design";

export function StudyTopBar({ crumbs, detail, onClose }: { crumbs: string[]; detail?: string; onClose: () => void }) {
  return (
    <Row
      align="center"
      as="header"
      className="shrink-0 border-b"
      gap={8}
      justify="between"
      style={{ height: "var(--h-topbar)", padding: "0 var(--space-12) 0 var(--space-16)", background: "var(--bg-page)", borderColor: "var(--border-subtle)" }}
    >
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center" style={{ gap: "var(--space-6)" }}>
        {crumbs.map((crumb, index) => (
          <Fragment key={`${index}-${crumb}`}>
            {index > 0 && <Icon icon={ChevronRight} size={12} tone="muted" />}
            <Text className="min-w-0" tone={index === crumbs.length - 1 ? "primary" : "secondary"} truncate variant="caption">
              {crumb}
            </Text>
          </Fragment>
        ))}
        {detail && (
          <Text className="shrink-0" tone="muted" variant="caption">
            {detail}
          </Text>
        )}
      </nav>
      <IconButton icon={X} label="Close" onClick={onClose} size={28} />
    </Row>
  );
}

export function StudyNotice({
  action,
  icon,
  sentence,
  title,
}: {
  action?: { label: string; onClick: () => void };
  icon: LucideIcon;
  sentence: string;
  title: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center" style={{ padding: "var(--space-24)" }}>
      <Stack align="center" className="text-center" gap={12} style={{ maxWidth: "var(--reading-column)" }}>
        <Icon icon={icon} size={24} tone="muted" />
        <Stack align="center" gap={4}>
          <Text as="h2" variant="title-sm">
            {title}
          </Text>
          <Text as="p" tone="secondary" variant="body">
            {sentence}
          </Text>
        </Stack>
        {action && (
          <Button onClick={action.onClick} variant="secondary">
            {action.label}
          </Button>
        )}
      </Stack>
    </div>
  );
}

/** While the cards load. Quiet on purpose: it is normally gone before anyone reads it. */
export function StudyLoading({ label = "Opening your cards" }: { label?: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center" role="status" style={{ padding: "var(--space-24)" }}>
      <Text as="p" tone="muted" variant="ui">
        {label}
      </Text>
    </div>
  );
}
