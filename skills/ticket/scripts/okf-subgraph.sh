#!/usr/bin/env bash
# Print one doc plus the local markdown files it links to, up to a depth.
# This is the "sub-graph query": read a small linked set, not all of docs/.
# usage: okf-subgraph.sh <file.md> [depth=1] [--list]
# Works on macOS bash 3 (no associative arrays).
set -uo pipefail
START="${1:?markdown file}"; DEPTH="${2:-1}"; MODE="${3:-print}"
SEEN="$(mktemp)"; trap 'rm -f "$SEEN"' EXIT
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

visit() {
  local f="$1" d="$2" base l p
  [ -f "$f" ] || return 0
  f="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"
  grep -qxF "$f" "$SEEN" && return 0
  echo "$f" >> "$SEEN"
  if [ "$MODE" = "--list" ]; then echo "$f"; else echo; echo "===== $f ====="; cat "$f"; fi
  [ "$d" -ge "$DEPTH" ] && return 0
  base="$(dirname "$f")"
  grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//' | while IFS= read -r l; do
    [ -z "$l" ] && continue
    case "$l" in http*|mailto*|\#*) continue ;; esac
    l="${l%%#*}"
    case "$l" in /*) p="$ROOT$l" ;; *) p="$base/$l" ;; esac
    case "$p" in *.md) visit "$p" $((d+1)) ;; esac
  done
}
visit "$START" 0
