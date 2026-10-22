---
name: harness-help
description: Answer any question about how Larry works with Claude Code - the harness, Herdr (keys, panes, workspaces, fresh start), the hud dashboard, harness-init / harness-up, the /ticket loop and its 7 steps, the OpenSpec change folder (openspec/changes/, old docs/changes/), /opsx commands, the review gate, skills, agents, hooks and what they block, notifications, statusline, where files live, troubleshooting. Use whenever Larry asks "how do I...", "what is...", "which command...", "why is X blocked", or mentions herdr, hud, harness, pane, workspace, the loop, or a skill/agent name - even with typos (herbr, harnes, hub).
---

# Harness help

You are answering Larry inside his own setup. Everything below is true on his Mac.
Answer in his style: simple words, short sentences, one step at a time, the exact keys or
command to type. If the answer is not in this sheet, **read the manual first**:

- `~/GITHUB/claude-harness/docs/USER-MANUAL.md` — the user manual (sections 0–11)
- `~/GITHUB/claude-harness/docs/agentic-workflow-setup.md` — what was set up and why, what is pending
- `~/GITHUB/claude-harness/hooks/README.md` — the hooks
- For Herdr CLI syntax run `herdr --help` / `herdr pane` / `herdr workspace` (the binary is the truth)
- For Herdr keys/concepts: https://herdr.dev/docs/keyboard/ and https://herdr.dev/docs/concepts/

## The map (say this first when he is lost)

```
Herdr (runtime)  ->  one workspace per repo  ->  left pane: claude   right pane: hud
/ticket <ID or words>  ->  1 Intent -> 2 Spec -> 3 Ready -> 4 Implement -> 5 QA -> 6 Done -> 7 Measure
one step per turn, Larry says "go"
```

## Herdr — keys (prefix = ctrl+b: press it, let go, then the key)

| Keys | Does |
|---|---|
| `ctrl+b` `v` | split left / right (new pane on the right gets the cursor) |
| `ctrl+b` `-` | split top / bottom |
| `ctrl+b` `h` / `l` / `j` / `k` | move cursor left / right / down / up between panes (or click the pane) |
| `ctrl+b` `shift+n` | new workspace (one per repo; run it from inside that repo, or use harness-up) |
| `ctrl+b` `w` | switch workspace (or click the name in the left sidebar) |
| `ctrl+b` `c` | new tab inside a workspace |
| `ctrl+b` `x` | close pane |
| `ctrl+b` `q` | detach: leave Herdr, everything keeps running. Type `herdr` to come back |
| `ctrl+b` `?` | Herdr's own key help |

Herdr catches `ctrl+b` even while Claude is running in the pane.

## Herdr — commands (from any terminal)

| Command | Does |
|---|---|
| `herdr` | open / come back |
| `harness-up <repo> <repo> ...` | one workspace per repo, split, `claude` left, `hud` right. Skips repos that already have one |
| `herdr server stop` | stop everything (layout is saved and restored next time) |
| **Fresh start** | `herdr server stop && rm ~/.config/herdr/session.json` → `herdr` → `ctrl+b` `q` → `harness-up ...` → `herdr` |
| `herdr worktree create --branch <name>` | second copy of the repo for a parallel task, opens as its own workspace |
| `herdr workspace list` / `herdr pane list` | JSON of what exists |
| `~/.config/herdr/config.toml` | settings: sound, toasts, resume on restart |

Known thing: after a restart Herdr types `claude --resume <old id>`. If it says "No conversation found", just type `claude`.

## The HUD (`hud` in a pane)

Panels: **NOW** (changes, git, PR/CI, agents, stack) · **LIFECYCLE** (7-stage meter, gate, scenarios, edge cases without tests) · **SUGGESTED NEXT** (ranked, with the exact command).
Refreshes itself every 5 s.

| Key | Does |
|---|---|
| `n` | run suggestion #1 · `1`-`4` run that one |
| `l` | agent loops: 1 ticket · 2 bug · 3 PR babysitter · 4 QA sweep · 5 measure sweep · 6 verify branch · 7 wayfinder · 8 onboard |
| `s` | find a skill by word, pick a number, add arguments (130+ skills) |
| `e` | open the repo (and the current specs/<capability>/spec.md) in VS Code — its Source Control tab shows every change Claude made; `cmd+shift+v` previews a .md file |
| `o` | pick a doc: lists the newest markdown files under docs/ (reports, specs), press a number, it opens in VS Code. The NOW panel also shows "new docs" changed in the last 24 h |
| `d` | git diff in a pane (stat + full diff, `q` to close) |
| `c` | change folder · `t` target (this pane / new Herdr pane) · `r` refresh · `q` quit |

`hud --skills <word>` from a shell lists matching skills. Old HUD on screen? `q` then `hud`.

## The loop — `/ticket`

`/ticket MMV-123` or `/ticket add a forgot-password page` (plain words are fine; Claude makes an id like `LM-1`).
Each ticket = one OpenSpec change: `openspec/changes/<id>-<slug>/` (lower case, e.g. `mmv-278-evening-ritual`) with `index.md` (stage), `proposal.md` (why, out of scope, user stories, hypotheses, decision log), `research.md`, `specs/<capability>/spec.md` (delta spec, happy + edge `S1` scenarios), `design.md`, `tasks.md` (slices `## 1. T1 ... (blocked by: ...)` with `- [ ] 1.1` boxes), `qa-report.md`. Old `docs/changes/` folders still work.
Repo has no `openspec/`? Run once: `openspec init --tools none` (skills and `/opsx:*` are global from the harness).

