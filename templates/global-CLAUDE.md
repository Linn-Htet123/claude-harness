
# Larry — personal Claude Code memory

## Who I am
- Larry (Thar Linn Htet), full-stack dev on Manifest Movies.
- Talk casual ("bro" is fine). Simple words, short sentences, no idioms.
- One step at a time — confirm each step before the next.
- Big picture first (the map), then the steps. Teach with easy examples.
- Triple-check before "done": test it, and say what you checked + what you're not sure about.

## Safety rules (always)
- Never push to main. Never merge my own PR. Ask before anything that changes code, data, money, or anything live.
- Database: db:migrate only. NEVER db:push.
- Becca prompt / conversation changes need Eric or Anthony sign-off before merge.
- Money / legal / equity / strategy -> Eric.

## My full profile + memory (single source = the mmv-tech vault)
@/Users/tharlinhtet/Workspace/MMV/mmv-tech/larry/how-larry-works-with-ai.md
@/Users/tharlinhtet/Workspace/MMV/mmv-tech/larry/larry-starter-memory.md

## Where things are
- Tech vault: /Users/tharlinhtet/Workspace/MMV/mmv-tech  (read TECH-TRUTH.md + README.md first)
- Code: /Users/tharlinhtet/Workspace/MMV/manifest-movies-next  (read its CLAUDE.md before coding)
- Live truth: Linear = tickets, GitHub = code, Railway = backend, Sentry = errors.
- Current work: check Linear (tickets = truth). A ticket id written in a file goes stale; do not trust it.

## How we work (the loop, same in every project)
- Any ticket bigger than a one-line fix: `/ticket <ID>`. Intent → Spec (grilling, happy + edge scenarios) → Ready → Implement (TDD) → QA (@qa) → Done (PR, never main) → Measure (/measure). One step per turn; I say "go".
- Each ticket is one OpenSpec change in `openspec/changes/<id>-<slug>/` (proposal, research, specs/<capability>/spec.md, design, tasks). Read that folder, not the whole repo. `openspec/specs/` = what the system already promises. Old tickets may still be in `docs/changes/`.
- Fresh eyes before a PR: @verifier (spec coverage) + the review gate below. @scout for research. Never merge.
- Guardrail hooks block: push to main, force push, PR merge, schema push, `rm -rf ~`, reading `.env`. If a hook blocks you, say so in one line and stop.
- Setup guide + research: ~/GITHUB/claude-harness/docs/agentic-workflow-setup.md
- Any "how do I / what is / which key" question about Herdr, hud, the harness, the loop, hooks, skills or agents (even with typos like "herbr"): use the `harness-help` skill. It has the cheat sheet and reads the manual. Never guess about these.

## Output style: ASD-STE100
(From Anthony's setup, 2026-10-21.)

Write your chat responses in Simplified Technical English. Load the `asd-ste100` skill at the start of the session.

The rules, in short:

- Use the active voice.
- Use simple tenses only.
- Write one instruction per sentence.
- Keep sentences under 20 words for instructions, under 25 for descriptions.
- Use one word for one meaning. Do not rotate synonyms.
- Use a list for a sequence of 3 or more steps.
- Do not stack more than 3 nouns.
- Do not use em dashes.

Scope: this applies to chat responses, commit messages, and PR bodies. It does not apply to deliverables where voice is the point, such as marketing copy. Casual words like "bro" are still fine.

## Review before opening a PR (all projects)

Run BOTH before you open a PR. They hunt different things, and neither finds the other's misses. `/review-gate` runs both (plus @verifier and @security-reviewer) in one go, and the guardrails hook blocks opening a PR until it passes.

1. `/code-review` (or `/thermonuclear-review` for a big or risky change): defects. Is this wrong?
2. `/ponytail-review`: over-engineering. Reinvented standard library, unneeded dependencies, speculative abstractions, dead flexibility. Ends with `net: -N lines possible`.

Fix the defect findings. Judge the ponytail findings: it lists, it never edits, and some of what it names is a deliberate cost. State the ones you keep and why.

**Why both.** A defect review asks "is this wrong". It never asks "should this exist". On Anthony's SPS-397 work, four review rounds found seven real defects across 546 lines and never questioned the size. One ponytail pass then found about 100 deletable lines. **The axis a review does not have is invisible to how many rounds you run.**

A plugin or skill added after a session starts is absent from that session's skill list, and the Skill tool answers "Unknown skill". Read its `SKILL.md` directly and apply it until the next restart.

## The agent changelog (all projects)

After you complete a change (a merged PR, an opened PR, a deletion, an infrastructure change, an important finding):

1. Open `~/.claude/shared/agent-changelog.md`.
2. Add one entry at the top of the **Entries** section. The entry format is in that file.

Write entries in ASD-STE100. Do not skip this for small changes. A one-line entry is enough for a small change.

## The session journal (all projects)

The journal feeds a memory / learning loop. It records the SESSION; the changelog above records the REPO. Do not duplicate one into the other.

Write your entry when a long-running session winds down. Also write it when Larry says "wrap up", and after you complete a major thread of work. Do not wait for a signal that the session is over; you will not get one.

1. Copy `~/.claude/shared/journal/TEMPLATE.md` to `~/.claude/shared/journal/YYYY-MM-DD-<session-slug>.md`.
2. Fill the three sections. "What was learned" is the one that matters: corrections, claims that died and how, techniques that worked, traps hit.
3. If your session continues afterward, update the SAME file. Never append to another session's file, and never create a shared append file.

One file per session. Short is fine. A session with nothing learned writes five lines and says so.
