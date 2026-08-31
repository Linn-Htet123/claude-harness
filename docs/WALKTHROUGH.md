# Walkthrough — a real feature, start to finish

A worked example of using the harness on a real job:

> *"I am new to this project. It has 3 repos. I have user stories. I need to
> add a feature. Where do I start?"*

The example used here is an inventory module in a 3-repo system
(Go API + 2 Next.js frontends). The shape works for any feature in any
project.

---

## The one rule

**One phase, one session.**

Run `/clear` (or quit and restart) between every phase below.

Why: a session that spent 40 messages arguing about the spec is a *bad*
session to write code in. It is full of rejected ideas. Anthropic's guidance
is direct about it - write the spec, then *start a fresh session to execute
it*.

You will be tempted to keep going in one session because it "remembers".
Don't. The memory you want is in `SPEC.md` and `PLAN.md`, on disk.

---

## Session 1 - What already exists?

**Goal:** stop assuming. Find the ground truth.

Open Claude Code in the workspace root.

```
@explorer does an inventory or stock module already exist here?
check migrations/, internal/model/, internal/router/router.go, and the
admin app/admin/* pages. answer yes or no, with file:line evidence.
```

Then:

```
@explorer show me how ONE existing feature is built end to end - pick the
simplest one. migration -> model -> route -> admin page. I want the shape
I should copy.
```

That second question is the highest-value one you will ask all week. Every
codebase has a pattern. Copy it. Do not invent a new one.

**You leave this session with:** does it exist, and what shape to follow.

`/clear`

---

## Session 2 - Turn user stories into a spec

**Goal:** a `SPEC.md` you and your lead both agree on, before any code.

Paste your user stories in, then:

```
/grill-me
```

It will interview you in rounds. Numbered questions, its own recommended
answer on each, then it waits. Answer honestly. "I don't know, who decides
that?" is a real answer - write it down as an open question.

Expect it to find holes you did not see. That is the point. Finding them
here is free. Finding them in week 3 is not.

Then:

```
/spec-first
```

You get `SPEC.md`: goal, out of scope, behaviours, files, contract changes,
how we prove it works.

**Send `SPEC.md` to whoever owns the decision before you build.** This is the
cheapest moment in the whole project to be wrong.

`/clear`

---

## Session 3 - Plan it

**Goal:** the order of work, with a check on every step.

Press `Shift+Tab` until you see **plan mode** (read-only - it cannot edit).

```
@planner read SPEC.md and plan this. it spans 3 repos, so give me the order
of work and tell me exactly where the API contract has to be frozen.
```

For a feature that crosses repos, the order is not negotiable:

```
1. DB migration        new tables, new migration file only
2. API                 model -> route -> websocket event
3. FREEZE THE CONTRACT the exact JSON shape, written down
4. Admin UI            staff-facing
5. Guest UI            diner-facing, if any
```

Step 3 is the one people skip, and it is the one that costs a week. Both
frontends build against a shape that is agreed *in writing*, not one that is
still moving.

Save the output as `PLAN.md`.

`/clear`

---

## Session 4+ - Build, one slice at a time

**Goal:** small pieces, each one proven.

**One session per slice.** Not one session for the feature.

A slice is something you could ship on its own:

- "the migration + the model"
- "GET /inventory returns stock levels"
- "the admin stock table renders"

For each slice:

```
we are on step 3 of PLAN.md. build only that step.
/tdd-loop
```

The loop is: write a failing test -> **watch it fail** -> make it pass ->
paste the real output.

Watching it fail is not ceremony. A test that has never failed might be
asserting nothing.

**When something breaks:**

```
/triage-bug
```

Reproduce first. Never fix a symptom you cannot explain.

**When the session feels heavy or Claude keeps missing:**

```
/ctx
```

It will tell you honestly whether to keep going, `/compact`, or restart.
If you have corrected the same mistake twice, restart. That is a rule, not
a suggestion.

`/clear` between slices.

---

## Session 5 - Review, with fresh eyes

**Goal:** someone who did not write it looks at it.

**Start a new session.** This is the most important `/clear` of the whole
process. A session that just wrote the code cannot review the code - it is
proud of it.

```
@reviewer review my diff against SPEC.md. only correctness and missed
requirements. no style.
```

If it touches auth, payments, or user data:

```
@security-reviewer
```

Then:

```
@tester run the full suite, not just my new tests, and paste the output.
```

Fix what is real. Ignore findings with no concrete failure story - a reviewer
asked to find problems will invent some. That is a known failure mode, not a
sign your code is bad.

---

## Session 6 - Ship

```
/ship-it
```

Pre-flight, clean diff, branch, commit, push, PR body with real test output.

**It stops at the PR.** A person merges. Every large engineering org that has
published on this keeps that gate - GitHub's agent structurally cannot
approve its own PR.

---

## Ongoing

| When | Command |
|---|---|
| Every morning | `/standup` |
| Lead or PM asks for status | `/pm-handoff` |
| Something broke and cost you time | `/postmortem` |
| Starting in a repo for the first time | `/onboard-repo` |

`/postmortem` is the one people skip and should not. It appends four lines to
`memory/lessons.md`, and `/triage-bug` reads that file first next time. That
is how the setup gets smarter instead of just staying the same.

---

## The whole thing on one page

```
SESSION 1   @explorer          what exists? what shape do I copy?
   /clear
SESSION 2   /grill-me          interview me
            /spec-first        -> SPEC.md   [get this agreed]
   /clear
SESSION 3   @planner           -> PLAN.md   [freeze the contract]
   /clear
SESSION 4   /tdd-loop          slice 1      [/clear between slices]
SESSION 5   /tdd-loop          slice 2
   ...
SESSION n   @reviewer          fresh eyes
            @security-reviewer
            @tester            real output
   
            /ship-it           -> PR. a human merges.
```

---

## If the project has no tests

Some codebases have no test runner at all. Then `/tdd-loop` has nothing to
run, and every "prove it works" step is empty.

You have three options, worst to best:

1. **Ignore it.** You are the verification loop. Everything is manual, and
   AI speed makes it worse, not better.
2. **Verify by hand, every time.** Write the exact click-path in `SPEC.md`
   and walk it after each slice. Slow but honest.
3. **Add a thin test harness first.** Usually half a day. One test file, one
   command, one green run. Now every slice after it can prove itself.

Option 3 pays for itself inside a week on any feature bigger than a few days.

This is not a style opinion. The 2025 DORA report found AI adoption
correlates with **higher throughput and lower delivery stability** - the
teams that gain are the ones who already had fast feedback and automated
tests. AI amplifies the substrate you have. If the substrate is thin, it
amplifies that too.
