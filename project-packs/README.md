# Project packs

The global harness (skills, agents, hooks, statusline, Playwright MCP) already
works in **every** repo. A project pack is the small per-repo layer on top.

```
project-packs/
  _template/                 <- copy this into any new repo
  manifest-movies-next/      <- worked example (MMV)
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
| `docs/changes/README.md` | **yes** | explains the per-ticket folder convention (`/ticket`). |
| `CLAUDE.md` | **yes** | see `templates/CLAUDE.md.template` at the harness root; keep it under 150 lines. |

## Use

```bash
# 1. local, safe parts (rules + launch.json). Says what it did.
~/GITHUB/claude-harness/project-packs/apply.sh ~/Workspace/some-repo

# 2. tracked parts: copy by hand, read them, open a PR
cp -n project-packs/_template/.mcp.json  ~/Workspace/some-repo/
cp -n project-packs/_template/.worktreeinclude ~/Workspace/some-repo/
mkdir -p ~/Workspace/some-repo/docs/agents ~/Workspace/some-repo/docs/changes
cp -n project-packs/_template/docs/agents/issue-tracker.md ~/Workspace/some-repo/docs/agents/
cp -n project-packs/_template/docs/changes/README.md ~/Workspace/some-repo/docs/changes/
```

Then edit the rules for that stack (Next.js? FastAPI? Go?) and the tracker file
(Linear / GitHub Issues / Jira). Delete rules you do not need.
