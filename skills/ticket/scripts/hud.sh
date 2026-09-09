#!/usr/bin/env bash
# HUD v2 — dashboard for a Herdr/tmux pane next to `claude`.
#
#   hud [docs/changes/<ID>-<slug>] [--once]
#
# Panels: NOW (what is going on) · LIFECYCLE (the ticket loop) · SUGGESTED NEXT (ranked)
# Keys:   n = run suggestion 1   1-4 = run that suggestion   l = agent loops   s = find a skill
#         c = change folder   t = target (this pane / new Herdr pane)   r = refresh   q = quit
# Bash 3 compatible (macOS). Width-aware. Works outside Herdr too (runs Claude in the foreground).
set -uo pipefail

# ---------- locate real files (works through the /opt/homebrew/bin/hud symlink) ----------
SELF="${BASH_SOURCE[0]}"; while [ -L "$SELF" ]; do T="$(readlink "$SELF")"; case "$T" in /*) SELF="$T" ;; *) SELF="$(dirname "$SELF")/$T" ;; esac; done
S="$(cd "$(dirname "$SELF")" && pwd)"

ONCE=0; DIR=""; TARGET="here"
SKILLS_ONLY=""; for a in "$@"; do case "$a" in --once) ONCE=1 ;; --skills) SKILLS_ONLY="all" ;; *) if [ "$SKILLS_ONLY" = "all" ]; then SKILLS_ONLY="$a"; else DIR="$a"; fi ;; esac; done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
IS_GIT=0; git rev-parse --show-toplevel >/dev/null 2>&1 && IS_GIT=1
NAME="$(basename "$ROOT")"
IN_HERDR=0; [ -n "${HERDR_PANE_ID:-}" ] && IN_HERDR=1 && TARGET="pane"

# ---------- look ----------
if [ -t 1 ]; then
  B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'; INV=$'\033[7m'
  MAG=$'\033[35m'; CYN=$'\033[36m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLU=$'\033[34m'; RED=$'\033[31m'; WHT=$'\033[97m'
else B=""; D=""; R=""; INV=""; MAG=""; CYN=""; GRN=""; YEL=""; BLU=""; RED=""; WHT=""; fi
K() { printf '%s%s %s %s' "$INV" "$YEL" "$1" "$R"; }          # key label, high contrast
width() { local w=""; w="$(stty size </dev/tty 2>/dev/null | awk '{print $2}')"; [ -z "$w" ] || [ "$w" = 0 ] && w="$(tput cols 2>/dev/null || echo "${COLUMNS:-80}")"; [ "$w" -lt 40 ] && w=40; echo "$w"; }
hr()   { local w n; w="$(width)"; n=$((w-1)); printf '%s' "$D"; local i=0; while [ $i -lt $n ]; do printf '─'; i=$((i+1)); done; printf '%s\n' "$R"; }
trunc(){ local s="$1" n="$2"; [ ${#s} -gt "$n" ] && printf '%s…' "${s:0:$((n-1))}" || printf '%s' "$s"; }
short_path() { case "$1" in "$HOME"*) printf '~%s' "${1#$HOME}" ;; *) printf '%s' "$1" ;; esac; }
title() { printf '%s%s%s%s\n' "$B" "$1" "$2" "$R"; }

# ---------- state ----------
stage_of() { grep -m1 '^stage:' "$1/index.md" 2>/dev/null | sed 's/stage: *//'; }
pick_folder() { ls -td "$ROOT"/docs/changes/*/ 2>/dev/null | head -1 | sed 's|/$||'; }
[ -z "$DIR" ] && DIR="$(pick_folder)"
case "$DIR" in /*) ;; "") ;; *) DIR="$ROOT/$DIR" ;; esac
[ -n "$DIR" ] && [ ! -d "$DIR" ] && DIR=""

PR_LINE=""; PR_STATE=""; PR_CI=""
refresh_pr() {
  PR_LINE=""; PR_STATE=""; PR_CI=""
  [ "$IS_GIT" = 1 ] && command -v gh >/dev/null || return 0
  local j; j="$(cd "$ROOT" && gh pr view --json number,state,url,statusCheckRollup 2>/dev/null)" || return 0
  [ -n "$j" ] || return 0
  PR_STATE="$(printf '%s' "$j" | jq -r '.state // ""')"
  local num fail total
  num="$(printf '%s' "$j" | jq -r '.number // ""')"
  total="$(printf '%s' "$j" | jq -r '[.statusCheckRollup[]?] | length')"
  fail="$(printf '%s' "$j" | jq -r '[.statusCheckRollup[]? | select((.conclusion // .state // "") | test("FAIL|ERROR|CANCEL"))] | length')"
  if [ "$total" -gt 0 ] 2>/dev/null; then
    if [ "$fail" -gt 0 ]; then PR_CI="CI ✗ ($fail failing)"; else PR_CI="CI ✓"; fi
  fi
  PR_LINE="PR #$num $(echo "$PR_STATE" | tr A-Z a-z) $PR_CI"
}

gather() {
  BRANCH="-"; DIRTY=0; GLAST=""; TICKET_IN_BRANCH=""
  if [ "$IS_GIT" = 1 ]; then
    BRANCH="$(git -C "$ROOT" branch --show-current 2>/dev/null)"; [ -z "$BRANCH" ] && BRANCH="(detached)"
    DIRTY="$(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    GLAST="$(git -C "$ROOT" log -1 --format='%s (%cr)' 2>/dev/null | cut -c1-70)"; [ -z "$GLAST" ] && GLAST="(no commits yet)"
    TICKET_IN_BRANCH="$(printf '%s' "$BRANCH" | grep -oiE '(^|[^a-z])[a-z]{2,5}-[0-9]{1,4}([^0-9]|$)' | grep -oiE '[a-z]{2,5}-[0-9]{1,4}' | awk -F- '$2<1900 || $2>2100' | head -1 | tr a-z A-Z)"
  fi
  # all change folders: "folder|stage"
  CHANGES=""; N_CHANGES=0
  for d in "$ROOT"/docs/changes/*/; do
    [ -d "$d" ] || continue; [ -f "$d/index.md" ] || continue
    CHANGES="$CHANGES$(basename "$d")|$(stage_of "${d%/}")"$'\n'; N_CHANGES=$((N_CHANGES+1))
  done
  # spec facts for DIR
  STAGE=""; REQ=0; HAPPY=0; EDGE=0; EDGE_MISSING=""; T_DONE=0; T_ALL=0; GATE=""
  if [ -n "$DIR" ]; then
    STAGE="$(stage_of "$DIR")"; [ -z "$STAGE" ] && STAGE="?"
    if [ -f "$DIR/spec.md" ]; then
      REQ="$(grep -c '^### Requirement:' "$DIR/spec.md")"
      HAPPY="$(grep -ci '^#### Scenario:.*happy' "$DIR/spec.md")"
      EDGE="$(grep -ci '^#### Scenario:.*edge' "$DIR/spec.md")"
      if [ "$IS_GIT" = 1 ]; then
        for sid in $(grep -oiE '^#### Scenario: S[0-9]+ edge' "$DIR/spec.md" | grep -oE 'S[0-9]+'); do
          git -C "$ROOT" grep -qiE "$sid edge" -- ':!docs' 2>/dev/null || EDGE_MISSING="$EDGE_MISSING $sid"
        done
      fi
    fi
    if [ -f "$DIR/tickets.md" ]; then
      T_ALL="$(grep -Ec '^\| T[0-9]+ ' "$DIR/tickets.md")"
      T_DONE="$(grep -E '^\| T[0-9]+ ' "$DIR/tickets.md" | grep -ci '| *done *|$')"
    fi
    case "$STAGE" in spec|ready|implement|qa|done)
      if bash "$S/ready-check.sh" "$DIR" >/dev/null 2>&1; then GATE="${GRN}READY ✓${R}"; else GATE="${YEL}not ready (g)${R}"; fi ;;
    esac
  fi
  # agents in this Herdr workspace
  AGENTS=""
  if [ "$IN_HERDR" = 1 ] && command -v herdr >/dev/null; then
    AGENTS="$(herdr pane list 2>/dev/null | jq -r --arg w "$HERDR_WORKSPACE_ID" '[.result.panes[] | select(.workspace_id==$w and .agent!=null) | "\(.agent):\(.agent_status)"] | join("  ")' 2>/dev/null)"
  fi
  # stack hints
  STACK=""
  local pk; pk="$(find "$ROOT" -maxdepth 3 -name package.json -not -path '*/node_modules/*' 2>/dev/null | head -8 | xargs cat 2>/dev/null)"
  printf '%s' "$pk" | grep -q '"next"'    && STACK="$STACK next.js"
  printf '%s' "$pk" | grep -q 'playwright' && STACK="$STACK playwright"
  printf '%s' "$pk" | grep -q 'drizzle'    && STACK="$STACK drizzle"
  { [ -f "$ROOT/pyproject.toml" ] || [ -f "$ROOT/requirements.txt" ] || ls "$ROOT"/backend/*.py >/dev/null 2>&1; } && STACK="$STACK python"
  [ -f "$ROOT/go.mod" ] && STACK="$STACK go"
  STACK="${STACK# }"
}

# ---------- suggestions (ranked) ----------
SUG_N=0
add_sug() { SUG_N=$((SUG_N+1)); eval "SUG_L$SUG_N=\"\$1\""; eval "SUG_C$SUG_N=\"\$2\""; }
sug_l() { eval "printf '%s' \"\$SUG_L$1\""; }
sug_c() { eval "printf '%s' \"\$SUG_C$1\""; }
suggest() {
  SUG_N=0
  local rel="${DIR#$ROOT/}"
  if [ "$IS_GIT" = 0 ]; then
    add_sug "This folder is not a git repo. Make it one first." "shell:git init && harness-init $ROOT"
  fi
  if [ ! -s "$ROOT/CLAUDE.md" ]; then
    add_sug "No CLAUDE.md. Set the repo up, then let Claude learn it." "shell:harness-init $ROOT && claude '/onboard-repo'"
  fi
  if [ -n "$DIR" ]; then
    local next; next="$(cd "$ROOT" && bash "$S/next-step.sh" "$rel" 2>/dev/null | grep '^NEXT:' | sed 's/^NEXT: *//' | sed 's/ *—.*//' | xargs)"
    case "$STAGE" in
      done)    add_sug "Measure $(basename "$DIR"): check the hypotheses in PostHog" "claude:/measure $rel" ;;
      closed)  ;;
      *)       add_sug "Continue $(basename "$DIR") → ${next:-next step}" "claude:/ticket $rel" ;;
    esac
    [ -n "$EDGE_MISSING" ] && add_sug "Edge scenarios without a test:$EDGE_MISSING → run QA" "claude:/qa $rel"
  else
    if [ -n "$TICKET_IN_BRANCH" ]; then
      add_sug "Branch names ticket $TICKET_IN_BRANCH but there is no change folder → start the loop" "claude:/ticket $TICKET_IN_BRANCH"
    elif [ -s "$ROOT/CLAUDE.md" ]; then
      add_sug "Start a ticket (Intent → Spec → Ready → Implement → QA → Done)" "ask:/ticket"
    fi
  fi
  if [ "$DIRTY" -gt 0 ] 2>/dev/null; then
    case "$STAGE" in implement|qa|done|"") add_sug "$DIRTY uncommitted file(s) → review + open a PR (never merges)" "claude:/ship-it" ;; esac
  fi
  case "$PR_CI" in *✗*) add_sug "$PR_LINE → babysit it: fix red CI, answer reviews" "claude:/loop 10m Check the open PR for this branch. If CI is red, fix it. If there are review comments, answer or apply them. Otherwise say: quiet." ;; esac
  [ "$SUG_N" -lt 3 ] && [ "$IS_GIT" = 1 ] && add_sug "Daily update from git + PRs" "claude:/standup"
  [ "$SUG_N" -lt 4 ] && add_sug "Fuzzy idea? Get hard questions first" "claude:/grill-me"
}

