---
name: implement-spec
description: "Implement a specification in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The goal is a PR which implements the entire spec on a single branch.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for **maximum concurrency**.

## Steps

1. Read the spec and tickets. Read enough to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Use the current branch (create one from the repo's base branch if you are on it). When called from `/ticket`, do NOT open a PR: `/ticket` Step 6 runs the review gate and `/ship-it`. Called on its own, open a draft PR that closes the spec issue and tickets.

4. Use **implementer subagents** to implement each ticket. Each implementer subagent should work in its own worktree, on its own branch. Each one works test-first and titles tests with the scenario ids (`S1 happy: ...`, `S2 edge: ...`), and ticks its `- [x]` boxes in `tasks.md`.

5. Once an **implementer subagent** completes, merge its work to the PR branch with a **merger subagent**.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete: when called from `/ticket`, stop and report which S-ids are green (Step 6 reviews). On its own, run /code-review and /ponytail-review on the branch, fix the real findings in a single **implementer subagent**, then mark the PR as ready for review.

8. Never merge.

9. Clean up all **implementer subagent** worktrees.
