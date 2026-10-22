---
type: Proposal
title: {{ID}} {{TITLE}}
status: draft
resource: {{LINEAR_URL}}
sources:
  - id: ticket
    resource: {{LINEAR_URL}}
    title: Ticket {{ID}}
---
# Proposal — {{ID}} {{TITLE}}

## Why
{{Who is stuck, on what. Plain words. 2-4 lines.}}

## What Changes
- {{The change, one bullet each. Mark breaking changes with **BREAKING**.}}
- Does NOT change: {{...}}

## Capabilities

### New Capabilities
- `{{CAPABILITY}}`: {{what this capability covers}}

### Modified Capabilities
<!-- Existing capabilities under openspec/specs/ whose requirements change. Leave empty if none. -->

## Impact
{{Affected code, APIs, dependencies, systems.}}

## Out of scope
- {{the most useful list in this file}}

## User stories
1. As a {{who}}, I want {{what}}, so that {{why}}.

## Key unknowns
- U1: {{question we cannot answer yet}}

## Hypotheses (each one must be measurable)
- H1: metric: {{event or number in PostHog}}; from: {{X}}; to: {{Y}}; within: {{N days}}; flag: {{feature flag name or none}}

## Decision log
| # | Question | Options considered | Selected | Why the others were rejected |
|---|---|---|---|---|
| D1 | {{...}} | A / B / C | B | {{...}} |

## Links
- Research: [research.md](research.md)
- Spec: [specs/{{CAPABILITY}}/spec.md](specs/{{CAPABILITY}}/spec.md)
- Design: [design.md](design.md)
- Tasks: [tasks.md](tasks.md)