| Step | Claude | Larry |
|---|---|---|
| 1 Intent | reads ticket, makes folder | `go` |
| 2 Spec & Design | grilling questions, @scout research, writes spec with **happy + edge** scenarios | answer, `go` |
| 3 Ready | `ready-check.sh` (+ `openspec validate`) | approve = `go` |
| 4 Implement | branch, test-first per scenario (`S1 happy:`, `S2 edge:` in test titles). Small: `/tdd-loop`. Big: `/implement-spec` (parallel worktrees) | `go` per slice |
| 5 QA | @qa runs scenarios + browser pass, `qa-report.md` | read gaps |
| 6 Done | commit, then `/review-gate` (runs @verifier + `/code-review` or `/thermonuclear-review` + `/ponytail-review` + @security-reviewer when needed; must PASS, the hook blocks opening a PR until the current commit has its mark), then `/ship-it` PR to base branch, changelog line in `~/.claude/shared/agent-changelog.md`. Never merges | ask a human to review |
| 7 Measure | `/measure <folder>` PostHog numbers → learnings, new edge scenarios; then `openspec archive <name> --yes` merges the spec into `openspec/specs/` | read, say "finished" |

Scripts (in `~/.claude/skills/ticket/scripts/`): `new-change.sh`, `ready-check.sh`, `next-step.sh`, `okf-subgraph.sh`, `hud.sh`.
Small change: `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Small bug: `/triage-bug` → `/tdd-loop` → `/ship-it`. Too big for one session: `/wayfinder` → `/to-spec` → `/ticket`.

## Skills and agents

Skills: `/ticket /qa /measure /triage-bug /tdd-loop /ship-it /hotfix /postmortem /grill-me /wayfinder /onboard-repo /standup /pm-handoff /ctx /harness-help /herdr` plus Superpowers, Matt Pocock's, Vercel, drawio.
From Anthony: `/to-spec /to-tickets /implement-spec /thermonuclear-review /ponytail /ponytail-review /two-axis-review` (his code review, renamed so the built-in `/code-review` still works) `/asd-ste100` (simple English) `/duel` (Claude vs Codex, needs `codex login`). Not installed on purpose: fleet, reconcile.
OpenSpec: skills `openspec-propose/explore/apply-change/update-change/sync-specs/archive-change`, commands `/opsx:propose|explore|apply|update|sync|archive`.
Agents: `@scout` (research) `@qa` `@verifier` (spec coverage) `@reviewer` (correctness) `@security-reviewer` `@explorer` `@planner` `@tester`.

## New project

`harness-init <path> [--tracker linear]` → `cd` there → `claude` → `/onboard-repo`. Never overwrites. It also runs `openspec init --tools none` if `openspec` is on PATH and there is no `openspec/` yet. A SessionStart hook offers this once when a repo lacks CLAUDE.md.

## Guardrails (hooks, cannot be talked past)

Blocked: push to main/master (also `git -C`, quoted `"main"`, `HEAD`/`@` while on main, `--all`), any force push (also `+branch`, `--mirror`), merging a PR (`gh pr merge`, `gh api` merge, graphql), schema push (`db:push`, `drizzle-kit push`, `prisma db push`), `rm -rf ~`, reading real `.env` files, and opening a PR before `/review-gate` passed on the current commit. The PR rule is strict: a command that only *mentions* the PR-open words is blocked too, so PR bodies go in a file (`/ship-it` does this). Release tags from main are fine (`git push --tags`). If blocked: say so in one line, stop, Larry does it by hand if he really wants.
Sounds: Hero = turn finished; Glass + banner = Claude needs you; Herdr ding = agent in another workspace. Status bar: `model | ctx 37% [###.......] | branch | $` — over 40% → `/compact` or `/clear`.

## Where things live

`~/GITHUB/claude-harness` (git, private remote https://github.com/Linn-Htet123/claude-harness ; Larry pushes by hand) → symlinked into `~/.claude` by `./install.sh`. **New Mac:** `git clone` it, then `./setup-new-mac.sh` (installs everything: brew tools, symlinks, PATH commands, hooks into settings.json with backup, CLAUDE.md, Herdr config + integration, Playwright MCP). Then `/plugin install superpowers` + `mattpocock-skills`, and `/mcp` logins.
`~/.claude/settings.json` hooks + statusline (backups in `~/.claude/backups/`). `~/.claude/CLAUDE.md` who Larry is + the loop + ASD-STE100 output style, review before PR (both axes), agent changelog, session journal. `~/.claude/shared/agent-changelog.md` changelog. `~/.claude/shared/journal/` session journal. `~/.claude/commands/opsx/` the /opsx commands (install.sh links command sub-folders). `<repo>/.claude/rules/` path-scoped rules. `<repo>/openspec/changes/` tickets (old: `docs/changes/`). `<repo>/openspec/specs/` living spec library. `<repo>/docs/decisions/` ADRs.

## Troubleshooting (short)

No ding → `/hooks`; banner needs System Settings → Notifications → Script Editor → Allow. HUD stale → it auto-refreshes; old version → `q` then `hud`. "Blocked: commit … has no review" → run `/review-gate`; a new commit needs a new run. "Blocked:" on something safe → tell Claude the exact command, fix lives in `hooks/guardrails.sh`. Playwright not running → `/mcp`, dev server must be up. Rules ignored after long session → `/compact`. Changed a skill → restart the session.

## How to answer

1. Give the exact key or command first. 2. One or two lines of why. 3. Next step. No walls of text.
If he pastes an error, read it and answer from the manual before guessing. If you are not inside Herdr (`HERDR_ENV` unset) you can still explain; you just cannot control panes.
