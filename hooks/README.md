# Hooks — ON since 2026-09-09

Wired in `~/.claude/settings.json` (backup in `~/.claude/backups/`).

| Hook | Event | What it does |
|---|---|---|
| `guardrails.sh` | `PreToolUse` on `Bash\|Read` | denies: push to main/master, force push (a simple text check: the real lock is GitHub branch protection), PR merge via gh (any flags, quotes, `gh api`, graphql), schema push, `rm -rf ~`, reading real `.env` files, opening a PR (`gh pr create\|new`, `gh api` POST pulls, graphql) before `/review-gate` marked HEAD as reviewed. `gh-intent.pl` is strict: it removes quotes and joins lines, then matches the words anywhere, so a mention counts too (put PR bodies in `--body-file`) |
| `notify.sh` | `Notification` (`permission_prompt`, `idle_prompt\|agent_needs_input`) | macOS banner + Glass sound "Claude needs your permission / is waiting for you" |
| (inline) | `Stop` | plays Hero.aiff — the "ding" when Claude finishes a turn |
| `statusline.sh` | `statusLine` | `model \| ctx 37% [###.......] \| branch \| $cost` — warns at 40% |

## The review gate is a nudge, not a lock

Rule 6 stops Claude from forgetting `/review-gate`. The mark is a file in `.git/review-gate/`, so an agent that really wants to skip review can still fake it (for example with the Write tool, which this hook does not watch). The human merge is the real lock.

The `duel` viewer's "open PR" button runs `gh` itself, so this hook never sees it. Run `/review-gate` on the `duel/<slug>` branch before you press it. Duel PRs target `main`; set `DUEL_BASE=dev` for MMV.

## Why hooks

A rule in `CLAUDE.md` is **advice**. A hook is **code that runs before the action** and cannot be talked out of.

## Test

```bash
./test-guardrails.sh
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | ./guardrails.sh   # -> deny JSON
echo '{"tool_name":"Bash","tool_input":{"command":"pnpm test"}}' | ./guardrails.sh             # -> nothing
echo '{"cwd":"/tmp"}' | ./notify.sh "test"                                                      # -> banner
```

If the banner does not show: System Settings → Notifications → Script Editor → Allow.

## Turn one off

Delete its block from the `hooks` key in `~/.claude/settings.json`, restart Claude Code.
To remove the Stop "ding" only, delete the `Stop` block.
