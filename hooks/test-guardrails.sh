#!/usr/bin/env bash
# Prove the guardrail does what it says before you trust it.
#   ./hooks/test-guardrails.sh
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guardrails.sh"
PASS=0; FAIL=0
t(){ exp="$3"; raw=$(printf '%s' "$1" | "$H")
 if [ -z "$raw" ]; then got=allow; else got=$(printf '%s' "$raw" | jq -r '.hookSpecificOutput.permissionDecision'); fi
 if [ "$got" = "$exp" ]; then PASS=$((PASS+1)); printf 'ok    %-40s %s\n' "$2" "$got"
 else FAIL=$((FAIL+1)); printf 'FAIL  %-40s got=%s want=%s\n' "$2" "$got" "$exp"; fi; }

echo "--- must BLOCK ---"
t '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' 'force push main' deny
t '{"tool_name":"Bash","tool_input":{"command":"git push -f origin master"}}' 'force push master' deny
t '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 42 --squash"}}' 'gh pr merge' deny
t '{"tool_name":"Bash","tool_input":{"command":"cat .env"}}' 'cat .env' deny
t '{"tool_name":"Bash","tool_input":{"command":"cat backend/.env.production"}}' 'cat .env.production' deny
t '{"tool_name":"Bash","tool_input":{"command":"head -5 .env.local"}}' 'head .env.local' deny
t '{"tool_name":"Read","tool_input":{"file_path":"/app/.env.local"}}' 'Read .env.local' deny
t '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}' 'rm -rf ~' deny
echo "--- must ALLOW ---"
t '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' 'npm test' allow
t '{"tool_name":"Bash","tool_input":{"command":"git push origin feat/login"}}' 'push a branch' allow
t '{"tool_name":"Bash","tool_input":{"command":"gh pr create --fill"}}' 'gh pr create' allow
t '{"tool_name":"Bash","tool_input":{"command":"rm -rf node_modules"}}' 'rm -rf node_modules' allow
t '{"tool_name":"Bash","tool_input":{"command":"cat .env.example"}}' 'cat .env.example' allow
t '{"tool_name":"Bash","tool_input":{"command":"cp .env.example .env"}}' 'cp .env.example .env' allow
t '{"tool_name":"Read","tool_input":{"file_path":".env.example"}}' 'Read .env.example' allow
t '{"tool_name":"Read","tool_input":{"file_path":"src/env.ts"}}' 'Read src/env.ts' allow
t '{"tool_name":"Bash","tool_input":{"command":"git merge feat/login"}}' 'git merge a branch' allow
t '{"tool_name":"Bash","tool_input":{"command":"git push --force origin feat/x"}}' 'force push a branch' allow
echo ""; echo "PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