# ---------- launching ----------
run_here_or_pane() { # $@ = command line to run in a shell
  if [ "$TARGET" = "pane" ] && [ "$IN_HERDR" = 1 ]; then
    local out pid
    out="$(herdr pane split --pane "$HERDR_PANE_ID" --direction down --ratio 0.5 --cwd "$ROOT" 2>/dev/null)"
    pid="$(printf '%s' "$out" | jq -r '.result.pane.pane_id // empty' 2>/dev/null)"
    if [ -n "$pid" ]; then herdr pane run "$pid" "$@" >/dev/null 2>&1; LAST="Started in pane $pid: $*"; return 0; fi
  fi
  printf '\n%s▶ %s%s\n\n' "$CYN" "$*" "$R"
  ( cd "$ROOT" && eval "$@" )
  LAST="Finished: $*"
}
run_claude() { # $1 = prompt text
  local p; p="$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
  run_here_or_pane "claude '$p'"
}
run_sug() {
  local c; c="$(sug_c "$1")"; [ -n "$c" ] || return 0
  case "$c" in
    claude:*) run_claude "${c#claude:}" ;;
    shell:*)  run_here_or_pane "${c#shell:}" ;;
    ask:*)    printf '\nTicket id (MMV-123, 42, ...): '; read -r tid; [ -n "$tid" ] && run_claude "${c#ask:} $tid" ;;
  esac
}

