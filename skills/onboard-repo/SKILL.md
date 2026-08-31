---
name: onboard-repo
description: Learn an unfamiliar codebase and write a short CLAUDE.md for it. Run this once in any repo you will work in more than once, so every future session starts already knowing the project.
---

# Onboard a repo

One-time setup per repo. After this, every Claude session in this folder
starts knowing how things work here.

## Step 1 - look around

Read in this order. Stop when you can answer the questions below.

1. `README.md`, `CONTRIBUTING.md`
2. `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `Makefile`
3. CI config: `.github/workflows/`, `.gitlab-ci.yml`
4. The entry point: `main`, `index`, `app`, route definitions
5. `git log --oneline -30` - what does this team actually work on
6. One existing test file - the conventions live there

Use `@explorer` for the wide search so you do not fill this session with
file contents.

## Step 2 - answer these

You must be able to answer all of them from evidence, not guessing:

- How do I install dependencies?
- How do I run it locally?
- How do I run all tests? A single test?
- How do I lint and typecheck?
- How do I build for production?
- Where does the code live, folder by folder?
- What is the branch and PR convention? Who merges?
- What is non-obvious - something a new dev would trip on in week one?

If you cannot find one, **ask the human**. Do not invent a command.

## Step 3 - check for an existing file

If `CLAUDE.md` already exists, do not overwrite it. Read it, and propose
additions as a diff for the human to approve.

Also check for `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`
- reuse what is already there instead of duplicating it.

## Step 4 - write it

Use `templates/CLAUDE.md.template` from the harness repo as the shape.

Then **cut it down**. For every line ask:

> Would deleting this line cause a mistake?

If no, delete it. From Anthropic's own docs:

> *"Bloated CLAUDE.md files cause Claude to ignore your actual instructions."*

Keep: commands that cannot be guessed, non-default conventions, real
gotchas, who merges.

Cut: anything readable from the code, generic advice like "write clean
code", full API documentation, anything that changes weekly.

Aim for under 60 lines. Use `IMPORTANT:` on **one** line only - the single
most important rule. If everything is important, nothing is.

## Step 5 - hand back

Show the human the file and say:

> Read this and delete anything obvious. Then commit it - your whole team
> gets it.
