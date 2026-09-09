#!/usr/bin/env bash
# HUD — a small dashboard like Keolo's `av` screen, for one change folder.
# Shows: workspace / branch / worktree, the lifecycle meter, next action,
# scenarios, tickets table, and keys that launch Claude Code with a skill.
#
# usage: hud.sh [docs/changes/<ID>-<slug>] [--once]
#   no folder  -> picks the most recently changed folder under docs/changes/
#   --once     -> render one frame and exit (for tests)
# Run it in a Herdr/tmux pane next to your `claude` pane.
set -uo pipefail

# resolve the real file even when called through a symlink (e.g. /opt/homebrew/bin/hud)
SELF="${BASH_SOURCE[0]}"; while [ -L "$SELF" ]; do T="$(readlink "$SELF")"; case "$T" in /*) SELF="$T" ;; *) SELF="$(dirname "$SELF")/$T" ;; esac; done
S="$(cd "$(dirname "$SELF")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ONCE=0; DIR=""
for a in "$@"; do case "$a" in --once) ONCE=1 ;; *) DIR="$a" ;; esac; done

# colors (fall back to plain if not a tty)
if [ -t 1 ]; then
  B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'
  MAG=$'\033[35m'; CYN=$'\033[36m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLU=$'\033[34m'; RED=$'\033[31m'; INV=$'\033[7m'
else B=""; D=""; R=""; MAG=""; CYN=""; GRN=""; YEL=""; BLU=""; RED=""; INV=""; fi

pick_folder() {
  local latest
  latest="$(ls -td "$ROOT"/docs/changes/*/ 2>/dev/null | head -1)"
  [ -n "$latest" ] && printf '%s' "${latest%/}"
}
[ -z "$DIR" ] && DIR="$(pick_folder)"
case "$DIR" in /*) ;; "") ;; *) DIR="$ROOT/$DIR" ;; esac

stage_of() { grep -m1 '^stage:' "$1/index.md" 2>/dev/null | sed 's/stage: *//'; }

meter() {
  local cur="$1" i=1 out="" names="intent spec ready implement qa done measure"
  local labels="1.Intent 2.Spec&Design 3.Ready(DoR) 4.Implement(TDD) 5.QA 6.Done&Ship 7.Measure"
  set -- $labels
  for n in $names; do
    if [ "$n" = "$cur" ]; then out="$out ${INV}${BLU} $1 ${R}"; else out="$out ${D}○ $1${R}"; fi
    [ "$i" -lt 7 ] && out="$out ${D}→${R}"
    i=$((i+1)); shift
  done
  [ "$cur" = "closed" ] && out="$out ${GRN}✓ closed${R}"
  printf '%s\n' "$out"
}

LINE="$(i=0; while [ $i -lt 78 ]; do printf '─'; i=$((i+1)); done)"