# ---------- skill finder ----------
SKILLS_CACHE="${TMPDIR:-/tmp}/hud-skills-$$.tsv"
build_skills() {
  : > "$SKILLS_CACHE"
  local f name desc src
  parse() { # file name-override src
    name="$(grep -m1 '^name:' "$1" | sed 's/^name: *//; s/"//g')"; [ -n "$2" ] && name="$2"
    desc="$(grep -m1 '^description:' "$1" | sed 's/^description: *//; s/"//g' | cut -c1-90)"
    [ -n "$name" ] && printf '%s\t%s\t%s\n' "$name" "$desc" "$3" >> "$SKILLS_CACHE"
  }
  for f in "$ROOT"/.claude/skills/*/SKILL.md; do [ -f "$f" ] && parse "$f" "" "project"; done
  for f in "$HOME"/.claude/skills/*/SKILL.md; do [ -f "$f" ] && parse "$f" "" "user"; done
  for f in "$HOME"/.claude/plugins/cache/*/*/*/skills/*/SKILL.md "$HOME"/.claude/plugins/cache/*/*/*/skills/*/*/SKILL.md; do
    [ -f "$f" ] || continue
    plugin="$(printf '%s' "$f" | awk -F/ '{for(i=1;i<=NF;i++) if($i=="cache"){print $(i+2); exit}}')"
    sk="$(basename "$(dirname "$f")")"
    parse "$f" "$plugin:$sk" "plugin"
  done
  sort -u -t$'\t' -k1,1 "$SKILLS_CACHE" -o "$SKILLS_CACHE"
}
skill_finder() {
  [ -s "$SKILLS_CACHE" ] || build_skills
  local total; total="$(wc -l < "$SKILLS_CACHE" | tr -d ' ')"
  printf '\n%sFind a skill%s (%s installed). Type a word to filter, Enter for all: ' "$B" "$R" "$total"
  read -r q
  local list="${TMPDIR:-/tmp}/hud-skills-f-$$.tsv"
  if [ -n "$q" ]; then grep -i -- "$q" "$SKILLS_CACHE" > "$list"; else cp "$SKILLS_CACHE" "$list"; fi
  local n=0
  while IFS=$'\t' read -r name desc src; do
    n=$((n+1)); [ "$n" -gt 40 ] && { printf '  %s… %s more; filter to narrow%s\n' "$D" "$(( $(wc -l < "$list") - 40 ))" "$R"; break; }
    printf '  %s%2d%s %s%-34s%s %s%s%s\n' "$YEL" "$n" "$R" "$WHT" "$(trunc "$name" 34)" "$R" "$D" "$(trunc "$desc" $(( $(width) - 44 )))" "$R"
  done < "$list"
  [ "$n" = 0 ] && { echo "  (no match)"; rm -f "$list"; return 0; }
  printf 'Number to run (Enter = cancel): '; read -r pick
  [ -n "$pick" ] || { rm -f "$list"; return 0; }
  local name; name="$(sed -n "${pick}p" "$list" | cut -f1)"; rm -f "$list"
  [ -n "$name" ] || return 0
  printf 'Arguments for /%s (Enter = none): ' "$name"; read -r args
  run_claude "/$name${args:+ $args}"
}

