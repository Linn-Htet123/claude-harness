# claude-harness

A complete SDLC setup for Claude Code. Install once, works in every project.

**New here? Read [docs/USER-MANUAL.md](./docs/USER-MANUAL.md) (how to use it day to day) and [TUTORIAL.md](./TUTORIAL.md) (how it is built).**

## Install

New Mac, everything at once:

```bash
git clone https://github.com/Linn-Htet123/claude-harness.git ~/GITHUB/claude-harness
cd ~/GITHUB/claude-harness && ./setup-new-mac.sh
```

Just the symlinks:

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
| **Whole ticket, start to finish** | `/ticket MMV-123` (Intent → Spec → Ready → Implement → QA → Done → Measure). One OpenSpec change in `openspec/changes/<id>-<slug>/` |
| Small change, short path | `/opsx:propose` → `/opsx:apply` → `/opsx:archive` (also `/opsx:explore`, `/opsx:update`, `/opsx:sync`) |
| Dashboard next to Claude (Herdr pane) | `hud` |
| Open 3 projects in Herdr at once | `harness-up <repo> <repo> <repo>` |
| Unclear request | `/grill-me` |
| Requirements | `/spec-first` or `/to-spec` |
| Split into slices | `/to-tickets` |
| Plan | `@planner` |
| New repo | `harness-init <path>` then `/onboard-repo` |
| Build | `/tdd-loop` (small) or `/implement-spec` (big, parallel worktrees) |
| Simplest thing that works | `/ponytail` |
| Test | `@tester` |
| QA against the spec | `/qa` or `@qa` |
| Spec coverage check | `@verifier` |
| Research (read-only) | `@scout` |
| **Review before a PR (all axes)** | `/review-gate` (must PASS; the hook blocks opening a PR without it) |
| Review (defects) | `/code-review`, `@reviewer`; risky work: `/thermonuclear-review` |
| Review (over-engineering) | `/ponytail-review` |
| Review (standards + spec) | `/two-axis-review` |
| Second opinion from Codex | `/duel <task>` (needs `codex login`) |
| Plain English output | `/asd-ste100` |
| Security | `@security-reviewer` |
| Ship | `/ship-it` |
| Bug | `/triage-bug` |
| Emergency | `/hotfix` |
| Learn from it | `/postmortem` |
| Did the feature work? | `/measure` |
| Daily update | `/standup` |
| Talk to PM | `/pm-handoff` |
| Heavy context | `/ctx` |

## Layout

- `agents/` — specialists that run in fresh context
- `skills/` — SDLC playbooks, incl. `openspec-*` (OpenSpec) and `ponytail`, `ponytail-review`, `thermonuclear-review`, `to-spec`, `to-tickets`, `implement-spec`, `two-axis-review`, `asd-ste100`, `duel`
- `openspec/` — this repo's own OpenSpec folder (`openspec init --tools none`); any repo using `/ticket` needs one
- `commands/` — small shortcuts; `commands/opsx/` = the `/opsx:*` OpenSpec commands (install.sh links sub-folders)
- `memory/lessons.md` — what broke before; read before debugging
- `hooks/` — guardrails + notify + statusline, **ON** (wired in `~/.claude/settings.json`)
- `templates/` — `CLAUDE.md` starter for any repo
- `project-packs/` — per-repo layer (rules, launch.json, .mcp.json, tracker doc) + `apply.sh`
- `docs/USER-MANUAL.md` — the user manual

## Update

```bash
git pull
```

Symlinks mean every install updates at once.
