#!/usr/bin/env bash
# Create docs/changes/<ID>-<slug>/ from the templates.
# usage: new-change.sh <ID> <slug> [title] [linear-url]
# example: new-change.sh MMV-278 evening-ritual "Evening 5-turn ritual" https://linear.app/manifest-movies/issue/MMV-278
# example: new-change.sh 42 login-form "Login form" https://github.com/me/repo/issues/42
set -euo pipefail
ID="${1:?ID like MMV-278}"; SLUG="${2:?slug like evening-ritual}"
TITLE="${3:-$SLUG}"; URL="${4:-$ID}"   # 4th arg = ticket URL (Linear / GitHub / Jira); defaults to the id
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DIR="$ROOT/docs/changes/$ID-$SLUG"
TPL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../templates" && pwd)"
DATE="$(date +%Y-%m-%d)"
if [ -e "$DIR" ]; then echo "exists: $DIR"; exit 0; fi
mkdir -p "$DIR"
for f in "$TPL"/*.md; do
  sed -e "s|{{ID}}|$ID|g" -e "s|{{TITLE}}|$TITLE|g" -e "s|{{LINEAR_URL}}|$URL|g" -e "s|{{DATE}}|$DATE|g" \
    "$f" > "$DIR/$(basename "$f")"
done
echo "created: $DIR"; ls "$DIR"
