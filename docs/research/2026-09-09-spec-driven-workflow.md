# Research: Keolo's spec-driven "happy path + edge cases" loop, and the tools behind it

Date: 2026-09-09. All facts below were fetched from the linked pages today. Simple English on purpose.

## Summary (10 lines)

1. Keolo's `av` CLI is **not public**. Nothing on his GitHub, his site, or aliveness.ventures mentions it ([github.com/keolo](https://github.com/keolo), [aliveness.ventures](https://aliveness.ventures), [keolo.com](https://keolo.com/)).
2. **OpenSpec** is real and big: 67.8k stars, MIT, v1.12.0 on 2026-09-03. Specs use `### Requirement:` + `#### Scenario:` with **WHEN / THEN / AND** lines (not Given/When/Then) ([repo](https://github.com/Fission-AI/OpenSpec), [releases](https://github.com/Fission-AI/OpenSpec/releases.atom)).
3. **OKF = Google Cloud's Open Knowledge Format** (June 2026). It is a folder of Markdown files with YAML frontmatter. Only `type` is required. Links between files make the graph ([spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), [blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)).
4. Main alternatives: GitHub **Spec Kit** (134k stars, has Given/When/Then + an "Edge Cases" section), **Superpowers** (284k stars, brainstorm → plan → TDD), **BMAD** (53k), **Kiro** specs (EARS "WHEN ... THE SYSTEM SHALL"), **Tessl** (framework still closed beta).
5. Anthropic's own guide says: let Claude **interview you**, write `SPEC.md`, then start a fresh session; always give Claude a **check it can run** ([best practices](https://code.claude.com/docs/en/best-practices)).
6. **Definition of Ready** is useful but must be a guideline, not a hard gate (Mike Cohn, Agile Alliance). Decision logs = **MADR** ADRs in `docs/decisions/NNNN-title.md`.
7. **PostHog** closes the loop: experiments have a **hypothesis** field + primary/secondary metrics; surveys can target by feature flag; the Claude Code plugin gives `/posthog:experiments`, `/posthog:surveys`, etc. ([plugin](https://claude.com/plugins/posthog)).
8. **Agent QA**: Playwright MCP has `--caps=testing` with `browser_verify_*` assert tools; Playwright **Test Agents** (planner/generator/healer) work with Claude Code; **playwright-bdd** turns Given/When/Then `.feature` files into real Playwright tests. That is how to assert edge cases, not only happy paths.
9. **Tickets in repo → Linear**: Beads (`bd linear sync`), Linear MCP, `schpet/linear-cli`, Linear's own GitHub Issues two-way sync, and `gh issue`.
10. Community view: SDD works when specs stay **living and small**. Critics (Fowler's Böckeler, HN "Waterfall strikes back") warn about too many markdown files and specs drifting from code.

---

## 1. OpenSpec (Fission-AI/OpenSpec)

**What it is.** "Spec-driven development (SDD) for AI coding assistants." You agree on the spec before code is written. It supports 30+ tools (Claude Code, Cursor, Copilot, Codex, Zed...). 67.8k stars, 4.7k forks, MIT. Source: [github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec).

**Latest releases** (from the [Atom feed](https://github.com/Fission-AI/OpenSpec/releases.atom)): v1.12.0 (2026-09-03, "Findings Reports, SourceCraft"), v1.11.0 (2026-08-26, spec diffs + batch status), v1.10.0 (2026-08-19, Zed), v1.9.0 (2026-08-13), v1.8.0 (2026-08-05). So it ships about weekly.

**Folder layout** ([README](https://github.com/Fission-AI/OpenSpec)):
```
openspec/
  specs/<capability>/spec.md      # current truth, one file per capability
  changes/<change-name>/
    proposal.md                   # why + what changes + capabilities + impact
    specs/<capability>/spec.md    # DELTA spec (ADDED / MODIFIED / REMOVED / RENAMED)
    design.md                     # how (optional)
    tasks.md                      # checkbox list
  changes/archive/YYYY-MM-DD-<name>/   # done changes, merged into specs/
```

**Artifact order** (from [schema.yaml](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/schemas/spec-driven/schema.yaml)): proposal → specs → design → tasks. Tasks need both specs and design. Every requirement must have at least one scenario written with exactly four `#` (`####`). A change with no spec delta must set `skip_specs: true`.

**Templates** (fetched raw):
- [proposal.md](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/schemas/spec-driven/templates/proposal.md): `## Why`, `## What Changes`, `## Capabilities` (New / Modified), `## Impact`.
- [design.md](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/schemas/spec-driven/templates/design.md): `## Context`, `## Goals / Non-Goals`, `## Decisions` ("with rationale and alternatives considered"), `## Risks / Trade-offs`. This is the built-in **decision log**.
- [spec.md](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/schemas/spec-driven/templates/spec.md): `## Purpose`, `## ADDED Requirements` with WHEN/THEN scenarios.

**Spec format (exact).** From the README:
```markdown
## ADDED Requirements

### Requirement: Theme selection
The app SHALL let users switch between light and dark themes,
defaulting to the system preference.

#### Scenario: User toggles dark mode
- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
```
A real example from OpenSpec's own specs ([openspec-conventions/spec.md](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/openspec/specs/openspec-conventions/spec.md)) shows an **edge-case scenario**:
```markdown
#### Scenario: Handling conflicts during archive
- **WHEN** delta changes conflict with current spec state
- **THEN** the archive command SHALL report specific conflicts
- **AND** require manual resolution before proceeding
```
Note: OpenSpec uses **WHEN / THEN / AND**, not Given/When/Then. Nothing in the templates forces an edge-case scenario. Keolo's "each scenario = happy path + edge cases" is his own rule on top of OpenSpec. You can add "Given" lines as a convention; the validator only checks the `####` scenario heading count.

**CLI commands** ([README](https://github.com/Fission-AI/OpenSpec), [installation.md](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/installation.md)): `npm install -g @fission-ai/openspec@latest`; `openspec init --tools <ids>`; `openspec update`; `openspec validate`; `openspec config profile`. Init writes tool files and a marker block in `CLAUDE.md` / `AGENTS.md`. Node 20.19+.

**Slash commands in Claude Code** (spelled `/opsx:` for Claude): default profile = `/opsx:explore`, `/opsx:propose <idea>`, `/opsx:apply`, `/opsx:archive`. Expanded profile adds `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive`, `/opsx:onboard` ([README](https://github.com/Fission-AI/OpenSpec)). Also a beta "Stores" feature for shared specs across repos.

**Issues.** 119 open. Recent ones are mostly parser bugs that fail silently: requirements outside delta sections dropped (#1803), repeated delta headers discard requirements (#1801), REMOVED/RENAMED with `*`/`+` bullets ignored (#1799), archive rewrites text inside code fences (#1797). No issues about Linear/Jira sync or knowledge graphs ([issues](https://github.com/Fission-AI/OpenSpec/issues)). Lesson: run `openspec validate` in CI and keep specs simple.

**Community opinion.**
- dev.to comparison (2026-04-23): OpenSpec is best for **existing codebases** because of the ADDED/MODIFIED/REMOVED delta discipline; Spec Kit for new projects; BMAD for compliance. All three share **spec drift** when the agent adapts during coding ([dev.to](https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j)).
- One blog timed the same CRM task: OpenSpec 12 min, Spec Kit 90 min, BMAD 5.5 h ([nosam.com](https://www.nosam.com/spec-driven-development-openspec-vs-spec-kit-vs-bmad-which-ones-actually-worth-your-time/)).
- OpenSpec "has no review gates between phases" — fast but not enforced ([reenbit](https://reenbit.com/bmad-vs-spec-kit-vs-openspec-choosing-your-spec-driven-ai-framework/)).

---

## 2. OKF / Open Knowledge Format

**It exists, and it is Google's.** Google Cloud (Data Cloud team, Sam McVeety and Amir Hormati) published OKF on **2026-06-13**. It "formalizes the LLM-wiki pattern" (Karpathy's idea of an agent-maintained wiki) into a portable format ([Google Cloud blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)). Spec and tools: [GoogleCloudPlatform/knowledge-catalog/okf](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md). Current spec is **v0.2**.

**Core rule.** "One file = one concept." A bundle is a directory of Markdown files with YAML frontmatter. The spec says: "If you can `cat` a file, you can read OKF; if you can `git clone` a repo, you can ship it" ([SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)).

**Frontmatter** ([SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)):
- Required: `type` (free string, e.g. "Metric", "Playbook", "Proposal").
- Recommended: `title`, `description`, `resource` (URI of the thing), `tags`.
- Trust: `sources: [{id, resource, title, author, usage_count, last_modified}]`, `generated: {by, at}`, `verified: [{by, at}]`.
- Lifecycle: `status: draft | stable | deprecated`, `stale_after`.
- Actor ids: `human:<id>`, `process:<id>`, `<agent>/<version>`.
- Trust tiers come from `verified`: unverified → machine-confirmed → human-reviewed.

Example from the spec:
```yaml
---
type: BigQuery Table
title: Customer Orders
description: One row per completed customer order across all channels.
tags: [sales, orders, revenue]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-05-28T14:30:00Z }
verified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }
status: stable
sources:
  - id: ga4-schema
    resource: https://developers.google.com/analytics/bigquery/export-schema
---
```

**Links = graph edges.** Concepts link with normal Markdown links. Bundle-relative absolute paths (`/tables/customers.md`) are recommended. The kind of edge (parent, depends-on, related) "is conveyed by surrounding prose, not by the link itself." Broken links are allowed. Reserved files: `index.md` (directory listing for progressive disclosure) and `log.md` (history). Consumers must not reject unknown `type` values or extra keys ([SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)).

**Viewer.** Google ships a static single-file HTML viewer that shows a bundle as an interactive graph, no backend ([blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)).

**What is NOT in OKF.** There is no `related:` frontmatter key and no "sub-graph query" command in the spec. The graph is just links. "Sub-graph queries to save tokens" is Keolo's tool reading only the files linked from a start file (plus `index.md`), instead of the whole `docs/`. The OKF `sources` array matches his "sources" idea; his "related" is probably plain links or a custom key (allowed by the spec).

**Closest alternatives** if you do not want OKF: Obsidian-style `[[wikilinks]]` vaults (what the mmv-tech vault already is), and Superpowers' plain `docs/superpowers/specs/` + `plans/` folders. OKF is nicer because frontmatter carries `type`, `status`, `sources`, `verified`.

---

## 3. Spec-driven alternatives, compared

| Tool | Artifacts | Loop | Claude Code | Maturity / size | Source |
|---|---|---|---|---|---|
| **OpenSpec** | proposal, delta specs (WHEN/THEN), design, tasks | explore → propose → apply → archive | `/opsx:*` commands | 67.8k stars, weekly releases, 119 open issues | [repo](https://github.com/Fission-AI/OpenSpec) |
| **GitHub Spec Kit** | constitution, `specs/###-feature/spec.md`, `plan.md`, `tasks.md` | constitution → specify → clarify → plan → tasks → analyze → implement → converge; optional `checklist`, `taskstoissues` | `/speckit.*` commands; 30+ agents | 134.4k stars, v1.0.0, MIT, Python `uv tool install specify-cli` | [repo](https://github.com/github/spec-kit) |
| **Superpowers** (obra) | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | brainstorming → git worktree → writing-plans → subagent-driven-development or executing-plans → TDD → code review → finish branch | official plugin marketplace; also Codex, OpenCode, Cursor | 283.9k stars, MIT | [repo](https://github.com/obra/superpowers), [brainstorming](https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md), [writing-plans](https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md) |
| **BMAD Method** | `docs/prd.md`, `docs/architecture.md`, stories | clarify → plan → build & verify → learn & adjust; agent personas (PM, architect, dev, QA) | `bmad` + `bmad-build` skills | 52.8k stars, v6.12.0 (2026-09-04), MIT | [repo](https://github.com/bmad-code-org/BMAD-METHOD), [releases](https://github.com/bmad-code-org/BMAD-METHOD/releases.atom) |
| **Kiro specs** (AWS) | `requirements.md` (EARS), `design.md` (diagrams), `tasks.md` | requirements → design → tasks; tasks run in dependency "waves" | Kiro IDE only | AWS product | [docs](https://kiro.dev/docs/specs/), [feature specs](https://kiro.dev/docs/specs/feature-specs/) |
| **Tessl** | `.spec.md` capability specs with `@generate` / `@describe`, tests linked to capabilities | spec → generate → tests as guardrails | Tiles work in MCP agents incl. Claude Code | Registry open beta; **Framework closed beta** since 2025-09-23 | [launch post](https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry), [Fowler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) |

**Details that matter for Keolo's loop:**
- **Spec Kit's spec template** already has: user stories with P1/P2/P3, acceptance scenarios in **Given/When/Then**, an explicit **Edge Cases** section, `FR-###` requirements, Success Criteria, and `[NEEDS CLARIFICATION]` markers ([spec-template.md](https://raw.githubusercontent.com/github/spec-kit/main/templates/spec-template.md)). This is the closest public template to "happy path + edge cases = success criteria."
- **Kiro EARS format:** `WHEN [condition/event] THE SYSTEM SHALL [expected behavior]`. Example: "WHEN a user submits a form with invalid data THE SYSTEM SHALL display validation errors next to the relevant fields" ([Kiro docs](https://kiro.dev/docs/specs/feature-specs/)). Community guides say files live in `.kiro/specs/<feature>/` ([kiro.directory](https://kiro.directory/tips/spec-writing)).
- **Superpowers brainstorming** = Keolo's "grilling" session. It classifies work as spike / bounded / architectural, asks **one question at a time**, proposes 2-3 approaches, and needs approval before code. Then `writing-plans` makes tasks of 2-5 minutes each with a 5-step TDD flow and "zero placeholders" ([brainstorming](https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md), [writing-plans](https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md)). Google's own Antigravity CLI codelab uses Superpowers for SDD ([codelab](https://codelabs.developers.google.com/sdd-agy-cli)).
- **Sean Grove ("The New Code", OpenAI, AI Engineer World's Fair):** specs are the real source; code is a lossy projection. Quotes: "Code is sort of 10% to 20% of the value that you bring," and "The person who communicates most effectively is the most valuable programmer." OpenAI's Model Spec has testable clauses with IDs that link to eval prompts ([transcript](https://lawwu.github.io/transcripts/8rABwKRsec4.html), [AI Engineer](https://ai.engineer/speakers/sean-grove)). This is the theory behind "spec → tests + evals."
- **Anthropic guidance** ([Claude Code best practices](https://code.claude.com/docs/en/best-practices)): explore → plan → implement → commit; "Let Claude interview you" with `AskUserQuestion` about "edge cases, concerns, and tradeoffs," then "write a complete spec to SPEC.md" and start a fresh session. Give Claude a check it can run (tests, build, screenshot). Use `/goal`, a **Stop hook**, or a **verification subagent** as gates. Warns about "the trust-then-verify gap" where code "doesn't handle edge cases."

**Critics (read before adopting):**
- Birgitta Böckeler on martinfowler.com (2025-10-15): "I'd rather review code than all these markdown files"; one-size workflow, waterfall risk, LLMs still ignore specs ([article](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html), HN 128 points).
- HN thread "Spec-Driven Development: The Waterfall Strikes Back" (225 points, 191 comments): supporters report 2-3 h of spec then same-day tested delivery; critics say specs and code diverge on big projects ([HN](https://news.ycombinator.com/item?id=45935763)).
- "Verified SDD" gist (HN 211 points) adds TDD + adversarial reviewer in a fresh context + traceability spec → test → code ([gist](https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00)).
- Take-away: keep specs **small per change** (OpenSpec deltas), let them change during implementation, and always end with a runnable check.

---

## 4. Definition of Ready, decision logs, ADRs (short)

- **Definition of Ready (DoR)** = criteria a story must meet before work starts. Usually INVEST + clear acceptance criteria + estimate + known dependencies ([Agile Alliance](https://agilealliance.org/glossary/definition-of-ready/), [Scrum.org](https://www.scrum.org/resources/blog/ready-or-not-demystifying-definition-ready-scrum)). Not in the Scrum Guide.
- **Warning:** Mike Cohn says a strict DoR "becomes a huge step towards a sequential, stage-gate approach." Use guidelines, not 100%-done rules ([Mountain Goat](https://www.mountaingoatsoftware.com/agile/the-dangers-of-a-definition-of-ready)). For agents this matters: a "Ready" gate should be a **checklist the agent can verify** (spec validates, each scenario has a happy path and at least one edge case, open questions resolved), not a human meeting.
- **ADR** = one file per decision: Title, Status, Context, Decision, Consequences ([adr.github.io](https://adr.github.io/)). **MADR 4.0.0** adds Decision Drivers, Considered Options, Decision Outcome, Pros and Cons, Confirmation; files in `docs/decisions/NNNN-title-with-dashes.md` ([MADR](https://adr.github.io/madr/)).
- OpenSpec's `design.md` "Decisions" section and Spec Kit's `plan.md` are lightweight ADRs inside the change. Keolo's "decision log of options selected/rejected" = MADR's Considered Options + Decision Outcome. Keep the per-ticket log in the change folder; promote big ones to `docs/decisions/`.

---

## 5. Measure loop: PostHog + agents

- **PostHog MCP**: hosted at `https://mcp.posthog.com/mcp`; install with `npx @posthog/wizard mcp add`. Tools cover feature flags, experiments, insights/HogQL, error tracking, surveys ([docs](https://posthog.com/docs/model-context-protocol)).
- **Claude Code plugin**: `claude plugin install posthog`, "27+ PostHog tools", 12 slash commands incl. `/posthog:flags`, `/posthog:experiments`, `/posthog:surveys`, `/posthog:errors`, `/posthog:insights`; 13,453 installs ([plugin page](https://claude.com/plugins/posthog)).
- **Experiments carry the hypothesis.** Creating an experiment = (1) name + **hypothesis** + feature flag, (2) variant rollout (control + test), (3) primary and secondary metrics. Metrics should be set before launch "to avoid analysis bias" ([docs](https://posthog.com/docs/experiments/creating-an-experiment)).
- **Surveys** target by "events, properties, cohorts, and feature flags"; answers become events you can query and tie to session replays; there is an API to pull responses ([docs](https://posthog.com/docs/surveys)).
- **PostHog agent skills** live in the PostHog monorepo under `products/*/skills/` and sync into Claude Code as `SKILL.md` folders; examples include experiment creation and flag audits ([handbook](https://posthog.com/handbook/engineering/ai/writing-skills), [skills list](https://mcpservers.org/agent-skills/author/posthog)).

**How to close the loop (spec → analytics → next spec):**
1. In `proposal.md`, write each hypothesis as: metric, direction, threshold, time window (e.g. "day-7 return rate of PMAC users goes from 30% to 40% within 2 weeks").
2. When you ship, the `measure` step creates one PostHog **feature flag** per feature and, if there is a real A/B, an **experiment** whose hypothesis text is copied from the proposal. Add a **survey** targeted to that flag for qualitative feedback.
3. After N days, an agent skill queries the experiment results + survey responses via MCP and writes `learnings.md` (or a "Learnings" section in `research.md`) with links to the PostHog insight.
4. Errors from production (Sentry / PostHog error tracking) become new **edge-case scenarios** in the spec and new regression tests. Anthropic's eval guide lists good edge inputs: empty/irrelevant input, very long input, typos, sarcasm, ambiguous cases ([develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)). For Becca (LLM feature), each scenario also becomes an **eval case** graded by code or by a separate Claude model.

---

## 6. Agent QA of a Next.js app: assert edge cases, not only happy paths

**Tools (all primary docs):**
- **Playwright MCP** (Microsoft). Uses accessibility-tree snapshots, not screenshots. `claude mcp add playwright npx @playwright/mcp@latest`. With `--caps=testing` you get **assert tools**: `browser_verify_element_visible`, `browser_verify_text_visible`, `browser_generate_locator` ([README](https://github.com/microsoft/playwright-mcp)). This is the missing piece for Anthony: the agent can *assert*, not just click.
- **Playwright Test Agents** (planner → generator → healer). `npx playwright init-agents --loop=claude` writes Claude Code agent definitions. Planner explores the app and writes a Markdown test plan (scenarios with numbered steps + expected results). Generator turns the plan into `.spec.ts` and **verifies each selector and assertion live**. Healer fixes broken tests ([docs](https://playwright.dev/docs/test-agents)).
- **Claude Code + Chrome**: `claude --chrome`; uses your logged-in browser; can read console errors, network, DOM, take screenshots, record GIFs. Example prompt from the docs: "try submitting the form with invalid data, and check if the error messages appear correctly" ([docs](https://code.claude.com/docs/en/chrome)). Good for exploratory QA; not a test suite.
- **Chrome DevTools MCP** (Google): `npx -y chrome-devtools-mcp@latest`; console with source-mapped stacks, network, **performance traces**, JS eval ([repo](https://github.com/ChromeDevTools/chrome-devtools-mcp)). Use for perf and debugging, not for assertions.
- **playwright-bdd**: runs Gherkin `.feature` files on the Playwright runner via `bddgen`; each Scenario becomes a native test; supports "exporting steps for AI agents" ([repo](https://github.com/vitalets/playwright-bdd), 774 stars).
- **Gherkin**: `Given / When / Then / And / But`, `Background`, `Scenario Outline` + `Examples` table, tags ([Cucumber reference](https://cucumber.io/docs/gherkin/reference/)).
- **Visual regression**: `await expect(page).toHaveScreenshot()`; baseline in `<file>-snapshots/`; `--update-snapshots`; `maxDiffPixels`; commit snapshots ([Playwright](https://playwright.dev/docs/test-snapshots)).

**Recipe: scenario → test mapping so edge cases are asserted**
1. Write each spec scenario with **one happy path and named edge cases** in Given/When/Then. Use `Scenario Outline` + `Examples` for input tables (empty, too long, invalid email, offline, double-click, expired session).
2. Keep a stable id per scenario (e.g. `MMV-278-S3`). Put the id in the test title. Now "every scenario has a test" is a grep check an agent or a CI script can run.
3. Generate tests two ways: (a) playwright-bdd if you keep `.feature` files; (b) Playwright's **generator agent** from a Markdown plan that you write *from the spec*, not from exploring the app. Exploring only finds what exists; the spec knows what should fail.
4. Every edge-case test must end with an **assertion on the failure behaviour** (error text, disabled button, 4xx in network, no navigation). Playwright MCP `browser_verify_text_visible` gives an agent the same ability during a live check.
5. Add `toHaveScreenshot()` only on stable screens (Becca chat bubbles, not timestamps). Mask dynamic parts.
6. Gate: a Claude Code **Stop hook** or `/goal` runs `npx playwright test` and blocks "done" until green ([best practices](https://code.claude.com/docs/en/best-practices)). A **verification subagent** with a fresh context re-checks "every scenario in spec.md has a test and the edge cases are asserted."
7. Production bugs → new `#### Scenario:` + new test (regression) + eval case if LLM-related.

---

## 7. Tickets in the repo, synced to Linear

| Tool | What it does | Sync | Source |
|---|---|---|---|
| **Linear MCP** (official) | `claude mcp add --transport http linear-server https://mcp.linear.app/mcp`; OAuth via `/mcp`; read-only URL available; tools to find/create/update issues, projects, comments | live API, not a repo file | [Linear docs](https://linear.app/docs/mcp) |
| **Linear ↔ GitHub Issues sync** (official) | one-way or **two-way** sync of issues between a GitHub repo and a Linear team; syncs title, description, status, assignee, labels, sub-issues, comments in synced threads | only **new** issues; one repo per team for two-way | [Linear docs](https://linear.app/docs/github) |
| **Linear agents** | assign an issue to an agent (Claude Code, Cursor...) or @mention it; "agent guidance" text tells agents repo and PR rules | n/a | [Linear docs](https://linear.app/docs/agents-in-linear) |
| **Beads** (`bd`, Steve Yegge) | git-native issue graph for agents; Dolt-backed; `bd create`, `bd ready`, `bd close`, `bd prime`; hash ids like `bd-a1b2`; 27k stars | `bd linear sync --pull / --push / (both)`; conflict: timestamp, `--prefer-local`, `--prefer-linear`; maps priority, state, labels→type, blocking relations; **no** comments, attachments, cycles | [README](https://github.com/gastownhall/beads/blob/main/README.md), [linear-workflow](https://github.com/gastownhall/beads/blob/main/examples/linear-workflow/README.md) |
| **schpet/linear-cli** | `linear issue list / start / create / pr / view`; reads issue id from branch name (`eng-123-...`); `--json`; Claude Code plugin + skill; 954 stars | reads/writes Linear directly | [repo](https://github.com/schpet/linear-cli) |
| **gh issue** | `create, list, view, edit, close, comment, develop` (branch from issue) | GitHub only | [gh manual](https://cli.github.com/manual/gh_issue) |
| **Spec Kit** `/speckit.taskstoissues` | turns `tasks.md` into GitHub Issues | one-way to GitHub | [repo](https://github.com/github/spec-kit) |

Practical pattern for MMV: keep `tickets.md` (or Beads) in the change folder as the source of truth; a deterministic script pushes to Linear with the Linear MCP or `linear-cli`; branch name carries the Linear id so Linear's own GitHub integration links the PR automatically ([Linear GitHub docs](https://linear.app/docs/github)).

---

## 8. Aliveness Ventures / Keolo Keagy: what is public

- **Aliveness Ventures** (not "Liveness"): an innovation studio in SF / LA building MVPs in 8-12 weeks for health, education, and social-good orgs. Team of six incl. Keolo Keagy (Engineering & AI). **No tools, CLI, or open-source listed** ([aliveness.ventures](https://aliveness.ventures)).
- **Keolo's GitHub** (`keolo`): 8 public repos; pinned `mixpanel_client` (Ruby, 146 stars) and `population` (Go). **No repo named av, aliveness, spec, or okf** ([github.com/keolo](https://github.com/keolo)).
- **keolo.com**: Fractional CTO / Partner at Aliveness Ventures; one blog post found, "Your AI Doesn't Just Need Guardrails. It Needs a Harness." (argues production failures come from infrastructure around the model, not prompts). No mention of `av`, OpenSpec, or OKF ([keolo.com](https://keolo.com/)). A direct URL for the post was not found via search.
- LinkedIn / X profiles exist ([linkedin.com/in/keolo](https://www.linkedin.com/in/keolo/), [x.com/keolo_keagy](https://x.com/keolo_keagy)) but were not fetchable; no public posts about `av` surfaced in search.
- **Conclusion:** the `av` CLI is private. Everything he described maps to public pieces: OpenSpec (spec/proposal/design/tasks), OKF (docs graph), Superpowers-style skills (grilling/brainstorm, plans, TDD), Beads or Linear MCP (tickets), PostHog MCP (measure).

---

## How to rebuild Keolo's loop with Claude Code today

**Big picture:** OpenSpec gives the change folder and validator. OKF frontmatter gives the knowledge graph. Claude Code skills give the interview, the ready-check, the TDD loop, the QA run, and the measure step. Hooks make the gates deterministic. Linear MCP and PostHog MCP are the two external syncs.

### Step 0: install
```bash
npm install -g @fission-ai/openspec@latest && openspec init --tools claude   # OpenSpec
claude plugin install posthog                                              # PostHog MCP + skills
claude mcp add --transport http linear-server https://mcp.linear.app/mcp   # Linear MCP
claude mcp add playwright npx @playwright/mcp@latest --caps=testing         # browser asserts
npx playwright init-agents --loop=claude                                   # planner/generator/healer
```
Optional: install `superpowers` from the Claude plugin marketplace for brainstorming / writing-plans / TDD skills ([superpowers](https://github.com/obra/superpowers)).

### Folder layout (OpenSpec + OKF + Keolo's per-ticket folder)
```
docs/
  index.md                       # OKF directory index
  log.md                         # OKF change history
  decisions/0001-....md          # MADR ADRs for big decisions
  changes/
    MMV-278-evening-ritual/      # <LINEAR-ID>-<slug>
      proposal.md                # type: Proposal  (unknowns, hypotheses, decision log)
      research.md                # type: Research  (findings table, prior art, learnings)
      spec.md                    # type: Spec      (user stories, scenarios, happy + edge)
      design.md                  # type: Design    (mermaid diagrams, decisions)
      tickets.md                 # type: Tickets   (synced to Linear)
      tests/                     # generated Playwright specs (or link to e2e/)
openspec/                        # keep OpenSpec's own tree if you use /opsx:* as-is
.claude/skills/                  # the skills below
.claude/agents/verifier.md       # fresh-context reviewer
```
If you prefer to stay 100% OpenSpec-compatible, put the change folder under `openspec/changes/MMV-278-evening-ritual/` and keep `research.md` and `tickets.md` as extra files; `openspec validate` ignores unknown files.

### File templates (OKF frontmatter + OpenSpec body)

`proposal.md`
```markdown
---
type: Proposal
title: MMV-278 Evening 5-turn ritual
status: draft
tags: [pmac, becca]
resource: https://linear.app/mmv/issue/MMV-278
sources:
  - id: linear
    resource: https://linear.app/mmv/issue/MMV-278
---
## Why
## What Changes
## Key unknowns
- U1: ...
## Hypotheses (measurable)
- H1: metric=..., from X to Y, within N days, flag=`pmac-evening-ritual`
## Decision log
| # | Options considered | Selected | Rejected because |
## Links
- Research: [research.md](research.md) · Spec: [spec.md](spec.md)
```

`spec.md` (OpenSpec body; Given/When/Then allowed as extra lines)
```markdown
---
type: Spec
title: MMV-278 Evening ritual spec
status: draft
---
## Purpose
## ADDED Requirements
### Requirement: Evening ritual has exactly 5 turns
The system SHALL end the evening ritual after 5 user turns.

#### Scenario: S1 happy path — user completes 5 turns
- **GIVEN** a PMAC user on day 3 with no ritual today
- **WHEN** the user sends the 5th message
- **THEN** Becca sends the closing message and marks day 3 done

#### Scenario: S2 edge — user leaves after turn 2 and returns next day
- **WHEN** the user returns after 24h
- **THEN** the ritual restarts at turn 1 and the old draft is discarded

#### Scenario: S3 edge — empty message
- **WHEN** the user sends an empty message
- **THEN** the turn does not count and Becca asks again
```
Rule: every Requirement has ≥1 happy scenario and ≥1 edge scenario. Ids `S1..Sn` go into test titles.

`research.md`
```markdown
---
type: Research
sources:
  - id: ...
    resource: https://...
---
## Question
## Findings
| Finding | Supports / refutes | Source |
## Prior art
## Learnings after launch (filled by /measure)
```

`design.md`: OpenSpec's Context / Goals / Non-Goals / Decisions / Risks + a `## Architecture` section with a ```mermaid``` diagram.

`tickets.md`
```markdown
---
type: Tickets
---
| id | title | status | linear_id | scenarios |
| T1 | DB: ritual_turn table | todo | MMV-281 | S1,S2 |
```

### Skills (put in `.claude/skills/<name>/SKILL.md`, format from [Claude docs](https://code.claude.com/docs/en/skills))
1. `/intent` — takes a Linear id (`argument-hint: [MMV-123]`), pulls the issue via Linear MCP, creates the folder + frontmatter.
2. `/grill` — the interview. Reuse `superpowers:brainstorming` or the Anthropic prompt: "Interview me in detail using the AskUserQuestion tool. Ask about ... edge cases, concerns, and tradeoffs" ([best practices](https://code.claude.com/docs/en/best-practices)). Writes proposal + spec + design. Spawns a `context: fork` research subagent that writes `research.md`.
3. `/ready` — Definition of Ready check (deterministic script + review): `openspec validate` passes; every requirement has ≥1 edge scenario; no `[NEEDS CLARIFICATION]` left; hypotheses have metric + threshold; `status: stable`. Prints a checklist, does not block forever (Cohn's warning).
4. `/implement` — TDD per scenario: red → green → refactor (`superpowers:test-driven-development` or your `tdd-loop` skill). Writes test titles as `S1 happy: ...`.
5. `/qa` — runs Playwright generator from the scenarios, runs `npx playwright test`, uses Playwright MCP `browser_verify_*` for a live pass, saves screenshots.
6. `/done` — verifier subagent (fresh context) checks scenario→test coverage, then `ship-it` opens the PR with the Linear id in the branch.
7. `/measure` — creates the PostHog flag/experiment with the hypothesis text, a survey targeted to the flag; later reads results via `/posthog:experiments` and appends "Learnings" to `research.md` and new edge scenarios to `spec.md`.
8. `/sync-linear` — `disable-model-invocation: true`; a script that pushes `tickets.md` rows to Linear through the MCP or `linear-cli` and writes back ids.
9. `/next` — reads the folder state (which files exist, `status`, test results) and suggests the next skill. This is Keolo's "suggest next action from repo state."

### Deterministic gates (hooks)
- **Stop hook** runs `openspec validate && npm test && npx playwright test`; blocks the turn until green (max 8 blocks) ([best practices](https://code.claude.com/docs/en/best-practices)).
- **PreToolUse hook** blocks edits to `prisma/migrations/` unless via `db:migrate` (team rule).
- CI: same commands + a script that fails if a `#### Scenario:` id has no matching test title.

### Knowledge graph queries without a custom CLI
- Every doc links to its siblings with bundle-relative links (`/docs/changes/MMV-278-evening-ritual/spec.md`).
- A tiny script (`scripts/okf-subgraph.sh <file> <depth>`) prints the file plus linked files up to depth N; skills call it instead of reading all of `docs/`. Google's static viewer renders the same links as a graph ([OKF blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)).

### What I am not sure about
- Whether Keolo's `av` adds custom OKF keys (like `related:`). The OKF spec allows unknown keys, so either way it stays valid.
- Exact Playwright MCP tool names can change between versions; re-check the README when installing.
- OpenSpec's validator is strict about `####` scenario headings and delta sections; test the Given/When/Then extra lines with `openspec validate` before adopting them team-wide.

---

## Sources

Primary
- OpenSpec repo: https://github.com/Fission-AI/OpenSpec
- OpenSpec releases feed: https://github.com/Fission-AI/OpenSpec/releases.atom
- OpenSpec issues: https://github.com/Fission-AI/OpenSpec/issues
- OpenSpec schema: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/schemas/spec-driven/schema.yaml
- OpenSpec templates: https://github.com/Fission-AI/OpenSpec/tree/main/schemas/spec-driven/templates (proposal.md, spec.md, design.md, tasks.md)
- OpenSpec dogfood spec: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/openspec/specs/openspec-conventions/spec.md
- OpenSpec install: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/installation.md
- OKF spec v0.2: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- OKF announcement: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
- Spec Kit: https://github.com/github/spec-kit ; template: https://raw.githubusercontent.com/github/spec-kit/main/templates/spec-template.md
- Superpowers: https://github.com/obra/superpowers ; brainstorming and writing-plans SKILL.md (raw links above)
- BMAD: https://github.com/bmad-code-org/BMAD-METHOD ; releases: https://github.com/bmad-code-org/BMAD-METHOD/releases.atom
- Kiro specs: https://kiro.dev/docs/specs/ ; https://kiro.dev/docs/specs/feature-specs/
- Tessl launch: https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry
- Antigravity SDD codelab: https://codelabs.developers.google.com/sdd-agy-cli
- Claude Code best practices: https://code.claude.com/docs/en/best-practices
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code + Chrome: https://code.claude.com/docs/en/chrome
- Anthropic eval guide: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Playwright Test Agents: https://playwright.dev/docs/test-agents
- Playwright snapshots: https://playwright.dev/docs/test-snapshots
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
- playwright-bdd: https://github.com/vitalets/playwright-bdd
- Gherkin reference: https://cucumber.io/docs/gherkin/reference/
- PostHog MCP: https://posthog.com/docs/model-context-protocol ; plugin: https://claude.com/plugins/posthog
- PostHog experiments: https://posthog.com/docs/experiments/creating-an-experiment ; surveys: https://posthog.com/docs/surveys ; skills handbook: https://posthog.com/handbook/engineering/ai/writing-skills
- Linear MCP: https://linear.app/docs/mcp ; GitHub sync: https://linear.app/docs/github ; agents: https://linear.app/docs/agents-in-linear
- Beads: https://github.com/gastownhall/beads/blob/main/README.md ; Linear workflow: https://github.com/gastownhall/beads/blob/main/examples/linear-workflow/README.md
- linear-cli: https://github.com/schpet/linear-cli
- gh issue: https://cli.github.com/manual/gh_issue
- ADR: https://adr.github.io/ ; MADR: https://adr.github.io/madr/
- Definition of Ready: https://agilealliance.org/glossary/definition-of-ready/ ; https://www.mountaingoatsoftware.com/agile/the-dangers-of-a-definition-of-ready ; https://www.scrum.org/resources/blog/ready-or-not-demystifying-definition-ready-scrum
- Keolo / Aliveness: https://github.com/keolo ; https://aliveness.ventures ; https://keolo.com/

Secondary
- Sean Grove transcript: https://lawwu.github.io/transcripts/8rABwKRsec4.html ; https://ai.engineer/speakers/sean-grove
- Böckeler, martinfowler.com: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- HN "Waterfall Strikes Back": https://news.ycombinator.com/item?id=45935763
- VSDD gist: https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00
- dev.to SDD comparison: https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j
- nosam.com timing comparison: https://www.nosam.com/spec-driven-development-openspec-vs-spec-kit-vs-bmad-which-ones-actually-worth-your-time/
- reenbit comparison: https://reenbit.com/bmad-vs-spec-kit-vs-openspec-choosing-your-spec-driven-ai-framework/
- Kiro folder layout (community): https://kiro.directory/tips/spec-writing
- PostHog skills list: https://mcpservers.org/agent-skills/author/posthog
