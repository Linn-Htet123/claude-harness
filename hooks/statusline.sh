#!/usr/bin/env bash
# Status line: model | context used % | git branch | cost.
# Claude passes session JSON on stdin.
set -uo pipefail
IN="$(cat 2>/dev/null || true)"
J() { printf '%s' "$IN" | /usr/bin/jq -r "$1 // empty" 2>/dev/null; }
MODEL="$(J '.model.display_name')"
PCT="$(J '.context_window.used_percentage')"
DIR="$(J '.workspace.current_dir')"; [ -z "$DIR" ] && DIR="$(J '.cwd')"
COST="$(J '.cost.total_cost_usd')"
BRANCH=""
if [ -n "$DIR" ] && [ -d "$DIR" ]; then
  BRANCH="$(git -C "$DIR" branch --show-current 2>/dev/null || true)"
fi
BAR=""
if [ -n "$PCT" ]; then
  P=${PCT%.*}
  FILLED=$(( P / 10 )); EMPTY=$(( 10 - FILLED ))
  BAR="$(printf '%*s' "$FILLED" '' | tr ' ' '#')$(printf '%*s' "$EMPTY" '' | tr ' ' '.')"
  WARN=""; [ "$P" -ge 40 ] && WARN=" (compact soon)"
  CTX="ctx ${P}% [${BAR}]${WARN}"
else
  CTX="ctx ?"
fi
OUT="${MODEL:-claude} | ${CTX}"
[ -n "$BRANCH" ] && OUT="$OUT | $BRANCH"
[ -n "$COST" ] && OUT="$OUT | \$$(printf '%.2f' "$COST" 2>/dev/null || echo "$COST")"
printf '%s\n' "$OUT"
