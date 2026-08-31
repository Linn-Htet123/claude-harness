---
name: postmortem
description: Write up what broke and why, and append the lesson to memory/lessons.md so future sessions read it before debugging. Use after any incident, outage, or bug that cost real time.
argument-hint: "[what happened]"
---

# Postmortem

The point is not the document. The point is that the next person - or the
next Claude session - does not repeat this.

## Blameless

Write about systems, not people.

- Not: "Larry deployed without testing."
- Yes: "The deploy path had no required test gate, so an untested change
  reached production."

If a person could make this mistake, the system allowed it. Fix the system.

## The document

```markdown
# <short title> - <YYYY-MM-DD>

## What users saw
<the symptom, in plain words, and for how long>

## Impact
<how many users, what they could not do, money if known>

## Timeline
| Time | What happened |
|---|---|
| 14:02 | change deployed |
| 14:15 | error rate rose |
| 14:40 | first person noticed |
| 15:10 | rolled back |

## Root cause
<the actual mechanism - keep asking "why" until it stops>

## Why it was not caught
<the honest one - no test, no alert, no review, no staging parity>

## Fix
<what was done>

## Actions
| Action | Owner | Ticket |
|---|---|---|
```

The gap between "when it broke" and "when someone noticed" is usually the
most valuable line in the timeline. It tells you what monitoring is missing.

## Then - the important part

Append a short entry to `memory/lessons.md` in the harness repo:

```markdown
## YYYY-MM-DD - <short title>
- **What happened:** <one line>
- **Root cause:** <one line>
- **Fix:** <one line>
- **How to avoid next time:** <the thing a future session should check first>
```

Keep it to four lines. This file gets read at the start of every debugging
session, so it must stay short enough to read.

This is the same pattern Anthropic uses for their own on-call agent: an
accumulating `lessons.md` in git, read before each investigation. Memory that
lives in a file, not in a chat history that disappears.

## Rules

- No blame, ever.
- "We should be more careful" is not an action. An action is a test, an
  alert, a check, a gate - something that works when nobody is being careful.
- If the same lesson is already in `lessons.md`, the fix failed. Say that
  out loud - a repeat is a much bigger signal than a first occurrence.
