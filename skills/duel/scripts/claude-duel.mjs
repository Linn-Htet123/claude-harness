#!/usr/bin/env node
import { parseWrapperArgs, runWrapped } from './wrapper-core.mjs';

const a = parseWrapperArgs(process.argv.slice(2));
const mode = a.extra.get('mode') || 'read';
if (!['read', 'write'].includes(mode)) { console.error(`invalid --mode ${mode}`); process.exit(1); }
if (mode === 'write' && !a.cd) { console.error('--mode write requires --cd (write powers only ever point at a worktree)'); process.exit(1); }

// Hermetic: --strict-mcp-config (no --mcp-config → ZERO MCP servers booted, so a
// contestant can't reach linear/figma/etc write tools and pays no MCP boot cost);
// --setting-sources project (ignore the operator's ~/.claude global always-allow
// rules & hooks). Verified flags on claude 2.1.210.
const cmd = ['claude', '-p', '--output-format', 'stream-json', '--verbose',
  '--strict-mcp-config', '--setting-sources', 'project'];
if (a.resume) cmd.push('--resume', a.resume);
// NOTE: --allowedTools/--disallowedTools are variadic (<tools...>) — they swallow
// every following non-flag token. Never append a positional prompt after them; the
// prompt always goes via stdin (runWrapped writes it to the child's stdin).
if (mode === 'read') cmd.push('--allowedTools', 'Read Glob Grep WebFetch WebSearch TodoWrite',
  '--disallowedTools', 'Bash Edit Write NotebookEdit');
else cmd.push('--permission-mode', 'acceptEdits', '--allowedTools', 'Read Glob Grep Edit Write Bash TodoWrite');

runWrapped({
  duelDir: a.duelDir, role: a.role, round: a.round, outName: a.outName,
  actor: 'claude', timeoutS: a.timeoutS, parseOnly: a.parseOnly,
  argv: cmd, cwd: a.cd, promptText: a.prompt,
  handleLine(line, ctx) {
    let e; try { e = JSON.parse(line); } catch { return; }
    if (e.type === 'system' && e.subtype === 'init') { ctx.setSession(e.session_id || null); ctx.log({ role: 'status', content: `claude session ${e.session_id || '?'} started` }); }
    else if (e.type === 'assistant' && e.message?.content) {
      for (const block of e.message.content) {
        if (block.type === 'tool_use') ctx.log({ role: 'status', content: `\`⚒ ${block.name}\` ${JSON.stringify(block.input ?? {}).slice(0, 160)}` });
        else if (block.type === 'text' && block.text?.trim()) ctx.log({ role: 'status', content: block.text.slice(0, 300) });
      }
      if (e.session_id) ctx.setSession(e.session_id);
    }
    else if (e.type === 'result') {
      if (e.session_id) ctx.setSession(e.session_id);
      if (e.subtype === 'success' && typeof e.result === 'string') ctx.setFinal(e.result);
      else ctx.setError(JSON.stringify(e).slice(0, 500));
    }
  },
});
