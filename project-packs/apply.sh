#!/usr/bin/env bash
# Copy the LOCAL parts of a project pack into a repo: .claude/rules/*.md and .claude/launch.json
# usage: apply.sh <repo-path> [pack=_template]
# It never overwrites a file that already exists.
set -euo pipefail
REPO="${1:?repo path}"; PACK="${2:-_template}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/$PACK" && pwd)"
[ -d "$REPO/.git" ] || { echo "not a git repo: $REPO"; exit 1; }
mkdir -p "$REPO/.claude/rules"
for f in "$SRC"/.claude/rules/*.md; do
  d="$REPO/.claude/rules/$(basename "$f")"
  if [ -e "$d" ]; then echo "  skip (exists) $d"; else cp "$f" "$d"; echo "  added $d"; fi
done
if [ -f "$SRC/.claude/launch.json" ] && [ ! -e "$REPO/.claude/launch.json" ]; then
  cp "$SRC/.claude/launch.json" "$REPO/.claude/launch.json"; echo "  added $REPO/.claude/launch.json (edit the port + command)"
fi
if git -C "$REPO" check-ignore -q .claude/rules/x.md 2>/dev/null; then
  echo "  note: .claude/ is gitignored here -> these files stay local (good)."
else
  echo "  note: .claude/ is NOT gitignored here -> these files would be committed. Review before you commit."
fi
echo "Next: edit the rules for this stack, then copy the tracked files (see project-packs/README.md)."
