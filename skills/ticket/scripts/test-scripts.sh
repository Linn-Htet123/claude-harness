#!/usr/bin/env bash
# Test new-change, ready-check and next-step on a throwaway repo. Needs openspec.
# usage: bash skills/ticket/scripts/test-scripts.sh
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$(mktemp -d)"; trap 'rm -rf "$R"' EXIT; cd "$R" && git init -q && openspec init --tools none >/dev/null 2>&1
PASS=0; FAIL=0; chk() { if eval "$2"; then PASS=$((PASS+1)); echo "ok   $1"; else FAIL=$((FAIL+1)); echo "BAD  $1"; fi; }

# new-change: & and | in title/url survive; injection does not write a file
bash $H/new-change.sh MMV-1 login "Login & signup | v2" "https://x/issue?a=1&b=2" >/dev/null 2>&1
D=openspec/changes/mmv-1-login
chk "title with & and | kept"      "grep -q 'title: MMV-1 Login & signup | v2' $D/index.md"
chk "url with & kept"              "grep -q 'resource: https://x/issue?a=1&b=2' $D/index.md"
bash $H/new-change.sh MMV-2 inj "x|w $R/pwned
#" >/dev/null 2>&1
chk "injection title: change made"  "[ -f openspec/changes/mmv-2-inj/index.md ]"
chk "sed injection writes nothing" "[ ! -e '$R/pwned' ] && ! ls $R/pwned* >/dev/null 2>&1"
chk "bad capability refused"       "! bash $H/new-change.sh MMV-3 cap t u ../../x >/dev/null 2>&1"

# ready-check: a 'ledger' happy-only requirement must FAIL
D2=openspec/changes/mmv-4-pay; bash $H/new-change.sh MMV-4 pay "Pay" >/dev/null 2>&1
find $D2 -name '*.md' -exec sed -i '' -E 's/\{\{[^}]*\}\}/filled text for the payment ledger capability/g' {} +
awk '/^#### Scenario: S2 edge/{skip=1} /^## |^### /{if(skip&&!/^#### /)skip=0} !skip' $D2/specs/pay/spec.md > t && mv t $D2/specs/pay/spec.md
chk "ledger-only spec has no edge"  "! grep -q 'S2 edge' $D2/specs/pay/spec.md"
chk "ready-check FAILS without edge" "! NO_VALIDATE=1 bash $H/ready-check.sh $D2 >/dev/null 2>&1"

# ready-check: old docs/changes layout can pass
O=docs/changes/MMV-5-old; mkdir -p $O
for f in index proposal research design; do printf -- '---\ntype: X\n---\n' > $O/$f.md; done
printf -- '- H1: metric: m; from: 1; to: 2; within: 7d\n| D1 | q | a | a | b |\n' >> $O/proposal.md
printf -- '---\ntype: Spec\n---\n## Out of scope\n- x\n### Requirement: R\n#### Scenario: S1 happy — a\n#### Scenario: S2 edge — b\n' > $O/spec.md
printf -- '---\ntype: Tickets\n---\n| T1 | t | - | S1 | x | todo |\n' > $O/tickets.md
chk "old layout passes ready-check" "bash $H/ready-check.sh $O >/dev/null 2>&1"

# next-step: archived change is found, not 'Step 1'
sed -i '' 's/stage: intent/stage: measure/' $D/index.md
find $D -name '*.md' -exec sed -i '' -E 's/\{\{[^}]*\}\}/filled text for the login capability here/g' {} +
openspec archive mmv-1-login --yes >/dev/null 2>&1
chk "next-step finds archived"     "bash $H/next-step.sh $D | grep -q 'STAGE: archived'"
D3=openspec/changes/mmv-6-done; bash $H/new-change.sh MMV-6 done "Done" >/dev/null 2>&1; sed -i '' 's/stage: intent/stage: done/' $D3/index.md
chk "next-step done = measure, no archive" "bash $H/next-step.sh $D3 | grep -q 'NEXT: Step 7 Measure' && ! bash $H/next-step.sh $D3 | grep -q 'NEXT:.*archive'"
mkdir -p 'sp ace' && cp -R $D2 'sp ace/'
chk "spec path with a space"        "! NO_VALIDATE=1 bash $H/ready-check.sh 'sp ace/mmv-4-pay' 2>&1 | grep -q 'No such file'"
echo; echo "passed=$PASS failed=$FAIL"; [ "$FAIL" = 0 ]
