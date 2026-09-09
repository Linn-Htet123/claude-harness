# Issue tracker for agent skills

Pick ONE and delete the others.

## Option A — GitHub Issues (default for personal repos)
- Create: `gh issue create --title ... --body ... --label ...`
- Read: `gh issue view <n> --comments`
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
- Blocking: native "blocked by" (sub-issues + dependencies).

## Option B — Linear
- Use the Linear MCP tools (`get_issue`, `save_issue`, `list_issues`, `save_comment`). Team key: `<KEY>`.
- Put the id in the branch name (`larry/key-123-slug`) so Linear links the PR by itself.
- Blocking: Linear "blocked by" relation. Sub-issues: parent/child.

## Wayfinding operations (for /wayfinder)
- The **map** is one issue labelled `wayfinder:map`; tickets are its children, labelled `wayfinder:<research|prototype|grilling|task>`.
- **Claim** = assign the ticket to yourself before working.
- **Frontier** = open children with no open blocker and no assignee.
- **Resolve** = answer as a comment, close it, add one line to the map's "Decisions so far".

## PRs as a request surface
Off.
