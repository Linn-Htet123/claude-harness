#!/usr/bin/env bash
# up.sh — open N projects in Herdr at once: one workspace per repo,
# split left/right, `claude` on the left, `hud` on the right.
#
#   harness-up ~/Workspace/a ~/Workspace/b ~/Workspace/c
#   harness-up --no-claude ~/Workspace/a      # only make the workspace + hud, start claude yourself
#
# Needs the Herdr server running (it is, whenever `herdr` is open or `brew services start herdr`).
# Idempotent: a repo that already has a workspace is skipped.
set -uo pipefail
START_CLAUDE=1; REPOS=()
for a in "$@"; do case "$a" in --no-claude) START_CLAUDE=0 ;; *) REPOS+=("${a/#\~/$HOME}") ;; esac; done
[ ${#REPOS[@]} -gt 0 ] || { sed -n '2,8p' "$0"; exit 1; }
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

if ! herdr workspace list >/dev/null 2>&1; then
  echo "Herdr server is not running. Open a terminal and run: herdr   (then run this again)"; exit 1
fi

for REPO in "${REPOS[@]}"; do
  REPO="$(cd "$REPO" 2>/dev/null && pwd)" || { echo "skip: no such folder $REPO"; continue; }
  NAME="$(basename "$REPO")"
  echo "==> $NAME  ($REPO)"
  [ -s "$REPO/CLAUDE.md" ] || echo "   note: no CLAUDE.md here. Run: harness-init $REPO   then /onboard-repo"

  EXISTING="$(herdr workspace list 2>/dev/null | jq -r --arg l "$NAME" '.result.workspaces[] | select(.label==$l) | .workspace_id' | head -1)"
  if [ -n "$EXISTING" ]; then
    echo "   workspace $EXISTING already exists — skipping (use ctrl+b w to go there)"; continue
  fi

  OUT="$(herdr workspace create --cwd "$REPO" --label "$NAME" --no-focus 2>&1)"
  LEFT="$(printf '%s' "$OUT" | jq -r '.result.root_pane.pane_id // empty')"
  WS="$(printf '%s' "$OUT" | jq -r '.result.workspace.workspace_id // empty')"
  [ -n "$LEFT" ] || { echo "   could not create workspace: $OUT"; continue; }
  echo "   workspace $WS created (pane $LEFT)"

  SPLIT="$(herdr pane split --pane "$LEFT" --direction right --ratio 0.62 --cwd "$REPO" 2>&1)"
  RIGHT="$(printf '%s' "$SPLIT" | jq -r '.result.pane.pane_id // .result.new_pane.pane_id // .result.pane_id // empty')"
  if [ -z "$RIGHT" ]; then
    RIGHT="$(herdr pane list | jq -r --arg w "$WS" --arg l "$LEFT" '.result.panes[] | select(.workspace_id==$w and .pane_id!=$l) | .pane_id' | head -1)"
  fi
  if [ -n "$RIGHT" ]; then
    herdr pane run "$RIGHT" hud >/dev/null 2>&1 && echo "   right pane $RIGHT: hud"
  else
    echo "   could not split; open Herdr and press ctrl+b v, then type hud"
  fi
  if [ "$START_CLAUDE" = 1 ]; then
    herdr pane run "$LEFT" claude >/dev/null 2>&1 && echo "   left pane  $LEFT: claude"
  else
    echo "   left pane  $LEFT: shell (type claude yourself)"
  fi
done
echo
echo "Open Herdr (type: herdr) and press ctrl+b w to switch between workspaces."
