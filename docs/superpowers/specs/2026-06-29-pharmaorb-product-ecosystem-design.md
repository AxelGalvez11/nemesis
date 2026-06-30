# PharmaOrb Product Ecosystem Design

## Positioning

PharmaOrb should become one evidence operating system with three user-facing surfaces:

```text
One evidence backend
  -> Web workspace
  -> Mobile companion
  -> Supervised research agent / desktop operator
```

The short positioning:

> PharmaOrb is the AI evidence engine for health and science, available as a web workspace, mobile companion, and supervised research agent.

This should not become three disconnected products. The account, projects, paper library, watchlists, evidence graph, billing, reports, and API/MCP access should be shared.

## Research Notes

- Elicit’s public product framing supports the web-workspace thesis: search across academic papers and clinical trials, generate research reports, support systematic literature review screening/data extraction, store library sources, and send alerts.
  - https://elicit.com/
- Scite validates the support/contradiction wedge: Smart Citations classify citation statements as supporting, contradicting/contrasting, or mentioning.
  - https://scite.ai/features
  - https://scite.ai/blog/scite-and-wiley-partner-to-introduce-smart-citations-40537e71f3f8
- Zotero validates research-library behavior across surfaces: collect, organize, annotate, cite, share, sync, and collaborate.
  - https://www.zotero.org/
- ChatGPT Agent validates supervised “research operator” behavior: browser interaction, text browsing, terminal/tool use, connectors, file manipulation, spreadsheets/slides, user interruption, and explicit permission for consequential actions.
  - https://openai.com/index/introducing-chatgpt-agent/
- Mobile scanning is technically realistic: Google ML Kit supports text recognition, document scanning, and barcode scanning; Apple VisionKit supports iOS vision/document workflows but its public docs require JavaScript in browser.
  - https://developers.google.com/ml-kit/vision/text-recognition/v2
  - https://developers.google.com/ml-kit/vision/barcode-scanning
  - https://developer.apple.com/documentation/visionkit

## Surface 1: PharmaOrb Web App

The web app is the core product and should receive the most engineering attention first.

Primary jobs:

- evidence chat
- PubMed / Europe PMC / OpenAlex / ClinicalTrials search
- projects
- saved chats
- paper library
- literature reviews
- evidence tables
- systematic review workflows
- claim check
- evidence maps
- watchlists
- reports and exports
- team collaboration

Design principle: web is where serious research gets organized and turned into deliverables.

## Surface 2: PharmaOrb Mobile

Mobile is the companion, not the heavy research workspace.

Primary jobs:

- quick evidence questions
- scan supplement labels
- scan medication labels
- scan food/product labels
- save articles, screenshots, links, and PDFs into a project
- voice-note research ideas
- receive watchlist/study alerts
- read short evidence summaries

Design principle: mobile captures real-world inputs and sends them into the web workspace.

Example flow:

```text
User sees “matcha causes anemia”
  -> opens PharmaOrb Mobile
  -> scans product or saves video/article context
  -> asks quick evidence question
  -> creates watchlist/project
  -> later reviews full evidence map on web
```

## Surface 3: PharmaOrb Agent / Desktop

Agent/Desktop is the premium labor layer.

Primary jobs:

- browser automation for research workflows
- course/portal imports where user approves access
- Google Drive organization
- PDF downloading and summarization
- Zotero organization
- evidence table extraction
- spreadsheet updates
- research report drafting
- systematic review grunt work
- study monitoring

Design principle: do not lead with “controls your computer.” Lead with “does the boring research work while you supervise.”

Safety principle: agent workflows require approval before consequential actions, sensitive portal interactions, sending messages, submitting forms, deleting files, purchases, or changing external systems.

## Product Ladder

- Free: limited evidence search and chat.
- Web Pro: projects, saved reports, watchlists, higher limits.
- Researcher: PDFs, literature matrices, systematic review tools, advanced reports.
- Agent: supervised browser/desktop research workflows and monthly agent hours.
- Agent Pro: deeper workflows, Zotero, extraction sheets, more agent hours.
- Teams/Labs: shared libraries, audit logs, team projects, admin controls.
- Enterprise: SSO, custom integrations, private evidence infrastructure, API/MCP scale.

## Roadmap

1. Web app MVP: evidence chat, evidence broker, projects, citations, reports.
2. Research workflows: paper library, watchlists, evidence tables, claim check, gap reports.
3. Mobile companion: quick questions, label scanning, capture, alerts.
4. Browser agent: Playwright-based research operator for web workflows and portal imports.
5. Desktop agent: local PDFs, Zotero, spreadsheets, supervised computer-use.

## Key Constraint

Do not build all three equally at once. The web app and evidence backend are the foundation. Mobile and agent features should feed into the same project/library/watchlist system instead of creating parallel data silos.
