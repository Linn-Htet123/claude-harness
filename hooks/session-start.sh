#!/usr/bin/env bash
# SessionStart hook: if this repo is not set up for the harness, tell Claude
# in one line so it can offer init.sh + /onboard-repo. Prints nothing otherwise
# (a hook that prints nothing costs zero context).
set -uo pipefail
IN="$(cat 2>/dev/null || true)"
CWD="$(printf '%s' "$IN" | /usr/bin/jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$CWD" ] && CWD="$PWD"
ROOT="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$ROOT" ] && exit 0                       # not a git repo: stay silent
[ "$ROOT" = "$HOME" ] && exit 0
[ -f "$ROOT/install.sh" ] && [ -d "$ROOT/skills" ] && exit 0   # the harness repo itself
[ -f "$ROOT/.no-harness" ] && exit 0                              # opt-out marker for any repo
MISSING=""
[ -f "$ROOT/CLAUDE.md" ]              || MISSING="$MISSING CLAUDE.md"
[ -d "$ROOT/openspec" ] || [ -d "$ROOT/docs/changes" ] || MISSING="$MISSING openspec/"
[ -z "$MISSING" ] && exit 0
echo "Harness note: this repo ($(basename "$ROOT")) is missing:$MISSING. Offer Larry once, in one line: run \`~/GITHUB/claude-harness/project-packs/init.sh $ROOT\` then \`/onboard-repo\`. If he says no, do not mention it again this session."
exit 0
