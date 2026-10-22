#!/usr/bin/env bash
# Create the OpenSpec change openspec/changes/<id>-<slug>/ and fill it from the templates.
# usage: new-change.sh <ID> <slug> [title] [ticket-url] [capability]
# example: new-change.sh MMV-278 evening-ritual "Evening 5-turn ritual" https://linear.app/manifest-movies/issue/MMV-278
# example: new-change.sh 42 login-form "Login form" https://github.com/me/repo/issues/42 user-auth
# capability = the spec folder under specs/ (kebab-case). Defaults to the slug.
set -euo pipefail
ID="${1:?ID like MMV-278}"; SLUG="${2:?slug like evening-ritual}"
TITLE="${3:-$SLUG}"; URL="${4:-$ID}"   # 4th arg = ticket URL (Linear / GitHub / Jira); defaults to the id
CAP="${5:-$SLUG}"
NAME="$(echo "$ID-$SLUG" | tr '[:upper:]' '[:lower:]')"   # OpenSpec needs lowercase kebab-case
[[ $NAME =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "bad id/slug: '$NAME' (use letters, digits, dashes)"; exit 1; }
[[ $CAP =~ ^[a-z0-9][a-z0-9-]*(/[a-z0-9][a-z0-9-]*)*$ ]] || { echo "bad capability: '$CAP' (kebab-case, like user-auth or identity/user-auth)"; exit 1; }
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DIR="$ROOT/openspec/changes/$NAME"
TPL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../templates" && pwd)"
DATE="$(date +%Y-%m-%d)"
if [ -e "$DIR" ]; then echo "exists: $DIR"; exit 0; fi
if [ ! -d "$ROOT/openspec" ]; then
  echo "This repo has no openspec/ folder. Ask Larry, then run once: (cd $ROOT && openspec init --tools none)"; exit 1
fi
(cd "$ROOT" && openspec new change "$NAME" >/dev/null)
mkdir -p "$DIR/specs/$CAP"
esc() { printf '%s' "$1" | tr '\n' ' ' | sed -e 's/[\\|&]/\\&/g'; }   # safe as sed replacement text
fill() { sed -e "s|{{ID}}|$(esc "$ID")|g" -e "s|{{TITLE}}|$(esc "$TITLE")|g" -e "s|{{LINEAR_URL}}|$(esc "$URL")|g" \
             -e "s|{{DATE}}|$DATE|g" -e "s|{{CAPABILITY}}|$CAP|g" "$1" > "$2"; }
for f in "$TPL"/*.md; do
  case "$(basename "$f")" in
    spec.md) fill "$f" "$DIR/specs/$CAP/spec.md" ;;
    *)       fill "$f" "$DIR/$(basename "$f")" ;;
  esac
done
echo "created: $DIR"; (cd "$DIR" && find . -type f -name '*.md' | sort)
