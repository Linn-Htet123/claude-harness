import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('parse-only converts claude stream-json into duel events and writes the out file', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  const fixture = readFileSync(new URL('./fixtures/claude-hello.jsonl', import.meta.url));
  const stdout = execFileSync('node', ['scripts/claude-duel.mjs',
    '--duel-dir', d, '--role', 'design', '--round', '1', '--out', 'design-claude.md', '--parse-only'],
    { input: fixture });
  const result = JSON.parse(stdout.toString().trim().split('\n').pop());
  assert.equal(result.ok, true);
  assert.ok(result.threadId, 'session id extracted');
  assert.match(readFileSync(join(d, 'design-claude.md'), 'utf8'), /hello duel/);
  const events = readFileSync(join(d, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const main = events.find(e => e.role === 'design');
  assert.equal(main.actor, 'claude');
  assert.equal(main.ref, 'design-claude.md');
});

test('mode write without --cd is refused before spawning', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  let failed = false;
  try {
    execFileSync('node', ['scripts/claude-duel.mjs', '--duel-dir', d, '--role', 'status',
      '--round', '1', '--out', 'x.md', '--mode', 'write', 'hi'], { stdio: 'pipe' });
  } catch (e) { failed = true; assert.match(String(e.stderr), /--mode write requires --cd/); }
  assert.ok(failed);
});
