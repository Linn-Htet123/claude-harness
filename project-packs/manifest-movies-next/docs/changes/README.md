# docs/changes — moved to OpenSpec

New tickets do not go here any more. Each `/ticket <ID>` is one OpenSpec change:

`openspec/changes/<id>-<slug>/` (lower case, e.g. `mmv-278-evening-ritual`)

| file | what |
|---|---|
| `index.md` | stage (intent → spec → ready → implement → qa → done → measure → closed) + links |
| `proposal.md` | why, what changes, out of scope, user stories, **measurable hypotheses**, decision log |
| `research.md` | findings with sources; learnings after launch |
| `specs/<capability>/spec.md` | delta spec; every requirement has **≥1 happy and ≥1 edge scenario** (ids `S1..Sn`, reused in test titles) |
| `design.md` | architecture (mermaid), data/contract changes, decisions, rollout/rollback |
| `tasks.md` | tracer-bullet slices (`## 1. T1 ... (blocked by: ...)`) with `- [ ] 1.1` boxes |
| `qa-report.md` | pass/fail per scenario |

After ship, `openspec archive <name> --yes` merges the spec into `openspec/specs/` (the living spec library).
Old folders here still work with the `/ticket` scripts and the HUD.
Set up once per repo: `openspec init --tools none`. See ~/GITHUB/claude-harness/skills/ticket.
