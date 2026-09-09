# Issue tracker for agent skills

Tracker: **Linear**, team "Manifest Movies", key `MMV`. Use the Linear MCP tools
(`get_issue`, `save_issue`, `list_issues`, `save_comment`).

- Create an issue: `save_issue` with team MMV. Put the id in the branch name (`larry/mmv-123-slug`) so Linear links the PR by itself.
- Read an issue: `get_issue` with `MMV-123` or the URL.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` (create once in Linear if missing).
- Blocking: Linear's native "blocked by". Sub-issues: parent/child.
- Base branch for PRs: `dev`. Never `main`. Larry never merges his own PR.

## Wayfinding operations (for /wayfinder)
- The **map** is a Linear issue labelled `wayfinder:map`; tickets are its child issues, labelled `wayfinder:<research|prototype|grilling|task>`.
- **Claim** = assign to yourself before working it.
- **Frontier** = open children with no open "blocked by" and no assignee (`list_issues` on the parent, filter client-side).
- **Resolve** = answer as a comment, mark Done, add one line to the map's "Decisions so far".

## PRs as a request surface
Off. Only issues are triaged.
