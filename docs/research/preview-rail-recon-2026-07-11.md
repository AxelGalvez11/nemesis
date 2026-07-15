# Right-rail preview recon — how Claude Code / ChatGPT / Cursor render files (2026-07-11)

Research question (owner): how do Claude Code, Codex, Claude.ai, ChatGPT Canvas, and Cursor
display browsers, sources, markdown, PDF, and PPTX in their right-side drawers — and what
should Nemesis adopt?

## Technique per file type

| File type | Claude Code Desktop | ChatGPT/Codex desktop | Claude.ai Artifacts | Cursor |
|---|---|---|---|---|
| Live browser | Tabbed embedded Chromium, own profile, agent-drivable | Same ("built-in browser", optional CDP devtools) | n/a (chat SPA) | Embedded Chromium tab + DOM visual-editor overlay |
| Web sources | Open as tabs in the browser pane | Same | Citation chips linking out (inferred) | Embedded browser tab |
| Markdown | Plain text in editor pane — NOT rendered | Rendered live (own parser) | `text/markdown` → HTML in iframe sandbox | VS Code markdown preview (iframe) |
| PDF | Embedded browser's native PDFium (plausible, undocumented) | Same | Almost certainly pdf.js (SPA, no webview) | Bundled webview PDF preview |
| PPTX/DOCX | UNSUPPORTED | Previews *generated* docs only (technique undisclosed) | Not previewed (upload = text extraction) | UNSUPPORTED |
| Images | Native img | Native | Native img in iframe | Native |

Notable: OpenAI's "Codex app" browser docs now redirect to ChatGPT desktop docs — the two
surfaces merged; Codex CLI/IDE has no preview UI at all.

## PPTX/DOCX answer for Nemesis

Nobody above solves generic Office preview. The proven prior art is the VS Code office
extension (cweijan/vscode-office, 1.5k★), which publishes its stack:
- PDF → mozilla/pdf.js (we already ship this)
- DOCX → **docx-preview** (VolodymyrBaydalka/docxjs, 2k★ — DOCX→HTML/CSS incl. page breaks, JSZip, pure client-side)
- PPTX → pptxviewjs / **pptx-glimpse** (pure TS, PPTX→SVG/PNG, ~30MB, MIT, actively maintained, 136 preset shapes, charts, tables; static only — no animations)

**Recommended (no LibreOffice):** docx-preview + pptx-glimpse renderers added to our
existing rail. Trade-off: two renderers, static fidelity.
**If bundling ~500MB is ever acceptable:** headless `soffice --convert-to pdf` → feed our
existing pdf.js viewer. One pipeline, exact fidelity, big install + seconds per file.
(Gotenberg is the server-side packaging of the same pattern.)

## UX patterns worth copying

1. **Route-by-extension (Claude Code):** any file path in chat is a live link; type decides
   the pane automatically — no "preview" button.
2. **Annotate-then-request (ChatGPT):** draw/click on any preview, leave a note, it becomes
   grounded context for the agent's next turn — makes the rail an edit-request surface.
3. **Browser as first-class pane (Cursor):** draggable out of the window, real inspector —
   not a bolt-on modal.

## Nemesis gap analysis

Already at parity or better: live agent-drivable browser (native WebContentsView), pdf.js
viewer with thumbnails, markdown notes, tabbed rail, sources panel.
Gaps to close, in order of value:
1. docx-preview + pptx-glimpse renderers in the rail (deps to add; MIT).
2. Route-by-extension: clicking any Library/chat file path opens the right renderer
   automatically.
3. Later: annotate-then-request on previews (turns review into instructions).

Sources: code.claude.com/docs/en/desktop · learn.chatgpt.com/docs/browser ·
learn.chatgpt.com/docs/artifacts-viewer · simonwillison.net/2024/Aug/28 (Artifacts) ·
forum.cursor.com/t/pdfs-are-stale-in-the-cursor-browser/160016 · cursor.com/blog/browser-visual-editor ·
github.com/cweijan/vscode-office · github.com/hirokisakabe/pptx-glimpse · gotenberg.dev
