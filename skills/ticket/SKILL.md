---
name: ticket
description: Run one ticket (Linear, GitHub Issue, Jira) through the whole loop - Intent -> Spec & Design (grilling) -> Ready -> Implement (TDD) -> QA -> Done (review gate + PR) -> Measure + archive. Each ticket is one OpenSpec change in openspec/changes/<id>-<slug>/ (proposal, research, specs/<capability>/spec.md with happy + edge scenarios, design, tasks). One step per turn; Larry says "go" before the next step. Use for any ticket bigger than a one-line fix.
argument-hint: "[TICKET-ID | plain words describing the work | path to openspec/changes/<folder>]"
disable-model-invocation: true
---

# /ticket — the loop

This is the workflow Keolo showed (intent → spec → ready → implement → measure),
rebuilt on Claude Code. It merges three things:
- **Larry's loop**: grilling, happy + edge scenarios with ids, the ready check, /measure.
- **OpenSpec**: every ticket is one OpenSpec change. After it ships, `openspec archive` merges its spec into `openspec/specs/`, the living spec library of the repo.
- **Anthony's gates**: tracer-bullet tasks with blocked-by edges, parallel build for big work, and the two-axis review (defects + over-engineering) before a PR.

It works in any repo. The per-project facts (base branch, test commands, tracker) come from that repo's CLAUDE.md. Scripts live in `scripts/` next to this file; templates in `templates/`.

**Rules for the whole loop**
- One step per turn. End every step with: what I did, what I checked, what I am not sure about, and `Next step: N — say "go"`. Then STOP.
- Facts are my job (read code, Linear, docs). Decisions are Larry's.
- Never push to `main`, never merge, never schema-push (a hook also blocks these in every project).
- Ticket ids go in commit messages and PR bodies, never in code comments.
- If the ticket is a one-line fix, say so and skip the loop.

## Map (the big picture)

```
1 Intent ── 2 Spec & Design ── 3 Ready ──── 4 Implement ── 5 QA ── 6 Done ─────────── 7 Measure
 change      grill + research   DoR check    TDD per S-id    @qa     review gate + PR    PostHog
 created     → OpenSpec files   + validate   or parallel             (defects+ponytail)  + archive
```

## Step 0 — where are we?

Find the change: `openspec/changes/<id>-*` (lowercase). Old tickets may still live in `docs/changes/<ID>-*`; the scripts read both. Then:
```bash
bash ~/.claude/skills/ticket/scripts/next-step.sh openspec/changes/<id>-<slug>
```
Follow the `NEXT:` line. If no change exists, start at Step 1.

**No `openspec/` folder in this repo?** Ask Larry, then run once: `openspec init --tools none`. (`--tools none` is right: the OpenSpec skills and `/opsx:*` commands already come from the harness, in every repo.)

## Step 1 — Intent

0. **No ticket id, just words?** (e.g. `/ticket add a login page`). That is fine. Make an id:
   PREFIX = first 2-4 letters of the repo name, upper case (lovememora → `LM`, massive-qr → `MQ`);
   number = highest existing `openspec/changes/<prefix>-<n>-*` (and archive, and old `docs/changes/`) + 1, or 1. Slug = 2-4 words from the text.
   Tell Larry the id you made. Skip reading a tracker; the words are the intent.
1. Read the ticket with whatever this repo uses (Linear MCP, `gh issue view`, Jira MCP; check CLAUDE.md): title, description, comments, parent, labels.
2. Read `CLAUDE.md` and `openspec/specs/` (what the system already promises), and `@explorer` to find the code this touches.
3. Pick the **capability**: the spec folder this change belongs to (kebab-case, a durable behaviour like `user-auth`, not the task name). Reuse an existing one from `openspec/specs/` if it fits.
4. Create the change:
   ```bash
   bash ~/.claude/skills/ticket/scripts/new-change.sh <ID> <slug> "<title>" "<ticket url>" <capability>
   ```
5. Fill only `proposal.md` → **Why** and **What Changes** from the ticket. Leave the rest.
6. Show Larry the folder path and a 5-line summary of the intent. Stop.

## Step 2 — Spec & Design (the grilling)

