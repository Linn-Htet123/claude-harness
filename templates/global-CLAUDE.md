
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
- Per-ticket docs live in `docs/changes/<ID>-<slug>/` (proposal, research, spec, design, tickets). Read that folder, not all of `docs/`.
- Fresh eyes before a PR: @verifier (spec coverage) + @reviewer (correctness). @scout for research. Never merge.
- Guardrail hooks block: push to main, force push, PR merge, schema push, `rm -rf ~`, reading `.env`. If a hook blocks you, say so in one line and stop.
- Setup guide + research: ~/GITHUB/claude-harness/docs/agentic-workflow-setup.md
- Any "how do I / what is / which key" question about Herdr, hud, the harness, the loop, hooks, skills or agents (even with typos like "herbr"): use the `harness-help` skill. It has the cheat sheet and reads the manual. Never guess about these.
