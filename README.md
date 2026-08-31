# claude-harness

A complete SDLC setup for Claude Code. Install once, works in every project.

**New here? Read [TUTORIAL.md](./TUTORIAL.md).**

## Install

```bash
./install.sh                                        # into ~/.claude
./install.sh ~/.claude-manifest ~/.claude-personal  # multiple accounts
./install.sh --dry-run ~/.claude                    # look first
./install.sh --uninstall ~/.claude                  # remove
```

Also install the two plugin packs inside Claude Code:

```
/plugin install superpowers
/plugin install mattpocock-skills
```

## Cheat sheet

| Stage | Command |
|---|---|
| Unclear request | `/grill-me` |
| Requirements | `/spec-first` |
| Plan | `@planner` |
| New repo | `/onboard-repo` |
| Build | `/tdd-loop` |
| Test | `@tester` |
| Review | `@reviewer` |
| Security | `@security-reviewer` |
| Ship | `/ship-it` |
| Bug | `/triage-bug` |
| Emergency | `/hotfix` |
| Learn from it | `/postmortem` |
| Daily update | `/standup` |
| Talk to PM | `/pm-handoff` |
| Heavy context | `/ctx` |

## Layout

- `agents/` — specialists that run in fresh context
- `skills/` — SDLC playbooks
- `commands/` — small shortcuts
- `memory/lessons.md` — what broke before; read before debugging
- `hooks/` — guardrails, **off by default**
- `templates/` — `CLAUDE.md` starter for any repo

## Update

```bash
git pull
```

Symlinks mean every install updates at once.
