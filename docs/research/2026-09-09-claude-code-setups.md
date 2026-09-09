# Claude Code setups in 2026 — research report

*Researched 2026-09-09. Star counts pulled live from the GitHub API on that date. Sources are cited inline. Written in simple English.*

## Summary (10 lines)

1. Official advice in 2026 is: **start small**. One short CLAUDE.md, one hook, one skill, one MCP. Add more only when a real pain repeats. (https://code.claude.com/docs/en/features-overview)
2. The core rule: **context is the scarce resource**. Every CLAUDE.md line, skill description and MCP tool costs tokens every turn. (https://code.claude.com/docs/en/best-practices)
3. Use **CLAUDE.md for facts**, **rules for path-scoped facts**, **skills for procedures**, **hooks for "must always happen"**, **subagents for noisy side work**. (https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)
4. The most-used community kits are **obra/superpowers (283.9k stars)**, **mattpocock/skills (257.7k)**, **affaan-m/everything-claude-code (254.9k)**, **anthropics/skills (175.4k)**. Superpowers already covers brainstorm → plan → TDD → review. (GitHub API, 2026-09-09)
5. For "spec → plan → TDD → PR", Superpowers + Mattpocock's `grill`/CONTEXT.md/ADR skills + the built-in `/code-review` are enough. Do not stack three frameworks. (https://github.com/affaan-m/everything-claude-code warns the same.)
6. For agent QA of a web app: **Playwright MCP** for repeatable tests, **Claude in Chrome** (`claude --chrome`) for quick real-session checks, **Chrome DevTools MCP** only for perf/network debugging. (https://stevekinney.com/courses/self-testing-ai-agents/runtime-tools-compared)
7. For parallel work: `claude --worktree <name>` per task, `claude agents` to watch them, cross-session messaging to pass findings. Agent teams are experimental and cost ~7x tokens. (https://code.claude.com/docs/en/agent-teams)
8. Notifications on macOS: a `Notification` hook (matcher `permission_prompt`, `idle_prompt`) + a `Stop` hook with `osascript` or `terminal-notifier` + `afplay`. Exact JSON in section 3.
9. Memory: CLAUDE.md is yours, auto memory is Claude's. Keep MEMORY.md under 200 lines; only the first 200 lines / 25 KB load. (https://code.claude.com/docs/en/memory)
10. Top warnings: long CLAUDE.md gets ignored; too many MCP servers used to eat 40% of context (tool search now fixes most of it); "never do X" in prose is not a guardrail — use a hook; do not run agent teams unattended.

---

## 1. Official primitives

Each item: what it is (3 lines), link, when to use.

### CLAUDE.md (project / user)
- A markdown file Claude reads at the start of every session. Lives at `./CLAUDE.md` (project, commit it), `~/.claude/CLAUDE.md` (user), `./CLAUDE.local.md` (private, gitignore it).
- Files above your working directory load at launch; files in subdirectories load when Claude reads files there. `@path` imports pull in other files (they still load at launch).
- Target **under 200 lines**. Longer files reduce adherence. HTML comments are stripped before injection, so use them for human notes.
- Link: https://code.claude.com/docs/en/memory
- Use when: build commands, conventions, "always do X" rules that apply to every session.

### `.claude/rules/` directory
- Many small markdown files instead of one big CLAUDE.md. All `.md` files are found recursively. Rules with no `paths:` frontmatter load every session, same priority as CLAUDE.md.
- Rules with `paths:` (glob) load only when Claude touches matching files. Example: `paths: ["src/api/**/*.ts"]`.
- User-level rules go in `~/.claude/rules/`. Symlinks work for sharing.
- Link: https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/
- Use when: language- or folder-specific rules (e.g. "FastAPI routes must use Pydantic models") that should not cost context in every session.

### Skills (`SKILL.md`)
- A folder with a `SKILL.md` (frontmatter + instructions). Lives in `~/.claude/skills/<name>/`, `.claude/skills/<name>/`, or a plugin. The folder name becomes `/name`.
- Frontmatter: `description` (needed for auto-invoke), `disable-model-invocation: true` (only you can run it, e.g. deploy), `user-invocable: false` (only Claude), `allowed-tools`, `context: fork` (run in subagent), `model`, `paths`, `arguments`. Skills load their description at start and the full body only when used.
- Keep `SKILL.md` under ~500 lines; move detail to `reference.md` / `scripts/`. Descriptions are cut at 1,536 chars in the listing. Once invoked, the body stays in context.
- Link: https://code.claude.com/docs/en/skills ; Anthropic post: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Use when: a procedure you repeat (deploy checklist, ADR template, "fix Linear ticket" flow) or reference docs you only need sometimes.

### Subagents (`.claude/agents/*.md`)
- A markdown file with frontmatter: `name`, `description`, `tools`, `disallowedTools`, `model` (sonnet/opus/haiku/inherit), `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `memory`, `background`, `isolation: worktree`. Body = system prompt.
- Runs in its own context and returns only a summary. Built-ins: `Explore`, `Plan`, `general-purpose`. Subagents do **not** get your conversation history or auto memory; they do get CLAUDE.md (except Explore/Plan).
- Keep descriptions short; combined custom descriptions over 15,000 tokens trigger a warning. Nested depth is 3 by default.
- Link: https://code.claude.com/docs/en/sub-agents
- Use when: side work would flood your main context (search, logs, review), or you want tool limits (read-only reviewer).

### Hooks
- Shell commands (or HTTP / MCP tool / prompt / agent) that run at lifecycle events. Configured in `~/.claude/settings.json`, `.claude/settings.json`, or plugin `hooks/hooks.json`. Structure: event → matcher group → handler list.
- Events include `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `Stop`, `SubagentStop`, `PreCompact`/`PostCompact`, `TaskCompleted`, `TeammateIdle`, `WorktreeCreate`, `FileChanged`, `ConfigChange`, `SessionEnd`, and more.
- Exit code 2 blocks (`PreToolUse`, `UserPromptSubmit`, `Stop`); JSON on stdout can `deny`, `allow`, or add context. Hooks cost zero context unless they print.
- Link: https://code.claude.com/docs/en/hooks (reference) and https://code.claude.com/docs/en/hooks-guide (recipes)
- Common uses: notifications, format on save (`PostToolUse` + `Edit|Write` → prettier/ruff), block dangerous commands (`PreToolUse` + `Bash`), run tests before Claude may stop (`Stop` hook), re-inject context after compaction (`SessionStart` with `compact` matcher).
- Use when: something must happen **every time**, no exceptions. CLAUDE.md is advice; a hook is enforcement.

### Plugins and marketplaces
- A plugin = a folder with `.claude-plugin/plugin.json` plus `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `monitors/`. Skills are namespaced `/plugin:skill`.
- Official marketplace `claude-plugins-official` is added automatically. Install: `/plugin install github@claude-plugins-official`. Community marketplace: `/plugin marketplace add anthropics/claude-plugins-community`.
- Official plugins include LSP plugins (`typescript-lsp`, `pyright-lsp`), integrations (`github`, `linear`, `sentry`, `vercel`, `figma`, `slack`), `security-guidance`, `commit-commands`, `pr-review-toolkit`, `code-review`, `feature-dev`, `claude-md-management`, `hookify`. External entries include `neon`, `chrome-devtools-mcp`, `mattpocock-skills`, `posthog`/`railway`/`playwright` (implied in catalog).
- Link: https://code.claude.com/docs/en/discover-plugins and https://code.claude.com/docs/en/plugins
- Use when: you want the same setup in more than one repo, or want a maintained integration without hand-config. The `/plugin` Discover tab shows a **context cost** per plugin — check it.

### MCP servers
- External tools over the Model Context Protocol. Add with `claude mcp add --transport http <name> <url>` or `--transport stdio <name> -- <cmd>`. Scopes: local (`~/.claude.json`, default), project (`.mcp.json`, committed), user.
- **Tool search is on by default**: only tool names load at start; full schemas load on demand. Output per tool is capped at 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`).
- Commands: `claude mcp list`, `/mcp`, `/context all` (shows tokens per loaded tool).
- Link: https://code.claude.com/docs/en/mcp
- Use when: Claude needs live data or actions in another system (GitHub, Linear, Sentry, Neon, Railway, PostHog). Prefer a CLI (`gh`, `railway`, `sentry-cli`) when one exists — it is cheaper in context. (https://code.claude.com/docs/en/best-practices#use-cli-tools)

### Memory (auto memory)
- Claude writes its own notes to `~/.claude/projects/<project>/memory/MEMORY.md` plus topic files. Types: `user`, `feedback`, `project`, `reference`. It skips things it can derive from code or that CLAUDE.md already says.
- Only the first 200 lines / 25 KB of MEMORY.md load each session; topic files load on demand. Shared by all worktrees of one repo. Machine-local, not synced.
- Toggle with `/memory` or `autoMemoryEnabled`. Say "remember that we use pnpm" and Claude saves it.
- Link: https://code.claude.com/docs/en/memory#auto-memory
- Use when: you want Claude to learn from corrections without editing files yourself. Audit it monthly.

### Agent teams / swarms
- Experimental, off by default: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. One lead session spawns teammates that share a task list and message each other. Display: in-process (default) or split panes (tmux / iTerm2 `it2`).
- Teammates load CLAUDE.md, MCP, skills, but not the lead's history. Permission prompts bubble to the lead. Hooks `TeammateIdle`, `TaskCreated`, `TaskCompleted` can gate quality.
- Costs scale per teammate; docs say start with 3–5 and "significantly more tokens". No resume of in-process teammates, no nested teams.
- Link: https://code.claude.com/docs/en/agent-teams
- Use when: research/review from many angles, or clearly separate modules. Not for sequential work or same-file edits. Subagents are the lighter default.

### Worktrees (`--worktree`, `EnterWorktree`)
- `claude --worktree <name>` (or `-w`) creates `.claude/worktrees/<name>/` on branch `worktree-<name>` and starts Claude there. Second terminal, second name → isolated parallel session. Ask Claude to "work in a worktree" → it calls `EnterWorktree`.
- Subagents can run in their own worktree with `isolation: worktree` in frontmatter. `.worktreeinclude` copies gitignored files like `.env` into new worktrees. On exit, clean worktrees are removed; dirty ones prompt you.
- Add `.claude/worktrees/` to `.gitignore`. `${CLAUDE_PROJECT_DIR}` in hooks stays at the main checkout; read `cwd` from hook input for the worktree path.
- Link: https://code.claude.com/docs/en/worktrees
- Use when: two Claude sessions must edit the same repo at the same time.

### Remote Control / web / desktop
- `claude --remote-control` (`--rc`) keeps a local session and lets you drive it from claude.ai/code or the iOS/Android app (QR code). `claude remote-control` is server mode. Requires claude.ai login; Team/Enterprise need an admin toggle.
- Desktop app: each session gets its own worktree automatically, panes for diff/browser/terminal, desktop notifications when a session finishes, PR auto-fix toggles, and local scheduled tasks. `/desktop` moves a CLI session into it.
- Claude Code on the web runs sessions in the cloud (routines run there too).
- Links: https://code.claude.com/docs/en/remote-control ; https://code.claude.com/docs/en/desktop
- Use when: you want to check on a long task from your phone, or manage several sessions visually.

### Scheduled tasks, `/loop`, routines
- `/loop 5m check the deploy` re-runs a prompt in the current session (min 1 minute, expires after 7 days). `/loop` with no prompt runs a built-in "tend the PR" maintenance prompt; `.claude/loop.md` replaces it.
- Routines (`/schedule` or claude.ai/code/routines) run in the cloud on cron, API call, or GitHub events (min 1 hour). Desktop scheduled tasks run locally with file access.
- One-shot: "remind me at 3pm to push the release branch".
- Links: https://code.claude.com/docs/en/scheduled-tasks ; https://code.claude.com/docs/en/routines
- Use when: babysit a PR/CI, nightly backlog grooming, "open cleanup PR in two weeks".

### Output styles
- Change tone/role via the system prompt. Built-ins: Default, Proactive, Concise, Explanatory, Learning. Custom: `~/.claude/output-styles/<name>.md` with `keep-coding-instructions: true`. Select with `/config`.
- Link: https://code.claude.com/docs/en/output-styles
- Use when: you want the same voice every turn (e.g. Learning mode with `TODO(human)` markers). Not for project rules — that is CLAUDE.md.

### Statusline
- A shell script that gets session JSON on stdin (`model`, `context_window.used_percentage`, `cost`, `rate_limits`, git info) and prints a bar. `/statusline show model and context percentage` generates it. Setting: `"statusLine": {"type":"command","command":"~/.claude/statusline.sh"}`.
- Link: https://code.claude.com/docs/en/statusline
- Use when: you want to watch context fill up (the #1 thing to watch).

### Keybindings
- `~/.claude/keybindings.json`, `/keybindings` to open. Contexts (`Chat`, `Global`, …), chords like `ctrl+x ctrl+k`, `null` to unbind. Reload is automatic.
- Link: https://code.claude.com/docs/en/keybindings
- Use when: a default shortcut clashes with tmux or your terminal.

### Permissions and sandbox
- Modes: `default` (Manual), `acceptEdits`, `plan`, `auto` (classifier reviews actions; the starting mode on Pro/Max/Team), `dontAsk`, `bypassPermissions`. Cycle with Shift+Tab. Rules: `permissions.allow / ask / deny` in settings; deny wins in every mode.
- `/sandbox` turns on OS-level isolation (macOS Seatbelt, nothing to install). In auto-allow mode sandboxed Bash runs without prompts; network domains are prompted the first time.
- `/fewer-permission-prompts` scans your transcripts and proposes an allowlist.
- Links: https://code.claude.com/docs/en/permission-modes ; https://code.claude.com/docs/en/sandboxing ; https://code.claude.com/docs/en/settings
- Use when: you want fewer prompts without `--dangerously-skip-permissions`.

### Headless / Agent SDK
- `claude -p "prompt" --allowedTools "Read,Edit,Bash" --output-format json`. `--bare` skips hooks/skills/CLAUDE.md for reproducible CI runs. `--json-schema` for structured output. `--permission-prompts none` for unattended runs.
- Link: https://code.claude.com/docs/en/headless
- Use when: CI, pre-commit, batch loops (`for f in $(cat files.txt); do claude -p ...; done`).

### Built-in skills worth knowing
`/code-review` (fresh-context bug review, `--fix`), `/simplify`, `/batch` (fan out to 5–30 worktree subagents), `/verify`, `/goal` (keep working until a condition holds), `/doctor` (finds unused skills/MCPs, proposes CLAUDE.md trims), `/context`, `/compact <hint>`, `/rewind`, `/btw` (side question, no context cost), `/init` (`CLAUDE_CODE_NEW_INIT=1` for the interactive version). (https://code.claude.com/docs/en/commands)

---

## 2. Top community skills / agents (stars as of 2026-09-09)

| # | Repo | Stars | What it is | Overlap with Superpowers (you have it) |
|---|------|------:|-----------|----------------------------------------|
| 1 | obra/superpowers | 283,864 | Workflow kit: brainstorming → writing-plans → executing-plans → test-driven-development → systematic-debugging → verification-before-completion → requesting/receiving-code-review → finishing-a-development-branch, plus using-git-worktrees, subagent-driven-development, dispatching-parallel-agents, writing-skills. Ships a SessionStart hook. Official marketplace. | — (this is the baseline) |
| 2 | mattpocock/skills | 257,677 | "Skills for Real Engineers": grill-me / grill-with-docs (interview → spec), to-spec / to-tickets, implement (TDD at seams), tdd, code-review (standards + spec in parallel subagents), diagnosing-bugs, research, domain-modeling (CONTEXT.md + ADRs), handoff, prototype, wizard, resolving-merge-conflicts. | **High**: tdd ≈ test-driven-development; code-review ≈ requesting-code-review; diagnosing-bugs ≈ systematic-debugging; grill ≈ brainstorming. **Unique and useful**: domain-modeling/CONTEXT.md/ADR, research, handoff, to-tickets. |
| 3 | affaan-m/everything-claude-code | 254,919 | 68 agents, 286 skills, 94 commands, rules, hooks, memory CLI. "plan → test → implement → review → verify → remember." | **Very high** and very big. Its own README says: do not stack install methods, do not copy its hooks.json by hand. Skip if you keep Superpowers. |
| 4 | anthropics/skills | 175,392 | Official skills: docx/pdf/pptx/xlsx, skill-creator, mcp-builder, webapp-testing, plus examples. `/plugin marketplace add anthropics/skills`. | skill-creator ≈ writing-skills. webapp-testing is useful for QA. |
| 5 | anthropics/claude-code (demo plugins) | 144,540 | Product repo + `claude-code-plugins` demo marketplace (commit-commands, pr-review-toolkit, etc.). | finishing-a-development-branch ≈ commit-commands. |
| 6 | ruvnet/claude-flow (Ruflo) | 71,773 | Swarm/"hive-mind" orchestration, vector memory, 35 plugins, own CLI + MCP server. Heavy; parts marked beta. | Not a skills kit; a whole orchestration layer. Most solo devs skip it. |
| 7 | hesreallyhim/awesome-claude-code | 53,757 | Curated list: guides, statuslines (claude-statusbar), hooks (Claude Code Safety Net), sandboxes (Cleat), orchestration (AB Method, gstack), browser (Dev Browser). | Index, not a kit. Good for finding one-off tools. |
| 8 | ChromeDevTools/chrome-devtools-mcp | 51,450 | Google's MCP: perf traces, network, console, screenshots. `npx -y chrome-devtools-mcp@latest`. | Tooling, no overlap. |
| 9 | wshobson/agents | 39,524 | 94 plugins / 202 agents / 183 skills as a marketplace (`/plugin marketplace add wshobson/agents`). Has `fastapi-pro`, `python-pro`, typescript agents. Loads only the plugin you install. | Domain agents, not workflow. Pick 1–2 plugins max. |
| 10 | microsoft/playwright-mcp | 36,915 | Playwright MCP: accessibility-tree snapshots, cross-browser, `--headless`, `--isolated`. `claude mcp add playwright npx @playwright/mcp@latest`. | Tooling, no overlap. |
| — | anthropics/claude-plugins-official | 36,079 | The official marketplace itself. | — |
| — | davila7/claude-code-templates | 30,575 | CLI to browse/install components and monitor sessions. | Overlaps with everything; optional. |
| — | VoltAgent/awesome-claude-code-subagents | 24,961 | 100+ subagent `.md` files by role. | Same idea as wshobson; pick, don't bulk-install. |
| — | shanraisshan/claude-code-best-practice | ~65.8k (per README) | Most-cited practices repo; reports on Chrome vs DevTools MCP, monorepos, memory. | Reading, not installing. |

Sources: star counts via `gh api repos/<owner>/<repo>` on 2026-09-09; READMEs at https://github.com/obra/superpowers , https://github.com/mattpocock/skills , https://github.com/affaan-m/everything-claude-code , https://github.com/anthropics/skills , https://github.com/wshobson/agents , https://github.com/ruvnet/claude-flow , https://github.com/hesreallyhim/awesome-claude-code , https://github.com/shanraisshan/claude-code-best-practice .

**Overlap verdict for this dev.** Superpowers already gives the full brainstorm → plan → TDD → review → finish-branch loop. Add only the pieces Superpowers lacks: (a) Mattpocock `domain-modeling` (CONTEXT.md + ADR = your decision log), `research`, `handoff`; (b) official `code-review`, `security-guidance`, `typescript-lsp`, `pyright-lsp`; (c) Playwright MCP for QA. Note: your current setup also has custom skills `spec-first`, `tdd-loop`, `ship-it`, `triage-bug` that duplicate Superpowers' brainstorming/TDD/finishing-branch/systematic-debugging. Keep one set per job so Claude does not pick randomly (conflicting instructions is a documented failure: https://code.claude.com/docs/en/memory#write-effective-instructions ).

---

## 3. Notification hooks on macOS (exact JSON)

Facts from the docs (https://code.claude.com/docs/en/hooks-guide#get-notified-when-claude-needs-input):
- `Notification` fires when Claude waits. Matchers: `permission_prompt` (prompt waited ~6 s), `idle_prompt` (Claude finished ~60 s ago and you typed nothing), `agent_needs_input`, `agent_completed` (v2.1.198+), `auth_success`, elicitation and quota events. Empty matcher = all.
- `Stop` fires every time Claude finishes a response (not on Esc). No matcher.
- `osascript` notifications go through Script Editor. First run `osascript -e 'display notification "test"'`, then System Settings → Notifications → Script Editor → Allow. Otherwise it fails silently.
- Hooks run in a non-interactive shell: use absolute paths (e.g. `/opt/homebrew/bin/terminal-notifier`). (https://khromov.se/claude-code-hooks-for-simple-macos-notifications/)
- `terminal-notifier -sender com.anthropic.claudefordesktop` shows the Claude icon and needs Claude.app installed; brackets in `-subtitle` make the subtitle vanish. (https://www.d12frosted.io/posts/2026-01-05-claude-code-notifications)
- On this Mac today: `jq` and `gh` are installed; `terminal-notifier` and `tmux` are not. `~/.claude/settings.json` has no `hooks` key yet.

### Option A — no install (osascript + sound). Put in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude needs permission\" with title \"Claude Code\" sound name \"Glass\"'",
            "async": true
          }
        ]
      },
      {
        "matcher": "idle_prompt|agent_needs_input",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude is waiting for you\" with title \"Claude Code\" sound name \"Ping\"'",
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "afplay /System/Library/Sounds/Hero.aiff",
            "async": true
          }
        ]
      }
    ]
  }
}
```

Why `Stop` = sound only: `Stop` fires after every reply, even short ones. A banner on every reply is noise; a short sound is fine. (Reasoning based on the `Stop` timing in https://code.claude.com/docs/en/hooks-guide ; the Glass/Hero sound pairing is from https://www.d12frosted.io/posts/2026-01-05-claude-code-notifications .)

### Option B — terminal-notifier (`brew install terminal-notifier`), nicer banner with project name:

Script `~/.claude/hooks/notify.sh`:
```bash
#!/bin/bash
# stdin = hook JSON. $1 = message.
input=$(cat)
proj=$(echo "$input" | /usr/bin/jq -r '.cwd' | xargs basename)
/opt/homebrew/bin/terminal-notifier \
  -title "Claude Code: $proj" \
  -message "$1" \
  -sender com.anthropic.claudefordesktop \
  -sound Glass \
  -activate com.googlecode.iterm2
```
`chmod +x ~/.claude/hooks/notify.sh`. Then in settings:
```json
{
  "hooks": {
    "Notification": [
      { "matcher": "permission_prompt", "hooks": [ { "type": "command", "command": "~/.claude/hooks/notify.sh 'Needs permission'", "async": true } ] },
      { "matcher": "idle_prompt|agent_needs_input", "hooks": [ { "type": "command", "command": "~/.claude/hooks/notify.sh 'Waiting for you'", "async": true } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "afplay /System/Library/Sounds/Pop.aiff", "async": true } ] }
    ]
  }
}
```
Change `-activate` to your terminal's bundle id (`com.apple.Terminal`, `com.googlecode.iterm2`, `com.mitchellh.ghostty`). Check with `/hooks` that they registered. Test by switching to Manual mode (Shift+Tab) and asking for a risky command. (https://code.claude.com/docs/en/hooks-guide#set-up-your-first-hook)

Also note: background sessions in `claude agents` and the desktop app send their own notifications via `preferredNotifChannel`, so you may not need a hook for those. (https://code.claude.com/docs/en/agent-view)

### Other hooks worth copying

Format on save (project `.claude/settings.json`):
```json
{ "hooks": { "PostToolUse": [ { "matcher": "Edit|Write",
  "hooks": [ { "type": "command", "command": "f=$(jq -r '.tool_input.file_path'); case \"$f\" in *.py) ruff format \"$f\" && ruff check --fix \"$f\";; *.ts|*.tsx|*.js|*.json|*.md) npx prettier --write \"$f\";; esac", "timeout": 30 } ] } ] } }
