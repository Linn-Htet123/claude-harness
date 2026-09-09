#!/usr/bin/env bash
# Read the change folder state and print the next step of the loop.
# usage: next-step.sh docs/changes/MMV-278-evening-ritual
set -uo pipefail
DIR="${1:?change folder}"
if [ ! -d "$DIR" ]; then echo "STAGE: none"; echo "NEXT: Step 1 Intent — create the folder: scripts/new-change.sh <ID> <slug>"; exit 0; fi
STAGE="$(grep -m1 '^stage:' "$DIR/index.md" 2>/dev/null | sed 's/stage: *//')"
echo "STAGE: ${STAGE:-unknown}"
case "$STAGE" in
  intent)    echo "NEXT: Step 2 Spec & Design — run the grilling interview, fill proposal.md, spec.md, design.md; send @scout for research.md" ;;
  spec)      echo "NEXT: Step 3 Ready — run scripts/ready-check.sh $DIR and fix FAIL lines; Larry approves; set stage: ready" ;;
  ready)     echo "NEXT: Step 4 Implement — worktree + /tdd-loop per scenario (test titles carry S-ids); tickets.md rows -> Linear; set stage: implement" ;;
  implement) echo "NEXT: Step 5 QA — dispatch @qa with $DIR/spec.md; it writes qa-report.md; set stage: qa" ;;
  qa)        echo "NEXT: Step 6 Done — @verifier + @reviewer, then /ship-it (PR to dev, never main); Linear -> In Review; set stage: done" ;;
  done)      echo "NEXT: Step 7 Measure — after deploy + N days, run /measure $DIR; set stage: measure" ;;
  measure)   echo "NEXT: Close — learnings written, new edge scenarios added, ADR if needed; set stage: closed" ;;
  closed)    echo "NEXT: nothing. This change is closed." ;;
  *)         echo "NEXT: index.md has no known 'stage:'. Set one of: intent spec ready implement qa done measure closed" ;;
esac
echo; echo "Files:"; for f in proposal research spec design tickets qa-report; do
  if [ -f "$DIR/$f.md" ]; then n="$(grep -c '{{' "$DIR/$f.md")"; echo "  $f.md  (placeholders left: $n)"; else echo "  $f.md  MISSING"; fi; done
