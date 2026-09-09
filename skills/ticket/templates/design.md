---
type: Design
title: {{ID}} technical design
status: draft
---
# Design — {{ID}} {{TITLE}}

## Context
{{What exists today. Link the files that matter.}}

## Goals / Non-goals
- Goal: {{...}}
- Non-goal: {{...}}

## Architecture
```mermaid
flowchart LR
  UI[{{screen}}] --> API[{{route}}] --> DB[({{table}})]
```

## Data / contract changes
{{schema, API shape, events. "none" is a fine answer}}

## Decisions
| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | {{...}} | {{...}} | {{...}} |

Big decisions also get an ADR in `docs/decisions/` (use /domain-modeling).

## Risks / trade-offs
- {{...}}

## Rollout / rollback
{{flag? migration? how to undo?}}
