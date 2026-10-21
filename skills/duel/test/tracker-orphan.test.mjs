import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWayfinder } from '../viewer/wayfinder.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// alive: process.kill(pid,0) throws ESRCH when the pid is gone; EPERM means it exists.
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// A tracker sync/finalize that times out must NOT orphan the detached `claude` grandchild
// that tracker-agent's runWrapped spawns. runTracker SIGTERMs the node tracker-agent so
// its signal handler group-kills claude; a direct SIGKILL would leave claude running.
test('tracker timeout reaps the detached claude grandchild (no orphan)', { skip: process.platform === 'win32' ? 'needs POSIX process groups' : false }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'wf-orphan-'));
  const binDir = join(root, 'bin');
  const mapdir = join(root, 'mapdir');
  const pidFile = join(root, 'claude.pid');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(mapdir, { recursive: true });
  // fake `claude`: record own pid, then live long past the timeout. exec keeps pid == $$.
  writeFileSync(join(binDir, 'claude'), `#!/bin/sh\necho $$ > "$FAKE_PID_FILE"\nexec sleep 120\n`);
  chmodSync(join(binDir, 'claude'), 0o755);
  writeFileSync(join(mapdir, 'config.json'), JSON.stringify({ url: '/tmp/wf-orphan', tracker: 'local', mapId: 'wf-orphan' }));

  const wf = createWayfinder({
    trackerTimeoutS: 2,
    trackerEnv: { PATH: `${binDir}:${process.env.PATH}`, FAKE_PID_FILE: pidFile },
  });

  const res = await wf._internals.runTracker('sync', mapdir);
  assert.equal(res.code, 124, 'runTracker reports a timeout');

  // non-vacuous: the grandchild MUST have actually spawned, or "no orphan" is meaningless
  for (let i = 0; i < 20 && !existsSync(pidFile); i++) await sleep(100);
  assert.ok(existsSync(pidFile), 'the fake claude grandchild actually started');
  const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
  assert.ok(pid > 0, 'captured a real grandchild pid');

  // after the SIGTERM-first timeout, the grandchild must die (was orphaned under SIGKILL-only)
  let dead = false;
  for (let i = 0; i < 40; i++) { if (!alive(pid)) { dead = true; break; } await sleep(150); }
  if (!dead) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  rmSync(root, { recursive: true, force: true });
  assert.ok(dead, `claude grandchild pid ${pid} was orphaned — it survived the tracker timeout`);
});
