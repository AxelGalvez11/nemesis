# Coverage

Every component family in `apps/web/components`, the rules that govern it, and where it stands. Owner, 2026-09-11: "I need the
design to encompass all the components of your web app, everything."

`apps/web/lib/design/design-coverage.test.ts` fails when a family or a top-level component appears without a row here, so a new
surface cannot arrive without someone deciding what governs it.

**Status**

- **on the system**: built from these documents and guarded.
- **measured reference**: matched to a named product, measured live, with its own guard. It moves onto the tokens in the app-screens
  pass without changing how it looks.
- **to migrate**: works today on the older tokens (`--ui-*`, `desktop-ui.css`) and moves onto the tokens and primitives in the order in
  MIGRATION.md.
- **own system**: governed by its own deliberate vocabulary.
- **not drawn** and **internal**: logic with no pixels, or a developer tool no learner sees.

## Families

| family | what it draws | governed by | status |
| --- | --- | --- | --- |
| `components/design` | the primitives: Text, Heading, Icon, Button, IconButton, Surface, Stack, Row, Container, Card, Divider, Input, Textarea, Checkbox, Toggle, SegmentedControl, GradientField | COMPONENTS.md, TOKENS.md | on the system |
| `components/ui` | the older shared controls: button, dialog, input, tabs, tooltip, separator, skeleton, scroll area | COMPONENTS.md §2, MIGRATION.md Refactor | to migrate |
| `components/desktop-ui` | desktop-parity chrome: menus, title bar and window controls | DESIGN.md §2, TOKENS.md | to migrate |
| `components/ai-elements` | answer and tool-call elements | DESIGN.md §9, COMPONENTS.md | to migrate |
| `components/settings` | settings panels and forms | COMPONENTS.md §2, INTERACTIONS.md | to migrate |
| `components/avatar` | the character's small avatar | the character's motion vocabulary | own system |
| `components/character` | the character: body, face and poses | the character's motion vocabulary (MIGRATION.md Keep) | own system |
| `components/mascot` | the mascot's renderer and poses | the character's motion vocabulary | own system |
| `components/dev` | developer studios such as the character studio and the mascot lab | none | internal |
| `components/lab` | parser, replay and tutor labs | none | internal |
| `components/space` | the pages workspace: sidebar, pages, blocks, databases, share, settings; the client itself lives in apps/web/space | measured on Notion's web app; ICONS.md: one library (Lucide), stroke 1.5; docs/space/PLAN.md | measured reference |
| `components/workspace` | the signed-in app; its families follow | DESIGN.md | see the rows below |
| `components/workspace/shell` | sidebar, title bar, status bar, settings modal and panels | DESIGN.md §1, §2, §7; RESPONSIVE.md | to migrate |
| `components/workspace/learn` | the chat thread, composer, answers, thinking, check and quiz cards, figures | measured on ChatGPT's Work view and Claude; DESIGN.md §8, §9 | measured reference |
| `components/workspace/board` | the canvas board, its cards, groups, toolbar and history rail | measured on wondering.app and Obsidian; DESIGN.md §8 | measured reference |
| `components/workspace/reader` | the document reading pane and its tabs | measured on ChatGPT's side panel; DESIGN.md §1 | measured reference |
| `components/workspace/study` | flashcards, the study panel and create dialogs; flashcards stay white | DESIGN.md §8, COMPONENTS.md | to migrate |
| `components/workspace/calendar` | the week grid and the event editor | measured on Google Calendar | measured reference |
| `components/workspace/library` | shelves, folders and sources | page frame measured on Gemini; COMPONENTS.md | to migrate |
| `components/workspace/library-v2` | the next library layout | page frame measured on Gemini; COMPONENTS.md | to migrate |
| `components/workspace/projects` | project pages and pickers | page frame measured on Gemini | to migrate |
| `components/workspace/plugins` | connected apps | COMPONENTS.md, INTERACTIONS.md | to migrate |
| `components/workspace/onboarding` | the first-run flow | DESIGN.md, COMPONENTS.md | to migrate |
| `components/workspace/deck` | deck designs and exports | COMPONENTS.md | to migrate |

## Top-level components

