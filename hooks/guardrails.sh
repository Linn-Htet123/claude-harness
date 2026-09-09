#!/usr/bin/env bash
# PreToolUse guardrail. Wired in ~/.claude/settings.json (matcher "Bash|Read").
# Reads the hook JSON on stdin. Prints a JSON "deny" for the few things below.
# Prints nothing and exits 0 for everything else (= allowed).
#
# Blocks (Larry's rules, enforced in every project, cannot be talked out of):
#   1. git push to main/master (force or not), and any force push
#   2. merging a PR with the gh CLI                -> a human merges
#   3. schema push (db:push / drizzle-kit push / prisma db push) -> migrations only
#   4. rm -rf on root / home
#   5. reading a real .env file into context (cat/less/head/tail/... or the Read tool)
#
# Test it: hooks/test-guardrails.sh

set -uo pipefail

INPUT="$(cat)"
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
CMD="$(printf '%s' "$INPUT"  | jq -r '.tool_input.command // empty')"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

if [ "$TOOL" = "Bash" ] || [ "$TOOL" = "PowerShell" ]; then

  # 1. any push that targets main/master (origin main, HEAD:main, ... main)
  if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push' \
     && printf '%s' "$CMD" | grep -Eq '(^|[[:space:]:])(main|master)([[:space:]]|$)'; then
    deny "Blocked: push to main/master. Push to a branch and open a PR."
  fi
  # 1b. force push anywhere
  if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push' \
     && printf '%s' "$CMD" | grep -Eq '(--force([^-]|$)|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
    deny "Blocked: force push. Ask Larry to do this by hand if it is really needed."
  fi

  # 2. merging a pull request
  if printf '%s' "$CMD" | grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge'; then
    deny "Blocked: merging is a human decision. Post the PR link and stop."
  fi

  # 3. schema push (skips migrations)
  if printf '%s' "$CMD" | grep -Eq '(db:push|drizzle-kit[[:space:]]+push|prisma[[:space:]]+db[[:space:]]+push)'; then
    deny "Blocked: schema push is never allowed. Generate a migration, then migrate."
  fi

  # 4. catastrophic recursive delete
  if printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[fF]|-[a-zA-Z]*[fF][a-zA-Z]*[rR])[a-zA-Z]*[[:space:]]+(/|~|\$HOME|\*)[[:space:]]*$'; then
    deny "Blocked: recursive delete of a root/home path."
  fi

  # 5. reading secrets through the shell.
  #    Only when a .env path is a direct argument of a reader command, so a
  #    heredoc like `cat > file <<EOF` that merely mentions .env is fine.
  #    .env.example / .env.sample / .env.template / .env.dist hold no secrets.
  SEG="$(printf '%s' "$CMD" | grep -oE '(^|[|;&[:space:]])(cat|less|more|head|tail|bat)([[:space:]]+[^[:space:]|;&<>]+)*' || true)"
  if [ -n "$SEG" ]; then
    for P in $(printf '%s' "$SEG" | grep -Eo '[^[:space:];|&<>]*\.env[^[:space:];|&<>]*' || true); do
      case "$P" in
        *.example|*.sample|*.template|*.dist) continue ;;
      esac
      deny "Blocked: reading $P puts secrets into context. Use .env.example instead."
    done
  fi
fi

# 5b. reading secrets through the Read tool
if [ "$TOOL" = "Read" ] \
   && printf '%s' "$FILE" | grep -Eq '(^|/)\.env(\.[a-zA-Z0-9_]+)?$' \
   && ! printf '%s' "$FILE" | grep -Eq '\.(example|sample|template|dist)$'; then
  deny "Blocked: reading $FILE puts secrets into context. Use .env.example instead."
fi

exit 0
