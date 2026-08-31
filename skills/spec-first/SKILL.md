---
name: spec-first
description: Turn a vague request or ticket into a written SPEC.md before any code is written. Use when a ticket is unclear, when the work touches more than one file, or when you are about to build something and are not sure exactly what is being asked for.
argument-hint: "[ticket id or one-line description]"
---

# Spec first

A vague ticket becomes a wrong feature. Get it exact on paper first, where
changing it is free.

## Step 1 - gather what already exists

Do not ask the human anything you can look up yourself. First:

- Read the ticket if an id was given (Linear/GitHub/Jira MCP if connected)
- Read `CLAUDE.md`
- Use `@explorer` to find the code this touches
- Check `memory/lessons.md` for related past failures

## Step 2 - interview, in rounds

Ask only the questions you can ask **right now** - the ones whose answers do
not depend on another open question. Hold the rest for the next round.

Number them. Give your own recommended answer to each, so the human can just
say "yes to all" when you guessed right.

```
Q1 - <title>
<the question, with options if there are options>
-> My recommendation: <your answer, and why in one line>

Q2 - <title>
...
```

Then **stop and wait**. Do not answer your own questions and carry on.

When the human answers, ask the next round. Repeat until you have no
questions left.

Rule: **facts are your job, decisions are theirs.** If a question can be
answered by reading the code, go read it. Only ask about things that are
genuinely a choice.

## Step 3 - write SPEC.md

```markdown
# <Feature>

## Problem
<who is stuck, and on what - in plain language>

## Goal
<one sentence: what is true when this is done>

## Out of scope
<explicitly not doing - the most valuable section in this file>

## Behaviour
- Given <situation>, when <action>, then <result>
- Given <edge case>, when <action>, then <result>
- Given <error case>, when <action>, then <result>

## Files
| File | Change |
|---|---|

## Data / contract changes
<schema, API shape, events. "none" is a fine answer>

## How we prove it works
<the exact command or click-path that demonstrates the feature end to end>

## Decisions made
| Question | Answer | Who decided |
|---|---|---|

## Still open
- <anything unresolved>
```

## Step 4 - hand off

Save it as `SPEC.md`. Then tell the human:

> Spec is written. **Start a fresh session** and point it at `SPEC.md` to
> build it. A clean context builds better than this one, which is now full
> of our discussion.

## Rules

- Never start coding inside this skill.
- If "Still open" is not empty, say so loudly. Do not let it slide.
- If the whole thing is one obvious line of code, say "this does not need a
  spec" and stop.
