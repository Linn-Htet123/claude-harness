# Hooks — ON since 2026-09-09

Wired in `~/.claude/settings.json` (backup in `~/.claude/backups/`).

| Hook | Event | What it does |
|---|---|---|
| `guardrails.sh` | `PreToolUse` on `Bash\|Read` | denies: push to main/master, force push, PR merge via gh, schema push, `rm -rf ~`, reading real `.env` files |
| `notify.sh` | `Notification` (`permission_prompt`, `idle_prompt\|agent_needs_input`) | macOS banner + Glass sound "Claude needs your permission / is waiting for you" |
| (inline) | `Stop` | plays Hero.aiff — the "ding" when Claude finishes a turn |
| `statusline.sh` | `statusLine` | `model \| ctx 37% [###.......] \| branch \| $cost` — warns at 40% |

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
