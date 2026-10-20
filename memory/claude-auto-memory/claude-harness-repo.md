---
name: claude-harness-repo
description: "Where Larry's global Claude Code harness lives (local path + private GitHub remote) and how it installs."
metadata: 
  node_type: memory
  type: reference
  originSessionId: fa25f864-cbb0-4016-a4f2-5be75425a309
  modified: 2026-10-20T04:04:11.303Z
---

Larry's harness (skills, agents, hooks, statusline, project packs) lives at
`~/GITHUB/claude-harness`, branch `master`, private remote
https://github.com/Linn-Htet123/claude-harness (created 2026-09-10 with `gh repo create`).

`./install.sh` symlinks it into `~/.claude`. **New Mac:** clone, then `./setup-new-mac.sh`
(added 2026-10-20; idempotent; installs brew tools, symlinks, PATH commands, merges hooks into
settings.json with backup, CLAUDE.md + Herdr config from `templates/`, Playwright MCP). Larry pushes it by hand: the guardrail hook
blocks any `git push` to `master`, so Claude cannot push this repo for him.
Guide: `docs/agentic-workflow-setup.md`. See [[agentic-workflow-setup]].