# ---------- agent loops ----------
loops_menu() {
  local rel="${DIR#$ROOT/}"
  printf '\n%sAgent loops%s (each runs %s)\n' "$B" "$R" "$([ "$TARGET" = pane ] && echo 'in a new Herdr pane' || echo 'here')"
  printf '  %s1%s Ticket loop      Intent → Spec → Ready → Implement → QA → Done  (one ticket)\n' "$YEL" "$R"
  printf '  %s2%s Bug loop         triage → test-first fix → PR                    (one bug)\n' "$YEL" "$R"
  printf '  %s3%s PR babysitter    every 10 min: fix red CI, answer reviews\n' "$YEL" "$R"
  printf '  %s4%s QA sweep         run @qa on every change in implement/qa stage\n' "$YEL" "$R"
  printf '  %s5%s Measure sweep    /measure on every change in done stage\n' "$YEL" "$R"
  printf '  %s6%s Verify branch    @verifier + @reviewer on the current diff, report only\n' "$YEL" "$R"
  printf '  %s7%s Wayfinder        map a big fuzzy idea into decision tickets\n' "$YEL" "$R"
  printf '  %s8%s Onboard repo     read the code, write CLAUDE.md\n' "$YEL" "$R"
  printf '> '; read -r n
  case "$n" in
    1) if [ -n "$DIR" ]; then run_claude "/ticket $rel"; else printf 'Ticket id: '; read -r t; [ -n "$t" ] && run_claude "/ticket $t"; fi ;;
    2) printf 'Describe the bug in one line: '; read -r bug; [ -n "$bug" ] && run_claude "/triage-bug $bug — after the cause is found, fix it with /tdd-loop, then /ship-it. Stop after each skill and tell me what you found." ;;
    3) run_claude "/loop 10m Check the open PR for this branch with gh. If CI is red, fix it and push. If there are review comments, answer or apply them. Otherwise say: quiet." ;;
    4) run_claude "For every folder in docs/changes/ whose index.md has stage implement or qa, dispatch the qa agent with that folder and collect the pass/fail tables into one summary. Report only." ;;
    5) run_claude "For every folder in docs/changes/ whose index.md has stage done, run /measure on it. Numbers in a table. Say not enough data instead of guessing." ;;
    6) run_claude "Dispatch @verifier and @reviewer on the current branch diff${DIR:+ against $rel}. Report their findings, ranked. Do not edit anything." ;;
    7) printf 'Destination in one line: '; read -r idea; [ -n "$idea" ] && run_claude "/wayfinder $idea" ;;
    8) run_claude "/onboard-repo" ;;
  esac
}

