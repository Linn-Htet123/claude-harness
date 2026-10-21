#!/usr/bin/env bash
# Install the harness into one or more Claude Code config directories.
#
#   ./install.sh                      -> installs into $CLAUDE_CONFIG_DIR, or ~/.claude
#   ./install.sh ~/.claude-manifest ~/.claude-personal
#   ./install.sh --uninstall ~/.claude-manifest
#   ./install.sh --dry-run ~/.claude
#
# It creates SYMLINKS. So `git pull` in this repo updates every install at once.
# It never overwrites a real file that you wrote yourself - it skips and warns.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="install"
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --dry-run)   MODE="dryrun" ;;
    -h|--help)   sed -n '2,12p' "$0"; exit 0 ;;
    *)           TARGETS+=("${arg/#\~/$HOME}") ;;
  esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=("${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
fi

link_one() {
  local src="$1" dest="$2"
  if [ "$MODE" = "dryrun" ]; then
    echo "  would link  $(basename "$dest")"
    return
  fi
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    echo "  SKIP (real file already there, not touching it): $dest"
    return
  fi
  ln -sfn "$src" "$dest"
  echo "  linked      $(basename "$dest")"
}

unlink_one() {
  local dest="$1"
  if [ -L "$dest" ]; then
    rm "$dest"; echo "  removed     $(basename "$dest")"
  fi
}

for T in "${TARGETS[@]}"; do
  echo ""
  echo "==> $T"

  if [ "$MODE" != "dryrun" ]; then
    mkdir -p "$T/agents" "$T/skills" "$T/commands"
  fi

  # agents/*.md and commands/*.md  -> one symlink per file
  for kind in agents commands; do
    shopt -s nullglob
    for f in "$SRC/$kind"/*.md; do
      base="$(basename "$f")"
      if [ "$MODE" = "uninstall" ]; then
        unlink_one "$T/$kind/$base"
      else
        link_one "$f" "$T/$kind/$base"
      fi
    done
    shopt -u nullglob
  done

  # commands/<group>/ and skills/<name>/  -> one symlink per directory
  shopt -s nullglob
  for d in "$SRC/commands"/*/; do
    base="$(basename "$d")"
    if [ "$MODE" = "uninstall" ]; then
      unlink_one "$T/commands/$base"
    else
      link_one "${d%/}" "$T/commands/$base"
    fi
  done
  for d in "$SRC/skills"/*/; do
    base="$(basename "$d")"
    if [ "$MODE" = "uninstall" ]; then
      unlink_one "$T/skills/$base"
    else
      link_one "${d%/}" "$T/skills/$base"
    fi
  done
  shopt -u nullglob
done

echo ""
case "$MODE" in
  install)   echo "Done. Open Claude Code and type /  - the new skills and agents are there." ;;
  uninstall) echo "Done. Symlinks removed. Your own files were untouched." ;;
  dryrun)    echo "Dry run only. Nothing was changed." ;;
esac
