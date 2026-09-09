---
name: ticket
description: Run one ticket (Linear, GitHub Issue, Jira) through the whole loop - Intent -> Spec & Design (grilling) -> Ready -> Implement (TDD) -> QA -> Done (PR) -> Measure. Keeps everything in docs/changes/<ID>-<slug>/ (proposal, research, spec with happy + edge scenarios, design, tickets). One step per turn; Larry says "go" before the next step. Use for any ticket bigger than a one-line fix.
argument-hint: "[TICKET-ID | TICKET-ID slug | path to docs/changes/<folder>]"
disable-model-invocation: true
---

# /ticket — the loop

This is the workflow Keolo showed (intent → spec → ready → implement → measure)
rebuilt on Claude Code with the tools Larry already has. It works in any repo:
the per-project facts (base branch, test commands, tracker) come from that repo's CLAUDE.md. Scripts live in
`scripts/` next to this file; templates in `templates/`.

**Rules for the whole loop**
- One step per turn. End every step with: what I did, what I checked, what I am not sure about, and `Next step: N — say "go"`. Then STOP.
- Facts are my job (read code, Linear, docs). Decisions are Larry's.
- Never push to `main`, never merge, never schema-push (a hook also blocks these in every project).
- Ticket ids go in commit messages and PR bodies, never in code comments.
- If the ticket is a one-line fix, say so and skip the loop.

## Map (the big picture)

```
1 Intent ── 2 Spec & Design ── 3 Ready ── 4 Implement ── 5 QA ── 6 Done ── 7 Measure
 folder       grill + research   DoR check   TDD per S-id   @qa     PR+tracker  PostHog
```

## Step 0 — where are we?

Find the folder: `docs/changes/<ID>-*`. Then:
```bash
bash ~/.claude/skills/ticket/scripts/next-step.sh docs/changes/<ID>-<slug>
```
Follow the `NEXT:` line. If no folder exists, start at Step 1.

## Step 1 — Intent

1. Read the ticket with whatever this repo uses (Linear MCP, `gh issue view`, Jira MCP; check CLAUDE.md): title, description, comments, parent, labels.
2. Read `CLAUDE.md`, and `@explorer` to find the code this touches.
3. Create the folder:
   ```bash
   bash ~/.claude/skills/ticket/scripts/new-change.sh <ID> <slug> "<title>" "<linear url>"
   ```
4. Fill only `proposal.md` → **Why** and **What changes** from the ticket. Leave the rest.
5. Show Larry the folder path and a 5-line summary of the intent. Stop.

## Step 2 — Spec & Design (the grilling)

1. Call the Skill tool with `grilling` (mattpocock) — numbered questions, each with my recommended answer, in rounds. Ask about: users, happy path, edge cases (empty input, offline, double click, expired session, timezone), what is out of scope, what to measure.
2. In parallel, dispatch `@scout` with the proposal to write `research.md` (findings table with sources). It returns only a short summary and the path.
3. When the frontier is empty, write:
   - `proposal.md`: unknowns, **hypotheses** (`- H1: metric: ...; from: ...; to: ...; within: ...`), decision log (options / selected / rejected because).
   - `spec.md`: out of scope, user stories, `### Requirement:` blocks. **Every requirement gets ≥1 `Scenario: Sn happy —` and ≥1 `Scenario: Sn edge —`**, GIVEN / WHEN / THEN.
   - `design.md`: context, goals / non-goals, mermaid diagram, data/contract changes, decisions, rollout/rollback. A big decision also becomes an ADR (`docs/decisions/`, use `/domain-modeling`).
   - `tickets.md`: vertical slices (T1, T2...), blocked-by, which scenarios each covers.
4. Set `stage: spec` in `index.md`. Show Larry the spec scenarios list (ids + names). Stop.

## Step 3 — Ready (Definition of Ready)

```bash
bash ~/.claude/skills/ticket/scripts/ready-check.sh docs/changes/<ID>-<slug>
```
Fix every FAIL. Then ask Larry: "Is this spec what you want? Anything to add to edge cases or out of scope?"
When he approves: set `stage: ready`, `status: stable` in `spec.md`, and (only after his OK) create the tracker sub-issues from `tickets.md` (Linear MCP / `gh issue create`), writing the ids back into the `tracker` column. Stop.

## Step 4 — Implement

1. Branch or worktree: `git checkout -b <type>/<ID>-<slug>` from the base branch named in the repo CLAUDE.md (MMV = `dev`), or `claude --worktree <ID>`.
2. For each ticket row, for each scenario: call the Skill tool with `tdd-loop`. Test titles carry the id: `S1 happy: ...`, `S2 edge: ...`. Edge tests assert the failure behaviour.
3. Run typecheck + the single test file often; the full suite once at the end. Paste real output.
4. Update `tickets.md` status column; set `stage: implement`. Tell Larry which S-ids are green. Stop after each ticket row (or after all, if he said "run all").

## Step 5 — QA

Dispatch `@qa` with the folder path. It runs the scenario tests, does a live browser pass with the Playwright MCP when a dev server is up, and writes `qa-report.md`. Read the report to Larry in 5 lines. Set `stage: qa`. Stop.

## Step 6 — Done

1. Dispatch `@verifier` (fresh eyes: every S-id has a test, diff matches spec, no ticket refs in code, no secrets).
2. Dispatch `@reviewer` (correctness only).
3. Fix real findings, re-run tests.
4. Call the Skill tool with `ship-it` → PR to the base branch (MMV = `dev`; never `main`). PR body links the change folder and lists S-ids covered.
5. Move the ticket to **In Review** (or this tracker's equivalent) with the PR link as a comment. Set `stage: done`. Stop. **Never merge.**

## Step 7 — Measure (after deploy + a few days)

Call the Skill tool with `measure` and pass the folder. It checks each hypothesis in PostHog, writes **Learnings after launch** in `research.md`, and turns production bugs into new edge scenarios. Set `stage: measure`, then `closed`.

## Reading only what you need

To load one doc plus what it links to (not all of `docs/`):
```bash
bash ~/.claude/skills/ticket/scripts/okf-subgraph.sh docs/changes/<ID>-<slug>/spec.md 1
```
