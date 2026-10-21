# Project pack — manifest-movies-next (worked example)

Already applied locally (gitignored, safe, nothing reaches the team repo):
`.claude/rules/{frontend,backend,db}.md` and `.claude/launch.json` in the repo.

Files below belong IN the team repo, so they need a PR to `dev` after Larry reads them:

| File | Why |
|---|---|
| `.mcp.json` | Playwright MCP for the whole team. |
| `.worktreeinclude` | copies `.env` files into `claude --worktree` checkouts so the apps run there. |
| `docs/agents/issue-tracker.md` | points Matt Pocock's skills at Linear (team MMV). Hand-written draft of what `/setup-matt-pocock-skills` would write. |
| `docs/changes/README.md` | short pointer: tickets now live in `openspec/changes/` (old folders here still work). |
| `openspec/` | made by `openspec init --tools none` (run once in the repo). Each `/ticket` is one change in `openspec/changes/`; `openspec/specs/` is the living spec library. |
