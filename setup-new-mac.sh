#!/usr/bin/env bash
# setup-new-mac.sh — install Larry's whole harness on a fresh Mac in one go.
#
#   git clone https://github.com/Linn-Htet123/claude-harness.git ~/GITHUB/claude-harness
#   cd ~/GITHUB/claude-harness && ./setup-new-mac.sh
#
# Idempotent: safe to run again. Never overwrites a file you already have
# (it backs up ~/.claude/settings.json before merging hooks into it).
# Needs: Homebrew + Claude Code already installed and logged in.
set -uo pipefail
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
skip() { printf '  \033[2m- %s\033[0m\n' "$1"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$1"; }

echo "==> 1. tools (brew)"
command -v brew >/dev/null || { echo "Homebrew missing: https://brew.sh  — install it, then re-run."; exit 1; }
for pkg in jq gh herdr node; do
  if command -v "$pkg" >/dev/null; then skip "$pkg already installed"; else brew install "$pkg" >/dev/null 2>&1 && ok "installed $pkg" || warn "could not install $pkg"; fi
done
command -v claude >/dev/null || warn "claude CLI not found. Install Claude Code first: https://code.claude.com"
# OpenSpec (the /ticket spec files) and Codex (the other side of /duel)
if command -v openspec >/dev/null; then skip "openspec already installed"; else npm i -g @fission-ai/openspec >/dev/null 2>&1 && ok "installed openspec" || warn "could not install openspec (needs node: brew install node)"; fi
if command -v codex >/dev/null; then skip "codex already installed"; else brew install --cask codex >/dev/null 2>&1 && ok "installed codex (run: codex login)" || warn "could not install codex"; fi

echo "==> 2. skills / agents / commands -> ~/.claude (symlinks)"
"$H/install.sh" >/dev/null && ok "install.sh done"

echo "==> 3. commands on PATH: hud, harness-init, harness-up"
BIN="/opt/homebrew/bin"; [ -w "$BIN" ] || { BIN="$HOME/.local/bin"; mkdir -p "$BIN"; warn "using $BIN — add it to PATH if needed"; }
ln -sfn "$H/skills/ticket/scripts/hud.sh" "$BIN/hud"
ln -sfn "$H/project-packs/init.sh"        "$BIN/harness-init"
ln -sfn "$H/project-packs/up.sh"          "$BIN/harness-up"
chmod +x "$H"/skills/ticket/scripts/*.sh "$H"/project-packs/*.sh "$H"/hooks/*.sh 2>/dev/null
ok "hud, harness-init, harness-up -> $BIN"

echo "==> 4. hooks + statusline -> ~/.claude/settings.json"
mkdir -p "$HOME/.claude/backups"
SJ="$HOME/.claude/settings.json"
[ -f "$SJ" ] && cp "$SJ" "$HOME/.claude/backups/settings.json.$(date +%Y%m%d-%H%M%S).bak"
python3 - "$SJ" "$H/templates/settings-hooks.json" <<'EOF'
import json,sys,os
sj,tpl=sys.argv[1],sys.argv[2]
d=json.load(open(sj)) if os.path.exists(sj) else {}
t=json.load(open(tpl))
hooks=d.setdefault('hooks',{})
added=0
for ev,groups in t.get('hooks',{}).items():
    cur=hooks.setdefault(ev,[])
    have={h.get('command') for g in cur for h in g.get('hooks',[])}
    for g in groups:
        if not all(h.get('command') in have for h in g.get('hooks',[])):
            cur.append(g); added+=1
if 'statusLine' not in d and t.get('statusLine'): d['statusLine']=t['statusLine']; added+=1
ep=d.setdefault('enabledPlugins',{})
for p in ("superpowers@claude-plugins-official","mattpocock-skills@claude-plugins-official"):
    ep.setdefault(p,True)
json.dump(d,open(sj,'w'),indent=2)
print(f"  ✓ settings.json merged ({added} new entries)")
EOF

echo "==> 5. global CLAUDE.md"
if [ -s "$HOME/.claude/CLAUDE.md" ]; then skip "~/.claude/CLAUDE.md exists — not touched (compare with templates/global-CLAUDE.md)"; else cp "$H/templates/global-CLAUDE.md" "$HOME/.claude/CLAUDE.md"; ok "~/.claude/CLAUDE.md installed"; fi
mkdir -p "$HOME/.claude/shared/journal"
for f in agent-changelog.md journal/TEMPLATE.md; do
  if [ -e "$HOME/.claude/shared/$f" ]; then skip "shared/$f exists"; else cp "$H/templates/shared/$f" "$HOME/.claude/shared/$f"; ok "shared/$f installed"; fi
done

echo "==> 5b. Claude memory notes (what past sessions learned)"
MEMDIR="$HOME/.claude/projects/-Users-tharlinhtet-my/memory"
mkdir -p "$MEMDIR"
for f in "$H"/memory/claude-auto-memory/*.md; do
  [ -f "$f" ] || continue
  if [ -e "$MEMDIR/$(basename "$f")" ]; then skip "memory $(basename "$f") exists"; else cp "$f" "$MEMDIR/"; ok "memory $(basename "$f")"; fi
done

echo "==> 6. Herdr"
if command -v herdr >/dev/null; then
  mkdir -p "$HOME/.config/herdr"
  if [ -f "$HOME/.config/herdr/config.toml" ]; then skip "herdr config exists"; else cp "$H/templates/herdr-config.toml" "$HOME/.config/herdr/config.toml"; ok "herdr config installed"; fi
  herdr integration install claude >/dev/null 2>&1 && ok "herdr claude integration" || warn "herdr integration install claude failed (run it by hand)"
fi

echo "==> 7. Playwright MCP (browser checks for @qa)"
if command -v claude >/dev/null; then
  if claude mcp get playwright >/dev/null 2>&1; then skip "playwright MCP exists"; else claude mcp add --scope user playwright -- npx -y @playwright/mcp@latest --headless --isolated >/dev/null 2>&1 && ok "playwright MCP added" || warn "could not add playwright MCP"; fi
fi

echo "==> 8. check"
bash "$H/hooks/test-guardrails.sh" | tail -1
echo
echo "Done. Last steps by hand (inside Claude Code, once):"
echo "  /plugin install superpowers        /plugin install mattpocock-skills"
echo "  /mcp   -> log in to Linear, GitHub, Sentry, Railway, PostHog, Neon as needed"
echo "Then:  cd <a repo> && herdr   ->  ctrl+b shift+n  ->  claude | hud"
echo "Manual: $H/docs/USER-MANUAL.md"
