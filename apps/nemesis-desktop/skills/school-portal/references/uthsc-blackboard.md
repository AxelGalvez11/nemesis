# UTHSC Blackboard Ultra — navigation reference

## Logged-in landing
After login, Blackboard Ultra renders inside an **iframe** (`notif-websockets-...` origin).  
Browser snapshots are from the iframe, not the parent page. This works — the iframe IS the app.

## Main navigation
Click the **hamburger button** ("Open main navigation") to reveal:
- Your name (profile)
- Institution Page
- Activity
- **Courses** ← main course list
- Organizations
- Calendar
- Messages
- Grades
- Tools
- Sign Out

## Finding active courses
Courses page defaults to the **last-viewed term** (e.g. "Spring 2026").  
To see currently active courses:

1. Click **"Filters dropdown"** button
2. In the **Terms** combobox, select **"Current Courses"**
3. Click **Close** to apply

The filter tags appear: `Current Courses` with a delete button.

## Course list grid
Each course card shows:
- Course name and code (e.g. "PHCY4000_45007_202640")
- Status badge: **Open** (active) or **Closed** (past — no access)
- Instructors (expandable "Multiple Instructors" button)
- Favorite/unfavorite star button

## Entering a closed course
Clicking a **Closed** course triggers an alert dialog:
> "You can't access this course right now. Your instructor will allow access when the course is ready."
>
> [OK] button

Dismiss with **Escape** or click OK (ref may shift — use `browser_press` key=Escape).

## Inside a course
Course page has a toolbar with links: Content, Calendar, Announcements, Discussions, Gradebook, Messages, Groups.

**Content page** is the default — shows all posted items.
- Empty course = "Content is on the way!"
- Items show: title, type badge, optional due date, "Start attempt N" for assessments
- Use **"Search course content"** link to find specific files

**Announcements** are under their own tab — not shown on the Content page.

## Institution Page (notices/announcements)
URL: `https://blackboard.uthsc.edu/ultra/institution`  
Contains IT/help announcements from UTHSC:
- System issues (Simple Syllabus, Safari document errors, Blackboard mobile app)
- Resource links (CARE Team, TimelyCare, Library, Disability Services, etc.)

## Daily brief workflow
After scanning courses + Institution Page:
1. Save note to `~/Documents/Nemesis Library/School/Daily brief — Blackboard YYYY-MM-DD.md`
2. Check Outlook separately (not auto-logged-in from Blackboard session — sign-in is independent)
3. End with a read-only disclaimer: nothing submitted or changed
