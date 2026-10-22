import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyScore, SEED } from '../scripts/score.mjs';

const fresh = () => { const d = mkdtempSync(join(tmpdir(), 'duels-')); const p = join(d, 'SCOREBOARD.md'); writeFileSync(p, SEED); return p; };

test('design win adds +2, upserts category, appends log line', () => {
  const p = fresh();
  applyScore(p, { type: 'design-win', winner: 'codex', category: 'library', slug: 'x-y' });
  const s = readFileSync(p, 'utf8');
  assert.match(s, /\| codex {2}\| 2 \| 0 \| 0 \|/);
  assert.match(s, /\| library \| 0 \| 2 \|/);
  assert.match(s, /- .*x-y.*design win: codex/);
  applyScore(p, { type: 'design-win', winner: 'codex', category: 'library', slug: 'x-z' });
  assert.match(readFileSync(p, 'utf8'), /\| library \| 0 \| 4 \|/); // upsert, not duplicate row
});

test('checkpoint adds attack/defense points', () => {
  const p = fresh();
  applyScore(p, { type: 'checkpoint', attacker: 'claude', attackPoints: 3, defender: 'codex', defensePoints: 1, category: 'library', slug: 'x-y', note: '3 confirmed, 1 rebutted' });
  const s = readFileSync(p, 'utf8');
  assert.match(s, /\| claude \| 0 \| 3 \| 0 \|/);
  assert.match(s, /\| codex {2}\| 0 \| 0 \| 1 \|/);
  assert.match(s, /3 confirmed, 1 rebutted/);
});

test('runtime facts: replaces placeholder, caps at 5 (oldest dropped)', () => {
  const p = fresh();
  for (let i = 1; i <= 6; i++) applyScore(p, { type: 'runtime-fact', text: `fact ${i}` });
  const s = readFileSync(p, 'utf8');
  assert.ok(!s.includes('(none yet)'));
  assert.ok(!s.includes('fact 1'), 'oldest dropped');
  assert.ok(s.includes('fact 6'));
  assert.equal((s.match(/^- fact /gm) || []).length, 5);
});

test('category with regex metacharacters upserts correctly, no duplicate/corruption/throw', () => {
  const p = fresh();
  // '+' quantifier: two wins in the same metachar category must upsert to one row at 4, not duplicate
  applyScore(p, { type: 'design-win', winner: 'codex', category: 'a+b', slug: 's1' });
  applyScore(p, { type: 'design-win', winner: 'codex', category: 'a+b', slug: 's2' });
  const s = readFileSync(p, 'utf8');
  assert.equal((s.match(/^\| a\+b \|/gm) || []).length, 1, 'exactly one a+b row');
  assert.match(s, /\| a\+b \| 0 \| 4 \|/);
  // '(' would throw an unterminated-group SyntaxError if unescaped
  assert.doesNotThrow(() => applyScore(p, { type: 'design-win', winner: 'claude', category: 'c(d', slug: 's3' }));
  // '.' must NOT match a literal '-' in a neighbouring category
  const p2 = fresh();
  applyScore(p2, { type: 'design-win', winner: 'claude', category: 'web-app', slug: 'a' });
  applyScore(p2, { type: 'design-win', winner: 'codex', category: 'web.app', slug: 'b' });
  const s2 = readFileSync(p2, 'utf8');
  assert.match(s2, /\| web-app \| 2 \| 0 \|/, 'web-app row untouched');
  assert.match(s2, /\| web\.app \| 0 \| 2 \|/, 'web.app is its own row');
});
