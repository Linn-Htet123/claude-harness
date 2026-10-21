---
type: Design
title: {{ID}} technical design
status: draft
---
# Design — {{ID}} {{TITLE}}

## Context
{{What exists today. Link the files that matter. See proposal.md for the why.}}

## Goals / Non-Goals
**Goals:**
- {{...}}

**Non-Goals:**
- {{...}}

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

## Risks / Trade-offs
- {{...}}

## Rollout / rollback
{{flag? migration? how to undo?}}
