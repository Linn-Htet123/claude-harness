# User manual — Larry's agentic workflow

*Simple words. Short steps. Read section 1 and 3 first; the rest is reference.*

---

## 0. What this is (30 seconds)

Think of a kitchen. Claude is the chef. This harness is the knives, the recipe cards,
the timer, and the rule "taste before you serve". Same chef, better food.

You have 4 layers:

| Layer | What | Where |
|---|---|---|
| **Runtime** | Herdr: one screen for all your projects, agents keep running when you close the lid | `herdr` |
| **Dashboard** | `hud`: shows which step of the ticket you are on and what is next | `hud` |
| **The loop** | `/ticket`: Intent → Spec → Ready → Implement → QA → Done → Measure | inside Claude |
| **Guardrails** | hooks that block dangerous commands, ding when Claude needs you | automatic |

---

## 1. Every day: start work (2 minutes)

```bash
cd ~/Workspace/MMV/manifest-movies-next     # any repo
herdr
```

First time in this repo: press `ctrl+b` then `shift+n` → new workspace (one per repo).
Then `ctrl+b` then `v` → split the screen.

- **Left pane:** type `claude` → Claude Code opens.
- **Right pane:** type `hud` → the dashboard opens.

To stop for the day: `ctrl+b` then `q`. Everything keeps running. Tomorrow: `herdr` brings it back.

**Herdr keys you need** (prefix = `ctrl+b`, press it first, then the key):

| Keys | Does |
|---|---|
| `ctrl+b` `shift+n` | new workspace (new repo) |
| `ctrl+b` `w` | switch workspace |
| `ctrl+b` `v` | split left / right |
| `ctrl+b` `c` | new tab |
| `ctrl+b` `h` `j` `k` `l` | move between panes |
| `ctrl+b` `q` | detach (leave, agents keep running) |
| `herdr` (in any terminal) | come back |

The sidebar shows every workspace and whether its agent is **working / blocked / done**.
A ding plays when an agent in another workspace finishes or needs you.

---

## 2. A new project (once per repo)

```bash
harness-init ~/Workspace/new-thing                 # GitHub Issues
harness-init ~/Workspace/new-thing --tracker linear   # Linear
cd ~/Workspace/new-thing && claude
```

Inside Claude type `/onboard-repo`. It reads the code and fills `CLAUDE.md`.
Then open `.claude/rules/` and delete the rule files you do not need (no backend? delete `backend.md`).

If you forget, Claude will say "this repo is missing CLAUDE.md, want me to run harness-init?" Say yes or no.

For MMV nothing is needed; it is already set up.

---

## 3. Doing a ticket (the loop)

This is the main thing. One ticket = one folder `docs/changes/<ID>-<slug>/` with 7 files.
Claude does **one step per turn** and stops. You say **`go`** for the next step.

```
1 Intent ── 2 Spec & Design ── 3 Ready ── 4 Implement ── 5 QA ── 6 Done ── 7 Measure
```

### Start
In the Claude pane type:
```
/ticket MMV-123
```
(or press `n` in the HUD, it types this for you)

### What happens at each step

| Step | Claude does | You do |
|---|---|---|
| **1 Intent** | reads the ticket in Linear, makes the folder, writes "Why" | read the 5-line summary, say `go` |
| **2 Spec & Design** | asks you numbered questions (each with its recommended answer), sends a scout to research, writes proposal / spec / design / tickets. Every requirement gets a **happy** scenario and an **edge** scenario | answer the questions. "yes to all" is fine if the recommendations are right. Then `go` |
| **3 Ready** | runs the gate check (13 checks). Shows you the spec | read the scenarios. Add edge cases you know about. Say `go` = you approve. Only then it creates Linear sub-issues |
| **4 Implement** | makes a branch, writes a failing test per scenario, then the code, then runs the full test suite. Pastes real output | read the test output. `go` for the next ticket row |
| **5 QA** | the `@qa` agent runs the scenario tests + a live browser pass, writes `qa-report.md` | read the pass/fail table. Any **edge** scenario with no test is a real gap |
| **6 Done** | `@verifier` + `@reviewer` check it, then opens a **PR to dev**. Never merges. Moves the Linear ticket to In Review | read the PR. Ask Anthony to review |
| **7 Measure** | days later: `/measure docs/changes/MMV-123-slug` checks PostHog numbers, writes learnings, adds production bugs as new edge scenarios | read the learnings |

**Lost?** Look at the HUD. Or type in a terminal:
```bash
bash ~/.claude/skills/ticket/scripts/next-step.sh docs/changes/MMV-123-slug
```

**Small bug fix?** Skip the loop: `/triage-bug` → fix → `/ship-it`.

