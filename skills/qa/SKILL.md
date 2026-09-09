---
name: qa
description: Check a change against its spec scenarios - run the scenario tests, do a live browser walk with the Playwright MCP, write qa-report.md with a pass/fail table per S-id. Use after implementing, before the PR. Report only; writes tests only when asked.
argument-hint: "[docs/changes/<ID>-<slug>] [--write-tests]"
disable-model-invocation: true
---

# /qa

Dispatch the `qa` agent (fresh context, so the main session stays small):

> Use the Agent tool with `subagent_type: qa`. Prompt: "Change folder: <path>. Mode: report (or write-tests). Dev server URL if running: <url>. Read spec.md, run the tests whose titles carry the S-ids, do a live pass for scenarios without tests, write qa-report.md, return the table."

When it returns, show Larry the table and the gaps. If any **edge** scenario has no test, say it plainly: "S3 edge has no test — this is exactly the kind of bug that reaches users."

If Larry says `--write-tests`, run again in write mode: the agent adds `e2e/<slug>.spec.ts` (Playwright) or unit tests next to the code, titles `S1 happy: ...`, then re-runs.
