# School portal extraction (Blackboard + Outlook web)

Use this skill when the student asks you to check their school portal, pull course
materials, summarize announcements, or triage school email. You have real browser
automation tools (browser_navigate, browser_snapshot, browser_click, browser_type,
browser_scroll, browser_press, browser_back) — use them for Blackboard, Outlook on the
web, and similar school sites that have no public API.

## Hard rules (non-negotiable)

1. **Never submit anything.** Do not click Submit, Send, Post, Reply, or any button that
   publishes on the student's behalf — no assignment submissions, no discussion posts, no
   emails sent. You prepare drafts and summaries; the student submits. If a task seems to
   require submitting, stop and tell the student to do that step themselves.
2. **Never change account settings**, forwarding rules, passwords, or sharing permissions.
3. **Login belongs to the student.** If a page asks for credentials or two-factor codes,
   pause and tell the student to complete the login. Never ask them to paste passwords
   into the chat.
4. **Read-only bias.** Navigation, reading, and downloading course materials the student
   already has access to are fine. Anything that writes to the portal is not.

## Portal addresses: ask once, remember forever

Before any portal work, check your USER.md memory snapshot for a "School portals"
entry. If it's missing:

1. ASK the student for their school's exact Blackboard web address (e.g.
   `https://learn.<school>.edu`) and whether their school email is plain
   `outlook.office.com` or a school-specific mail URL.
2. SAVE the answer immediately with the memory tool (target USER.md), one entry:
   `School portals — Blackboard: <url> · Mail: <url>`.
3. Never ask again once saved. If the student corrects an address later, use the
   memory replace action to update the same entry — don't add duplicates.

## Blackboard flow

1. Navigate to the school's Blackboard URL from memory (see above).
2. After the student completes login, snapshot the page.
3. Click the **hamburger button** ("Open main navigation") to reveal all sections:
   Courses, Institution Page, Calendar, Grades, Messages, Tools.
4. Open **Courses** — the page may default to a past term. Use **Filters dropdown →
   Terms → "Current Courses"** and close the filter panel to see active courses.
5. For each active (Open) course:
   - Check **Content** (default landing — posted files, assessments with due dates)
   - Check **Announcements** (separate tab — not shown on Content page)
   - Items to note: name, type, due date, "Start attempt" status
   - Closed courses block entry with a dismissable alert dialog — press Escape.
6. Check the **Institution Page** via the nav menu for IT/help announcements and
   resource links (Simple Syllabus issues, Safari workarounds, etc.).
7. Save a consolidated **daily brief** as Markdown into
   `~/Documents/Nemesis Library/School/Daily brief — Blackboard YYYY-MM-DD.md`.
   Order: due-soon list first, then new materials, then announcements, each with
   its course tag. End with a note that Outlook is checked separately.
8. To CAPTURE a file the student asks for: click its download link in the browser
   (it lands in `~/Downloads`), then move it with the terminal into
   `~/Documents/Nemesis Library/School/<Course>/`, and say where you put it.

> See `references/uthsc-blackboard.md` for school-specific navigation patterns.

## Outlook web flow

1. Navigate to the mail URL from memory (default outlook.office.com; student logs
   in themselves).
2. Snapshot the inbox list; open only what's needed to summarize.
3. Triage into: action needed (assignments, professor requests, registration deadlines),
   informational (newsletters, campus events), ignorable. Cite sender + date for each.
4. You may DRAFT replies in the chat for the student to copy. Never click Send.
5. Save the triage as a note in `~/Documents/Nemesis Library/School/Inbox brief <date>.md`
   when the student asks to keep it.

## Style

Summaries in plain English, newest first, always with dates. If a page fails to load or
the session expires, say exactly where you got stuck rather than guessing at content.
