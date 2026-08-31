# Claude Code Harness — Tutorial

How to make Claude Code work the same way in **every project you touch**.

---

## 1. What a "harness" is

A harness is the stuff around the AI. Not the AI itself.

Think of a good kitchen. The chef is the AI. The harness is the knives, the
recipe cards, the timer, and the rule "taste before you serve."

Same chef. Much better food.

This harness has 5 parts:

| Part | What it is | Where it lives |
|---|---|---|
| **Rules** | What Claude must know about a repo | `CLAUDE.md` in each repo |
| **Specialists** | Separate workers with fresh eyes | `agents/` |
| **Playbooks** | Your SDLC steps | `skills/` |
| **Shortcuts** | Small daily commands | `commands/` |
| **Memory** | What broke before | `memory/lessons.md` |

---

## 2. The one big idea

**Two layers. Install one once. Write one per project.**

```
LAYER 1 — GLOBAL   (install once, works in every project forever)
   ~/.claude/agents/     <- symlinks to this repo
   ~/.claude/skills/     <- symlinks to this repo
   ~/.claude/commands/   <- symlinks to this repo

LAYER 2 — PER PROJECT   (about 2 minutes per repo, one time)
   my-repo/CLAUDE.md     <- how THIS repo builds, tests, and ships
```

Layer 1 is *how you work*. It never changes between projects.
Layer 2 is *what this project is*. It changes every project.

That is the whole answer to "how do I use it everywhere."
You install once. Then each new repo needs one small file.

---

## 3. Install (do this once)

### Step 1 — get the two plugin packs

Open Claude Code and type:

```
/plugin install superpowers
/plugin install mattpocock-skills
```

These are free, open source, and already in Anthropic's official marketplace.
They give you TDD, systematic-debugging, root-cause-tracing, writing-plans,
code-review, and `/grill-me`.

Do not rebuild what these already do well.

### Step 2 — install this harness

In your terminal:

```bash
cd ~/GITHUB/claude-harness
./install.sh                 # into ~/.claude
```

You have two Claude accounts, so you probably want both:

```bash
./install.sh ~/.claude-manifest ~/.claude-personal
```

Not sure what it will do? Look first, nothing changes:

```bash
./install.sh --dry-run ~/.claude-manifest
```

It makes **symlinks**, not copies. So when you improve a skill in this repo,
every install gets the improvement right away. No re-installing.

It will never overwrite a file you wrote yourself. It skips and tells you.

### Step 3 — check it worked

Open Claude Code in any folder and type `/`.
You should see `spec-first`, `tdd-loop`, `ship-it`, `triage-bug`, and the rest.

---

## 4. How to use it in EVERY project

This is the part you asked about. There are three cases.

### Case A — a repo you already work in

One time, inside the repo:

```
/onboard-repo
```

Claude reads the codebase and writes a `CLAUDE.md` for it — build command,
test command, folder map, conventions, gotchas.

Read it. Delete any line that is obvious. Commit it.

Now that repo is set up forever. Everyone on the team gets it too.

### Case B — a brand new project

```bash
cp ~/GITHUB/claude-harness/templates/CLAUDE.md.template ./CLAUDE.md
```

Fill in the blanks. Takes 2 minutes.

### Case C — someone else's repo, quick look

Do nothing. The global layer already works. Just type `/triage-bug` or
ask a question. You only need `CLAUDE.md` when you will come back often.

### The rule of thumb

> Global = how you work. Never repeat it.
> `CLAUDE.md` = what this repo is. Write it once per repo.

### Keep CLAUDE.md small

Anthropic's own guidance is blunt about this:

> *"Bloated CLAUDE.md files cause Claude to ignore your actual instructions."*

Test for every line: **would deleting this line cause a mistake?**
If no, delete it.

Good lines: the test command, the deploy rule, a weird gotcha.
Bad lines: "write clean code", "use good names", anything Claude can read
from the code itself.

---

## 5. A normal day with the harness

**Morning — a ticket lands, and it is vague**

```
/grill-me
```

Claude interviews you. Numbered questions, one round at a time, with its own
recommended answer for each. You answer. It asks the next round.
When the questions run out, you both actually understand the ticket.

Then:

```
/spec-first
```

Writes `SPEC.md`. Files to touch. What is out of scope. How you will prove
it works.

**Then start a NEW session.** Important. Fresh context builds better.

**Mid-morning — build it**

```
/tdd-loop
```

