---
name: ship-it
description: Take finished work and turn it into a clean pull request - checks, branch, commit, push, PR. Use when a change is done and ready for review. Never merges.
---

# Ship it

Everything that has to be true before a human should be asked to look.

## Step 1 - pre-flight

Run these. All must pass. Paste the real output.

- [ ] Full test suite
- [ ] Lint
- [ ] Typecheck
- [ ] Build

If any fail, stop. Fix first. Do not open a PR on red.

## Step 2 - read your own diff

```
git diff
git status
```

Check for:

- [ ] Debug leftovers: `console.log`, `print()`, `debugger`, commented-out code
- [ ] Secrets, tokens, real credentials, real customer data
- [ ] Files that should not be committed: `.env`, `node_modules`, `.DS_Store`,
      build output, large binaries
- [ ] Changes you did not intend - unrelated files caught by `git add .`
- [ ] TODOs you meant to finish

## Step 3 - branch

Never commit to `main`.

```bash
git checkout -b <type>/<short-name>
```

`type` is one of: `feat`, `fix`, `hotfix`, `chore`, `docs`, `refactor`, `test`.

**Check `CLAUDE.md` for this repo's branch rule first** - some teams have a
required prefix, a ticket id, or a length limit. Follow theirs, not this one.
If the repo says nothing, keep it short and readable.

## Step 4 - commit

```
<type>: <what changed, imperative, lowercase>

<why it changed - the part a reviewer cannot get from the diff>

<ticket id if there is one>
```

Good: `fix: reject checkout when cart is empty`
Bad: `fixed stuff`, `updates`, `wip`

Split unrelated changes into separate commits.

## Step 5 - push and open the PR

```bash
git push -u origin <branch>
```

PR body:

```markdown
## What
<one or two sentences>

## Why
<the problem this solves - link the ticket>

## How to test it
1. <step>
2. <step>
Expected: <result>

## Verification
<paste the real test output>

## Risk
<what could break, and how to undo it>

## Not included
<anything deliberately left out>
```

## Step 6 - stop

**Do not merge.** Post the PR link and say who needs to review it.

Check `CLAUDE.md` for who reviews and who merges in this repo. If it does not
say, ask - do not assume you may merge.

Merging is a human decision. That is not a formality - it is the one control
that catches everything the machine missed. Every large engineering org that
has published on this keeps the same rule: the agent opens the PR, a person
merges it.

## Then

Ask `@reviewer` and, if it touches auth / payments / user data,
`@security-reviewer` to look before you ping a person. Fresh eyes are cheap.
