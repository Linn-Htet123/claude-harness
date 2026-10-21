#!/usr/bin/env bash
# Read the change folder state and print the next step of the loop.
# usage: next-step.sh openspec/changes/mmv-278-evening-ritual   (old docs/changes/<ID>-<slug> folders still work)
set -uo pipefail
DIR="${1:?change folder}"
if [ ! -d "$DIR" ]; then echo "STAGE: none"; echo "NEXT: Step 1 Intent — create the change: scripts/new-change.sh <ID> <slug>"; exit 0; fi
STAGE="$(grep -m1 '^stage:' "$DIR/index.md" 2>/dev/null | sed 's/stage: *//')"
NAME="$(basename "$DIR")"
echo "STAGE: ${STAGE:-unknown}"
case "$STAGE" in
  intent)    echo "NEXT: Step 2 Spec & Design — grilling interview, fill proposal.md, specs/<capability>/spec.md, design.md, tasks.md; send @scout for research.md" ;;
  spec)      echo "NEXT: Step 3 Ready — run scripts/ready-check.sh $DIR and fix FAIL lines; Larry approves; set stage: ready" ;;
  ready)     echo "NEXT: Step 4 Implement — branch/worktree; /tdd-loop per scenario (small) or /implement-spec (big); tick tasks.md boxes; set stage: implement" ;;
  implement) echo "NEXT: Step 5 QA — dispatch @qa with $DIR; it writes qa-report.md; set stage: qa" ;;
  qa)        echo "NEXT: Step 6 Done — @verifier + /code-review (or /thermonuclear-review) + /ponytail-review, then /ship-it (PR to dev, never main); set stage: done" ;;
  done)      echo "NEXT: Step 7 Measure — after deploy + N days, run /measure $DIR, then openspec archive $NAME; set stage: measure" ;;
  measure)   echo "NEXT: Close — learnings written, new edge scenarios added, change archived (openspec archive $NAME), changelog entry; set stage: closed" ;;
  closed)    echo "NEXT: nothing. This change is closed." ;;
  *)         echo "NEXT: index.md has no known 'stage:'. Set one of: intent spec ready implement qa done measure closed" ;;
esac
echo; echo "Files:"
SPECS="$(find "$DIR/specs" -name spec.md 2>/dev/null)"
[ -z "$SPECS" ] && [ -f "$DIR/spec.md" ] && SPECS="$DIR/spec.md"   # old docs/changes layout
for f in "$DIR/proposal.md" "$DIR/research.md" $SPECS "$DIR/design.md" "$DIR/tasks.md" "$DIR/qa-report.md"; do
  rel="${f#$DIR/}"
  if [ -f "$f" ]; then n="$(grep -c '{{' "$f")"; echo "  $rel  (placeholders left: $n)"; else echo "  $rel  MISSING"; fi
done
