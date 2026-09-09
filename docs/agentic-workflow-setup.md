# Agentic workflow setup — the map

*Built 2026-09-09 from the Aliveness tech meeting (Keolo, Anthony, Larry). Works in every project, not only MMV. Simple English on purpose.*

## 1. The big picture (read this first)

The meeting had three ideas. Here is how each one landed on your Mac:

| Idea from the meeting | Who said it | What you have now |
|---|---|---|
| A fixed loop: **Intent → Spec → Ready → Implement → Measure**, with a folder of docs per ticket (proposal, research, spec with happy + edge cases, design, tickets) | Keolo (his private `av` CLI) | `/ticket <ID>` skill + templates + 4 scripts. Folder: `docs/changes/<ID>-<slug>/` |
| One **coordinator**, sub-agents in worktrees, a project **map** in Linear, a **ding** when an agent needs you | Anthony (pi.dev inside Herdr, `/wayfinder`) | `@scout` `@qa` `@verifier` agents, `/wayfinder` (you already had it), notify + Stop hooks |
| Engineers own QA; an agent walks the **happy path and the edge cases** | Keolo + Anthony | `@qa` + Playwright MCP; `ready-check.sh` refuses a spec with no edge scenario |
| Guardrails must be code, not advice | (Claude Code docs) | `guardrails.sh` hook: no push to main, no force push, no PR merge, no schema push, no `rm -rf ~`, no `.env` reads |

Everything lives in **this repo** (`~/GITHUB/claude-harness`) and is symlinked into `~/.claude` by `./install.sh`. So it is global: same loop in MMV, massive-qr, lovememora, your side projects.

```
~/GITHUB/claude-harness/
  skills/ticket/     the loop  (SKILL.md, templates/, scripts/)
  skills/qa/         /qa  -> dispatches @qa
  skills/measure/    /measure -> PostHog check, learnings back into the spec
  agents/qa.md  verifier.md  scout.md        (+ your explorer, planner, reviewer, tester, security-reviewer)
  hooks/guardrails.sh  notify.sh  statusline.sh   (ON in ~/.claude/settings.json)
  project-packs/     per-repo layer: _template/ + manifest-movies-next/ + apply.sh
  docs/research/     the 4 research reports with sources
```

## 2. Daily flow (the steps)

```
1 Intent ── 2 Spec & Design ── 3 Ready ── 4 Implement ── 5 QA ── 6 Done ── 7 Measure
```

1. Open the repo, type `/ticket MMV-123` (or a GitHub issue number). Claude reads the ticket, makes the folder, fills the "Why". **Stops.**
2. Say `go`. Claude runs the grilling interview (numbered questions with its recommendation, you answer), sends `@scout` for research, then writes proposal / spec / design / tickets. Every requirement gets an `S1 happy` and an `S2 edge` scenario. **Stops.**
3. Say `go`. `ready-check.sh` runs (13 checks). You approve the spec = Definition of Ready. Sub-issues go to Linear only after your OK. **Stops.**
4. Say `go`. Branch or `claude --worktree`, then `/tdd-loop` per scenario. Test titles carry the S-ids. **Stops after each ticket row.**
5. Say `go`. `@qa` runs the scenario tests and a live browser pass (Playwright MCP), writes `qa-report.md`. **Stops.**
6. Say `go`. `@verifier` (spec coverage) + `@reviewer` (correctness), then `/ship-it` → PR to `dev`. Never merges. Linear → In Review. **Stops.**
7. A few days after deploy: `/measure docs/changes/MMV-123-slug`. PostHog numbers go into `research.md`; production bugs become new edge scenarios.

Lost? `bash ~/.claude/skills/ticket/scripts/next-step.sh docs/changes/<folder>` prints where you are and what is next. That is Keolo's "suggest next action" button.

**Small fix?** Skip the loop. `/triage-bug`, fix, `/ship-it`.
**Too big for one session?** `/wayfinder` first (needs the tracker doc, see section 5), then `/to-spec`, then `/ticket` per slice.

## 3. What each new piece does