Test first. Watch it fail. Then code until it passes. Claude shows you the
real test output, not a promise.

**Before lunch — check it**

```
@reviewer
@tester
```

These are separate workers with **fresh eyes**. They never saw Claude write
the code, so they are not proud of it.

GitHub enforces this in their product: their agent literally **cannot approve
its own pull request**. Same idea here.

**Afternoon — ship**

```
/ship-it
```

Branch, commit, push, open a PR. It stops there. It does not merge.
Anthony merges.

**Something broke**

```
/triage-bug
```

Reproduce first. Then narrow it down. Then find the real cause — not the
first thing that looks wrong.

If it is on fire:

```
/hotfix
```

Smallest safe change. PR. Nothing clever.

**After it is fixed**

```
/postmortem
```

Writes what happened into `memory/lessons.md`. Next time Claude debugs, it
reads that file first. Your team gets a memory.

**End of day**

```
/standup
```

Yesterday / today / blockers, from your real commits and PRs.

**Talking to Eric or a PM**

```
/pm-handoff
```

Turns engineering work into plain English. No jargon.

---

## 6. Every stage, one table

| SDLC stage | Command |
|---|---|
| Unclear request | `/grill-me` |
| Requirements | `/spec-first` |
| Plan | `@planner` (use plan mode: `Shift+Tab`) |
| Learn a new repo | `/onboard-repo` |
| Build | `/tdd-loop` |
| Test | `@tester` |
| Review | `@reviewer` |
| Security | `@security-reviewer` |
| Ship | `/ship-it` |
| Bug | `/triage-bug` |
| Emergency | `/hotfix` |
| Learn from it | `/postmortem` |
| Daily update | `/standup` |
| Talk to PM | `/pm-handoff` |
| Context feels heavy | `/ctx` |

---

## 7. The 5 rules that actually matter

These are not opinions. They come from what large engineering teams published
about running AI agents in production.

**1. Close the loop.**
Give Claude something it can *run* to check itself.

> Anthropic: *"Claude stops when the work looks done. Without a check it can
> run, 'looks done' is the only signal available, and you become the
> verification loop."*

**2. Never let the writer grade its own work.**
Use `@reviewer` in a fresh session. GitHub blocks self-approval in their
product. Google human-reviews every AI security patch. Stripe reviews all
1,300+ agent PRs per week.

**3. Feed the error back. Do not just retry.**
Airbnb migrated 3,500 test files in 6 weeks. What worked was not a smarter
prompt — it was retrying **with the error message included** each time.

**4. Keep context small. The right files beat more files.**
Use `/clear` between unrelated tasks. If you corrected Claude twice on the
same thing, the session is polluted — `/clear` and start over with a better
prompt.

**5. Rules in a file are advice. Hooks are law.**

> Anthropic: *"Unlike CLAUDE.md instructions which are advisory, hooks are
> deterministic and guarantee the action happens."*

You chose no hooks for now. `hooks/guardrails.sh` sits in this repo, switched
off. See `hooks/README.md` when you want it.

---

## 8. Keeping it updated

```bash
cd ~/GITHUB/claude-harness
git pull
```

That is it. Symlinks mean every install updates instantly.

Made a skill better? Commit it. Now it is better in every project.

**Remove it all:**

```bash
./install.sh --uninstall ~/.claude-manifest ~/.claude-personal
```

Your own files stay. Only the symlinks go.

---

## 9. When something is wrong

| Problem | Fix |
|---|---|
| `/` does not show the new skills | Restart Claude Code. Check `ls -l ~/.claude/skills` shows arrows `->` |
| Installed to the wrong place | Run `echo $CLAUDE_CONFIG_DIR` to see where your account points |
| A skill does nothing | Open its `SKILL.md`. The `description:` line is what makes Claude pick it |
| Claude ignores `CLAUDE.md` | It is too long. Cut it in half |
| Claude keeps getting it wrong | `/clear`, then write a better prompt. Do not correct three times |

---

## 10. Where things live

```
~/GITHUB/claude-harness/
├── TUTORIAL.md          <- this file
├── README.md            <- quick reference
├── install.sh           <- installer
├── agents/              <- specialists (fresh eyes)
├── skills/              <- SDLC playbooks
├── commands/            <- small shortcuts
├── memory/lessons.md    <- what broke before
├── hooks/               <- guardrails (OFF)
└── templates/           <- CLAUDE.md starter
```
