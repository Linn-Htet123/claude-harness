#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { appendEvent } from './append-event.mjs';

const DUELS_DIR = process.env.DUELS_DIR || join(homedir(), '.claude', 'duels');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const task = opt('task'); const repo = opt('repo'); const category = opt('category') || 'general';
if (!task || !repo) { console.error('usage: duel-init.mjs --task "..." --repo <path> [--category <label>]'); process.exit(1); }

const PIPELINES = ['interactive', 'resolution', 'execution', 'hitl'];
const pipeline = opt('pipeline') || 'interactive';
if (!PIPELINES.includes(pipeline)) { console.error(`invalid --pipeline ${pipeline}; must be one of ${PIPELINES.join('|')}`); process.exit(1); }
const ticket = opt('ticket') || null;
const map = opt('map') || null;

const date = new Date().toISOString().slice(0, 10);
const slugWords = task.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(0, 5).join('-')
  || 'untitled'; // an all-punctuation task must not collapse to a bare "<date>-" dir
const slug = `${date}-${slugWords}`;
const dir = join(DUELS_DIR, slug);
if (existsSync(dir)) { console.error(`duel dir already exists: ${dir}`); process.exit(1); }
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, 'duel.json'), JSON.stringify({
  task, slug, repo, category, phase: 'design', winner: null,
  worktree: null, branch: null, codexThreadId: null, checkpoints: 0,
  pipeline, ticket, map, hitlSessionId: null, heldBy: null,
  created: new Date().toISOString(),
}, null, 2));

const sb = join(DUELS_DIR, 'SCOREBOARD.md');
if (!existsSync(sb)) writeFileSync(sb, `# Duel Scoreboard

## Score

| Model  | Design wins | Attack points | Defense points |
|--------|-------------|---------------|----------------|
| claude | 0 | 0 | 0 |
| codex  | 0 | 0 | 0 |

## By category

| Category | Claude | Codex |
|----------|--------|-------|

## Runtime Facts

- (none yet)

## Duel log

`);

appendEvent(dir, { actor: 'orchestrator', role: 'status', round: 0, content: `Duel opened: ${task} (category: ${category}, repo: ${repo})` });
console.log(JSON.stringify({ dir, slug }));