| Piece | One line |
|---|---|
| `/ticket` | The loop. One step per turn. You say "go". |
| `templates/*.md` | OKF frontmatter (`type`, `status`, `sources`) + OpenSpec body (`### Requirement:` / `#### Scenario:` GIVEN/WHEN/THEN). Same shapes Keolo showed. |
| `scripts/new-change.sh` | Makes the folder from templates. |
| `scripts/ready-check.sh` | Definition of Ready: 13 PASS/FAIL lines. Refuses a requirement without an edge scenario. |
| `scripts/next-step.sh` | Reads `stage:` in `index.md`, prints the next step. |
| `scripts/okf-subgraph.sh` | Prints one doc + the docs it links to (depth N). Read a sub-graph, not all of `docs/`. Saves tokens. |
| `/qa` + `@qa` | Runs scenario tests, live browser pass, writes `qa-report.md`. Report-only unless you say `--write-tests`. |
| `@verifier` | Fresh eyes: every S-id has a test, edge tests assert failure, diff matches spec, no ticket refs in code, no secrets. |
| `@scout` | Read-only research worker. Writes `research.md`, returns 5 lines. Keeps your main context small (Anthony's "thin coordinator"). |
| `/measure` | Checks each hypothesis in PostHog, writes learnings, adds production edge cases to the spec. |
| `guardrails.sh` | The safety rules as code. Tested with 20 cases (section 6). |
| `notify.sh` | macOS banner + Glass sound when Claude needs permission or is waiting. |
| Stop hook | Hero.aiff ding when a turn ends (Anthony's ding). Delete the `Stop` block in settings if it annoys you. |
| `statusline.sh` | `Fable 5.1 \| ctx 37% [###.......] \| branch \| $0.42`. Warns at 40% (compact then). |
| Playwright MCP | `claude mcp add --scope user playwright` done. Headless, isolated. `@qa` uses it. |
| `.claude/rules/` in MMV | `frontend.md`, `backend.md`, `db.md` load only when you touch those paths. Gitignored, so local only. |
| `.claude/launch.json` in MMV | Lets the desktop Browser pane start becca (3001) / dashboard (3000). |
| `project-packs/apply.sh` | `apply.sh ~/Workspace/any-repo` copies rules + launch.json into a new project. |

## 4. What I changed on your Mac (all reversible)

| File | Change | Backup |
|---|---|---|
| `~/.claude/settings.json` | added `hooks` (Notification, Stop, PreToolUse) + `statusLine` | `~/.claude/backups/settings.json.20260909-235503.bak` |
| `~/.claude/CLAUDE.md` | replaced the stale "Next ticket = MMV-278" line; added a 6-line "How we work" block | `~/.claude/backups/CLAUDE.md.*.bak` (same content minus those lines) |
| `~/.claude.json` | Playwright MCP at user scope (`claude mcp remove playwright -s user` undoes it) | — |
| `~/.claude/skills/{ticket,qa,measure}` `~/.claude/agents/{qa,verifier,scout}.md` | new symlinks (from `install.sh`) | delete the symlink |
| `manifest-movies-next/.claude/rules/*.md`, `.claude/launch.json` | new, gitignored | delete the files |
| `~/.claude/projects/-Users-tharlinhtet-my/memory/` | one memory file + index line | — |
| This repo | new files, **not committed** (`git status` shows them). Commit when you are happy. | `git checkout -- .` / `git clean` |

Nothing was pushed, merged, deployed, or written to the team repo's tracked files.

## 5. Not done — your call (in order of value)

1. **Commit this repo** so the harness is saved: `cd ~/GITHUB/claude-harness && git add -A && git commit -m "harness: ticket loop, qa/verifier/scout, hooks on"`.
2. **PR the MMV tracked pack** (`project-packs/manifest-movies-next/`): `.mcp.json`, `.worktreeinclude`, `docs/agents/issue-tracker.md`, `docs/changes/README.md`. Read them first; they touch the team repo.
3. **`/setup-matt-pocock-skills`** inside MMV, pick Linear. That makes `/wayfinder`, `/to-spec`, `/to-tickets`, `/triage` work (Anthony's map). It writes into the repo → PR.
4. **Herdr** (what Anthony runs): `brew install herdr`, then `herdr integration install claude`, then `herdr`. One space per repo. Free, Apache 2.0, ~37k stars, v0.9 (young; has bugs). Try one week. If the tmux-style prefix keys annoy you, stay on the desktop app + `claude --remote-control`.
5. **PostHog plugin** for `/measure`: `claude plugin install posthog` (gives `/posthog:experiments`, `/posthog:surveys`). The PostHog MCP you already have works too.
6. **Ask Keolo** for the `av` repo invite; his loop is what `/ticket` copies, so contributing there will be easy. It is Go; you have `go` installed.
7. **Optional:** `brew install terminal-notifier` for nicer banners with the Claude icon; `openspec` CLI (`npm i -g @fission-ai/openspec`) if the team wants its `/opsx:*` commands. Not needed for the loop.
8. **Vault** `larry/larry-starter-memory.md` still says "Next task = MMV-278". Update it in a PR when you next pull the vault.

## 6. What I checked

- `guardrails.sh`: 28 cases in `hooks/test-guardrails.sh`, all pass — deny: push to main, `HEAD:master`, force push, `gh pr merge`, schema push (`db:push`, `drizzle-kit push`), `rm -rf ~`, `cat .env`, `cat apps/becca/.env.local`, `head -n 5 .env`, Read `.env`; allow: push to a feature branch, `git merge main`, `db:migrate`, `rm -rf dist`, `.env.example`, a heredoc that only mentions `.env`, `grep NEON .env`, `pnpm test`. The hook also fired for real inside this session (it blocked my own commands three times), so it is live.
- `statusline.sh`: sample JSON → `Fable 5.1 | ctx 37% [###.......] | master | $0.42`; empty JSON → `claude | ctx ?` (no crash).
- `notify.sh`: banner + sound shown on this Mac (Script Editor permission already granted).
- Scripts in a temp git repo: `new-change.sh` made 7 files; `ready-check.sh` failed on the raw template (27 placeholders) and passed after filling; `next-step.sh` moved intent → spec; `okf-subgraph.sh` listed 7 files from `index.md` and 4 from `proposal.md` (macOS bash 3 fix applied).
- `settings.json` is valid JSON. Playwright MCP shows **Connected**. Symlinks resolve. Frontmatter on all 6 new files parses.
- MMV `.claude/` is gitignored (`git check-ignore` confirmed).

## 7. What I am not sure about

- Hook keys `"async": true` come from the docs research; if a future Claude Code version rejects them, remove the key (hooks still run, just blocking).
- `Notification` matcher names (`permission_prompt`, `idle_prompt`, `agent_needs_input`) are from the docs on 2026-09-09; check `/hooks` in an interactive session shows all three.
- Playwright MCP tool names change between versions; `@qa` is written to "snapshot → act → assert" generically.
- `okf-subgraph.sh` follows only relative or repo-absolute `.md` links; wikilinks `[[x]]` are not followed.
- The Stop ding fires on every turn, including short ones. You may want it off.
- I did not run `/ticket` end-to-end on a real ticket (that needs you to answer the grilling). The scripts it calls are tested; the prose is not.

## 8. Research (sources for every claim)

- `docs/research/2026-09-09-pi-dev.md` — pi.dev (103k stars, Earendil), extensions, firstmate, wayfinder, cost, alternatives.
- `docs/research/2026-09-09-herdr.md` — Herdr (herdr.dev, YC F26, $6M seed), architecture, docs, issues, alternatives.
- `docs/research/2026-09-09-spec-driven-workflow.md` — OpenSpec, Google's OKF, Spec Kit, BMAD, Kiro, DoR, MADR, PostHog loop, Playwright agents, tickets↔Linear.
- `docs/research/2026-09-09-claude-code-setups.md` — official primitives, top community kits with star counts, notification hooks, CLAUDE.md rules, parallel work, QA tools, warnings.
- Meeting: https://app.fireflies.ai/view/01M23B9GEGHY21D2283X5DW7TG
