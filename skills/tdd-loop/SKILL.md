---
name: tdd-loop
description: Build a change test-first - write a failing test, watch it fail, then write the code until it passes. Use for any behaviour change, bug fix, or new function where correctness matters.
argument-hint: "[what you are building]"
---

# TDD loop

The test is not paperwork. It is the thing that lets you stop guessing
whether the code works.

## Why this is the default

From Anthropic's guidance:

> *"Claude stops when the work looks done. Without a check it can run,
> 'looks done' is the only signal available, and you become the
> verification loop."*

Write the check first, and the loop closes itself.

## The loop

### 1. RED - write a failing test

Write the smallest test that describes the behaviour you want.

**Then run it and watch it fail.**

This step is not optional. A test that has never failed proves nothing -
it may be asserting nothing at all.

Confirm the failure message is the *right* failure. `undefined is not a
function` means your test is broken. `expected 3, received 0` means your
test works and the feature is missing.

### 2. GREEN - make it pass

Write the least code that turns it green. No extra features, no "while I'm
here" refactors, no abstractions for a second case that does not exist yet.

Run the test. Paste the real output.

### 3. REFACTOR - clean it, keep it green

Only now. Tidy names, remove duplication. Run the tests after every change.

If the tests go red during a refactor, you changed behaviour. Undo it.

### 4. REPEAT

Next behaviour. Next test. Small steps beat big ones.

## Rules

- **Never change the test to make the code pass.** If the test was wrong,
  say out loud that it was wrong and why, then fix it deliberately.
- **Never claim a pass you did not see.** Paste real terminal output. Not
  "tests should pass now".
- **Feed errors back in.** When something fails, the next attempt must
  include the actual error text. Airbnb migrated 3,500 test files this way -
  retrying blind is a coin flip, retrying with the error is progress.
- Run the **whole** suite before you say done, not just your new test.
- If you have failed the same test 3 times, stop. Say what you tried and
  what you now think is happening. Ask.

## Finishing

Do not say "done". Say:

```
## Command
<the exact command>

## Output
<the real output>

## Result
<N passed, N failed> - full suite, not just the new test
```

Then hand to `@reviewer` for fresh eyes.
