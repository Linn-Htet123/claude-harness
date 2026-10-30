# Project packs

The global harness (skills, agents, hooks, statusline, Playwright MCP) already
works in **every** repo. A project pack is the small per-repo layer on top.

```
project-packs/
  _template/                 <- copy this into any new repo
  apply.sh <repo-path>       <- copies the local (gitignored-safe) parts for you
```

## What goes where

| File | Tracked in git? | Purpose |
|---|---|---|
| `.claude/rules/*.md` | usually no (`.claude/` is often gitignored) | path-scoped rules: frontend / backend / db. Loaded only when Claude touches matching files. |
| `.claude/launch.json` | no | lets the desktop app / `/run` start the dev server for QA. |
| `.mcp.json` | **yes** | project-scoped MCP servers (Playwright). Teammates get it on clone. |
| `.worktreeinclude` | **yes** | copies `.env*` into `claude --worktree` checkouts. |
| `docs/agents/issue-tracker.md` | **yes** | tells Matt Pocock's skills (/wayfinder, /to-spec, /to-tickets) which tracker to use. |
| `openspec/` | **yes** | made by `openspec init --tools none`. Each `/ticket` = one change in `openspec/changes/<id>-<slug>/`; `openspec/specs/` = living spec library. |
| `CLAUDE.md` | **yes** | see `templates/CLAUDE.md.template` at the harness root; keep it under 150 lines. |

## Use — one command for ANY repo (new or existing)

```bash
harness-init ~/Workspace/new-thing                 # GitHub Issues (default)
harness-init ~/Workspace/new-thing --tracker linear
```
`harness-init` = `project-packs/init.sh`. Idempotent: it never overwrites, so re-run it any time.
It makes the repo, `CLAUDE.md` (template), `.claude/rules/`, `.claude/launch.json`, `.mcp.json`,
`.worktreeinclude`, `openspec/` (runs `openspec init --tools none` if `openspec` is on PATH),
`docs/agents/issue-tracker.md`, `docs/decisions/`, and the `.gitignore` lines. Then run `/onboard-repo` inside Claude to fill `CLAUDE.md` from the real code.

A `SessionStart` hook (`hooks/session-start.sh`) tells Claude when a repo is missing
`CLAUDE.md` or `openspec/` (or old `docs/changes/`), so Claude offers `harness-init` once.

## Open several projects in Herdr

```bash
harness-up ~/Workspace/a ~/Workspace/b ~/Workspace/c   # one workspace each: claude | hud
```

## Use — by hand

```bash
# 1. local, safe parts (rules + launch.json). Says what it did.
~/GITHUB/claude-harness/project-packs/apply.sh ~/Workspace/some-repo

# 2. tracked parts: copy by hand, read them, open a PR
cp -n project-packs/_template/.mcp.json  ~/Workspace/some-repo/
cp -n project-packs/_template/.worktreeinclude ~/Workspace/some-repo/
mkdir -p ~/Workspace/some-repo/docs/agents
cp -n project-packs/_template/docs/agents/issue-tracker.md ~/Workspace/some-repo/docs/agents/
(cd ~/Workspace/some-repo && [ -d openspec ] || openspec init --tools none)
```

Then edit the rules for that stack (Next.js? FastAPI? Go?) and the tracker file
(Linear / GitHub Issues / Jira). Delete rules you do not need.
