---
name: harness-help
description: Answer any question about how Larry works with Claude Code - the harness, Herdr (keys, panes, workspaces, fresh start), the hud dashboard, harness-init / harness-up, the /ticket loop and its 7 steps, the docs/changes folder, skills, agents, hooks and what they block, notifications, statusline, where files live, troubleshooting. Use whenever Larry asks "how do I...", "what is...", "which command...", "why is X blocked", or mentions herdr, hud, harness, pane, workspace, the loop, or a skill/agent name - even with typos (herbr, harnes, hub).
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
| `e` | open the repo (and the current spec.md) in VS Code — its Source Control tab shows every change Claude made; `cmd+shift+v` previews a .md file |
| `o` | pick a doc: lists the newest markdown files under docs/ (reports, specs), press a number, it opens in VS Code. The NOW panel also shows "new docs" changed in the last 24 h |
| `d` | git diff in a pane (stat + full diff, `q` to close) |
| `c` | change folder · `t` target (this pane / new Herdr pane) · `r` refresh · `q` quit |

`hud --skills <word>` from a shell lists matching skills. Old HUD on screen? `q` then `hud`.

## The loop — `/ticket`

`/ticket MMV-123` or `/ticket add a forgot-password page` (plain words are fine; Claude makes an id like `LM-1`).
Folder: `docs/changes/<ID>-<slug>/` with `index.md` (stage), `proposal.md`, `research.md`, `spec.md`, `design.md`, `tickets.md`, `qa-report.md`.

| Step | Claude | Larry |
|---|---|---|
| 1 Intent | reads ticket, makes folder | `go` |
| 2 Spec & Design | grilling questions, @scout research, writes spec with **happy + edge** scenarios | answer, `go` |
| 3 Ready | `ready-check.sh` (13 checks) | approve = `go` |
| 4 Implement | branch, test-first per scenario (`S1 happy:`, `S2 edge:` in test titles) | `go` per ticket row |
| 5 QA | @qa runs scenarios + browser pass, `qa-report.md` | read gaps |
| 6 Done | @verifier + @reviewer, `/ship-it` PR to base branch, never merges | ask a human to review |
| 7 Measure | `/measure <folder>` PostHog numbers → learnings, new edge scenarios | read |

Scripts (in `~/.claude/skills/ticket/scripts/`): `new-change.sh`, `ready-check.sh`, `next-step.sh`, `okf-subgraph.sh`, `hud.sh`.
Small bug: `/triage-bug` → `/tdd-loop` → `/ship-it`. Too big for one session: `/wayfinder` → `/to-spec` → `/ticket`.

## Skills and agents

Skills: `/ticket /qa /measure /triage-bug /tdd-loop /ship-it /hotfix /postmortem /grill-me /wayfinder /onboard-repo /standup /pm-handoff /ctx /harness-help /herdr` plus Superpowers, Matt Pocock's, Vercel, drawio.
Agents: `@scout` (research) `@qa` `@verifier` (spec coverage) `@reviewer` (correctness) `@security-reviewer` `@explorer` `@planner` `@tester`.

## New project

`harness-init <path> [--tracker linear]` → `cd` there → `claude` → `/onboard-repo`. Never overwrites. A SessionStart hook offers this once when a repo lacks CLAUDE.md.

## Guardrails (hooks, cannot be talked past)

Blocked: push to main/master, any force push, `gh pr merge`, schema push (`db:push`, `drizzle-kit push`, `prisma db push`), `rm -rf ~`, reading real `.env` files. If blocked: say so in one line, stop, Larry does it by hand if he really wants.
Sounds: Hero = turn finished; Glass + banner = Claude needs you; Herdr ding = agent in another workspace. Status bar: `model | ctx 37% [###.......] | branch | $` — over 40% → `/compact` or `/clear`.

## Where things live

`~/GITHUB/claude-harness` (git, private remote https://github.com/Linn-Htet123/claude-harness ; Larry pushes by hand) → symlinked into `~/.claude` by `./install.sh`. **New Mac:** `git clone` it, then `./setup-new-mac.sh` (installs everything: brew tools, symlinks, PATH commands, hooks into settings.json with backup, CLAUDE.md, Herdr config + integration, Playwright MCP). Then `/plugin install superpowers` + `mattpocock-skills`, and `/mcp` logins.
`~/.claude/settings.json` hooks + statusline (backups in `~/.claude/backups/`). `~/.claude/CLAUDE.md` who Larry is + the loop. `<repo>/.claude/rules/` path-scoped rules. `<repo>/docs/changes/` tickets. `<repo>/docs/decisions/` ADRs.

## Troubleshooting (short)

No ding → `/hooks`; banner needs System Settings → Notifications → Script Editor → Allow. HUD stale → it auto-refreshes; old version → `q` then `hud`. "Blocked:" on something safe → tell Claude the exact command, fix lives in `hooks/guardrails.sh`. Playwright not running → `/mcp`, dev server must be up. Rules ignored after long session → `/compact`. Changed a skill → restart the session.

## How to answer

1. Give the exact key or command first. 2. One or two lines of why. 3. Next step. No walls of text.
If he pastes an error, read it and answer from the manual before guessing. If you are not inside Herdr (`HERDR_ENV` unset) you can still explain; you just cannot control panes.
