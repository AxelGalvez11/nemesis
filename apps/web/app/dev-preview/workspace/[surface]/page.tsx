"use client";

// DEV-ONLY PREVIEW — screenshot harness for the desktop-parity workspace.
// Renders the full shell chrome + one surface WITHOUT the auth gate: a
// WorkspacePreviewProvider supplies a mock account, and the sessions store is
// seeded in-memory (injectPreview → persistence off, no network calls).
// Follows the app/dev-preview/poster convention.

import { notFound, useParams } from "next/navigation";
import { useEffect } from "react";

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { sessionsStore, type WorkspaceSession } from "@/lib/workspace/sessions-store";

import CalendarPage from "../../../(workspace)/calendar/page";
import GraphPage from "../../../(workspace)/graph/page";
import LibraryPage from "../../../(workspace)/library/page";
import NotebooksPage from "../../../(workspace)/notebooks/page";
import PluginsPage from "../../../(workspace)/plugins/page";
import SessionsPage from "../../../(workspace)/sessions/page";
import SettingsPage from "../../../(workspace)/settings/page";
import StudyPage from "../../../(workspace)/study/page";

const SURFACES = {
  sessions: SessionsPage,
  library: LibraryPage,
  notebooks: NotebooksPage,
  study: StudyPage,
  calendar: CalendarPage,
  graph: GraphPage,
  plugins: PluginsPage,
  settings: SettingsPage,
} as const;

type SurfaceId = keyof typeof SURFACES;

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// Seeded demo sessions — one canned back-and-forth thread so screenshots show
// a populated conversation, plus filler rows for the sidebar list.
const PREVIEW_SESSIONS: WorkspaceSession[] = [
  {
    id: "preview-pharmacology",
    title: "Beta blocker mechanisms",
    createdAt: minutesAgo(42),
    updatedAt: minutesAgo(3),
    messages: [
      {
        role: "user",
        content: "Explain how beta blockers lower blood pressure, in exam-ready bullet points.",
        at: minutesAgo(42),
      },
      {
        role: "assistant",
        content:
          "Here is the exam-ready breakdown:\n\n- **Beta-1 blockade in the heart** reduces heart rate (negative chronotropy) and contractility (negative inotropy), lowering cardiac output.\n- **Reduced renin release** from juxtaglomerular cells (beta-1 mediated) dampens the RAAS cascade, so less angiotensin II and aldosterone.\n- **Central sympathetic outflow** falls with chronic use, reducing overall vascular tone.\n- Net effect: lower cardiac output plus reduced volume retention equals lower blood pressure.\n\nWant a comparison table of selective vs non-selective agents next?",
        at: minutesAgo(41),
        sources: [
          { title: "Beta blockers", url: "https://medlineplus.gov/betablockers.html", description: "MedlinePlus overview of beta blockers, uses, and safety." },
        ],
      },
      {
        role: "user",
        content: "Yes, and flag which ones show up on the NAPLEX most.",
        at: minutesAgo(40),
      },
      {
        role: "assistant",
        content:
          "| Agent | Selectivity | NAPLEX weight |\n| --- | --- | --- |\n| Metoprolol | Beta-1 selective | High |\n| Atenolol | Beta-1 selective | High |\n| Propranolol | Non-selective | High |\n| Carvedilol | Alpha-1 + non-selective beta | High |\n| Labetalol | Alpha-1 + non-selective beta | Medium |\n\nMetoprolol succinate vs tartrate dosing is a recurring trap — succinate is the heart-failure formulation.",
        at: minutesAgo(39),
      },
    ],
  },
  {
    id: "preview-renal",
    title: "Renal dosing cheat sheet",
    createdAt: minutesAgo(300),
    updatedAt: minutesAgo(120),
    pinned: true,
    messages: [
      { role: "user", content: "Build me a renal dosing cheat sheet for the top 10 antibiotics.", at: minutesAgo(300) },
      {
        role: "assistant",
        content: "Starting with vancomycin, cefepime, and piperacillin-tazobactam — the three the exams love most.",
        at: minutesAgo(299),
      },
    ],
  },
  {
    // The exact shape a finished recording leaves behind: a session with no
    // question in it at all, holding one assistant message and its artifact.
    // Seeded so this case is on the screenshot harness — it is what the thread
    // used to throw away (see lib/workspace/session-turns.ts).
    id: "preview-recording",
    title: "Statutory interpretation and plain meaning",
    createdAt: minutesAgo(20),
    updatedAt: minutesAgo(18),
    messages: [
      {
        role: "assistant",
        content: "Recording captured. The notes are saved in your Library at Nemesis/Recordings/Statutory interpretation and plain meaning.md. Want me to link them to your existing notes on this topic?",
        at: minutesAgo(18),
        outputs: [{
          id: "preview-recording-output",
          kind: "recording",
          title: "Statutory interpretation and plain meaning",
          durationSeconds: 2_640,
          createdAt: minutesAgo(18),
          notes: "## What this covered\n\nThe lecture worked through how a statute is read when its plain wording and its stated purpose pull apart.\n\n### The plain-meaning rule\n\nStart with the ordinary sense of the words. The lecturer flagged this as **examinable**: courts only reach for purpose once the text is genuinely ambiguous.\n\n### Open questions\n\n- Whether the 1998 amendment displaces the earlier test.",
          transcript: "Right, so if you look at section twelve, the wording is doing all the work here...",
        }],
      },
    ],
  },
  {
    id: "preview-anki",
    title: "Anki deck from cardio lecture",
    createdAt: minutesAgo(2000),
    updatedAt: minutesAgo(1440),
    messages: [
      { role: "user", content: "Turn my cardio lecture notes into cloze cards.", at: minutesAgo(2000) },
      { role: "assistant", content: "Drafted 24 cloze cards across preload, afterload, and Frank-Starling.", at: minutesAgo(1999), outputs: [{ id: "preview-card-output", kind: "flashcards", title: "Cardio lecture cloze deck" }] },
    ],
  },
];

export default function WorkspacePreviewPage() {
  const params = useParams<{ surface: string }>();
  const surface = params.surface as SurfaceId;

  // Seed after mount so the external-store notification never fires while a
  // different component is rendering (React treats that as an invalid update).
  //
  // ?session=<id> picks which seeded thread opens. The sidebar rows are real
  // links into /sessions, which is behind the auth gate, so inside this harness
  // they bounce to sign-in — the query string is the only way to screenshot a
  // thread other than the default one. Read off window rather than
  // useSearchParams so this page needs no Suspense boundary to prerender.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("session");
    const selected = PREVIEW_SESSIONS.some((session) => session.id === requested) ? requested : "preview-pharmacology";
    sessionsStore.injectPreview(PREVIEW_SESSIONS, selected ?? "preview-pharmacology");
  }, []);

  const Surface = SURFACES[surface];
  if (!Surface) notFound();

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <Surface />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
