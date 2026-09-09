#!/usr/bin/env bash
# Definition of Ready check for one change folder. Prints PASS/FAIL lines.
# usage: ready-check.sh docs/changes/MMV-278-evening-ritual
# exit 0 = ready, exit 1 = not ready. It is a checklist, not a wall.
set -uo pipefail
DIR="${1:?change folder}"; FAIL=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; FAIL=1; }

for f in index.md proposal.md research.md spec.md design.md tickets.md; do
  if [ -f "$DIR/$f" ]; then
    grep -q '^type:' "$DIR/$f" && ok "$f exists with OKF frontmatter (type:)" || bad "$f has no 'type:' frontmatter"
  else bad "$f is missing"; fi
done

# no template placeholders left
LEFT="$(grep -rn '{{' "$DIR"/*.md 2>/dev/null | grep -v 'research.md' | wc -l | tr -d ' ')"
[ "$LEFT" = "0" ] && ok "no {{placeholders}} left (research.md may still have some)" || bad "$LEFT placeholder line(s) still contain {{...}} — run: grep -n '{{' $DIR/*.md"

# spec: every requirement has >=1 happy and >=1 edge scenario
if [ -f "$DIR/spec.md" ]; then
  REQ="$(grep -c '^### Requirement:' "$DIR/spec.md")"
  [ "$REQ" -ge 1 ] && ok "spec has $REQ requirement(s)" || bad "spec has no '### Requirement:' block"
  awk '
    /^### Requirement:/ { if (name!="") report(); name=$0; sub(/^### Requirement: */,"",name); happy=0; edge=0; next }
    /^#### Scenario:/   { t=tolower($0); if (t ~ /happy/) happy++; if (t ~ /edge/) edge++; next }
    END { if (name!="") report() }
    function report() {
      if (happy>=1 && edge>=1) printf("PASS  requirement \"%s\": %d happy, %d edge\n", name, happy, edge);
      else { printf("FAIL  requirement \"%s\": needs >=1 \"happy\" and >=1 \"edge\" scenario (has %d/%d)\n", name, happy, edge); exit_code=1 }
    }
  ' "$DIR/spec.md" | tee /dev/stderr | grep -q '^FAIL' && FAIL=1
  grep -Eq '^#### Scenario: S[0-9]+' "$DIR/spec.md" && ok "scenarios carry ids (S1, S2, ...)" || bad "scenario titles must start with an id: '#### Scenario: S1 happy — ...'"
  grep -q '^## Out of scope' "$DIR/spec.md" && ok "spec has an Out of scope section" || bad "spec has no '## Out of scope' section"
fi

# proposal: at least one measurable hypothesis
if [ -f "$DIR/proposal.md" ]; then
  grep -Eq '^- H[0-9]+: *metric:' "$DIR/proposal.md" && ok "proposal has a measurable hypothesis (H1: metric: ...)" || bad "proposal needs '- H1: metric: ...; from: ...; to: ...; within: ...'"
  grep -q '^| D1' "$DIR/proposal.md" && ok "proposal has a decision log row" || bad "proposal decision log is empty"
fi

# tickets: at least one row
if [ -f "$DIR/tickets.md" ]; then
  grep -Eq '^\| T[0-9]+ ' "$DIR/tickets.md" && ok "tickets.md has at least one ticket row" || bad "tickets.md has no '| T1 ' row"
fi

echo; if [ "$FAIL" = "0" ]; then echo "READY: all checks pass. Ask Larry to approve, then set 'stage: ready' in index.md."; else echo "NOT READY: fix the FAIL lines above."; fi
exit $FAIL