```
(Pattern from https://code.claude.com/docs/en/hooks-guide#format-code-after-every-edit , extended for Python.)

Block dangerous commands (`PreToolUse`, `Bash`), based on the docs' `block-rm.sh` example (https://code.claude.com/docs/en/hooks#practical-examples): match `rm -rf`, `git push --force`, `git push origin main`, `db:push`, and exit 2 with a JSON `permissionDecision: "deny"`. This is the enforced version of your "never push to main / never db:push" rules.

Re-inject rules after compaction: `SessionStart` with matcher `compact` that echoes the 3 rules you care about most. (https://code.claude.com/docs/en/hooks-guide#re-inject-context-after-compaction)

---

## 4. CLAUDE.md and memory best practices

From https://code.claude.com/docs/en/best-practices#write-an-effective-claude-md and https://code.claude.com/docs/en/memory :

- **Length**: under 200 lines. "Bloated CLAUDE.md files cause Claude to ignore your actual instructions." `/doctor` proposes trims.
- **Include**: bash commands Claude can't guess; style rules that differ from defaults; test runner and how to run one test; branch/PR etiquette; project-specific architecture decisions; env quirks; known gotchas.
- **Exclude**: anything Claude can read from the code; standard language conventions; long API docs (link to them); file-by-file descriptions; "write clean code"; things that change weekly.
- **Test**: "For each line, ask: would removing this cause Claude to make mistakes? If not, cut it."
- **Emphasis**: mark at most one or two lines `IMPORTANT`. If many lines are emphasized, none stand out.
- **Move procedures out**: multi-step procedures → skill; folder-specific rules → `.claude/rules/*.md` with `paths:`; "every time X do Y" → hook. (https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more , June 2026)
- **Conflicts**: two files with opposite rules → Claude picks one at random. Review user + project + rules together.
- **Compaction**: project-root CLAUDE.md is re-read after `/compact`; nested files and path rules reload when files are touched. Add a line like "When compacting, keep the list of modified files and the test command."
- **Imports**: `@file` imports still load at launch, so they do not save context; they only organize.
- **AGENTS.md**: if the repo uses it for other tools, `CLAUDE.md` can be just `@AGENTS.md` plus Claude-specific lines.
- **Community numbers**: shanraisshan's guide says quality drops around ~40% context used and "aggressive pros keep it below 30%". (https://github.com/shanraisshan/claude-code-best-practice)
- **Your current user CLAUDE.md** imports two long profile files. That is fine, but they load in every session in every repo. Consider moving the "how to teach me" parts into a Learning output style and keeping only the safety rules in CLAUDE.md.

Memory:
- CLAUDE.md = what you write; auto memory = what Claude writes (`user`, `feedback`, `project`, `reference`). Both load every session. Neither is enforcement.
- MEMORY.md limit: 200 lines / 25 KB. Claude is nudged to keep one line per entry and push detail into topic files.
- Machine-local. Not shared across laptops. Shared across worktrees of one repo.
- Subagents do not see it. A fork does.
- Review with `/memory`. Delete stale lines. If a memory should be a team rule, move it into CLAUDE.md.
- Store: preferences, corrections, "staging is port 3001", "Eric signs off on Becca prompt changes". Do not store: architecture that the code shows, secrets, anything already in CLAUDE.md. (https://blog.memoryplugin.com/claude-code-memory/ , https://claudefa.st/blog/guide/mechanics/auto-memory)

---

## 5. Parallel work on several projects

Options, from lightest to heaviest, per https://code.claude.com/docs/en/best-practices#run-multiple-claude-sessions :

| Pattern | How | Good for | Trade-offs |
|---|---|---|---|
| Two terminals, two repos | `cd repoA && claude`, `cd repoB && claude`. Name sessions with `/rename` or `--name`. | Different projects (e.g. `manifest-movies-next` and `mmv-tech` vault). No conflict possible. | You watch two windows. Use notification hooks (section 3). |
| Worktrees, same repo | `claude --worktree feat-x` and `claude --worktree fix-y`. `.worktreeinclude` for `.env`. | Two tasks on one repo. | Fresh checkout each time → `pnpm install` per worktree. Clean up on exit. (https://code.claude.com/docs/en/worktrees) |
| Background agents | `claude --bg "task"` or `/bg`, then `claude agents` shows Needs input / Working / Ready for review. Auto-worktree, commits, pushes, opens draft PR. | "Dispatch and forget" tasks, then review PRs. | Research preview. Idle processes stop after ~1 h unless pinned. (https://code.claude.com/docs/en/agent-view) |
| Cross-session messaging | Session A tells session B "migration done" via `SendMessage`; `@name` mention. | Two worktrees that depend on each other. | Plain text only; messages can't approve anything. (https://code.claude.com/docs/en/cross-session-messaging) |
| Desktop app sessions | One window, sidebar of sessions, each auto-worktree, diff pane, browser pane. | Visual overview, PR auto-fix toggle. | No agent teams, no `dontAsk` mode. (https://code.claude.com/docs/en/desktop) |
| tmux + worktrees | Scripts like `tmx-worktree` create `~/work/src/<project>-<branch>/` and a tmux window per agent. | 4–8 sessions side by side. | Manual cleanup; tmux is not installed on your Mac. (https://gist.github.com/andynu/13e362f7a5e69a9f083e7bca9f83f60a , https://www.mindstudio.ai/blog/claude-code-git-worktree-parallel-branches) |
| Agent teams | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; lead + teammates, shared tasks. | Parallel review, competing hypotheses, separate modules. | Experimental; ~7x tokens in plan mode; no resume; one file per teammate or they overwrite each other. (https://code.claude.com/docs/en/agent-teams , https://www.mindstudio.ai/blog/claude-code-subagents-cost-tokens) |
| `/batch` | Splits one big change into 5–30 subagents, each in a worktree, each opens a PR. | Mass migrations. | Many PRs to review. (https://code.claude.com/docs/en/commands) |

Writer/Reviewer pattern: one session implements, a second fresh session reviews the diff, feedback goes back. Fresh context = less bias toward code it just wrote. (https://code.claude.com/docs/en/best-practices#run-multiple-claude-sessions)

Practical rule from the field: "one writer per worktree, one explicit handoff point, one terminal pane per agent"; 4–8 sessions is the realistic ceiling. (https://clawtab.cc/articles/claude-code-parallel-agents-tmux)

---

## 6. Agent QA and browser testing

Three tools, three jobs (https://stevekinney.com/courses/self-testing-ai-agents/runtime-tools-compared , https://github.com/shanraisshan/claude-code-best-practice/blob/main/reports/claude-in-chrome-v-chrome-devtools-mcp.md ):

| Tool | Context cost | Strength | Weakness | Use for |
|---|---|---|---|---|
| Playwright MCP (`claude mcp add playwright npx @playwright/mcp@latest`; flags `--headless`, `--isolated`) | ~13.7k tokens | Reproducible; accessibility-tree snapshots ("better than screenshot"); Chromium/Firefox/WebKit; CI-friendly | No real logins | Turning acceptance criteria into repeatable checks and real Playwright tests |
| Claude in Chrome (`claude --chrome`, `/chrome`) | ~15.4k tokens | Uses your logged-in browser; console + network + screenshots + GIF recording; plan mode makes reads free | Not reproducible; paid plan; "always on" costs context every session | Quick "open localhost:3000, submit bad form data, check errors" checks (https://code.claude.com/docs/en/chrome) |
| Chrome DevTools MCP (`npx -y chrome-devtools-mcp@latest`) | ~19.0k tokens | Perf traces, network detail, source-mapped console | Weak for driving flows | "Why is this page slow / which request fails" |

Recommended: Playwright MCP as the primary QA tool, Claude in Chrome on demand (do **not** enable by default — the docs warn it raises context use), DevTools MCP only when debugging perf. (https://code.claude.com/docs/en/chrome#enable-chrome-by-default)

How devs turn specs into tests:
1. Spec first: interview → `SPEC.md` with an end-to-end verification step. (https://code.claude.com/docs/en/best-practices#let-claude-interview-you)
2. Give Claude a check it can run: tests, build, or "take a screenshot and compare to the design". Use `/goal` or a `Stop` hook to make the check gate the turn. (https://code.claude.com/docs/en/best-practices#give-claude-a-way-to-verify-its-work)
3. Let the agent explore the flow with Playwright MCP, then "harden" the actions into `*.spec.ts` files. Playwright's reproducible actions map directly to test code. (https://stevekinney.com/courses/self-testing-ai-agents/runtime-tools-compared)
4. Review in a fresh context: `/code-review`, or a `reviewer` subagent with only the diff and the spec. (https://code.claude.com/docs/en/best-practices#add-an-adversarial-review-step)
5. Anthropic's long-running-agent harness used a feature list JSON + browser automation + a progress file so a fresh session could verify features end to end. (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents , Nov 2025)
6. Anthropic's `webapp-testing` skill in anthropics/skills packages this pattern. (https://github.com/anthropics/skills)

For the desktop app: the Browser pane + `.claude/launch.json` (`{"name":"web","runtimeExecutable":"pnpm","runtimeArgs":["dev"],"port":3000}`) lets Claude start your dev server and look at it. (https://code.claude.com/docs/en/desktop)

---

## 7. Warnings — what experienced devs say NOT to do

Official (https://code.claude.com/docs/en/best-practices#avoid-common-failure-patterns):
- **Kitchen-sink session**: mixing unrelated tasks. Fix: `/clear` between tasks.
- **Correcting over and over**: after two failed corrections, `/clear` and write a better prompt.
- **Over-specified CLAUDE.md**: Claude ignores half of it. Prune, or convert to a hook.
- **Trust-then-verify gap**: no test/screenshot = don't ship.
- **Infinite exploration**: scope investigations or use a subagent.
- **Reviewer chasing**: a reviewer told to find gaps will always find some; tell it to report only correctness gaps. Otherwise you get over-engineering.
- **Plan mode for tiny changes** adds overhead; "if you could describe the diff in one sentence, skip the plan."

Steering post (https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more):
- Don't write "every time X, always do Y" in CLAUDE.md — that is a hook.
- Don't rely on "never do this" prose as a guardrail — use a blocking hook or a deny rule.
- Don't put long procedures in CLAUDE.md — skills.
- Don't leave domain rules unscoped — add `paths:`.

Context / MCP:
- One dev measured 66k+ tokens (~1/3 of context) eaten by MCP tools before typing anything; 82k (41%) with all servers on. (https://scottspence.com/posts/optimising-mcp-server-context-usage-in-claude-code , Sept 2025). Tool search (default since Jan 2026) removes most of this, but **tool output** still costs: "tool names are cheap, tool output is not." (https://okhlopkov.com/claude-code-setup-mcp-hooks-skills-2026/)
- Check `/context all` and `/doctor` to find unused MCPs and skills. The `/plugin` Installed tab flags plugins "Not used recently". (https://code.claude.com/docs/en/discover-plugins)
- Your session today has ~10 MCP servers connected (GitHub, Linear, Sentry, Railway, Neon, PostHog, Figma, Fireflies, Statsig, Vercel, Chrome). Neon alone exposes ~130 tools, several destructive. Scope by project: keep Neon/Railway/Sentry in `manifest-movies-next/.mcp.json`, not user scope.

Frameworks:
- Don't stack Superpowers + ECC + mattpocock + your own spec skills that all say "TDD" slightly differently. ECC's own README: "Do not stack multiple install methods." (https://github.com/affaan-m/everything-claude-code)
- HN on spec-driven kits: "a detailed-enough spec is just code that you can't run"; the real problem is "agent adherence and laziness"; use heavy SDD only for mid-to-large work when plan + code fails. (https://news.ycombinator.com/item?id=48231575)
- Don't "railroad" Claude with step-by-step scripts; give goals, constraints, and a check. Don't state the obvious in skills. (https://github.com/shanraisshan/claude-code-best-practice)

Cost:
- Subagents reload context and don't share cache; agent teams in plan mode ≈ 7x tokens. Reports of unattended multi-agent runs burning large budgets. Use a fork when you need the conversation context; use subagents for wide, shallow searches. (https://www.mindstudio.ai/blog/claude-code-subagents-cost-tokens , Aug 2026)
- Don't let teams run unattended for long; the docs say "monitor and steer". (https://code.claude.com/docs/en/agent-teams#best-practices)

Safety:
- Plugins run arbitrary code with your user privileges; audit skills from unknown sources. (https://code.claude.com/docs/en/discover-plugins#security , https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- `claude -p` without `--bare` runs the repo's hooks and `.mcp.json` even in untrusted folders. (https://code.claude.com/docs/en/headless)
- `bypassPermissions` only inside a container/VM. (https://code.claude.com/docs/en/permission-modes)

---

## Recommended minimal setup for this dev

Goal: spec → plan → TDD → PR, agent QA of the Next.js app, parallel projects, decision log, notifications. Keep it small. Every file below has one job.

### User level (`~/.claude/`)
| File | Purpose |
|---|---|
| `~/.claude/CLAUDE.md` | ≤ 40 lines: who you are, tone, "one step at a time", the 5 safety rules (never push main, never merge own PR, `db:migrate` only, Becca prompt sign-off, money → Eric). Keep the two profile imports only if you accept the per-session cost; otherwise move teaching prefs to an output style. |
| `~/.claude/output-styles/pair-teacher.md` | `keep-coding-instructions: true`; short answers first, then explain, everyday comparison, ask before code changes. Replaces the long "how to teach me" prose. |
| `~/.claude/settings.json` | `hooks`: Notification (`permission_prompt`, `idle_prompt\|agent_needs_input`) + Stop sound (section 3). `statusLine` → `~/.claude/statusline.sh` (context % + git branch). `enabledPlugins`: superpowers, mattpocock-skills, code-review, security-guidance, typescript-lsp, pyright-lsp, github, linear, sentry. `autoMemoryEnabled: true`. |
| `~/.claude/hooks/notify.sh` | terminal-notifier script (Option B) — or skip and use Option A. |
| `~/.claude/hooks/block-danger.sh` | `PreToolUse` on `Bash`: deny `git push.*main`, `git push --force`, `db:push`, `rm -rf`, `railway .* --detach` to prod. Exit 2 + JSON deny. This is the enforced version of your safety rules. |
| `~/.claude/statusline.sh` | generated by `/statusline show model, context % bar, git branch`. |
| `~/.claude/keybindings.json` | only if a shortcut clashes; otherwise skip. |

### Project level (`manifest-movies-next/`)
| File | Purpose |
|---|---|
| `CLAUDE.md` (exists) | ≤ 150 lines: run/test/lint commands for Next.js and FastAPI, migration command, branch = `dev`, PR rules, Linear ticket format, where Becca prompts live. Run `/doctor` to trim. |
| `.claude/rules/frontend.md` (`paths: ["app/**", "src/**/*.tsx"]`) | Next.js/TS conventions only. |
| `.claude/rules/backend.md` (`paths: ["backend/**/*.py"]`) | FastAPI/Pydantic/SQL conventions; "explain WebSocket code simply" reminder. |
| `.claude/rules/db.md` (`paths: ["**/migrations/**", "**/schema*"]`) | `db:migrate` only; ask before any schema change. |
| `.claude/settings.json` | project hooks: PostToolUse format (prettier + ruff); `SessionStart` `compact` matcher echoing the 3 key rules; `permissions.allow` for `pnpm test`, `pnpm lint`, `gh pr view`, `git status/diff/log`; `permissions.deny` for `Bash(git push origin main*)`, `Bash(*db:push*)`. |
| `.mcp.json` | project-scoped: neon (read-mostly), railway, sentry, posthog, playwright. GitHub + Linear stay at user scope. Remove Figma/Fireflies/Statsig from the default set; add with `--scope local` when needed. |
| `.worktreeinclude` | `.env`, `.env.local`. |
| `.claude/launch.json` | `pnpm dev` on port 3000 for the desktop Browser pane / `/verify`. |
| `.claude/skills/ticket/SKILL.md` (`disable-model-invocation: true`, `arguments: [issue]`) | `/ticket MMV-278`: read Linear issue → `/superpowers:brainstorming` → write `docs/specs/MMV-278.md` → `/superpowers:writing-plans` → stop and ask. One entry point instead of `spec-first` + `tdd-loop` + `ship-it`. |
| `.claude/skills/adr/SKILL.md` | Decision log: `docs/decisions/NNN-title.md` (Context / Options / Decision / Consequences) + update `docs/decisions/README.md` index. Or install mattpocock `domain-modeling` and point it at `CONTEXT.md` + `docs/decisions/`. (https://www.beyondautocomplete.nl/how-i-use-claude-code-to-keep-my-architecture-decisions-on-track/) |
| `.claude/skills/qa-flow/SKILL.md` | Given a spec's acceptance criteria: start dev server, use Playwright MCP to walk the flow, report pass/fail with screenshots, then write `e2e/<feature>.spec.ts`. |
| `.claude/agents/reviewer.md` (exists) | keep: read-only, `model: opus`, "report correctness gaps only". |
| `.claude/agents/qa.md` | `tools: Read, Bash, mcp__playwright__*`, `mcpServers: [playwright]`, `isolation: worktree` optional. Runs the qa-flow skill and returns a short pass/fail table. |
| `docs/specs/`, `docs/decisions/`, `CONTEXT.md` | docs-as-code: specs, ADRs, domain glossary — all in git, all reviewed in the PR. |
| `.claude/loop.md` | "Check the current branch PR: fix red CI, answer review comments, else say quiet." Then `/loop` while you rest. |

### Remove or disable (to cut overlap)
- Custom `spec-first`, `tdd-loop`, `ship-it`, `triage-bug` → replaced by Superpowers skills + `/ticket`. Keep `hotfix`, `postmortem`, `pm-handoff` (no Superpowers equivalent).
- `engineering:*` plugin skills that duplicate `/code-review`, `standup`, `debug`. Keep one.
- Claude in Chrome: keep installed, **not** "enabled by default"; use `claude --chrome` when needed.

### Daily flow (map)
1. `claude --worktree mmv-278` in the app repo; second terminal `claude` in the vault repo.
2. `/ticket MMV-278` → spec → plan → you approve each step.
3. Implement with `/superpowers:test-driven-development`; format hook runs; LSP shows type errors.
4. `@qa` runs the flow with Playwright; `@reviewer` reviews the diff; you read both reports.
5. `/superpowers:finishing-a-development-branch` → PR to `dev` (never main); `/loop` babysits CI.
6. `/adr` when a real decision was made. Notification hook pings you when Claude waits.

---

## Sources

Official docs (code.claude.com, fetched 2026-09-09):
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/discover-plugins
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/remote-control
- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/scheduled-tasks
- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/keybindings
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/chrome
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/common-workflows

Anthropic / Claude blog:
- https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more (June 2026)
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills (Oct 2025)
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (Nov 2025)
- https://claude.com/blog/how-anthropic-teams-use-claude-code (July 2025)

GitHub (stars via `gh api`, 2026-09-09):
- https://github.com/obra/superpowers — 283,864
- https://github.com/mattpocock/skills — 257,677
- https://github.com/affaan-m/everything-claude-code — 254,919
- https://github.com/anthropics/skills — 175,392
- https://github.com/anthropics/claude-code — 144,540
- https://github.com/ruvnet/claude-flow — 71,773
- https://github.com/hesreallyhim/awesome-claude-code — 53,757
- https://github.com/ChromeDevTools/chrome-devtools-mcp — 51,450
- https://github.com/wshobson/agents — 39,524
- https://github.com/microsoft/playwright-mcp — 36,915
- https://github.com/anthropics/claude-plugins-official — 36,079
- https://github.com/davila7/claude-code-templates — 30,575
- https://github.com/VoltAgent/awesome-claude-code-subagents — 24,961
- https://github.com/humanlayer/humanlayer — 11,501
- https://github.com/anthropics/claude-code-action — 8,830
- https://github.com/ChrisWiles/claude-code-showcase — 6,063
- https://github.com/steipete/agent-rules — 5,690
- https://github.com/disler/claude-code-hooks-mastery — 3,915
- https://github.com/anthropics/claude-plugins-community — 3,673
- https://github.com/shanraisshan/claude-code-best-practice (README claims ~65.8k)
- https://github.com/shanraisshan/claude-code-best-practice/blob/main/reports/claude-in-chrome-v-chrome-devtools-mcp.md
- https://gist.github.com/andynu/13e362f7a5e69a9f083e7bca9f83f60a

Secondary (blogs, HN):
- https://www.d12frosted.io/posts/2026-01-05-claude-code-notifications
- https://khromov.se/claude-code-hooks-for-simple-macos-notifications/
- https://okhlopkov.com/claude-code-setup-mcp-hooks-skills-2026/
- https://scottspence.com/posts/optimising-mcp-server-context-usage-in-claude-code
- https://stevekinney.com/courses/self-testing-ai-agents/runtime-tools-compared
- https://www.mindstudio.ai/blog/claude-code-subagents-cost-tokens
- https://www.mindstudio.ai/blog/claude-code-git-worktree-parallel-branches
- https://clawtab.cc/articles/claude-code-parallel-agents-tmux
- https://news.ycombinator.com/item?id=48231575
- https://www.beyondautocomplete.nl/how-i-use-claude-code-to-keep-my-architecture-decisions-on-track/
- https://blog.memoryplugin.com/claude-code-memory/
- https://claudefa.st/blog/guide/mechanics/auto-memory

Not verified / could not fetch: githubdaily.medium.com agent-teams post (HTTP 403; only search snippet used). Star counts for `rachidelaid/claude-code-best-practices`, `kingbootoshi/claude-code-hooks`, `Mnehmos/awesome-claude-code` — repos not found (404).
