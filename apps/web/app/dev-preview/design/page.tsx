"use client";

// The design system gallery: every primitive, every size, every state, on one page.
//
// 🔴 THIS IS A MEASURING INSTRUMENT, NOT A DEMO. /design/DESIGN.md's visual QA loop needs a surface
// where every control can be read by a headless browser in one pass, so a drift in a radius or a
// type step is caught by a probe rather than by somebody noticing. Every element carries a
// `data-probe` name.

import { useState } from "react";

import { Bold, Check, Plus, Search, Settings, Trash2 } from "lucide-react";

import {
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
  Heading,
  Icon,
  IconButton,
  Input,
  Row,
  SegmentedControl,
  Stack,
  Surface,
  Text,
  Textarea,
  Toggle,
  TEXT_VARIANTS,
  type TextVariant,
} from "@/components/design";

export default function DesignGallery() {
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"all" | "mine">("all");
  return (
    <main className="min-h-dvh" data-workspace style={{ background: "var(--bg-page)" }}>
      <Container width="content">
        <Stack className="py-(--space-48)" gap={48}>
          <Stack gap={8}>
            <Heading level={1}>Design system</Heading>
            <Text tone="secondary" variant="body">
              Every primitive, every state. Canonical source: /design/COMPONENTS.md.
            </Text>
          </Stack>

          <Section title="Typography">
            <Stack gap={12}>
              {TEXT_VARIANTS.map((v: TextVariant) => (
                <Row align="baseline" gap={16} key={v}>
                  <Text className="w-24 shrink-0" tone="muted" variant="meta">
                    {v}
                  </Text>
                  <Text data-probe={`type-${v}`} variant={v}>
                    The best code is the code you never wrote
                  </Text>
                </Row>
              ))}
            </Stack>
          </Section>

          <Section title="Buttons">
            <Stack gap={16}>
              {(["sm", "md", "lg", "content"] as const).map((size) => (
                <Row align="center" gap={8} key={size} wrap>
                  <Text className="w-24 shrink-0" tone="muted" variant="meta">
                    {size}
                  </Text>
                  <Button data-probe={`btn-primary-${size}`} size={size} variant="primary">
                    Primary
                  </Button>
                  <Button data-probe={`btn-secondary-${size}`} size={size} variant="secondary">
                    Secondary
                  </Button>
                  <Button data-probe={`btn-ghost-${size}`} size={size} variant="ghost">
                    Ghost
                  </Button>
                  <Button data-probe={`btn-danger-${size}`} size={size} variant="danger">
                    Danger
                  </Button>
                  <Button iconStart={Plus} size={size} variant="secondary">
                    With icon
                  </Button>
                  <Button loading size={size} variant="secondary">
                    Loading
                  </Button>
                  <Button disabled size={size} variant="secondary">
                    Disabled
                  </Button>
                </Row>
              ))}
              <Row align="center" gap={8}>
                <Text className="w-24 shrink-0" tone="muted" variant="meta">
                  icon
                </Text>
                {([24, 28, 32, 36] as const).map((s) => (
                  <IconButton data-probe={`iconbtn-${s}`} icon={Settings} key={s} label={`Settings ${s}`} size={s} />
                ))}
                <IconButton icon={Trash2} label="Delete" variant="danger" />
                <IconButton icon={Bold} label="Bold" pill variant="secondary" />
              </Row>
            </Stack>
          </Section>

          <Section title="Controls">
            <Stack gap={16}>
              <Row gap={12} wrap>
                <Input data-probe="input" className="max-w-64" placeholder="Search sources" />
                <Input className="max-w-64" iconStart={Search} placeholder="With an icon" />
                <Input className="max-w-64" invalid placeholder="Invalid" />
              </Row>
              <Textarea data-probe="textarea" className="max-w-lg" placeholder="A longer answer" rows={3} />
              <Row gap={24} wrap>
                <Checkbox checked={checked} label="Ticked source" onChange={setChecked} />
                <Checkbox indeterminate label="Some ticked" />
                <Checkbox disabled label="Disabled" />
                <Toggle checked={on} label="Track learning" onChange={setOn} />
              </Row>
              <SegmentedControl
                data-probe="segmented"
                onChange={setSeg}
                options={[
                  { value: "all", label: "All" },
                  { value: "mine", label: "Mine" },
                ]}
                value={seg}
              />
            </Stack>
          </Section>

          <Section title="Surfaces">
            <Row gap={16} wrap>
              {(["flat", "sunken", "raised", "floating", "overlay"] as const).map((level) => (
                <Surface data-probe={`surface-${level}`} key={level} level={level} padding={16} radius={8}>
                  <Text variant="ui">{level}</Text>
                </Surface>
              ))}
            </Row>
            <Card className="mt-(--space-16) max-w-sm" data-probe="card">
              <Stack gap={8}>
                <Text variant="ui-lg">A card is a last resort</Text>
                <Text tone="secondary" variant="caption">
                  Whitespace, then type, then a hairline, then a background step, and only then this.
                </Text>
              </Stack>
            </Card>
          </Section>

          <Section title="Icons">
            <Row align="center" gap={16}>
              {([12, 14, 16, 20, 24] as const).map((s) => (
                <Row align="center" gap={6} key={s}>
                  <Icon icon={Check} size={s} tone="primary" />
                  <Text tone="muted" variant="meta">
                    {s}
                  </Text>
                </Row>
              ))}
              <Divider vertical />
              <Icon icon={Check} tone="primary" />
              <Icon icon={Check} tone="secondary" />
              <Icon icon={Check} tone="muted" />
            </Row>
          </Section>
        </Stack>
      </Container>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={16}>
      <Stack gap={8}>
        <Heading level={3}>{title}</Heading>
        <Divider />
      </Stack>
      {children}
    </Stack>
  );
}
