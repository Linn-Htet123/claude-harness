---
name: pm-handoff
description: Turn engineering work into plain language for a non-technical person - a PM, a founder, a stakeholder. Use when you need to report status, explain a delay, explain a technical constraint, or answer "is it done yet".
argument-hint: "[what you need to communicate]"
---

# PM handoff

The person reading this does not care how it works. They care about: can I
plan around this?

## Get the facts first

Do not write from memory. Check:

- `git log` since the last update
- Open PRs and their review state
- Ticket state (Linear / GitHub / Jira MCP if connected)
- What is actually blocked, and on whom

## The format

```markdown
**<Feature or ticket name>**

**Status:** <On track | At risk | Blocked | Done>

**Where it is:** <one sentence a non-engineer understands>

**What is left:** <plain steps, no jargon>

**When:** <a date, or "I can give a date after X">

**What I need from you:** <a decision, an approval, access - or "nothing">
```

## Translating

| Do not write | Write |
|---|---|
| Refactoring the auth middleware | Making login checks work the same everywhere, so we stop getting the random logout bug |
| Blocked on the migration | Waiting on a database change. It needs approval from whoever owns the database. About a day after that |
| It's mostly done, just needs testing | The code is written. Now proving it works, which is about half a day |
| We have tech debt in that area | That part of the code is fragile. Changing it is slow and risky until we clean it up. Roughly N days |

## Rules

- **Say a real status.** "At risk" today is a gift. "On track" today and a
  surprise slip on Friday is not.
- **No jargon.** No refactor, middleware, race condition, tech debt, edge
  case, regression. If you must use a term, explain it in the same sentence.
- **Never give a date you do not believe.** "I can commit to a date once I
  know X" is a real answer.
- **Short.** Five lines beats a page. They will ask if they want more.
- If you were asked for a decision that is financial, legal, or about
  scope-versus-deadline, that is not yours to make. Name the decision and
  route it to the right person.
