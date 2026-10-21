---
name: review-gate
description: The one review to run before a PR. Runs every review axis on the branch diff in parallel - spec coverage (@verifier), defects (/code-review, or /thermonuclear-review for risky diffs), over-engineering (/ponytail-review), and security (@security-reviewer when the diff touches auth, user data, uploads or secrets) - then gives one ranked report. When nothing blocks, it marks the commit as reviewed, which the guardrails hook needs before `gh pr create`. Use for "review", "review gate", "review before PR", or when a PR is blocked with "run /review-gate first".
argument-hint: "[base branch] [--strict]"
---

# /review-gate

One command for the whole review. It reports; it does not edit code.
`--strict` forces `/thermonuclear-review` for defects.

## 1. Scope

1. Base branch: the argument, else the repo CLAUDE.md (MMV = `dev`), else `git symbolic-ref --short refs/remotes/origin/HEAD`, else `main`.
2. `git status --porcelain`. Uncommitted changes → tell Larry to commit first (the mark is per commit), and stop.
3. `git diff --stat $(git merge-base HEAD <base>)...HEAD`. Empty diff → say so and stop.
4. Change folder: `openspec/changes/<id>-*` matching the branch's ticket id (old: `docs/changes/<ID>-*`). It may not exist.
5. **Risky?** Yes when `--strict`, or the diff is over ~500 changed lines, or it touches auth, payments/money, migrations or schema, permissions/RLS, or secrets handling.
6. **Sensitive?** Yes when the diff touches auth, user data, uploads, external input parsing, or secrets.

Tell Larry in two lines: base, size, which reviewers will run and why.

## 2. Run the reviewers in parallel

Send them in ONE message so they run at the same time. Each one gets the base and the diff command.

| Reviewer | When | How |
|---|---|---|
| Spec coverage | a change folder exists | Agent `subagent_type: verifier` with the folder path |
| Over-engineering | always | Agent `subagent_type: general-purpose`: "Read `~/.claude/skills/ponytail-review/SKILL.md` and apply it to `git diff <base>...HEAD`. Report only, in its format, ending with `net: -N lines possible`." |
| Defects (risky) | risky | Agent `subagent_type: general-purpose`: "Read `~/.claude/skills/thermonuclear-review/SKILL.md` and apply it to this branch vs `<base>`. Report only." |
| Security | sensitive | Agent `subagent_type: security-reviewer` with the diff command |

When the diff is **not** risky, also call the Skill tool with `code-review` (the built-in) on the branch diff for defects, while the agents run.

## 3. One report

```
### REVIEW GATE — <branch> vs <base> (<N> files, +A/-D)

Blockers (must fix before PR)
1. [defect|security|spec] <claim> (file:line) — <smallest fix>

Should fix
1. ...

Ponytail cuts (judge each: cut it, or say why the cost is deliberate)
1. <file:line> <tag> <cut> → <replacement>
net: -N lines possible

Verdict: PASS | BLOCKED (<n> blockers)
```

Rules:
- Rank by severity across reviewers, but keep each finding's source tag.
- Check each blocker yourself against the code before you list it. Drop false alarms and say how many you dropped.
- A missing S-id test or an edge test that does not assert the failure is a blocker.
- Ponytail cuts never block on their own.

## 4. Mark or stop

- **PASS:** run `bash ~/.claude/skills/review-gate/scripts/mark-reviewed.sh "<verdict line>"`. Tell Larry the PR can be opened (`/ship-it`).
- **BLOCKED:** do not mark. List the blockers and stop. After the fixes are committed, run `/review-gate` again (a new commit needs a new mark).

Never write the mark by hand or any other way, and never mark a BLOCKED review. The mark is the promise that this commit was reviewed.
