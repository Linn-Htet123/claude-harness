---
name: triage-bug
description: Find the real cause of a bug instead of the first thing that looks wrong. Use for any reported bug, failing test, error, or "it works on my machine" problem.
argument-hint: "[the bug or error]"
---

# Triage a bug

The first thing that looks wrong is usually not the cause. Slow down.

## Step 0 - check the memory

Read `memory/lessons.md` in the harness repo. If this bug has happened
before, the answer is already written down.

## Step 1 - reproduce it

**You may not debug something you cannot reproduce.**

Get to a command that fails, reliably, every time:

```
<command> -> <the exact error>
```

If you cannot reproduce it, stop and gather instead:
- exact steps the reporter took
- environment (branch, node/python version, OS, env vars)
- full error text and stack trace, not a screenshot description
- when did it last work

Ask for these. Do not start fixing.

## Step 2 - narrow it down

Cut the space in half at a time:

- Does it fail on `main` too? (`git stash && <command>`)
- `git log` / `git bisect` - which commit introduced it?
- Does it fail with minimal input?
- Comment out half. Still broken? The cause is in the other half.
- Add logging at the boundaries: what goes in, what comes out.

Write down what you ruled out. Ruled-out branches are progress.

## Step 3 - find the real cause

Keep asking "but why does that happen?" until the answer is a specific line
and a specific reason.

```
Symptom:   checkout page shows $0
Because:   cart.total is 0
Because:   items array is empty
Because:   the fetch returned 200 with an empty body
Because:   the userId query param is undefined
Because:   the route reads req.params.userId, but the route is
           defined as /:user_id            <- THE CAUSE, routes.ts:31
```

Stop when the next "why" leaves your codebase.

## Step 4 - prove it before fixing

Write a **failing test** that reproduces the bug. Watch it fail.

Now you have proof you understood it, and proof it will not come back.

## Step 5 - fix it

Smallest change that fixes the actual cause. Run the failing test - it
passes. Run the full suite - still green.

## Step 6 - write it down

If this cost more than an hour, or could bite someone again, run
`/postmortem` to add it to `memory/lessons.md`.

## Rules

- Never fix a symptom you do not understand. A fix you cannot explain is a
  bug that moved.
- Never "fix" by adding a try/catch that hides it.
- If two things changed, undo one. Never debug two variables at once.
- Say what you are **not** sure about. Guessing confidently is the worst
  outcome here.
