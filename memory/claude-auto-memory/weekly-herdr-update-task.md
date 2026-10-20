---
name: weekly-herdr-update-task
description: "Larry's desktop-app scheduled task \"weekly-herdr-harness-update\" (Sundays 22:30 Bangkok) that researches Herdr trends + user feedback, applies safe updates on a branch of claude-harness, opens a PR, and reports."
metadata: 
  node_type: memory
  type: project
  originSessionId: fa25f864-cbb0-4016-a4f2-5be75425a309
  modified: 2026-09-13T14:37:01.441Z
---

Created 2026-09-13 with the desktop app scheduler (local task, runs only while the app is open;
if the app is closed it runs at next launch). Task file:
`~/.claude/scheduled-tasks/weekly-herdr-harness-update/SKILL.md`. Cron `30 22 * * 0` local (Mac is UTC+7).

What it does each week: fetches herdr.dev (blog/docs/changelog), GitHub releases + top issues,
HN/Reddit/X feedback → three buckets: A apply safe (docs, cheat sheet, config.toml with backup,
regenerate `skills/herdr/SKILL.md`, `brew upgrade herdr` only patch/minor with no breaking notes),
B propose to Larry (settings.json, guardrails, loop steps, major versions), C ignore. Works on branch
`weekly/herdr-<date>`, writes `docs/research/herdr-weekly/<date>.md`, runs guardrail tests +
`hud --once`, pushes the branch, opens a PR to master, never merges. Reports max 12 lines.

**How to apply:** if Larry asks "what did the weekly job do", read the newest file in
`~/GITHUB/claude-harness/docs/research/herdr-weekly/` and the open PRs. To change the schedule
use `update_scheduled_task`. Related: [[agentic-workflow-setup]], [[claude-harness-repo]].
