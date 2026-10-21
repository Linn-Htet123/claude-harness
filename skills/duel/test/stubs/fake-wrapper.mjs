#!/usr/bin/env node
// Fake contestant wrapper: honors the real CLI surface, emits canned content.
// Env knobs: FAKE_ACTOR (claude|codex), FAKE_REPLY (text), FAKE_FAIL=1 (exit 1, no event),
//            FAKE_DELAY_MS (sleep before finishing).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const duelDir = opt('duel-dir'); const role = opt('role'); const round = Number(opt('round', '1'));
const out = opt('out'); const cd = opt('cd'); const actor = process.env.FAKE_ACTOR || 'claude';
const delay = Number(process.env.FAKE_DELAY_MS || '0');
const promptFile = opt('prompt-file');
const prompt = promptFile ? readFileSync(promptFile, 'utf8') : 'no prompt';

// Node's `node --test` default discovery glob matches ANY .mjs file under a
// directory named "test" (not just *.test.mjs) — it will import this file with
// zero argv/env as part of the full-suite run. Without this guard that hits
// mkdirSync(undefined) below and reports as a failing "test". Real wrapper-CLI
// invocations (from launcher.mjs) always pass --duel-dir and --out, so this is a
// no-op for every real call path and only short-circuits the bare-discovery case.
if (duelDir && out) {
setTimeout(() => {
  if (process.env.FAKE_FAIL === '1') {
    console.log(JSON.stringify({ ok: false, threadId: null, out, exitCode: 1 }));
    process.exit(1);
  }
  const text = process.env.FAKE_REPLY || `${actor} ${role} reply (saw ${prompt.length} chars)`;
  mkdirSync(duelDir, { recursive: true });
  writeFileSync(join(duelDir, out), text);
  // simulate an IMPLEMENT build by writing a file into the worktree (--cd) so the tree is
  // dirty and gitCommit produces a real diff — UNLESS FAKE_NOOP, which models a build that
  // produced no changes (codex burned its budget without writing code). out==='impl-notes.md'
  // marks the implement step (checkpoint attacks are read-only and pass no writable change).
  if (cd && out === 'impl-notes.md' && process.env.FAKE_NOOP !== '1') {
    try { writeFileSync(join(cd, `duel-impl-${actor}.txt`), text); } catch {}
  }
  appendFileSync(join(duelDir, 'events.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), actor, role, round, content: text, ref: out }) + '\n');
  console.log(JSON.stringify({ ok: true, threadId: `${actor}-sess-${round}`, out, exitCode: 0 }));
  process.exit(0);
}, delay);
}
