# Nemesis: from feature-set to closed-loop OS — incorporation plan (2026-07-11)

Source: owner's "closed-loop operating system" analysis. This doc maps that vision onto
what Nemesis already has, names the keystone, and sequences the build so we don't try to
boil the ocean.

## Positioning (settled 2026-07-11)

**Vertical product now. Horizontal platform underneath. Broader life OS later.**
Academic-first, not academic-only-forever. The engine is general (Nemesis Core); the
launched product is aggressively student-focused (Nemesis Academic).

- **Initial scope = student LIFE, not merely academics.** Coursework is the wedge, but the
  product understands everything directly around it: research projects, group work, clubs,
  internship/scholarship applications, resume/portfolio, professor/advisor meetings,
  certifications, career prep, and work-shifts/personal scheduling *insofar as they affect
  school*. Broader than "study app," still narrow enough to understand the user better than
  a general agent.
- **Expansion ladder:** Academic OS → student-life OS → early-career OS → broader personal.
  Phase 3 (student→career continuity: the knowledge graph, projects, skills, contacts,
  résumé evidence transition into job search / interview prep / workplace) is the real
  long-term differentiator — "the agent that grows from school into your career."
- **Two layers, already reflected in the codebase:** the `NEMESIS_STUDENT_BUILD` flag IS
  the Core/Academic boundary today. Nemesis Core = the modified-Hermes foundation (memory,
  browser automation, connectors, tasks, scheduling, permissions, approval, audit ledger,
  local+cloud, skills/subagents). Nemesis Academic = what customers see (course model,
  syllabus parser, LMS skills, lecture pipeline, concept graph, mastery, planner,
  integrity policy, student dashboard). Future modules (Research/Career/Projects/Personal)
  hang off Core without rebuilding the product.
- **Concrete build consequence:** the Academic Object Graph schema must be widened NOW to
  **student-life object types** — Project, Application (internship/scholarship), Contact
  (professor/advisor), Meeting, Credential — alongside Course/Concept/Assignment/Exam. Ship
  academic *workflows* first, but model the objects general-enough for student life from
  day one so Phase 2 is additive, not a migration.
- **Do NOT add** (crowded / moat-less / off-thesis): general productivity at launch, social
  media, shopping/travel, home automation, business accounting/CRM/marketing, general
  coding-agent, broad consumer browsing, "every connector," autonomous graded-work
  submission. Each adds permissions, security surface, UI complexity, and marketing blur.
- **Expansion trigger (data, not impatience):** broaden only after the academic product
  shows strong retention — habitual morning briefing, multi-course connections, cross-
  semester retention, and especially **users already trying to use Nemesis outside the
  academic boundary**. Then expansion answers demand instead of guessing.
- **Brand ladder:** "Nemesis — the operating system for students" now → "your agent for
  school, projects and everything around them" → "the personal agent that grows with you."
- **What we are NOT:** not "Claude Cowork but smaller," not "StudyFetch with browser
  automation." We are a persistent personal agent that learns your academic life first,
  then grows with you through research, projects, internships, and career.

## Verdict

The analysis is correct about the shape of the gap and the north star. Nemesis today is
strong at **capture + organization + acting on the world**, and weak at the **brain**
(structured state) and the **loop** (plan → verify → adapt). The fix is not 40 features;
it's one keystone that the other engines read and write.

North-star metric (adopt as stated): *% of important academic obligations completed on
time without last-minute crisis, while measurable mastery improves.* Not messages sent,
not notes generated.

## What already exists (so we don't rebuild)

| Engine / surface (from the analysis) | Nemesis today | Gap |
|---|---|---|
| 1. Single academic source of truth | Files (notes, decks, mindmaps, tests, calendar.json) + the graph page | **No unified, queryable object model** with provenance/confidence/timestamps/relationships. State is scattered across files + localStorage. THIS IS THE KEYSTONE. |
| 2. Planning & prioritization | Calendar page (day/week/month/year), agent writes deadlines | No scoring engine, no auto-scheduling, no replanning, no "what next & why". |
| 3. Mastery engine | FSRS review (ts-fsrs) on flashcards, practice tests, mind maps | Per-**card** scheduling exists; per-**concept mastery** does not. No prerequisite graph, no misconception detection, no teach-back. |
| 4. Governed action engine | Never-submit guardrail, per-action approval, agent file/browser control, plain thinking-trail | No **standing policies**, no dry-run/undo/verify contract, no persistent action ledger. |
| 5. Evaluation & adaptation | — | Nothing measures whether the help worked. Fully missing. |
| Local-first credentials | **DONE (round 28)** — Connections: sign in locally, cookies stay local, agent never sees passwords, revocable | The analysis's recommended architecture is already ours. Keep as-is. |
| Lecture→slide→note pipeline | Recorder (on-device transcription, auto lecture note, enhance) | Missing slide alignment + concept extraction + provenance tagging. |
| Bidirectional export | PDF/DOCX/PPTX + brand-free; Anki .apkg path researched | Add CSV, calendar, full graph archive later. |

