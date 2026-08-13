#!/usr/bin/env python3
"""TeammateIdle nudge: point an idle teammate at unblocked work in its own lane.

FAILS OPEN, and deliberately does NOT manufacture work. If the lane is legitimately blocked,
idling is the correct state and saying so is information. This only reminds the teammate where to
look and what the rules are.
"""
import sys

sys.stderr.write(
    "You are idle. Before stopping:\n"
    "1. Check the shared task list for an UNBLOCKED task in YOUR lane. If one exists, claim it "
    "(first claim wins) and continue.\n"
    "2. If your lane has work that is genuinely blocked, report NO CURRENT WORK and say what "
    "blocks it. An idle lane with a reason is information; a busy lane with no leverage is waste.\n"
    "3. Do NOT invent work, do NOT start another lane's task, and do NOT edit files you do not own "
    "(see your agent definition).\n"
    "The stop condition for the whole team is docs/canvas-v1-acceptance.md.\n"
)
sys.exit(0)
