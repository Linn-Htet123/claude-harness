---
name: measure
description: Close the loop after a feature ships - check each hypothesis from proposal.md in PostHog (and Sentry errors), write "Learnings after launch" in research.md, and turn real production edge cases into new spec scenarios. Use a few days after deploy.
argument-hint: "[openspec/changes/<id>-<slug>] [days=7]"
disable-model-invocation: true
---

# /measure

Big picture: the spec made promises (H1, H2...). Now we check them with real numbers,
and we feed what we learn back into the next spec. This is Keolo's "measure" step.

## Steps

1. Read `proposal.md` → the **Hypotheses** lines (`metric`, `from`, `to`, `within`, `flag`).
2. Ask Larry the date window if not given (default: last 7 days, and 30 days for trend).
3. For each hypothesis, use the PostHog MCP tools (insights / HogQL / experiments / surveys). If a flag or experiment was set up, read its results. Also check Sentry for new errors in the touched files.
4. Write to `research.md` under **Learnings after launch**:
   ```
   | H | metric | before | after | verdict (supported / refuted / not enough data) | link |
   ```
   plus 3-5 plain-English lines: what surprised us, what to change.
5. Every real production bug or unexpected user path becomes a new `#### Scenario: Sn edge —` in the change's `specs/<capability>/spec.md` (old layout: `spec.md`) (marked `(from production)`) and, if the code changed, a regression test.
6. If a hypothesis was refuted and we should change direction, write an ADR (`docs/decisions/`) or a one-line note for Eric via `/pm-handoff`.
7. Set `stage: measure` in `index.md`. Tell Larry: what was measured, what could not be measured and why, and the next step (usually: `openspec archive <id>-<slug> --yes` once he says the change is finished).

## Rules
- Numbers go in the table, not in prose.
- Say "not enough data" instead of guessing.
- Never change PostHog flags or experiments without Larry's OK.
