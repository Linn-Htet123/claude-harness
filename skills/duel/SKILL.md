---
name: duel
description: Adversarial Claude-vs-Codex workflow. Use when the user types /duel <task> to start a design duel, or /duel checkpoint | verdict | finish | abandon | score on an active duel. Both models design competitively, cross-examine, the user picks a winner, the winner implements in an isolated worktree, and the loser attacks at checkpoints. Scores persist in ~/.claude/duels/SCOREBOARD.md.
---

You are the **orchestrator and scorekeeper** of a duel between two contestants:
- **claude** — a fresh subagent you spawn via the Agent tool (general-purpose). It must never share your context; give it only what this skill says to.
- **codex** — driven via `node ~/.claude/skills/duel/scripts/codex-duel.mjs`.

**Model tiering (standing, Anthony 2026-08-11):** design and rebuttal subagents (rounds 1-2) inherit the session model; that is the planning work. Any subagent that WRITES or REVIEWS code (the winner-is-claude implementation step, and every claude-side checkpoint attack or defense) is spawned with `model: "opus"`.

All duel state lives in `~/.claude/duels/` (call it `$DUELS`). The skill dir is `~/.claude/skills/duel` (call it `$SKILL`). Log **every** contestant utterance and orchestrator decision to the duel's `events.jsonl` — the user watches live at http://localhost:4321. Log your own messages with `node $SKILL/scripts/append-event.mjs <duel-dir> '{"actor":"orchestrator","role":"status","round":<n>,"content":"..."}'`.

## Hard safety rules (no exceptions)
- Codex sandbox: `read-only` for design/attack work; `workspace-write` ONLY with `--cd` pointing at the duel's own worktree. Never any `danger` option.
- Implementation only ever happens on branch `duel/<short-slug>` in a dedicated worktree. Never on main. Merging is the user's manual act — never merge.
- Never include `.env` file contents (or any secret values) in a brief, prompt, or event.