**Read:** the two limbs (sensing the world, acting on it) and the trust spine
(local-first creds, never-submit) are built. The missing middle is **structured state +
the loop**. That's a focusing insight, not a discouraging one.

## The keystone: the Academic Object Graph (build this first)

Everything else in the analysis — command center, inbox, planner, mastery, ledger —
is a **reader/writer of one structured model**. Build the model and each of those becomes
a view, not a from-scratch feature.

Design (local-first, file-backed so the agent can read/write it and it survives export):
- A JSON/SQLite store at `~/Documents/Nemesis Library/.nemesis/graph/` (hidden, exportable).
  Objects: Student, Semester, Course, Syllabus, Professor, Announcement, Lecture, Concept,
  Assignment, Exam, Grade, MasteryState, CalendarEvent, EmailThread, File, StudySession.
- Every object carries: `id, type, source (url/file/lecture-ts), createdAt, updatedAt,
  confidence (instructor-stated | course-material | student-added | AI-inference |
  unverified), status, course, relationships[], history[]`.
- The agent's existing skills (school-portal, organize, study-decks) become **writers**
  into this graph instead of scattered files; the graph is the source of truth and the
  files are projections.
- The **Graph page** upgrades from "notes connected" to a view over this model (already
  has labels + glow from round 28 — the data model is what changes).

This is the one genuinely new, load-bearing system. Estimate: the biggest single build in
the roadmap (weeks, not a round). Do it as its own focused effort with schema-first design.

## Cheap wins that ride on the keystone (ship fast once state exists)

These are mostly **assembling data we already capture** into a surface — days, not weeks:
- **Morning command center** (replace blank-chat homepage): today's 3 outcomes, changes
  since yesterday, due dates, planned blocks, unread email, one recommended next action.
  Reads the object graph + calendar + inbox.
- **Activity ledger** (top trust/marketing feature, per the analysis): a persistent,
  plain-English "here's everything I did today; I sent nothing and submitted nothing"
  timeline. We already emit tool activity (round 29 thinking phrases) — this is
  persistence + formatting.
- **Universal academic inbox**: one triage feed (email + LMS announcements + new files +
  grades) classified into Action / Schedule-change / Learning-material / Waiting /
  Reference / Conflict / Needs-judgment. The agent already reads these sources.
- **Standing policies** (governed action): "auto-download new lectures", "draft email but
  never send", "add deadlines to calendar automatically", "never touch graded work". A
  policy layer above the existing per-action approval + never-submit guardrail.

## Sequencing (folds the analysis's priority into our reality)

**Now (the coherent first product leap):**
1. Academic Object Graph (schema + writers + graph-page view) — the keystone.
2. Morning command center (homepage) — reads the graph.
3. Universal inbox — writes into the graph.
4. Activity ledger + standing policies — governed execution over the graph.
5. Lecture→slide→note→concept pipeline upgrade (feeds Concepts + MasteryState).

**Next:**
6. Adaptive planner (task scoring + auto-schedule + replan) — reads graph, writes calendar.
7. Concept-level mastery graph (FSRS per concept, prerequisites, teach-back, mock exams).
8. Evening shutdown routine (mark done, reschedule, recall, file, plan tomorrow).
9. Project mode + group rooms.
10. Mobile capture + approvals.

**Later:** LTI/official-API LMS path, skills marketplace (sandboxed), cross-semester
career planning.

## Two reconciliations with decisions already in flight

- **Image generation** (owner asked for it; the analysis says "delay generic image gen").
  Reconcile by SCOPE: image gen for **study visuals** (mechanism diagrams, labeled figures,
  slide art grounded in course material) is on-thesis and fine; a general "make me any
  picture" toy is the distraction to avoid. Ship the scoped version, skip the toy.
- **Autonomous submission** — the analysis says never; we already have the never-submit
  guardrail. No change; the standing-policy engine will make it explicit ("never interact
  with graded assessments" as a default-on policy).

## What this doesn't change

The consumer-first, local-first, never-submit, plain-English, brand-free posture all hold
and are validated by the analysis. We are not pivoting; we are adding the spine that turns
the existing features into an operating system.
