---
description: Generate a standup update from real git and PR activity
argument-hint: "[since when - default yesterday]"
---

Generate my standup update from what actually happened, not from memory.

Gather first:

!`git log --author="$(git config user.name)" --since="${1:-yesterday}" --oneline 2>/dev/null | head -30`
!`git branch --show-current`
!`git status --short`

Also check open PRs and ticket moves if GitHub or Linear MCP tools are
connected.

Then write exactly this, and nothing else:

```
**Yesterday**
- <what actually shipped or moved - one line each>

**Today**
- <what I am picking up>

**Blockers**
- <what is stopping me, and who can unblock it - or "none">
```

Rules:
- Plain language. A non-engineer should understand every line.
- Base it on real commits and PRs. If there is nothing, say "nothing merged
  yesterday" rather than padding it.
- Under 8 lines total.
- A blocker names the person or thing that unblocks it.
