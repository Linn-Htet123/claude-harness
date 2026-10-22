import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWrapperArgs } from '../scripts/wrapper-core.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'duel-'));

test('parseWrapperArgs: shared flags, prompt-file precedence, extras', () => {
  const d = dir();
  writeFileSync(join(d, 'p.md'), 'from file');
  const a = parseWrapperArgs(['--duel-dir', d, '--role', 'design', '--round', '2',
    '--out', 'x.md', '--prompt-file', join(d, 'p.md'), '--sandbox', 'read-only',
    '--mode', 'write', 'positional ignored']);
  assert.equal(a.duelDir, d);
  assert.equal(a.role, 'design');
  assert.equal(a.round, 2);
  assert.equal(a.outName, 'x.md');
  assert.equal(a.prompt, 'from file');
  assert.equal(a.extra.get('sandbox'), 'read-only');
  assert.equal(a.extra.get('mode'), 'write');
});

test('runWrapped spawn path: events, out file, result JSON, session id (via inline fake child)', () => {
  const d = dir();
  const fake = join(d, 'fake-cli.mjs');
  writeFileSync(fake, `#!/usr/bin/env node
process.stdin.resume();
console.log(JSON.stringify({ kind: 'hello', id: 'sess-1' }));
console.log(JSON.stringify({ kind: 'final', text: 'the answer' }));
process.exit(0);
`);
  chmodSync(fake, 0o755);
  const runner = join(d, 'runner.mjs');
  writeFileSync(runner, `
import { runWrapped } from '${process.cwd()}/scripts/wrapper-core.mjs';
runWrapped({
  duelDir: process.argv[2], role: 'design', round: 1, outName: 'ans.md',
  actor: 'claude', timeoutS: 30, argv: ['node', '${fake}'], promptText: 'hi',
  handleLine(line, ctx) {
    const e = JSON.parse(line);
    if (e.kind === 'hello') { ctx.setSession(e.id); ctx.log({ role: 'status', content: 'started' }); }
    if (e.kind === 'final') ctx.setFinal(e.text);
  },
});
`);
  const res = spawnSync('node', [runner, d], { encoding: 'utf8' });
  const out = JSON.parse(res.stdout.trim().split('\n').pop());
  assert.equal(out.ok, true);
  assert.equal(out.threadId, 'sess-1');
  assert.equal(readFileSync(join(d, 'ans.md'), 'utf8'), 'the answer');
  const events = readFileSync(join(d, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events[0].actor, 'claude');
  assert.equal(events.at(-1).role, 'design');
  assert.equal(events.at(-1).ref, 'ans.md');
});

test('runWrapped: guarded out-file write failure yields ok:false', () => {
  const d = dir();
  // make outName collide with a directory so writeFileSync fails
  const runner = join(d, 'runner.mjs');
  writeFileSync(runner, `
import { mkdirSync } from 'node:fs';
import { runWrapped } from '${process.cwd()}/scripts/wrapper-core.mjs';
mkdirSync(process.argv[2] + '/ans.md', { recursive: true });
runWrapped({
  duelDir: process.argv[2], role: 'design', round: 1, outName: 'ans.md',
  actor: 'claude', parseOnly: true,
  handleLine(line, ctx) { ctx.setFinal('text'); },
});
`);
  const res = spawnSync('node', [runner, d], { input: '{"x":1}\n', encoding: 'utf8' });
  const out = JSON.parse(res.stdout.trim().split('\n').pop());
  assert.equal(out.ok, false);
});
