# Nemesis north star: grades → GPA → job (owner direction, 2026-07-14)

Owner's framing, verbatim intent: people go to school to learn → degree → job →
money. Nemesis therefore exists to get students **good grades and a strong GPA,
and then convert that into internships and job offers** — doing the legwork for
the user, not handing them chores.

Two consequences, stated by the owner:

## 1. Agent-led ingestion — "dropping in stuff like syllabus should be secondary"

The app exists so that **Nemesis finds the syllabi** (and deadlines, grades,
announcements) itself. Onboarding is therefore: connect your school portal →
Nemesis logs in (locally, watchable browser) → pulls syllabi/course docs →
builds the semester (courses, Calendar deadlines, Library folders, Today).
Manual upload stays as the fallback for schools we can't automate, not the
front door.

Build path (mostly exists):
- `.nemesis/portals.json` per-student portals + `school-sync` / `school-portal`
  skills already log in and extract (round-50).
- Extension: syllabus/document harvest per course → semester scaffold writer
  (Academic Object Graph entries + Calendar + Library) → Today populated.
- Old "syllabus-first upload onboarding" idea is demoted to fallback.

## 2. The Opportunity engine is not a side feature — it's the payoff

"What we're really trying to do here is get people jobs." The engine spans:

- **During school:** grade tracking ("what do I need on the final for an A"),
  GPA protection nudges, exam-week prep — the grade side of the loop.
- **Beyond school:** find internship and job openings matched to the student's
  field, year, and semester calendar (Handshake — the college job portal
  students already have logins for — fits the same portals.json +
  agent-browser pattern as Blackboard/Outlook; plus public listings), surface
  them in Today's Opportunities rail with deadlines, and **do things for the
  user**: draft the resume bullets, tailor the cover letter, prep the
  application checklist, track statuses in the graph.
- **Money adjacent:** scholarship windows and FAFSA deadline nudges.

## Hard guardrails (unchanged, restated)

- Nemesis **drafts, the student submits** — applications, like coursework, are
  never auto-submitted. The "submit" click is the student's.
- **Never form-fill government/financial forms** (FAFSA, anything wanting
  SSN/bank details) — checklists and walkthroughs only.
- Job-platform automation = read/search/draft on the student's own logged-in
  account, visible in the watchable browser, same posture as school portals.

## Release shape

- beta.9: agent-led semester ingest (portal → syllabi → scaffold), upload as
  fallback. This is onboarding week for fall semester (late August) — the wow.
- beta.10: Opportunities v1 — Handshake/public-listing search via the agent,
  Opportunities rail in Today (deadline-aware), application drafting flows.
- Grade tracking rides whichever release the portal grade-scrape lands in.

Related docs: nemesis-closed-loop-os-roadmap-2026-07.md (this is the loop's
"act" stage pointed at the real outcome), pharmaorb-school-os-vision-2026-07.md.