# ---------- render ----------
meter() {
  local cur="$1" i=1 out="" names="intent spec ready implement qa done measure"
  set -- "1 Intent" "2 Spec" "3 Ready" "4 Implement" "5 QA" "6 Done" "7 Measure"
  for n in $names; do
    if [ "$n" = "$cur" ]; then out="$out${INV}${CYN} $1 ${R}"; else out="$out${D}○ $1${R}"; fi
    [ "$i" -lt 7 ] && out="$out ${D}→${R} "; i=$((i+1)); shift
  done
  [ "$cur" = "closed" ] && out="$out ${GRN}✓ closed${R}"
  printf '%s\n' "$out"
}
render() {
  clear 2>/dev/null || printf '\033c'
  local w; w="$(width)"
  # header
  local hdr="$NAME"
  if [ "$IS_GIT" = 1 ]; then hdr="$hdr  ·  $BRANCH"; else hdr="$hdr  ·  ${RED}no git${R}"; fi
  hdr="$hdr  ·  $(short_path "$ROOT")"
  [ "$IN_HERDR" = 1 ] && hdr="$hdr  ${D}(herdr $HERDR_WORKSPACE_ID)${R}"
  printf '%s%s%s\n' "$B$CYN" "$(trunc "$hdr" $((w-1)))" "$R"; hr
  # NOW
  title "$MAG" "NOW"
  if [ "$N_CHANGES" -gt 0 ]; then
    printf '  %schanges:%s %s open' "$GRN" "$R" "$N_CHANGES"
    printf '%s' "$CHANGES" | head -4 | while IFS='|' read -r f st; do [ -n "$f" ] && printf '   %s▸%s %s %s(%s)%s' "$D" "$R" "$(trunc "$f" 28)" "$D" "$st" "$R"; done; echo
  else
    printf '  %schanges:%s none yet %s(docs/changes/ is empty)%s\n' "$GRN" "$R" "$D" "$R"
  fi
  if [ "$IS_GIT" = 1 ]; then
    printf '  %sgit:%s %s uncommitted · last: %s' "$GRN" "$R" "$DIRTY" "$(trunc "$GLAST" $((w-40)))"
    [ -n "$PR_LINE" ] && printf ' · %s' "$PR_LINE"; echo
  else
    printf '  %sgit:%s %snot a repository → run: git init%s\n' "$GRN" "$R" "$RED" "$R"
  fi
  [ -n "$AGENTS" ] && printf '  %sagents:%s %s\n' "$GRN" "$R" "$AGENTS"
  [ -n "$STACK" ] && printf '  %sstack:%s %s   %s(skills: %s)%s\n' "$GRN" "$R" "$STACK" "$D" "$(stack_skills)" "$R"
  hr
  # LIFECYCLE
  title "$MAG" "LIFECYCLE"
  if [ -z "$DIR" ]; then
    printf '  %sno ticket started here — press%s %s %sto begin%s\n' "$D" "$R" "$(K n)" "$D" "$R"
  else
    printf '  '; meter "$STAGE"
    printf '  %schange:%s %s   %sstage:%s %s' "$GRN" "$R" "$(basename "$DIR")" "$GRN" "$R" "$STAGE"
    [ -n "$GATE" ] && printf '   %sgate:%s %s' "$GRN" "$R" "$GATE"; echo
    if [ -f "$DIR/spec.md" ]; then
      printf '  %sspec:%s %s req · %s happy · %s edge' "$GRN" "$R" "$REQ" "$HAPPY" "$EDGE"
      [ -n "$EDGE_MISSING" ] && printf ' %s(no test:%s)%s' "$YEL" "$EDGE_MISSING" "$R"
      [ "$T_ALL" -gt 0 ] && printf '   %stickets:%s %s/%s done' "$GRN" "$R" "$T_DONE" "$T_ALL"; echo
    fi
  fi
  hr
  # SUGGESTED
  title "$MAG" "SUGGESTED NEXT"
  local i=1
  while [ $i -le "$SUG_N" ]; do
    printf '  %s %s\n' "$(K "$i")" "$(trunc "$(sug_l $i)" $((w-8)))"
    printf '      %s%s%s\n' "$D" "$(trunc "$(sug_c $i | sed 's/^[a-z]*://')" $((w-8)))" "$R"
    i=$((i+1))
  done
  [ "$SUG_N" = 0 ] && printf '  %snothing to suggest — you are up to date%s\n' "$D" "$R"
  hr
  # keys
  local tgt; tgt="$([ "$TARGET" = pane ] && echo 'new pane' || echo 'here')"
  if [ "$w" -ge 105 ]; then
    printf '%s run #1  %s pick  %s loops  %s find skill  %s change  %s target: %s  %s refresh  %s quit\n' \
      "$(K n)" "$(K 1-4)" "$(K l)" "$(K s)" "$(K c)" "$(K t)" "$tgt" "$(K r)" "$(K q)"
  else
    printf '%s run #1  %s pick  %s loops  %s find skill\n' "$(K n)" "$(K 1-4)" "$(K l)" "$(K s)"
    printf '%s change  %s target: %s  %s refresh  %s quit\n' "$(K c)" "$(K t)" "$tgt" "$(K r)" "$(K q)"
  fi
  [ -n "${LAST:-}" ] && printf '%s● %s%s\n' "$GRN" "$(trunc "$LAST" $((w-3)))" "$R"
}
stack_skills() {
  local s=""
  case " $STACK " in *" next.js "*) s="$s vercel:nextjs vercel:react-best-practices" ;; esac
  case " $STACK " in *" playwright "*) s="$s /qa" ;; esac
  case " $STACK " in *" drizzle "*) s="$s neon-postgres" ;; esac
  case " $STACK " in *" python "*) s="$s /tdd-loop engineering:debug" ;; esac
  case " $STACK " in *" go "*) s="$s gopls-lsp" ;; esac
  printf '%s' "${s# }"
}