| component | what it draws | governed by | status |
| --- | --- | --- | --- |
| `components/AuthFrame.tsx` | the sign-in, sign-up and /auth/* frame | SURFACES.md §2 | on the system |
| `components/AuthLaptop.tsx` | the laptop film in the sign-in panel | SURFACES.md §2 | on the system |
| `components/OAuthButtons.tsx` | the Google and Apple row | SURFACES.md §2 | on the system |
| `components/TurnstileWidget.tsx` | the security check box | SURFACES.md §2 | on the system |
| `components/nemesis-mark.tsx` | the mark | BRAND.md | on the system |
| `components/AuthProvider.tsx` | auth state; draws nothing | none | not drawn |
| `components/PostHogProvider.tsx` | analytics; draws nothing | none | not drawn |
| `components/theme-provider.tsx` | the light and dark switch; draws nothing | TOKENS.md §1.5 (dark mode moved from §1.4 when the grounds were added on 2026-09-11) | not drawn |
| `components/AppShell.tsx` | the app's outer frame | DESIGN.md §1, §2 | to migrate |
| `components/AppModal.tsx` | modal dialogs | COMPONENTS.md, INTERACTIONS.md | to migrate |
| `components/SettingsSurface.tsx` | the settings page frame | COMPONENTS.md | to migrate |
| `components/Skeleton.tsx` | loading placeholders | INTERACTIONS.md Loading | to migrate |
| `components/ui.tsx` | small shared pieces | COMPONENTS.md | to migrate |
| `components/icons.tsx` | hand-drawn icons | ICONS.md: one library, stroke 1.5 | to migrate |
| `components/Orb.tsx` | an animated orb | MOTION.md | to migrate |
| `components/RunThinking.tsx` | a run's thinking state | DESIGN.md §9, MOTION.md | to migrate |
| `components/AgentRunDock.tsx` | the agent run dock | DESIGN.md §9 | to migrate |
| `components/AgentRunTracker.tsx` | agent run progress | DESIGN.md §9 | to migrate |
| `components/WorkPanel.tsx` | the work panel | DESIGN.md §1, §2 | to migrate |
| `components/MissionSheet.tsx` | the mission sheet | COMPONENTS.md | to migrate |
| `components/PaperUploadSheet.tsx` | the upload sheet | COMPONENTS.md, INTERACTIONS.md | to migrate |
| `components/CreditsPanel.tsx` | usage and credits | COMPONENTS.md | to migrate |
| `components/DataSourcesPanel.tsx` | data sources | COMPONENTS.md | to migrate |
| `components/BrowseTopics.tsx` | topic browsing | COMPONENTS.md | to migrate |
| `components/DomainChips.tsx` | field chips | COMPONENTS.md | to migrate |
| `components/EntityPicker.tsx` | an entity picker | COMPONENTS.md §2 | to migrate |
| `components/EvidenceCharts.tsx` | evidence charts | DESIGN.md §4 | to migrate |
| `components/EvidenceGraph.tsx` | the evidence graph | DESIGN.md §4 | to migrate |
| `components/EvidenceMapView.tsx` | the evidence map | DESIGN.md §4 | to migrate |
| `components/EvidencePanel.tsx` | the evidence panel | COMPONENTS.md | to migrate |
| `components/ForestPlot.tsx` | forest plots | DESIGN.md §4 | to migrate |
| `components/ResearchMapView.tsx` | the research map | DESIGN.md §4 | to migrate |
| `components/ResearchPoster.tsx` | research posters | COMPONENTS.md | to migrate |
| `components/ResearchProgress.tsx` | research progress | MOTION.md, INTERACTIONS.md Loading | to migrate |
| `components/ResearchReportView.tsx` | research reports | DESIGN.md §1 | to migrate |
| `components/WatchButton.tsx` | the watch button | COMPONENTS.md §2 | to migrate |
| `components/WatchCurrentEvidence.tsx` | watched evidence | COMPONENTS.md | to migrate |
| `components/WatchDetail.tsx` | watch details | COMPONENTS.md | to migrate |

## Outside apps/web

| surface | governed by | status |
| --- | --- | --- |
| www.enternemesis.com (`landing/`) | SURFACES.md §1, BRAND.md | home and pricing are on the system; the about, principles, privacy and terms pages still wear the previous site's chrome |
| the phone app (`apps/mobile`) | not yet covered | the mark and the tokens reach it in its own pass |
