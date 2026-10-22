#!/usr/bin/env node
import { parseWrapperArgs, runWrapped } from './wrapper-core.mjs';

const argv = process.argv.slice(2);
// danger refusal must run BEFORE parseWrapperArgs reads --prompt-file, so a dangerous
// sandbox is rejected even if the prompt file is also unreadable (original codex-duel order)
const sbIdx = argv.indexOf('--sandbox');
const sandbox = sbIdx === -1 ? 'read-only' : (argv[sbIdx + 1] || 'read-only');
if (sandbox.toLowerCase().includes('danger')) { console.error('refusing dangerous sandbox'); process.exit(1); }
const a = parseWrapperArgs(argv);

// exec-level flags MUST precede the `resume` subcommand token —
// `codex exec resume` itself accepts neither -s nor -C (codex-cli 0.144.3).
const cmd = ['codex', 'exec', '-s', sandbox, '--skip-git-repo-check'];
if (a.cd) cmd.push('-C', a.cd);
if (a.resume) cmd.push('resume', a.resume);
cmd.push('--json', '-'); // prompt via stdin, never argv

runWrapped({
  duelDir: a.duelDir, role: a.role, round: a.round, outName: a.outName,
  actor: 'codex', timeoutS: a.timeoutS, parseOnly: a.parseOnly,
  argv: cmd, promptText: a.prompt,
  handleLine(line, ctx) {
    let e; try { e = JSON.parse(line); } catch { return; }
    if (e.type === 'thread.started') { const tid = e.thread_id || e.threadId || null; ctx.setSession(tid); ctx.log({ role: 'status', content: `codex session ${tid || '?'} started` }); }
    else if (e.type === 'item.completed' && e.item) {
      const it = e.item;
      if (it.type === 'agent_message' && typeof it.text === 'string') ctx.setFinal(it.text);
      else if (it.type === 'command_execution') ctx.log({ role: 'status', content: `\`$ ${(it.command || '').slice(0, 200)}\` (exit ${it.exit_code ?? '?'})` });
      else if (it.type === 'reasoning' && it.text) ctx.log({ role: 'status', content: `_thinking:_ ${it.text.slice(0, 300)}` });
    }
    else if (e.type === 'turn.failed' || e.type === 'error') ctx.setError(JSON.stringify(e));
  },
});