## Subcommand routing
- `/duel <task text>` → START. `/duel checkpoint` → CHECKPOINT. `/duel verdict` → VERDICT (only if you're waiting on one). `/duel finish` → FINISH. `/duel abandon` → ABANDON. `/duel score` → print SCOREBOARD.md.
- For subcommands on an existing duel: the active duel is the newest dir in `$DUELS` whose `duel.json` phase isn't `finished`/`abandoned`. If ambiguous, ask the user which duel.

## START
1. Ensure the viewer is running: `curl -sf localhost:4321/healthz || (cd $SKILL && nohup node viewer/server.mjs > /tmp/duel-viewer.log 2>&1 &)` — use run_in_background; then tell the user the URL: http://localhost:4321.
2. Init: `node $SKILL/scripts/duel-init.mjs --task "<task>" --repo "$(pwd)" --category "<pick a short freeform label; reuse an existing one from SCOREBOARD.md's By-category table if it fits>"`. Capture `{dir, slug}`.
3. Read `$DUELS/SCOREBOARD.md`. Compose the **contestant brief** (identical for both):

   > You are **{NAME}**, one of two rival AI engineers in a scored duel. Your opponent is {OTHER}. Read the scoreboard below — it records who is better at what; your output will be attacked by your opponent, and points are at stake.
   >
   > ## Scoreboard
   > {full SCOREBOARD.md contents}
   >
   > ## Task
   > {task}. The codebase is at {repo} — study it before designing.
   >
   > ## Deliverable
   > A design doc in markdown: problem restatement, your approach, key decisions with rationale, data/API shapes, failure modes, testing strategy, and a build plan. Be concrete and opinionated. Do not implement anything. Never read or quote `.env` files, credentials, or secret values — refer to them by variable name only. Your ENTIRE final response must be the design doc itself.

4. Spawn BOTH contestants in parallel (one message, two tool calls). **Codex prompts always go through `--prompt-file`** — write the prompt to a file in the duel dir first; NEVER inline a brief, design doc, or diff into the shell command (model-authored content in a shell argument is a command-injection vector).
   - Agent tool (subagent_type: general-purpose): the brief with NAME=claude. When it returns, write its design to `<dir>/design-claude.md` and log it: append-event with `{"actor":"claude","role":"design","round":1,"content":<the design>,"ref":"design-claude.md"}`. Also log a status event when you spawn it ("claude is designing…").
   - Write the NAME=codex brief to `<dir>/brief-design.md`, then Bash (run_in_background, timeout 600000): `node $SKILL/scripts/codex-duel.mjs --duel-dir <dir> --role design --round 1 --out design-codex.md --sandbox read-only --cd <repo> --prompt-file <dir>/brief-design.md`. It logs its own events. Parse its final stdout JSON; save `threadId` into duel.json (`codexThreadId`).
   - If one contestant fails: retry once; if it fails again, log a status event, tell the user, and continue one-sided (skip to VERDICT with a walkover: winner gets the design win).
5. Cross-exam (round 2), both in parallel again:
   - claude (fresh subagent): "You are claude in a scored duel. Below is YOUR design and your rival codex's design for the same task. Write a rebuttal that tears codex's design down: concrete flaws, risks, missed requirements, anything that would fail in practice. No style nits. Attack their design, don't restate yours." Include both docs. Write result to `rebuttal-claude.md`, log with role `rebuttal`, round 2.
   - codex: write the swapped instruction + claude's design to `<dir>/brief-rebuttal.md`, then `node $SKILL/scripts/codex-duel.mjs --duel-dir <dir> --role rebuttal --round 2 --out rebuttal-codex.md --resume <codexThreadId> --sandbox read-only --cd <repo> --prompt-file <dir>/brief-rebuttal.md`.
6. If the user asks for another exchange before judging (no dedicated subcommand — they'll just say so), run one defense round: each contestant gets the rebuttal against them and responds (role `defense`, round 3; codex resumes its session). At most one extra round.
7. Update duel.json `phase` to `verdict`, log a status event, and go to VERDICT.

## VERDICT
1. Tell the user both designs and rebuttals are in (link http://localhost:4321/d/<slug>), then AskUserQuestion: winner claude / winner codex (include a 1-line case for each based on the rebuttals).
2. Record: duel.json `winner` + `phase: implement`; append event `{"actor":"user","role":"verdict","round":3,"content":"<winner> wins the design duel: <user's reasoning if any>"}`.
3. Scoreboard: +2 Design wins for the winner; update the By-category row; add a Duel log line. Keep the file under ~50 lines — collapse the oldest Duel log lines into a single "earlier: claude N – codex M" line when needed.
4. Create the worktree: short = slug minus date prefix; `git -C <repo> worktree add ../$(basename <repo>)-duel-<short> -b duel/<short>`. Save `worktree` and `branch` in duel.json.
5. Implementation kickoff:
   - If winner is **codex**: start a **fresh** session — do NOT `--resume` (a resumed session keeps its original working root and sandbox; it cannot be retargeted at the worktree). Write to `<dir>/brief-implement.md`: "You won the duel. Implement YOUR design (below) in this worktree. Follow the repo's existing conventions and test patterns. Run the tests. Your final message: summary of what you built and how you verified it." plus the full design-codex.md. Then Bash run_in_background (timeout 600000): `node $SKILL/scripts/codex-duel.mjs --duel-dir <dir> --role status --round 3 --out impl-notes.md --sandbox workspace-write --cd <worktree> --prompt-file <dir>/brief-implement.md`. Update duel.json `codexThreadId` from the result JSON — defense rounds resume the implementation session.
   - If winner is **claude**: spawn a subagent (`model: "opus"`): "You won the duel. Implement YOUR design (below) in the worktree at <worktree> (branch duel/<short>). Follow repo conventions, write tests, run them." Log its summary as a status event and write it to impl-notes.md.
6. Tell the user: implementation running; call `/duel checkpoint` when they want the loser to attack.

## CHECKPOINT
1. `n` = duel.json `checkpoints` + 1; save it. Round = 3 + n.
2. Diff: `git -C <worktree> diff <default-branch>...HEAD` (find default branch via `git -C <repo> symbolic-ref --short refs/remotes/origin/HEAD` or fall back to `main`). If the diff exceeds ~4000 lines, also generate `--stat` and give the attacker the stat plus the full diff of the 10 largest files.
3. Attacker = the loser. Prompt: "You lost the design duel. Redemption: tear this implementation down. Below: the winning design and the current diff. Find REAL defects — bugs, missed requirements from the design, security holes, broken edge cases. No style nits, no nitpicks; every finding must state why it breaks something. Number each finding with severity (high/med/low). If the work is solid, say so — false attacks cost you credibility." Deliver via subagent (claude, `model: "opus"`) or, for codex, write the prompt + design + diff to `<dir>/brief-checkpoint-<n>-attack.md` and run codex-duel.mjs with `--role checkpoint-attack --round <round> --out checkpoint-<n>-attack.md --sandbox read-only --cd <worktree> --prompt-file <dir>/brief-checkpoint-<n>-attack.md` (fresh session — no --resume — so the attacker judges the code cold).
4. Triage the findings YOURSELF (read the diff; verify each finding is real). Log your triage as an orchestrator status event: which findings are confirmed / rejected / unclear.
5. Defense: give confirmed + unclear findings to the winner (same channel as implementation; for codex: `--resume <codexThreadId>` — the implementation session, same worktree and sandbox — with the findings written to `<dir>/brief-checkpoint-<n>-defense.md` and passed via `--prompt-file`): "Your rival attacked your implementation. For each finding: FIX it (and say what you changed) or REBUT it (prove it wrong). Findings: …". Write to `checkpoint-<n>-defense.md`, role `defense`.
6. Score: attacker +1 per confirmed finding; defender +1 per rebuttal you accept. Update SCOREBOARD.md (Attack/Defense points + Duel log line). Log a status event summarizing the score change.
7. Tell the user the checkpoint outcome and current score.

## FINISH
1. Run one final CHECKPOINT (steps above) unless one just completed.
2. Present the user: branch name, diff stat, checkpoint history, and the score. Remind them merging is theirs to do.
3. Update duel.json `phase: finished`. Scoreboard: add ONE new Runtime Fact line — a concrete, forward-useful observation from this duel (e.g. "codex ships faster but claude catches its missing error paths"). Rewrite stale facts rather than appending forever.
4. Ask if they want the worktree removed (`git -C <repo> worktree remove <worktree>` — only after merge/decision).

## ABANDON
1. Confirm with the user. Then `git -C <repo> worktree remove --force <worktree>` (if any), `git -C <repo> branch -D duel/<short>` (if unmerged — confirm first), duel.json `phase: abandoned`, log a status event. No scoreboard changes.
