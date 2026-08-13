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
import LearnPage from "../../../(workspace)/learn/page";
import LibraryPage from "../../../(workspace)/library/page";
import LibraryClassicPage from "../../../(workspace)/library/classic/page";
import NotebooksPage from "../../../(workspace)/notebooks/page";
import PluginsPage from "../../../(workspace)/plugins/page";
import SessionsPage from "../../../(workspace)/sessions/page";
import SettingsPage from "../../../(workspace)/settings/page";
import StudyPage from "../../../(workspace)/study/page";

const SURFACES = {
  // 🔴 THE CANVAS HAD NO PREVIEW AT ALL, which is why every visual claim about it has needed the
  // owner's own signed-in browser. It reads its state from the query exactly as the real route
  // does, so `?c=<id>` here renders the canvas surface — and, with no session behind it, the
  // PROCESSING state, which is the one §38.2 cares most about because it is where a deep link, a
  // hard refresh and a return from sign-in all land first.
  learn: LearnPage,
  sessions: SessionsPage,
  library: LibraryPage,
  "library-classic": LibraryClassicPage,
  notebooks: NotebooksPage,
  study: StudyPage,
  calendar: CalendarPage,
  // chill is retired: its route now server-redirects to /learn, so there is no component
  // here to preview. The games under BreakWorkspace are untouched.
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
    id: "preview-commerce",
    title: "Dormant commerce clause",
    createdAt: minutesAgo(42),
    updatedAt: minutesAgo(3),
    messages: [
      {
        role: "user",
        content: "Explain the dormant commerce clause, in exam-ready bullet points.",
        at: minutesAgo(42),
        // An attachment so the transcript's file chip — and the reader it opens
        // — can be seen in the harness. The path is the public fixture, which
        // AttachmentPreviewDialog resolves through the same "a leading slash is
        // already a URL" rule the Library fixtures use.
        attachments: [
          { name: "Con Law – Week 4 slides.pdf", kind: "file", mime: "application/pdf", url: "/reader-sample.pdf" },
        ],
      },
      {
        role: "assistant",
        content:
          "Here is the exam-ready breakdown:\n\n- **Facial discrimination** against out-of-state commerce is virtually per se invalid; the state must show no reasonable non-discriminatory alternative exists.\n- **Even-handed laws** with only an incidental burden go to the Pike balancing test instead.\n- **Pike balancing** asks whether the burden on interstate commerce is clearly excessive next to the local benefit.\n- Net effect: how the law treats out-of-state actors on its face decides which test you are in, and the test usually decides the case.\n\nWant the leading cases lined up against each prong next?",
        at: minutesAgo(41),
        sources: [
          { title: "Dormant Commerce Clause", url: "https://www.law.cornell.edu/wex/dormant_commerce_clause", description: "Cornell Legal Information Institute overview of the doctrine and its tests." },
        ],
      },
      {
        role: "user",
        content: "Yes, and flag which ones come up most in past papers.",
        at: minutesAgo(40),
      },
      {
        role: "assistant",
        content:
          "| Case | Prong | Exam weight |\n| --- | --- | --- |\n| Philadelphia v. New Jersey | Facial discrimination | High |\n| Hunt v. Washington Apple | Discriminatory effect | High |\n| Pike v. Bruce Church | Balancing | High |\n| C&A Carbone v. Clarkstown | Facial discrimination | Medium |\n| Exxon v. Governor of Maryland | Incidental burden | Medium |\n\nPike is the one to know cold — the balancing language gets quoted in almost every answer.",
        at: minutesAgo(39),
      },
    ],
  },
  {
    id: "preview-thermo",
    title: "Thermodynamics formula sheet",
    createdAt: minutesAgo(300),
    updatedAt: minutesAgo(120),
    pinned: true,
    messages: [
      { role: "user", content: "Build me a formula sheet for the second-law problems in this unit.", at: minutesAgo(300) },
      {
        role: "assistant",
        content: "Starting with entropy change, Carnot efficiency, and the Clausius inequality — the three your problem sets lean on hardest.",
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
    id: "preview-deck",
    title: "Deck from the Baroque lecture",
    createdAt: minutesAgo(2000),
    updatedAt: minutesAgo(1440),
    messages: [
      { role: "user", content: "Turn my Baroque lecture notes into cloze cards.", at: minutesAgo(2000) },
      { role: "assistant", content: "Drafted 24 cloze cards across Caravaggio, tenebrism, and the Counter-Reformation commissions.", at: minutesAgo(1999), outputs: [{ id: "preview-card-output", kind: "flashcards", title: "Baroque lecture cloze deck" }] },
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
    const selected = PREVIEW_SESSIONS.some((session) => session.id === requested) ? requested : "preview-commerce";
    sessionsStore.injectPreview(PREVIEW_SESSIONS, selected ?? "preview-commerce");
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