1. Call the Skill tool with `grilling` (mattpocock) — numbered questions, each with my recommended answer, in rounds. Ask about: users, happy path, edge cases (empty input, offline, double click, expired session, timezone), what is out of scope, what to measure.
2. In parallel, dispatch `@scout` with the proposal to write `research.md` (findings table with sources). It returns only a short summary and the path.
3. When the frontier is empty, write (for each file, `openspec instructions <artifact> --change <name> --json` gives OpenSpec's own rules; follow them too):
   - `proposal.md`: Capabilities (new / modified), Impact, Out of scope, user stories, unknowns, **hypotheses** (`- H1: metric: ...; from: ...; to: ...; within: ...`), decision log (options / selected / rejected because).
   - `specs/<capability>/spec.md`: `## ADDED Requirements` (or `## MODIFIED Requirements` for an existing capability, copying the whole old requirement first). **Every requirement gets ≥1 `#### Scenario: Sn happy —` and ≥1 `#### Scenario: Sn edge —`**, GIVEN / WHEN / THEN. Nothing above the first `##` heading (archive drops it). Behaviour only: no class names, no libraries.
   - `design.md`: context, goals / non-goals, mermaid diagram, data/contract changes, decisions, rollout/rollback. A big decision also becomes an ADR (`docs/decisions/`, use `/domain-modeling`).
   - `tasks.md`: **tracer-bullet slices** (the `to-tickets` rules): each `## N. TN <title> (blocked by: ...; scenarios: S1,S2; tracker: ...)` cuts a thin path through every layer and can be demoed alone. Prefactoring first. Under each heading, checkbox tasks `- [ ] N.1 ...`. A wide mechanical refactor uses expand → migrate in batches → contract instead.
4. Set `stage: spec` in `index.md`. Show Larry the spec scenarios list (ids + names) and the slices with their blocked-by edges. Stop.

## Step 3 — Ready (Definition of Ready)

```bash
bash ~/.claude/skills/ticket/scripts/ready-check.sh openspec/changes/<id>-<slug>
```
It also runs `openspec validate`. Fix every FAIL. Then ask Larry: "Is this spec what you want? Anything to add to edge cases or out of scope? Are the blocked-by edges right?"
When he approves: set `stage: ready`, and (only after his OK) create the tracker sub-issues from `tasks.md` slices (Linear MCP / `gh issue create`), using native blocking links where the tracker has them, and write the ids back into each heading's `tracker:`. Stop.

## Step 4 — Implement

1. Branch or worktree: `git checkout -b <type>/<ID>-<slug>` from the base branch named in the repo CLAUDE.md (MMV = `dev`), or `claude --worktree <ID>`.
2. Pick the mode, tell Larry which and why:
   - **Small (1-2 slices, or a straight chain):** for each slice, for each scenario: call the Skill tool with `tdd-loop`. Test titles carry the id: `S1 happy: ...`, `S2 edge: ...`. Edge tests assert the failure behaviour.
   - **Big (3+ slices with independent branches in the graph):** call `implement-spec` with the change folder. It runs one implementer subagent per frontier slice, each in its own worktree, still test-first with S-id titles, and merges them onto this branch.
3. Run typecheck + the single test file often; the full suite once at the end. Paste real output.
4. Tick the `tasks.md` boxes (`- [x]`) as they land; set `stage: implement`. Tell Larry which S-ids are green. Stop after each slice (or after all, if he said "run all").

## Step 5 — QA

Dispatch `@qa` with the change folder. It runs the scenario tests, does a live browser pass with the Playwright MCP when a dev server is up, and writes `qa-report.md`. Read the report to Larry in 5 lines. Set `stage: qa`. Stop.

## Step 6 — Done (the review gate)

Two axes, because a defect review never asks "should this exist":
1. Set `stage: done` in `index.md` and tick the last `tasks.md` boxes, so they are part of the reviewed commit. Commit the work, then call the Skill tool with `review-gate`. In one go it runs `@verifier` (every S-id has a test, diff matches the spec), defects (`code-review`, or `thermonuclear-review` for risky work), `ponytail-review` (over-engineering), and `@security-reviewer` when needed, then gives one ranked report.
2. BLOCKED: fix the blockers, re-run tests, commit, run `review-gate` again. Judge each ponytail cut: apply it, or say why the cost is deliberate.
3. PASS: it marks the commit as reviewed. The guardrails hook blocks opening a PR without that mark.
4. Call the Skill tool with `ship-it` → PR to the base branch (MMV = `dev`; never `main`). PR body links the change folder, lists S-ids covered, and has a **Verification** section with the test command, its real output, and the `/review-gate` verdict line.
5. Move the ticket to **In Review** (or this tracker's equivalent) with the PR link as a comment. Add the changelog entry (`~/.claude/shared/agent-changelog.md`). Stop. **Never merge.**

## Step 7 — Measure + archive (after merge + deploy + a few days)

1. Call the Skill tool with `measure` and pass the folder. It checks each hypothesis in PostHog, writes **Learnings after launch** in `research.md`, and turns production bugs into new edge scenarios. Set `stage: measure`.
2. When Larry says the change is finished: set `stage: closed` in `index.md`, then `openspec archive <id>-<slug> --yes`. This merges the spec delta into `openspec/specs/<capability>/spec.md` and moves the folder to `openspec/changes/archive/`. Commit on a branch, run `review-gate`, then `ship-it`. Stop.

## Reading only what you need

To load one doc plus what it links to (not the whole repo):
```bash
bash ~/.claude/skills/ticket/scripts/okf-subgraph.sh openspec/changes/<id>-<slug>/proposal.md 1
```

## OpenSpec commands you can also use

`/opsx:explore` (think before a ticket), `/opsx:propose` (quick change without the grilling), `/opsx:apply` (work through `tasks.md`), `/opsx:update` (revise the plan), `/opsx:archive`. `/ticket` is the full loop; the `/opsx:*` commands are the short path for small work.