short_path() { # ~ for home, else last 40 chars
  local p="$1"
  case "$p" in "$HOME"*) printf '~%s' "${p#$HOME}" ;; *) [ ${#p} -gt 40 ] && printf '…%s' "${p: -40}" || printf '%s' "$p" ;; esac
}

render() {
  clear 2>/dev/null || printf '\033c'
  local branch wt name stage next ready="" happy=0 edge=0 req=0
  branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || echo '-')"
  wt="$(short_path "$ROOT")"; name="$(basename "$ROOT")"
  printf '%s┌%s┐%s\n' "$BLU" "$LINE" "$R"
  printf '%s│%s %sWORKSPACE:%s %-18s %s│%s %sBRANCH:%s %-14s %s│%s %sWORKTREE:%s %s\n' "$BLU" "$R" "$CYN" "$R" "$name" "$D" "$R" "$CYN" "$R" "$branch" "$D" "$R" "$CYN" "$R" "$wt"
  printf '%s└%s┘%s\n\n' "$BLU" "$LINE" "$R"

  printf '%s%sLIFECYCLE PROGRESS METER%s\n' "$B" "$MAG" "$R"
  if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
    printf '  %s(no change folder under docs/changes/ — press [n] to start one)%s\n\n' "$D" "$R"
    stage="none"
  else
    stage="$(stage_of "$DIR")"; [ -z "$stage" ] && stage="?"
    meter "$stage"; echo
    printf '  %sChange:%s %s\n' "$GRN" "$R" "$(basename "$DIR")"
    printf '  %sCurrent stage:%s %s\n' "$GRN" "$R" "$stage"
    next="$(cd "$ROOT" && bash "$S/next-step.sh" "${DIR#$ROOT/}" 2>/dev/null | grep '^NEXT:' | sed 's/^NEXT: *//')"
    printf '  %sNext action:%s %s\n' "$GRN" "$R" "${next:-?}"
    if [ -f "$DIR/spec.md" ]; then
      req="$(grep -c '^### Requirement:' "$DIR/spec.md")"
      happy="$(grep -ci '^#### Scenario:.*happy' "$DIR/spec.md")"
      edge="$(grep -ci '^#### Scenario:.*edge' "$DIR/spec.md")"
      printf '  %sSpec:%s %s requirement(s), %s happy, %s edge scenario(s)\n' "$GRN" "$R" "$req" "$happy" "$edge"
    fi
    case "$stage" in spec|ready|implement|qa|done)
      if bash "$S/ready-check.sh" "$DIR" >/dev/null 2>&1; then ready="${GRN}gate: READY ✓${R}"; else ready="${YEL}gate: not ready — press [g]${R}"; fi
      printf '  %s\n' "$ready" ;;
    esac
    echo
    printf '%s%sEXECUTION TICKETS%s\n' "$B" "$GRN" "$R"
    if [ -f "$DIR/tickets.md" ] && grep -Eq '^\| T[0-9]+ ' "$DIR/tickets.md"; then
      printf '  %s%-4s %-38s %-10s %-10s %s%s\n' "$D" "id" "title" "blocked" "tracker" "status" "$R"
      grep -E '^\| T[0-9]+ ' "$DIR/tickets.md" | while IFS='|' read -r _ id title blocked scen tracker status _; do
        id="$(echo "$id" | xargs)"; title="$(echo "$title" | xargs | cut -c1-38)"; blocked="$(echo "$blocked" | xargs)"
        tracker="$(echo "$tracker" | xargs)"; status="$(echo "$status" | xargs)"
        col="$D"; case "$status" in done) col="$GRN" ;; doing|in-progress|wip) col="$YEL" ;; blocked) col="$RED" ;; esac
        printf '  %-4s %-38s %-10s %-10s %s%s%s\n' "$id" "$title" "$blocked" "$tracker" "$col" "$status" "$R"
      done
    else
      printf '  %s(no tickets discovered in tickets.md)%s\n' "$D" "$R"
    fi
  fi
  echo
  printf '%s[n]%s next action  %s[g]%s gate check  %s[s]%s run skill  %s[c]%s change folder  %s[r]%s refresh  %s[q]%s quit\n' \
    "$BLU" "$R" "$BLU" "$R" "$BLU" "$R" "$BLU" "$R" "$BLU" "$R" "$BLU" "$R"
  [ -n "${LAST:-}" ] && printf '%s● %s%s\n' "$GRN" "$LAST" "$R"
}

run_claude() { # $1 = prompt
  printf '\n%s▶ claude %s%s\n\n' "$CYN" "$1" "$R"
  ( cd "$ROOT" && claude "$1" )
  LAST="Action finished [$1]"
}

LAST=""
while :; do
  render
  [ "$ONCE" = 1 ] && exit 0
  IFS= read -r -s -n1 key
  case "$key" in
    n)
      if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
        printf '\nTicket id (e.g. MMV-123 or 42): '; read -r tid
        run_claude "/ticket $tid"; DIR="$(pick_folder)"
      else
        run_claude "/ticket ${DIR#$ROOT/}"
      fi ;;
    g)
      if [ -n "$DIR" ] && [ -d "$DIR" ]; then
        echo; bash "$S/ready-check.sh" "$DIR"; LAST="Gate check run"
        printf '\n%s(press any key)%s' "$D" "$R"; IFS= read -r -s -n1 _
      fi ;;
    s)
      printf '\nSkill: 1) ticket  2) qa  3) measure  4) tdd-loop  5) ship-it  6) triage-bug  7) grill-me  8) wayfinder  > '
      read -r n
      case "$n" in
        1) sk="/ticket ${DIR#$ROOT/}" ;; 2) sk="/qa ${DIR#$ROOT/}" ;; 3) sk="/measure ${DIR#$ROOT/}" ;;
        4) sk="/tdd-loop" ;; 5) sk="/ship-it" ;; 6) sk="/triage-bug" ;; 7) sk="/grill-me" ;; 8) sk="/wayfinder" ;; *) sk="" ;;
      esac
      [ -n "$sk" ] && run_claude "$sk" ;;
    c)
      echo; i=1; for d in "$ROOT"/docs/changes/*/; do [ -d "$d" ] || continue; printf '  %d) %s\n' "$i" "$(basename "$d")"; i=$((i+1)); done
      printf '> '; read -r n; j=1
      for d in "$ROOT"/docs/changes/*/; do [ -d "$d" ] || continue; [ "$j" = "$n" ] && DIR="${d%/}"; j=$((j+1)); done ;;
    r) LAST="Refreshed" ;;
    q) clear; exit 0 ;;
  esac
done
