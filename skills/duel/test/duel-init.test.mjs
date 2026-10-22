import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (env, args) => JSON.parse(execFileSync('node', ['scripts/duel-init.mjs', ...args], { env: { ...process.env, ...env } }).toString());

test('creates duel dir, duel.json, seeds scoreboard, logs initial event', () => {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  const res = run({ DUELS_DIR: root }, ['--task', 'Design the payout retry system now', '--repo', '/tmp/x', '--category', 'infra']);
  assert.match(res.slug, /^\d{4}-\d{2}-\d{2}-design-the-payout-retry-system$/);
  const meta = JSON.parse(readFileSync(join(res.dir, 'duel.json'), 'utf8'));
  assert.equal(meta.phase, 'design');
  assert.equal(meta.category, 'infra');
  assert.equal(meta.winner, null);
  assert.equal(meta.task, 'Design the payout retry system now');
  assert.equal(meta.repo, '/tmp/x');
  assert.equal(meta.worktree, null);
  assert.equal(meta.branch, null);
  assert.equal(meta.codexThreadId, null);
  assert.equal(meta.checkpoints, 0);
  assert.match(meta.created, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(existsSync(join(root, 'SCOREBOARD.md')));
  const events = readFileSync(join(res.dir, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(JSON.parse(events[0]).actor, 'orchestrator');
});

test('refuses to reuse an existing duel dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  const args = ['--task', 'same task twice', '--repo', '/tmp/x', '--category', 'infra'];
  run({ DUELS_DIR: root }, args);
  assert.throws(() => run({ DUELS_DIR: root }, args), /exists/i);
});

test('does not overwrite an existing scoreboard', () => {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  run({ DUELS_DIR: root }, ['--task', 'first duel here ok', '--repo', '/tmp/x', '--category', 'a']);
  writeFileSync(join(root, 'SCOREBOARD.md'), readFileSync(join(root, 'SCOREBOARD.md'), 'utf8') + 'CUSTOM');
  run({ DUELS_DIR: root }, ['--task', 'second duel here ok', '--repo', '/tmp/x', '--category', 'a']);
  assert.match(readFileSync(join(root, 'SCOREBOARD.md'), 'utf8'), /CUSTOM/);
});

test('falls back to untitled for degenerate task text', () => {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  const res = run({ DUELS_DIR: root }, ['--task', '???', '--repo', '/tmp/x', '--category', 'a']);
  assert.match(res.slug, /^\d{4}-\d{2}-\d{2}-untitled$/);
});

test('pipeline/ticket/map fields persist with defaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  const r1 = run({ DUELS_DIR: root }, ['--task', 'default pipeline duel here', '--repo', '/tmp/x', '--category', 'a']);
  const m1 = JSON.parse(readFileSync(join(r1.dir, 'duel.json'), 'utf8'));
  assert.equal(m1.pipeline, 'interactive');
  assert.equal(m1.ticket, null);
  assert.equal(m1.map, null);
  assert.equal(m1.hitlSessionId, null);
  const r2 = run({ DUELS_DIR: root }, ['--task', 'resolution duel for ticket', '--repo', '/tmp/x',
    '--category', 'a', '--pipeline', 'resolution', '--ticket', 'SPS-99', '--map', 'sps-81']);
  const m2 = JSON.parse(readFileSync(join(r2.dir, 'duel.json'), 'utf8'));
  assert.equal(m2.pipeline, 'resolution');
  assert.equal(m2.ticket, 'SPS-99');
  assert.equal(m2.map, 'sps-81');
});

test('rejects unknown pipeline', () => {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  assert.throws(() => run({ DUELS_DIR: root },
    ['--task', 'bad pipeline duel here', '--repo', '/tmp/x', '--pipeline', 'chaos']), /pipeline/);
});
