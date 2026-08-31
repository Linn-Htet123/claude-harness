---
name: hotfix
description: Handle a production problem - stop the bleeding with the smallest safe change, then do it properly. Use when something is broken in production right now and users are affected.
argument-hint: "[what is broken]"
---

# Hotfix

Production is broken. Different rules apply. Be boring.

## Step 1 - what is actually happening (2 minutes)

Answer these before touching anything:

- What is the user-visible symptom?
- How many users? All, some, one?
- When did it start?
- What changed near that time? (`git log`, recent deploys, a config change,
  an expired credential, an upstream provider)

If MCP tools are connected, look at live state rather than guessing -
Sentry for the error, Railway/Vercel for deploys and logs, PostHog for
the drop in events.

## Step 2 - tell a human, now

Before you fix anything, post what you know:

```
ISSUE: <symptom>
IMPACT: <who and how many>
SINCE: <time>
STATUS: investigating
```

An unreported outage is worse than a slow fix.

## Step 3 - can you just undo it?

**Ask this before writing any code.**

If a recent deploy caused it, rolling back is faster, safer, and more
reversible than a new fix. Rolling back is not defeat.

Rollback and deploy are live actions. **Propose it - do not do it.** Wait
for a human to say go.

## Step 4 - smallest safe change

If you must patch:

- Fix only the thing that is bleeding. Nothing else.
- No refactor. No cleanup. No renaming. No "while I'm in here".
- No new dependency.
- Prefer a change you can undo in one command.
- If a feature flag can turn it off, use the flag instead of code.

## Step 5 - prove it

Write a test that fails on the bug and passes with the fix. Even now.
Especially now - this is the fix most likely to be wrong.

Run the full suite.

## Step 6 - PR, and stop

Open a PR. Title it `hotfix: <what>`. In the body:

```
## Symptom
## Cause
## Fix
## Blast radius
## How to undo this
## Follow-up needed
```

**Do not merge. Do not deploy.** A human reviews and ships it.
That rule does not relax because it is urgent - urgency is exactly when
mistakes happen.

## Step 7 - afterwards

Run `/postmortem`. The proper fix goes in a normal ticket, not this PR.

## Rules

- Never deploy, merge, roll back, restart a service, or change an env var
  without a human saying yes.
- Never batch a hotfix with anything else.
- If you do not understand the cause, say so and escalate. A wrong hotfix
  during an incident makes it a longer incident.
