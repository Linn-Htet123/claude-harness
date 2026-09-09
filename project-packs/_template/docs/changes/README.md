# docs/changes — one folder per ticket

`docs/changes/<TICKET-ID>-<slug>/` holds everything about one change:

| file | what |
|---|---|
| `index.md` | stage (intent → spec → ready → implement → qa → done → measure → closed) + links |
| `proposal.md` | why, what changes, unknowns, **measurable hypotheses**, decision log |
| `research.md` | findings with sources; learnings after launch |
| `spec.md` | user stories + requirements; every requirement has **≥1 happy and ≥1 edge scenario** (GIVEN/WHEN/THEN); ids `S1..Sn` reused in test titles |
| `design.md` | architecture (mermaid), data/contract changes, decisions, rollout/rollback |
| `tickets.md` | vertical-slice tickets synced to the tracker |
| `qa-report.md` | pass/fail per scenario |

Frontmatter follows Google's Open Knowledge Format (`type`, `status`, `sources`, `verified`);
the body follows OpenSpec (`### Requirement:` / `#### Scenario:`).
Read one folder (a sub-graph), not the whole `docs/` tree.
Created by `/ticket <ID>` (see ~/GITHUB/claude-harness/skills/ticket).
