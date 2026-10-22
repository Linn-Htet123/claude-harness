import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// last non-empty line of a script's stdout is always the {ok, ...} result JSON
const lastJson = (buf) => JSON.parse(buf.toString().trim().split('\n').pop());

// fake `codex` on PATH so tests never spawn the real CLI
function fakeCodexDir(script) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-codex-'));
  const bin = join(dir, 'codex');
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return dir;
}

test('parse-only converts codex JSONL into duel events and writes the out file', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  const fixture = readFileSync(new URL('./fixtures/codex-hello.jsonl', import.meta.url));
  const stdout = execFileSync('node', ['scripts/codex-duel.mjs',
    '--duel-dir', d, '--role', 'design', '--round', '1', '--out', 'design-codex.md', '--parse-only'],
    { input: fixture });
  const result = JSON.parse(stdout.toString().trim().split('\n').pop());
  assert.equal(result.ok, true);
  assert.ok(result.threadId, 'threadId extracted');
  const finalDoc = readFileSync(join(d, 'design-codex.md'), 'utf8');
  assert.match(finalDoc, /hello duel/);
  const events = readFileSync(join(d, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const main = events.find(e => e.role === 'design');
  assert.equal(main.actor, 'codex');
  assert.match(main.content, /hello duel/);
  assert.equal(main.ref, 'design-codex.md');
  assert.ok(events.every(e => e.actor === 'codex'));
});

test('refuses dangerous sandbox values before spawning anything', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  let failed = false;
  try {
    execFileSync('node', ['scripts/codex-duel.mjs',
      '--duel-dir', d, '--role', 'status', '--round', '1', '--out', 'x.md',
      '--sandbox', 'Danger-Full-Access', 'hi'], { stdio: 'pipe' });
  } catch (e) {
    failed = true;
    assert.match(String(e.stderr), /refusing dangerous sandbox/);
  }
  assert.ok(failed, 'dangerous sandbox must be refused');
});

test('parse-only emits status events for command executions', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  const fixture = readFileSync(new URL('./fixtures/codex-cmd.jsonl', import.meta.url));
  execFileSync('node', ['scripts/codex-duel.mjs',
    '--duel-dir', d, '--role', 'status', '--round', '1', '--out', 'cmd.md', '--parse-only'],
    { input: fixture });
  const events = readFileSync(join(d, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const cmdEvents = events.filter(e => e.role === 'status' && /\$ /.test(e.content));
  assert.ok(cmdEvents.length >= 1, 'at least one command_execution surfaced as a status event');
});

test('codex hang past --timeout is killed and reports ok:false, exitCode:124', () => {
  const fakeDir = fakeCodexDir('#!/bin/sh\nsleep 30\n');
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  let stdout, status;
  try {
    stdout = execFileSync(process.execPath, ['scripts/codex-duel.mjs',
      '--duel-dir', d, '--role', 'status', '--round', '1', '--out', 'x.md',
      '--timeout', '1', 'hi'],
      { env: { ...process.env, PATH: fakeDir + ':' + process.env.PATH }, timeout: 15000 });
    status = 0;
  } catch (e) {
    stdout = e.stdout;
    status = e.status;
  }
  assert.equal(status, 124);
  const result = lastJson(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 124);
});

test('codex spawn failure (codex missing from PATH) reports ok:false, exitCode:127', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  let stdout, status;
  try {
    stdout = execFileSync(process.execPath, ['scripts/codex-duel.mjs',
      '--duel-dir', d, '--role', 'status', '--round', '1', '--out', 'x.md', 'hi'],
      { env: { ...process.env, PATH: '/nonexistent' } });
    status = 0;
  } catch (e) {
    stdout = e.stdout;
    status = e.status;
  }
  assert.equal(status, 127);
  const result = lastJson(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 127);
});

test('dangerous sandbox is refused before an unreadable prompt-file is read', () => {
  let failed = false;
  try {
    execFileSync('node', ['scripts/codex-duel.mjs', '--duel-dir', '/tmp/x', '--role', 'design',
      '--round', '1', '--out', 'o.md', '--sandbox', 'DANGER-full-access',
      '--prompt-file', '/nonexistent/prompt.md'], { stdio: 'pipe' });
  } catch (e) {
    failed = true;
    assert.match(String(e.stderr), /refusing dangerous sandbox/);
    assert.doesNotMatch(String(e.stderr), /cannot read --prompt-file/);
  }
  assert.ok(failed, 'must exit non-zero');
});

test('logFailed forces ok:false even when the out file write succeeds', () => {
  const d = mkdtempSync(join(tmpdir(), 'duel-'));
  mkdirSync(join(d, 'events.jsonl')); // events.jsonl is a directory -> appendFileSync throws -> logFailed
  const fixture = readFileSync(new URL('./fixtures/codex-hello.jsonl', import.meta.url));
  let stdout, status;
  try {
    stdout = execFileSync(process.execPath, ['scripts/codex-duel.mjs',
      '--duel-dir', d, '--role', 'design', '--round', '1', '--out', 'design-codex.md', '--parse-only'],
      { input: fixture });
    status = 0;
  } catch (e) {
    stdout = e.stdout;
    status = e.status;
  }
  assert.notEqual(status, 0, 'nonzero exit expected');
  const result = lastJson(stdout);
  assert.equal(result.ok, false);
});
