#!/usr/bin/env bash
# init.sh — set up ANY repo (new or existing) for the harness in one command.
#
#   ~/GITHUB/claude-harness/project-packs/init.sh <repo-path> [--tracker github|linear]
#
# Idempotent: never overwrites a file that exists. Safe to re-run.
# What it does:
#   1. git init if needed
#   2. CLAUDE.md from the template (you then run /onboard-repo to fill it)
#   3. .claude/rules/*.md + .claude/launch.json   (local rules, from _template)
#   4. .mcp.json (Playwright), .worktreeinclude
#   5. docs/changes/README.md, docs/agents/issue-tracker.md, docs/decisions/
#   6. .gitignore lines for .claude/settings.local.json and .claude/worktrees/
#   7. prints the next steps (onboard-repo, herdr workspace)
set -euo pipefail

REPO="${1:?usage: init.sh <repo-path> [--tracker github|linear]}"
TRACKER="github"
shift || true
while [ $# -gt 0 ]; do case "$1" in --tracker) TRACKER="$2"; shift 2 ;; *) shift ;; esac; done

# resolve the real file even when called through a symlink (e.g. /opt/homebrew/bin/harness-init)
SELF="${BASH_SOURCE[0]}"; while [ -L "$SELF" ]; do T="$(readlink "$SELF")"; case "$T" in /*) SELF="$T" ;; *) SELF="$(dirname "$SELF")/$T" ;; esac; done
H="$(cd "$(dirname "$SELF")/.." && pwd)"
T="$H/project-packs/_template"
REPO="${REPO/#\~/$HOME}"
mkdir -p "$REPO"; REPO="$(cd "$REPO" && pwd)"
NAME="$(basename "$REPO")"

add() { # src dest
  if [ -e "$2" ]; then echo "  keep   ${2#$REPO/}"; else mkdir -p "$(dirname "$2")"; cp "$1" "$2"; echo "  added  ${2#$REPO/}"; fi
}

echo "==> $REPO"
if [ ! -d "$REPO/.git" ]; then git -C "$REPO" init -q && echo "  git init"; fi

# 2. CLAUDE.md
if [ ! -s "$REPO/CLAUDE.md" ]; then   # missing OR empty
  sed "s/<PROJECT NAME>/$NAME/" "$H/templates/CLAUDE.md.template" > "$REPO/CLAUDE.md"
  echo "  added  CLAUDE.md (template — run /onboard-repo to fill it)"
else echo "  keep   CLAUDE.md"; fi

# 3. local rules + launch
for f in "$T"/.claude/rules/*.md; do add "$f" "$REPO/.claude/rules/$(basename "$f")"; done
add "$T/.claude/launch.json" "$REPO/.claude/launch.json"

# 4. tracked helpers
add "$T/.mcp.json" "$REPO/.mcp.json"
add "$T/.worktreeinclude" "$REPO/.worktreeinclude"

# 5. docs
add "$T/docs/changes/README.md" "$REPO/docs/changes/README.md"
add "$T/docs/agents/issue-tracker.md" "$REPO/docs/agents/issue-tracker.md"
mkdir -p "$REPO/docs/decisions"; [ -e "$REPO/docs/decisions/README.md" ] || {
  printf '# Decisions (ADRs)\n\nOne file per decision: `NNNN-short-title.md` with Context / Options / Decision / Consequences.\nWrite one when a choice is hard to undo. Use /domain-modeling.\n' > "$REPO/docs/decisions/README.md"; echo "  added  docs/decisions/README.md"; }
# tracker hint (only once)
IT="$REPO/docs/agents/issue-tracker.md"
if [ -f "$IT" ] && ! grep -q "init.sh: you chose" "$IT"; then
  sed -i '' "s/^Pick ONE and delete the others./Pick ONE and delete the others. (init.sh: you chose $(echo "$TRACKER" | tr a-z A-Z))/" "$IT" 2>/dev/null || true
fi

# 6. gitignore
GI="$REPO/.gitignore"; touch "$GI"
for line in ".claude/settings.local.json" ".claude/worktrees/" ".playwright-mcp/"; do
  grep -qxF "$line" "$GI" || { echo "$line" >> "$GI"; echo "  gitignore += $line"; }
done

echo
echo "Next steps:"
echo "  1. cd $REPO && claude      then type:  /onboard-repo     (fills CLAUDE.md from the real code)"
echo "  2. edit .claude/rules/*.md for this stack; delete the ones you do not need"
echo "  3. docs/agents/issue-tracker.md: keep the $TRACKER section, delete the other"
echo "  4. herdr:  ctrl+b shift+n  (new workspace)  ->  claude | hud"
echo "  5. first ticket:  /ticket <ID>"
