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

# 2b + 6. PR merge / create, built with jq so quotes and newlines are exact.
# U = repo with an unreviewed HEAD, V = repo whose HEAD has the review mark.
U="$(mktemp -d)"; V="$(mktemp -d)"; N="$(mktemp -d)"; trap 'rm -rf "$U" "$V" "$N"' EXIT
for r in "$U" "$V"; do git -C "$r" init -q && git -C "$r" -c user.email=t@t -c user.name=t commit -q --allow-empty -m one; done
(cd "$V" && bash "$(dirname "$G")/../skills/review-gate/scripts/mark-reviewed.sh" "test pass" >/dev/null)
c() { jq -nc --arg d "$1" --arg c "$2" '{tool_name:"Bash",cwd:$d,tool_input:{command:$c}}'; }
NL=$'\n'; P='gh pr'

t "merge: gh -R o/r pr merge"          deny  "$(c "$V" "gh -R o/r pr merge 1")"
t "merge: gh api PUT .../merge"        deny  "$(c "$V" "gh api -X PUT repos/o/r/pulls/1/merge")"
t "merge: graphql mergePullRequest"    deny  "$(c "$V" "gh api graphql -f query='mutation{mergePullRequest(input:{})}'")"

t "create: no review"                  deny  "$(c "$U" "$P create --fill")"
t "create: reviewed"                   allow "$(c "$V" "$P create --fill")"
t "create: view is fine"               allow "$(c "$U" "$P view")"
t "create: --help is fine"             allow "$(c "$U" "$P create --help")"
t "create: new commit after review"    deny  "$(cd "$V" && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m two; c "$V" "$P create --fill")"
(cd "$V" && bash "$(dirname "$G")/../skills/review-gate/scripts/mark-reviewed.sh" "test pass" >/dev/null)
t "create: not a git repo (fail closed)" deny "$(c "$N" "gh -R o/r pr create --head feat")"

t "bypass: gh pr new"                  deny  "$(c "$U" "$P new --fill")"
t "bypass: gh -R o/r pr create"        deny  "$(c "$U" "gh -R o/r pr create --fill")"
t "bypass: GH_REPO=x gh pr create"     deny  "$(c "$U" "GH_REPO=o/r $P create --fill")"
t "bypass: env gh"                     deny  "$(c "$U" "env $P create --fill")"
t "bypass: command gh"                 deny  "$(c "$U" "command $P create")"
t "bypass: full path gh"               deny  "$(c "$U" "/opt/homebrew/bin/$P create")"
t "bypass: backslash gh"               deny  "$(c "$U" "\\$P create")"
t "bypass: bash -c"                    deny  "$(c "$U" "bash -c '$P create --fill'")"
t "bypass: eval"                       deny  "$(c "$U" "eval \"$P create\"")"
t "bypass: backticks"                  deny  "$(c "$U" "echo \`$P create\`")"
t "bypass: \$() in double quotes"      deny  "$(c "$U" "echo \"\$($P create)\"")"
t "bypass: { ...; }"                   deny  "$(c "$U" "{ $P create; }")"
t "bypass: xargs"                      deny  "$(c "$U" "echo x | xargs $P create")"
t "bypass: gh api POST pulls"          deny  "$(c "$U" "gh api repos/o/r/pulls -f head=b -f base=dev -f title=t")"
t "bypass: here-string <<<"            deny  "$(c "$U" "cat <<<x${NL}$P create --fill")"
t "bypass: quoted <<EOF"               deny  "$(c "$U" "echo '<<EOF'${NL}$P create --fill")"
t "bypass: unquoted heredoc runs \$()" deny  "$(c "$U" "cat <<EOF${NL}\$($P create)${NL}EOF")"
t "bypass: cd other repo (reviewed cwd)" deny "$(c "$V" "cd $U && $P create --fill")"
t "bypass: commit in same command"     deny  "$(c "$V" "git commit --allow-empty -m w && $P create --fill")"
t "bypass: touch a mark"               deny  "$(c "$U" "mkdir -p .git/review-gate && touch .git/review-gate/abc")"

t "mention: commit msg, multi-line"    allow "$(c "$U" "git commit -m 'subject${NL}$P create is next'")"
t "mention: git log --grep with |"     allow "$(c "$U" "git log --grep 'a|$P create'")"
t "mention: quoted heredoc body"       allow "$(c "$U" "python3 - <<'PY'${NL}$P create in text${NL}PY")"
t "mention: grep"                      allow "$(c "$U" "grep -n \"$P create\" README.md")"
t "run the mark script (allowed)"      allow "$(c "$U" "bash ~/.claude/skills/review-gate/scripts/mark-reviewed.sh passed")"
echo; echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
