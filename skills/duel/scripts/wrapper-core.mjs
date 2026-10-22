#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { appendEvent, ROLES } from './append-event.mjs';

const SHARED = ['duel-dir', 'role', 'round', 'out', 'prompt-file', 'resume', 'cd', 'timeout'];

export function parseWrapperArgs(args) {
  const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
  const flag = (name) => args.includes(`--${name}`);
  const duelDir = opt('duel-dir'); const role = opt('role'); const round = Number(opt('round', '1'));
  const outName = opt('out'); const resume = opt('resume'); const cd = opt('cd');
  const timeoutS = Number(opt('timeout', '900'));
  if (!duelDir || !role || !outName) { console.error('usage: --duel-dir D --role R --out F [--prompt-file P] [...] [prompt]'); process.exit(1); }
  if (!ROLES.includes(role)) { console.error(`invalid --role ${role}; must be one of ${ROLES.join('|')}`); process.exit(1); }
  const promptFile = opt('prompt-file');
  let prompt;
  try {
    prompt = promptFile ? readFileSync(promptFile, 'utf8')
      : args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--'))).pop();
  } catch (e) {
    console.error(`cannot read --prompt-file: ${e.message}`);
    console.log(JSON.stringify({ ok: false, threadId: null, out: outName, exitCode: 1 }));
    process.exit(1);
  }
  const extra = new Map();
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const name = args[i].slice(2);
      if (!SHARED.includes(name) && name !== 'parse-only' && name !== 'prompt-file')
        extra.set(name, args[i + 1]);
    }
  }
  return { duelDir, role, round, outName, resume, cd, timeoutS, parseOnly: flag('parse-only'), prompt, extra };
}

export function runWrapped({ duelDir, role, round, outName, actor, timeoutS = 900, parseOnly = false, argv, cwd, promptText, handleLine }) {
  let sessionId = null; let finalText = ''; let sawError = null; let timedOut = false;
  let logFailed = false; let writeFailed = false;
  const log = (evt) => { try { appendEvent(duelDir, { actor, round, ...evt }); } catch (e) { logFailed = true; console.error(String(e)); } };
  const ctx = {
    log,
    setFinal: (t) => { finalText = t; },
    setSession: (id) => { sessionId = id; },
    setError: (m) => { sawError = String(m).slice(0, 500); },
  };
  let finished = false;
  function finish(exitCode) {
    if (finished) return; finished = true;
    if (finalText) {
      try { mkdirSync(duelDir, { recursive: true }); writeFileSync(join(duelDir, outName), finalText); }
      catch (e) { writeFailed = true; sawError = sawError || String(e); }
      if (!writeFailed) log({ role, content: finalText, ref: outName });
    }
    if (!finalText || writeFailed) {
      log({ role: 'status', content: `${actor} ${role} FAILED (exit ${exitCode})${sawError ? ': ' + sawError : ''}` });
    }
    // ok only if the main event actually landed — the log IS the product
    const ok = exitCode === 0 && !!finalText && !logFailed && !writeFailed;
    console.log(JSON.stringify({ ok, threadId: sessionId, out: outName, exitCode }));
    process.exit(ok ? 0 : (exitCode || 1));
  }
  const onLine = (line) => { try { handleLine(line, ctx); } catch { /* one bad line never kills the run */ } };
  if (parseOnly) {
    const rl = createInterface({ input: process.stdin });
    rl.on('line', onLine);
    rl.on('close', () => finish(0));
    return;
  }
  const child = spawn(argv[0], argv.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], detached: true, cwd });
  child.on('error', (e) => { ctx.setError(e); finish(127); });
  child.stdin.on('error', () => {});
  child.stdin.end(promptText || '');
  // if the launcher kills this wrapper (viewer shutdown), take the detached model
  // group down with it instead of orphaning a running claude/codex process
  const onSignal = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } process.exit(143); };
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  const timer = setTimeout(() => {
    timedOut = true;
    log({ role: 'status', content: `${actor} timed out after ${timeoutS}s — killed` });
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    setTimeout(() => finish(124), 2000);
  }, timeoutS * 1000);
  createInterface({ input: child.stdout }).on('line', onLine);
  let errBuf = ''; child.stderr.on('data', (d) => { errBuf = (errBuf + d).slice(-2000); });
  child.on('close', (code) => { clearTimeout(timer); if (code !== 0 && errBuf) sawError = sawError || errBuf.slice(-500); finish(timedOut ? 124 : (code ?? 1)); });
}