**Big fuzzy idea, too big for one session?** `/wayfinder` first (it makes a map of decisions in Linear), then `/to-spec`, then `/ticket` per slice.

---

## 4. The HUD (dashboard)

`hud` shows three panels:

- **NOW** — open change folders and their stage, git state (uncommitted files, last commit, PR + CI), which agents run in this Herdr workspace, and the stack it detected with matching skills.
- **LIFECYCLE** — the 7-stage meter for the current change, gate status (READY ✓), scenario counts, edge scenarios that have **no test yet**, tickets done.
- **SUGGESTED NEXT** — up to 4 ranked things to run, each with the exact command under it. Examples: "Continue MMV-123 → Step 3 Ready", "Edge scenarios without a test: S2 → run QA", "3 uncommitted files → open a PR", "PR CI is red → babysit it", "No CLAUDE.md → harness-init".

| Key | Does |
|---|---|
| `n` | run suggestion #1 |
| `1` `2` `3` `4` | run that suggestion |
| `l` | **agent loops**: 1 ticket loop · 2 bug loop (triage → test-first fix → PR) · 3 PR babysitter (every 10 min) · 4 QA sweep · 5 measure sweep · 6 verify branch · 7 wayfinder · 8 onboard repo |
| `s` | **find a skill**: type a word (e.g. `review`, `deploy`, `test`), pick a number, add arguments. Searches all 130+ installed skills (yours, project, plugins) |
| `c` | switch to another change folder |
| `t` | target: run in **this pane** or in a **new Herdr pane** below (default inside Herdr: new pane, so the HUD stays visible) |
| `r` | refresh (also re-reads the PR) |
| `q` | quit |

From a normal terminal: `hud --skills review` lists matching skills and exits.

## 5. Things you can type inside Claude

**Skills** (you type them):

| Type | When |
|---|---|
| `/ticket MMV-123` | any ticket bigger than a one-line fix |
| `/qa` | check the current change against its spec |
| `/measure <folder>` | days after deploy: did the feature work? |
| `/triage-bug` | a bug report: find the real cause |
| `/tdd-loop` | build one small thing test-first |
| `/ship-it` | open the PR (checks, branch, commit, push). Never merges |
| `/hotfix` | production is broken right now |
| `/postmortem` | after an incident, write what we learned |
| `/grill-me` | you have a fuzzy idea, want hard questions |
| `/wayfinder` | idea too big for one session |
| `/onboard-repo` | new repo, write CLAUDE.md |
| `/standup` | daily update from git + PRs |
| `/pm-handoff` | explain work to Eric in plain words |
| `/ctx` | is my context getting full? |

**Agents** (Claude calls them; you can ask for them by name):

| Name | Job |
|---|---|
| `@scout` | research, read-only, returns 5 lines |
| `@qa` | runs the scenarios, writes qa-report.md |
| `@verifier` | every scenario has a test? diff matches spec? no secrets? |
| `@reviewer` | correctness bugs only, fresh eyes |
| `@security-reviewer` | auth, payments, user data |
| `@explorer` | find where things live in a codebase |
| `@planner` | make an implementation plan |
| `@tester` | write and run tests |

Say things like: "ask @verifier to check this" or "send @scout to find how Stripe handles refunds".

---

## 6. Safety: what is blocked, and what to do

These are **code, not advice**. Claude cannot talk its way past them.

| Blocked | Why |
|---|---|
| `git push` to `main` / `master` | never push to main |
| any force push | too easy to lose work |
| `gh pr merge` | a human merges (Anthony) |
| `db:push` / `drizzle-kit push` / `prisma db push` | migrations only |
| `rm -rf ~` or `/` | obvious |
| `cat .env` or reading `.env` files | secrets must not enter Claude's context |

When Claude hits one you see "Blocked: ...". That is correct. If **you** really need the action, do it yourself in the terminal. Claude will not.

Also true in every repo: ticket ids go in commits and PR bodies, never in code comments.

---

## 7. Sounds, banners, status bar

- **Ding (Hero sound)** = Claude finished a turn.
- **Glass sound + banner "Claude needs your permission"** = go look, it is waiting.
- **Herdr ding** = an agent in *another* workspace finished or is blocked.
- **Status bar** under Claude: `Fable 5.1 | ctx 37% [###.......] | dev | $0.42`.
  When ctx passes **40%** it says "(compact soon)". Type `/compact` (keeps a summary) or `/clear` (fresh start) between tasks. Full context = worse answers.

Too noisy? Open `~/.claude/settings.json` and delete the `Stop` block (turn ding off) or set `delivery = "off"` under `[ui.toast]` in `~/.config/herdr/config.toml`.

