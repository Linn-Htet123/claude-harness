---
type: Change
title: {{ID}} {{TITLE}}
status: draft
stage: intent
resource: {{LINEAR_URL}}
tags: []
generated: { by: claude-code, at: {{DATE}} }
---
# {{ID}} — {{TITLE}}

One folder = one ticket = one OpenSpec change. The files link to each other,
so an agent can read only this folder (a sub-graph), not all of the repo.

| Step | File | Status |
|---|---|---|
| 1 Intent | [proposal.md](proposal.md) | draft |
| 2 Research | [research.md](research.md) | draft |
| 2 Spec | [specs/{{CAPABILITY}}/spec.md](specs/{{CAPABILITY}}/spec.md) | draft |
| 2 Design | [design.md](design.md) | draft |
| 2 Tasks | [tasks.md](tasks.md) | draft |
| 5 QA | [qa-report.md](qa-report.md) | not run |

## Stage log
- {{DATE}} — intent: change created from ticket {{ID}}
