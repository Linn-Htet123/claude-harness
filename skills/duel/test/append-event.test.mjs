import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEvent } from '../scripts/append-event.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'duel-'));

test('appends a valid event as one compact line and stamps ts', () => {
  const d = dir();
  const evt = appendEvent(d, { actor: 'codex', role: 'design', round: 1, content: 'hello' });
  assert.match(evt.ts, /^\d{4}-\d{2}-\d{2}T/);
  const lines = readFileSync(join(d, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.actor, 'codex');
  assert.equal(parsed.content, 'hello');
});

test('rejects unknown actor and role, leaves file untouched', () => {
  const d = dir();
  assert.throws(() => appendEvent(d, { actor: 'gpt', role: 'design', content: 'x' }), /invalid event:/);
  assert.throws(() => appendEvent(d, { actor: 'claude', role: 'poem', content: 'x' }), /invalid event:/);
  assert.throws(() => appendEvent(d, { actor: 'claude', role: 'design' }), /invalid event:/);
  assert.equal(existsSync(join(d, 'events.jsonl')), false);
});

test('preserves provided ts and appends multiple lines', () => {
  const d = dir();
  appendEvent(d, { ts: '2026-07-14T00:00:00Z', actor: 'claude', role: 'status', content: 'a' });
  appendEvent(d, { actor: 'user', role: 'verdict', content: 'b' });
  const lines = readFileSync(join(d, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).ts, '2026-07-14T00:00:00Z');
});

test('hitl is a valid role', () => {
  const d = dir();
  const evt = appendEvent(d, { actor: 'user', role: 'hitl', round: 1, content: 'my answer' });
  assert.equal(evt.role, 'hitl');
});
