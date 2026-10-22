#!/usr/bin/env bash
# Definition of Ready check for one OpenSpec change folder. Prints PASS/FAIL lines.
# usage: ready-check.sh openspec/changes/mmv-278-evening-ritual
# exit 0 = ready, exit 1 = not ready. It is a checklist, not a wall.
set -uo pipefail
DIR="${1:?change folder}"; FAIL=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; FAIL=1; }

OLD=0; [ ! -d "$DIR/specs" ] && [ -f "$DIR/spec.md" ] && OLD=1   # old docs/changes/<ID>-<slug> layout
TASKS="$DIR/tasks.md"; [ "$OLD" = 1 ] && TASKS="$DIR/tickets.md"
for f in index.md proposal.md research.md design.md "$(basename "$TASKS")"; do
  if [ -f "$DIR/$f" ]; then
    grep -q '^type:' "$DIR/$f" && ok "$f exists with OKF frontmatter (type:)" || bad "$f has no 'type:' frontmatter"
  else bad "$f is missing"; fi
done

SPECS="$(find "$DIR/specs" -name spec.md 2>/dev/null)"; [ "$OLD" = 1 ] && SPECS="$DIR/spec.md"
[ -n "$SPECS" ] && ok "found $(echo "$SPECS" | wc -l | tr -d ' ') spec file(s)" || bad "no specs/<capability>/spec.md"

# no template placeholders left
LEFT="$(grep -rn '{{' "$DIR" --include='*.md' 2>/dev/null | grep -v 'research.md' | wc -l | tr -d ' ')"
[ "$LEFT" = "0" ] && ok "no {{placeholders}} left (research.md may still have some)" || bad "$LEFT placeholder line(s) still contain {{...}} — run: grep -rn '{{' $DIR"

# spec: every requirement has >=1 happy and >=1 edge scenario
for S in $SPECS; do
  REQ="$(grep -c '^### Requirement:' "$S")"
  [ "$REQ" -ge 1 ] && ok "${S#$DIR/} has $REQ requirement(s)" || bad "${S#$DIR/} has no '### Requirement:' block"
  awk '
    /^### Requirement:/ { if (name!="") report(); name=$0; sub(/^### Requirement: */,"",name); happy=0; edge=0; next }
    /^#### Scenario:/   { t=tolower($0); if (t ~ /^#### scenario: s[0-9]+ happy/) happy++; if (t ~ /^#### scenario: s[0-9]+ edge/) edge++; next }
    END { if (name!="") report() }
    function report() {
      if (happy>=1 && edge>=1) printf("PASS  requirement \"%s\": %d happy, %d edge\n", name, happy, edge);
      else printf("FAIL  requirement \"%s\": needs >=1 \"Sn happy\" and >=1 \"Sn edge\" scenario (has %d/%d)\n", name, happy, edge)
    }
  ' "$S" | tee /dev/stderr | grep -q '^FAIL' && FAIL=1
  grep -Eq '^#### Scenario: S[0-9]+' "$S" && ok "${S#$DIR/} scenarios carry ids (S1, S2, ...)" || bad "scenario titles must start with an id: '#### Scenario: S1 happy — ...'"
done

# proposal: scope + at least one measurable hypothesis
if [ -f "$DIR/proposal.md" ]; then
  grep -q '^## Out of scope' "$DIR/proposal.md" "$DIR/spec.md" 2>/dev/null && ok "proposal has an Out of scope section" || bad "proposal has no '## Out of scope' section"
  grep -Eq '^- H[0-9]+: *metric:' "$DIR/proposal.md" && ok "proposal has a measurable hypothesis (H1: metric: ...)" || bad "proposal needs '- H1: metric: ...; from: ...; to: ...; within: ...'"
  grep -q '^| D1' "$DIR/proposal.md" && ok "proposal has a decision log row" || bad "proposal decision log is empty"
fi

# tasks: at least one tracer-bullet group with blocked-by and checkboxes
if [ "$OLD" = 1 ] && [ -f "$TASKS" ]; then
  grep -Eq '^\| T[0-9]+ ' "$TASKS" && ok "tickets.md has at least one ticket row" || bad "tickets.md has no '| T1 ' row"
elif [ -f "$DIR/tasks.md" ]; then
  grep -Eq '^## [0-9]+\. T[0-9]+ .*blocked by:' "$DIR/tasks.md" && ok "tasks.md has a slice heading with 'blocked by:'" || bad "tasks.md needs '## 1. T1 <title> (blocked by: none; scenarios: S1,S2; ...)'"
  grep -Eq '^- \[ ?\] [0-9]+\.[0-9]+ ' "$DIR/tasks.md" && ok "tasks.md has checkbox tasks (- [ ] 1.1 ...)" || bad "tasks.md has no '- [ ] 1.1' task"
fi

# OpenSpec's own check (structure of proposal + spec deltas)
ROOT="$(cd "$DIR/../../.." 2>/dev/null && pwd)"
if [ "$OLD" = 0 ] && [ "${NO_VALIDATE:-0}" != 1 ] && command -v openspec >/dev/null && [ -d "$ROOT/openspec" ]; then
  OUT="$(cd "$ROOT" && openspec validate "$(basename "$DIR")" 2>&1)"
  echo "$OUT" | grep -q 'is valid' && ok "openspec validate passes" || { bad "openspec validate fails:"; echo "$OUT" | sed 's/^/      /'; }
fi

echo; if [ "$FAIL" = "0" ]; then echo "READY: all checks pass. Ask Larry to approve, then set 'stage: ready' in index.md."; else echo "NOT READY: fix the FAIL lines above."; fi
exit $FAIL
