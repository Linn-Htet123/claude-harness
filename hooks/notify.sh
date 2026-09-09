#!/usr/bin/env bash
# macOS banner + sound when Claude needs you.
# Wired to the Notification hook in ~/.claude/settings.json.
# stdin = hook JSON (has .cwd). $1 = short message.
set -uo pipefail
INPUT="$(cat 2>/dev/null || true)"
PROJ="$(printf '%s' "$INPUT" | /usr/bin/jq -r '.cwd // empty' 2>/dev/null | xargs -I{} basename {} 2>/dev/null)"
MSG="${1:-needs you}"
TITLE="Claude Code${PROJ:+: $PROJ}"
/usr/bin/osascript -e "display notification \"Claude $MSG\" with title \"$TITLE\" sound name \"Glass\"" >/dev/null 2>&1 \
  || /usr/bin/afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1 || true
exit 0
