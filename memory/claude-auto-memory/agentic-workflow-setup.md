---
name: agentic-workflow-setup
description: "The 2026-09-09 setup of Larry's agentic dev loop (/ticket, @qa, @verifier, @scout, guardrail hooks, Playwright MCP) built from the Aliveness tech meeting; what Anthony and Keolo use; what is still pending."
metadata: 
  node_type: memory
  type: project
  originSessionId: fa25f864-cbb0-4016-a4f2-5be75425a309
  modified: 2026-09-09T18:30:59.325Z
---

On 2026-09-09 Larry asked for "the complete setup we discussed in meetings" after the
Aliveness tech meeting (Keolo Keagy, Anthony Lee, Larry). He wants it for **all his
projects**, not only MMV. Everything lives in his harness repo
`~/GITHUB/claude-harness` and is symlinked into `~/.claude` by `install.sh`.
Guide: `~/GITHUB/claude-harness/docs/agentic-workflow-setup.md`. Research with sources:
`~/GITHUB/claude-harness/docs/research/2026-09-09-*.md`.

**What the team uses (from the meeting):**
- Anthony: pi.dev (minimal agent, "chisel your own") inside **Herdr** (herdr.dev, tmux-like
  runtime for agents, spaces per project, resume, phone via SSH/Moshi, ding on stop). One
  coordinator per space, sub-agents in worktrees, Linear via MCP. His "Wayfinder map" is
  Matt Pocock's `/wayfinder` skill (Larry already has the plugin).
- Keolo: private Go CLI "av" (Aliveness Ventures). Loop: Intent → Spec/Design (grilling) →
  Ready → Implement (TDD) → Done → Measure (PostHog). Per-ticket folder with proposal,
  research, OpenSpec PRD (happy + edge scenarios), design, tickets synced to Linear; docs in
  Google's Open Knowledge Format as a linked graph. He promised to invite Larry + Anthony to
  the repo; Larry wants to contribute (Go).

**What was built (all global):** `/ticket` skill (the loop, one step per turn) with
templates + scripts (`new-change.sh`, `ready-check.sh`, `next-step.sh`, `okf-subgraph.sh`),
`/qa`, `/measure`, agents `qa` / `verifier` / `scout`, hooks (guardrails ON: push to main,
force push, PR merge, schema push, rm -rf ~, .env reads; notify banner; Stop ding),
statusline with context %, Playwright MCP at user scope, `project-packs/` (+ `apply.sh`).
MMV got local `.claude/rules/{frontend,backend,db}.md` + `launch.json` (gitignored).

**2026-09-10:** Herdr 0.9.0 installed (brew) + `herdr integration install claude` (adds a
SessionStart hook; my hooks intact) + `~/.config/herdr/config.toml`. Built `hud` command
(`skills/ticket/scripts/hud.sh`, symlinked to /opt/homebrew/bin/hud): av-style dashboard
(lifecycle meter, next action, gate, tickets; keys n/g/s/c/r/q launch `claude "/skill"`).
Larry runs `herdr` in a repo, `claude` in one pane, `hud` in the other.

**Help in every session:** `harness-help` skill (cheat sheet + reads USER-MANUAL.md) and `herdr`
skill (Herdr's own `herdr --skill` output) live in the harness; ~/.claude/CLAUDE.md tells Claude
to use harness-help for any Herdr/hud/harness question. Herdr's saved layout is
`~/.config/herdr/session.json` (delete it for a true fresh start; run `herdr` BEFORE `harness-up`).

**HUD v2 (2026-09-10):** panels NOW / LIFECYCLE / SUGGESTED NEXT (ranked, with exact commands),
keys n,1-4 run suggestions, `l` agent loops menu (ticket, bug, PR babysitter, QA sweep, measure
sweep, verify, wayfinder, onboard), `s` skill finder over ~130 SKILL.md files, `t` runs Claude in
a new Herdr pane (uses HERDR_PANE_ID + `herdr pane split/run`). `hud --skills <word>` from a shell.

**Several projects at once:** `harness-up <repo>...` (= `project-packs/up.sh`) creates one
Herdr workspace per repo via the JSON CLI (`herdr workspace create`, `pane split`, `pane run`),
`claude` left, `hud` right. User manual: `docs/USER-MANUAL.md` (sent to Larry 2026-09-10).

**Any future repo:** `harness-init <path> [--tracker linear]` (= `project-packs/init.sh`,
idempotent) then `/onboard-repo`. A SessionStart hook (`hooks/session-start.sh`) makes Claude
offer this once when a repo lacks CLAUDE.md or docs/changes/. Offer it once, then drop it.

**Pending / Larry's call:** PR the MMV tracked pack
files (`.mcp.json`, `.worktreeinclude`, `docs/agents/issue-tracker.md`, `docs/changes/README.md`),
run `/setup-matt-pocock-skills` in MMV, `claude plugin install posthog`, commit the harness
repo, ask Keolo for the `av` repo invite.

**How to apply:** when Larry starts a ticket, suggest `/ticket <ID>`. Do not re-propose
tools from the research; point at the guide. Related: [[workout-pwa]].
