"use client";

// DEV-ONLY PREVIEW — an answer's typography, with one of everything in it.
//
// 🔴 IT EXISTS BECAUSE NO OTHER HARNESS DRAWS ASSISTANT MARKDOWN. The lesson preview seeds a lesson
// and the board preview seeds cards; neither mounts `AssistantMarkdown`, so headings, quotes,
// tables and fences in an answer have never been visible outside a live conversation. Owner,
// 2026-09-06: *"copy the chat ui/ux as well so we have a good base for chat"*, and the base is
// exactly these elements. `data-slot` is the assistant wrapper the stylesheet keys some rules to,
// so what renders here is dressed the way a real answer is.

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";

const ANSWER = `# Cardiac action potentials

Heart cells change their membrane voltage by controlling which ions cross the membrane, and when.

> During the effective refractory period no stimulus, however strong, can produce a propagated beat, because the fast sodium channels have not yet recovered from inactivation.

## The five phases

Phase 0 is the upstroke. Fast voltage-gated sodium channels open and the cell depolarises within about a millisecond.

- Phase 1, a brief notch as potassium leaves
- Phase 2, the plateau, where calcium in balances potassium out
- Phase 3, repolarisation
- Phase 4, the resting potential

### Where they differ

| Tissue | Upstroke | Plateau |
| --- | --- | --- |
| Ventricular muscle | Sodium | Long |
| Sinoatrial node | Calcium | None |

1. Ions move down their gradients.
2. Channels open and close on a clock of their own.

Blocking the fast sodium channel slows conduction through ventricular muscle but leaves the node's rate alone.

\`\`\`text
Phase 0  ─┐
Phase 2   └────────┐
Phase 3            └──
\`\`\`

---

#### A smaller heading

That is the whole shape of it.
`;

export default function AnswerMarkdownPreview() {
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <main className="min-h-screen bg-(--ui-bg-editor) py-12" data-workspace="">
        <div className="mx-auto w-[768px]" data-slot="aui_assistant-message-content">
          <AssistantMarkdown text={ANSWER} />
        </div>
      </main>
    </WorkspacePreviewProvider>
  );
}
