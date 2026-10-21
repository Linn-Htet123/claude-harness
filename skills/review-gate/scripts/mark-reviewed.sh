#!/usr/bin/env bash
# Save the "reviewed" mark for the current commit. The guardrails hook lets
# `gh pr create` through only when HEAD has this mark.
# usage: mark-reviewed.sh "<one-line verdict>"
set -euo pipefail
GD="$(git rev-parse --git-common-dir)"; SHA="$(git rev-parse HEAD)"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Uncommitted changes. Commit first, then run the review again."; exit 1; }
mkdir -p "$GD/review-gate"
printf '%s\n%s\n' "$(date '+%Y-%m-%d %H:%M')" "${1:-passed}" > "$GD/review-gate/$SHA"
echo "reviewed: $(git rev-parse --short HEAD) on $(git branch --show-current)"
