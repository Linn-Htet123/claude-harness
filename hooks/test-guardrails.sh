#!/usr/bin/env bash
G="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guardrails.sh"
PASS=0; FAIL=0
t() { # label, expected(deny|allow), json
  r=$(printf '%s' "$3" | "$G")
  if [ -n "$r" ]; then got=deny; why="$(echo "$r" | jq -r .hookSpecificOutput.permissionDecisionReason | cut -c1-58)"; else got=allow; why=""; fi
  if [ "$got" = "$2" ]; then PASS=$((PASS+1)); mark="ok  "; else FAIL=$((FAIL+1)); mark="BAD "; fi
  printf '%s %-46s -> %-5s %s\n' "$mark" "$1" "$got" "$why"
}
b() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }
r() { printf '{"tool_name":"Read","tool_input":{"file_path":"%s"}}' "$1"; }
t "push origin main"                 deny  "$(b 'git push origin main')"
t "push HEAD:master"                 deny  "$(b 'git push -u origin HEAD:master')"
t "force push dev"                   deny  "$(b 'git push --force origin dev')"
t "push feat/x-main (allowed)"       allow "$(b 'git push -u origin feat/x-main')"
t "push larry/fix (allowed)"         allow "$(b 'git push -u origin larry/fix')"
t "gh pr merge"                      deny  "$(b 'gh pr merge 42 --squash')"
t "git merge main into feature"      allow "$(b 'git merge main')"
t "pnpm run db:push"                 deny  "$(b 'cd apps/dashboard && pnpm run db:push')"
t "npx drizzle-kit push"             deny  "$(b 'npx drizzle-kit push')"
t "prisma db push"                   deny  "$(b 'npx prisma db push')"
t "pnpm run db:migrate"              allow "$(b 'pnpm run db:migrate')"
t "rm -rf ~"                         deny  "$(b 'rm -rf ~')"
t "rm -rf /"                         deny  "$(b 'rm -rf /')"
t "rm -rf dist"                      allow "$(b 'rm -rf dist')"
t "cat .env"                         deny  "$(b 'cat .env')"
t "cat apps/becca/.env.local"        deny  "$(b 'cat apps/becca/.env.local')"
t "head -n 5 .env"                   deny  "$(b 'head -n 5 .env')"
t "tail .env | grep X"               deny  "$(b 'tail .env | grep X')"
t "cat .env.example"                 allow "$(b 'cat .env.example')"
t "heredoc mentioning .env"          allow "$(b 'cat > README.md <<EOF\ncopy .env into place\nEOF')"
t "cat notes | grep .env"            allow "$(b 'cat notes.md | grep .env')"
t "grep NEON .env"                   allow "$(b 'grep NEON .env')"
t "printf .env > .worktreeinclude"   allow "$(b 'printf .env > .worktreeinclude')"
t "Read .env"                        deny  "$(r '/x/.env')"
t "Read .env.local"                  deny  "$(r '/x/.env.local')"
t "Read .env.example"                allow "$(r '/x/.env.example')"
t "pnpm test"                        allow "$(b 'pnpm test')"
t "git push (no target)"             allow "$(b 'git push')"

# 6. gh pr create needs the /review-gate mark for HEAD (temp repo as cwd)
REPO="$(mktemp -d)"; trap 'rm -rf "$REPO"' EXIT
git -C "$REPO" init -q && git -C "$REPO" -c user.email=t@t -c user.name=t commit -q --allow-empty -m one
c() { printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$1" "$2"; }
t "gh pr create, no review"          deny  "$(c "$REPO" 'gh pr create --fill')"
t "gh pr view, no review (allowed)"  allow "$(c "$REPO" 'gh pr view')"
(cd "$REPO" && bash "$(dirname "$G")/../skills/review-gate/scripts/mark-reviewed.sh" "test pass" >/dev/null)
t "gh pr create, reviewed"           allow "$(c "$REPO" 'gh pr create --fill')"
git -C "$REPO" -c user.email=t@t -c user.name=t commit -q --allow-empty -m two
t "gh pr create, new commit"         deny  "$(c "$REPO" 'gh pr create --fill')"
t "gh pr create, not a git repo"     allow "$(c /tmp 'gh pr create --fill')"
t "cd x && gh pr create"             deny  "$(c "$REPO" 'cd . && gh pr create --fill')"
t "push; gh pr create"               deny  "$(c "$REPO" 'git push -u origin x; gh pr create --fill')"
t "heredoc mentions it (allowed)"    allow "$(c "$REPO" "python3 - <<'PY'\\ngh pr create in text\\nPY")"
t "commit msg mentions it (allowed)" allow "$(c "$REPO" 'git commit -m \"run gh pr create later\"')"
t "grep for it (allowed)"            allow "$(c "$REPO" 'grep -n \"gh pr create\" README.md')"
echo; echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
