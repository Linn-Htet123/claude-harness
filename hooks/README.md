# Hooks — currently OFF

Nothing in this folder runs. `guardrails.sh` is not wired to anything.

## Why hooks exist

A rule written in `CLAUDE.md` is **advice**. Claude can decide to ignore it.
A hook is **code that runs before the action**. It cannot be talked out of it.

From Anthropic's docs:

> *"Unlike CLAUDE.md instructions which are advisory, hooks are deterministic
> and guarantee the action happens."*

## What guardrails.sh would block

Only 4 things. Nothing you would type on purpose:

1. `git push --force` to `main` / `master`
2. `gh pr merge` (a person merges, not the agent)
3. Reading `.env` files into context (secret leak)
4. `rm -rf /` and friends

Everything else stays fast and light.

## How to switch it on

Add this to your settings file - your user config
(`~/.claude/settings.json`, or whichever `CLAUDE_CONFIG_DIR` you use), or a
single project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Read",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/GITHUB/claude-harness/hooks/guardrails.sh"
          }
        ]
      }
    ]
  }
}
```

Then restart Claude Code.

## How to test it before trusting it

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' \
  | ./guardrails.sh
```

You should see a JSON `deny` response.

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | ./guardrails.sh
```

You should see nothing (allowed).

## How to switch it off again

Delete the `hooks` block from your settings file. That is all.