---

## 8. Two or three projects at the same time

**One command:**
```bash
harness-up ~/Workspace/MMV/manifest-movies-next ~/Workspace/triosys/massive-qr ~/Workspace/triosys/lovememora
```
It makes one Herdr workspace per repo, splits it, starts `claude` on the left and `hud` on the right.
Repos that already have a workspace are skipped. Add `--no-claude` if you want to start Claude yourself.
Then type `herdr` and press `ctrl+b` `w` to jump between the three.

**The rhythm:** give each Claude one ticket (`/ticket ...`). Each one stops after every step.
Work on A, hear the ding from B, switch (`ctrl+b` `w`), say `go`, switch back. The stops are your sync points.

- Different repos: one Herdr workspace each. `ctrl+b` `w` to switch.
- Same repo, two tasks: `herdr worktree create --branch larry/mmv-123` → opens as its own workspace with its own copy of the code. Or `claude --worktree mmv-123`.
- Rule of thumb: 2 agents running at once is comfortable. 3+ costs 3x tokens and you cannot follow them.

Phone: type `/remote-control` inside the Claude pane, scan the QR with the Claude app. Or install Moshi and SSH to your Mac.

---

## 9. When something is wrong

| Problem | Do |
|---|---|
| No ding, no banner | type `/hooks` in Claude to see if hooks are registered. Banner needs System Settings → Notifications → Script Editor → Allow |
| HUD says "no change folder" | you are not in a repo with `docs/changes/`, or no ticket started yet. Press `n` |
| HUD box looks broken | your terminal font has no box characters; it still works |
| "Blocked: ..." on something safe | tell me the exact command; the rule may need a fix in `hooks/guardrails.sh` |
| After reboot Herdr panes are empty | run `herdr integration install claude` once (done already), and `resume_agents_on_restore = true` is set |
| Playwright / browser pass not running | type `/mcp` in Claude and check `playwright` is Connected. A dev server must be up (`pnpm dev:becca`) |
| Claude keeps forgetting rules after a long session | `/compact` or `/clear`. Long sessions drop instructions |
| I changed a skill and Claude uses the old text | restart the Claude session; skills load at start |
| Want to see what the setup did | `~/GITHUB/claude-harness/docs/agentic-workflow-setup.md` |

---

## 10. Where things live

```
~/GITHUB/claude-harness/          the harness (git, private on GitHub: Linn-Htet123/claude-harness)
  skills/  agents/  hooks/        symlinked into ~/.claude by ./install.sh
  skills/ticket/templates/        the 7 files of a change folder
  skills/ticket/scripts/          new-change, ready-check, next-step, okf-subgraph, hud
  project-packs/init.sh           = harness-init
  docs/USER-MANUAL.md             this file
  docs/agentic-workflow-setup.md  the map + what was changed + what is pending
  docs/research/                  the 4 research reports (pi.dev, Herdr, spec tools, Claude Code)
~/.claude/settings.json           hooks + statusline (backups in ~/.claude/backups/)
~/.claude/CLAUDE.md               who you are + the loop, loads in every session
~/.config/herdr/config.toml       Herdr settings
<repo>/CLAUDE.md                  facts about that repo (commands, branch, rules)
<repo>/.claude/rules/             rules that load only for matching files
<repo>/docs/changes/<ID>-<slug>/  one folder per ticket
<repo>/docs/decisions/            ADRs (big decisions)
```

To update the harness on this Mac: edit files in `~/GITHUB/claude-harness`, then `git add -A && git commit && git push` (you push; the hook blocks Claude from pushing master).
On a new Mac: `git clone` it, run `./install.sh`, `brew install herdr`, `herdr integration install claude`.

---

## 11. Small glossary

| Word | Meaning |
|---|---|
| **Spec** | the written plan: what we build, what we do not, how we prove it works |
| **Scenario** | one GIVEN / WHEN / THEN case. **Happy** = normal path. **Edge** = bad input, offline, double click, expired session |
| **Definition of Ready** | the spec is good enough to start coding (the gate check) |
| **Worktree** | a second copy of the repo on another branch, so two agents do not step on each other |
| **Skill** | a recipe card Claude follows when you type `/name` |
| **Agent** | a helper Claude with its own memory and fewer tools (`@name`) |
| **Hook** | a small program that runs automatically before or after Claude acts |
| **MCP** | a plug that gives Claude live access to a tool (Linear, GitHub, Playwright) |
| **Workspace** (Herdr) | one project's screen: tabs and panes |
| **Context** | Claude's short-term memory. Fills up. Watch the % in the status bar |
