#!/usr/bin/env bash
# PreToolUse guardrail. NOT ACTIVE unless you wire it into settings.json.
# See hooks/README.md.
#
# Reads the hook JSON on stdin. Prints a deny decision for 4 things.
# Prints nothing and exits 0 for everything else (= allowed).

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

  # 1. force push to a protected branch
  if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push' \
     && printf '%s' "$CMD" | grep -Eq '(--force([^-]|$)|--force-with-lease|[[:space:]]-f([[:space:]]|$))' \
     && printf '%s' "$CMD" | grep -Eq '(main|master)'; then
    deny "Blocked: force-push to main/master. Push to a branch and open a PR."
  fi

  # 2. merging a pull request
  if printf '%s' "$CMD" | grep -Eq '(gh[[:space:]]+pr[[:space:]]+merge|git[[:space:]]+merge[[:space:]]+.*(main|master))'; then
    deny "Blocked: merging is a human decision. Anthony reviews and merges."
  fi

  # 3. catastrophic recursive delete
  if printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[fF]|-[a-zA-Z]*[fF][a-zA-Z]*[rR])[a-zA-Z]*[[:space:]]+(/|~|\$HOME|\*)[[:space:]]*$'; then
    deny "Blocked: recursive delete of a root/home path."
  fi

  # 4. reading secrets through the shell
  #    .env.example / .env.sample / .env.template / .env.dist are safe - they hold no real secrets.
  if printf '%s' "$CMD" | grep -Eq '(^|[|;&[:space:]])(cat|less|more|head|tail|bat)[[:space:]]'; then
    for P in $(printf '%s' "$CMD" | grep -Eo '[^[:space:];|&<>]*\.env[^[:space:];|&<>]*' || true); do
      case "$P" in
        *.example|*.sample|*.template|*.dist) continue ;;
      esac
      deny "Blocked: reading $P puts secrets into context. Use .env.example instead."
    done
  fi
fi

# 4b. reading secrets through the Read tool
if [ "$TOOL" = "Read" ] \
   && printf '%s' "$FILE" | grep -Eq '(^|/)\.env(\.[a-zA-Z0-9_]+)?$' \
   && ! printf '%s' "$FILE" | grep -Eq '\.(example|sample|template|dist)$'; then
  deny "Blocked: reading $FILE puts secrets into context. Use .env.example instead."
fi

exit 0