# ---------- --skills [filter]: just list skills and exit ----------
if [ -n "$SKILLS_ONLY" ]; then
  build_skills
  if [ "$SKILLS_ONLY" = "all" ]; then cat "$SKILLS_CACHE"; else grep -i -- "$SKILLS_ONLY" "$SKILLS_CACHE"; fi | awk -F'\t' '{printf "%-36s %-8s %s\n", "/"$1, $3, substr($2,1,80)}'
  rm -f "$SKILLS_CACHE"; exit 0
fi

# ---------- main loop ----------
LAST=""
gather; refresh_pr; suggest
while :; do
  render
  [ "$ONCE" = 1 ] && exit 0
  IFS= read -r -s -n1 key
  case "$key" in
    n) run_sug 1 ;;
    1|2|3|4) run_sug "$key" ;;
    l) loops_menu ;;
    s) skill_finder ;;
    t) [ "$TARGET" = pane ] && TARGET=here || { [ "$IN_HERDR" = 1 ] && TARGET=pane || LAST="Not inside Herdr: target stays here"; } ;;
    c) echo; i=1; for d in "$ROOT"/docs/changes/*/; do [ -d "$d" ] || continue; printf '  %s%d%s %s (%s)\n' "$YEL" "$i" "$R" "$(basename "$d")" "$(stage_of "${d%/}")"; i=$((i+1)); done
       printf '> '; read -r n; j=1; for d in "$ROOT"/docs/changes/*/; do [ -d "$d" ] || continue; [ "$j" = "$n" ] && DIR="${d%/}"; j=$((j+1)); done ;;
    r) refresh_pr; LAST="Refreshed" ;;
    q) rm -f "$SKILLS_CACHE"; clear; exit 0 ;;
  esac
  gather; suggest
done
