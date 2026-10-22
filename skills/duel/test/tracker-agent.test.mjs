import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTrackerCmd, buildSyncPrompt, buildFinalizePrompt, buildDecomposePrompt, trackerTools } from '../scripts/tracker-agent.mjs';

// Any token that would let the agent MUTATE the tracker or the filesystem, or wander off the
// fast read path. A read-only sync must ALLOW none of these and must DISALLOW the dangerous ones.
const WRITE_TOKENS = ['save_comment', 'save_issue', 'gh issue comment', 'gh issue close', 'gh issue edit'];

test('linear sync is read-only: MCP reads allowed, writes/Bash/agent hard-DISALLOWED', () => {
  const cmd = buildTrackerCmd(true, 'linear');
  assert.equal(cmd[0], 'claude');
  const allow = cmd[cmd.indexOf('--allowedTools') + 1];
  const disallow = cmd[cmd.indexOf('--disallowedTools') + 1];
  // allow: Linear read MCP + Read/Glob/Grep, nothing that writes
  assert.ok(allow.includes('mcp__linear__get_issue') && allow.includes('mcp__linear__list_issues'));
  for (const w of WRITE_TOKENS) assert.ok(!allow.includes(w), `allow must not grant "${w}"`);
  // disallow is what ENFORCES read-only (--allowedTools alone only auto-approves): it must
  // block the write/agent tools, Bash, AND Read/Glob/Grep — those do nothing on a Linear map
  // but were the thrash vector (a 68-ticket sync flailed on 50 Greps).
  for (const d of ['Write', 'Edit', 'NotebookEdit', 'Task', 'Bash', 'Read', 'Glob', 'Grep']) assert.ok(disallow.includes(d), `disallow must block ${d}`);
  assert.ok(!cmd.includes('--permission-mode'), 'sync never runs acceptEdits');
  assert.ok(!cmd.includes('--strict-mcp-config'), 'non-hermetic so Linear MCP boots');
});

test('github sync keeps scoped gh (Bash allowed) but still blocks writes/agent', () => {
  const cmd = buildTrackerCmd(true, 'github');
  const allow = cmd[cmd.indexOf('--allowedTools') + 1];
  const disallow = cmd[cmd.indexOf('--disallowedTools') + 1];
  assert.ok(allow.includes('Bash(gh issue view:*)') && allow.includes('Bash(gh issue list:*)'), 'gh read subcommands allowed');
  for (const w of WRITE_TOKENS) assert.ok(!allow.includes(w), `allow must not grant "${w}"`);
  // github needs the shell for gh, so Bash is NOT globally disallowed here…
  assert.ok(!/\bBash\b/.test(disallow), 'github must keep Bash for gh');
  // …but the mutation + subagent tools still are
  for (const d of ['Write', 'Edit', 'Task']) assert.ok(disallow.includes(d), `disallow must block ${d}`);
});

test('linear finalize adds scoped MCP writes + acceptEdits, keeps the read floor', () => {
  const cmd = buildTrackerCmd(false, 'linear');
  const allow = cmd[cmd.indexOf('--allowedTools') + 1];
  assert.ok(allow.includes('mcp__linear__save_comment') && allow.includes('mcp__linear__save_issue'), 'scoped tracker writes');
  assert.ok(allow.includes('mcp__linear__get_issue'), 'still has the read floor');
  const pmIdx = cmd.indexOf('--permission-mode');
  assert.ok(pmIdx !== -1 && cmd[pmIdx + 1] === 'acceptEdits', 'finalize permits headless writes');
  // it writes via MCP save_* — it still should not touch local files or spawn agents
  const disallow = cmd[cmd.indexOf('--disallowedTools') + 1];
  for (const d of ['Write', 'Edit', 'Task']) assert.ok(disallow.includes(d));
});

test('github finalize allows the scoped gh write subcommands', () => {
  const { allow, disallow } = trackerTools('github', false);
  assert.ok(allow.includes('Bash(gh issue close:*)') && allow.includes('Bash(gh issue comment:*)'));
  assert.ok(!/\bBash\b/.test(disallow), 'gh finalize keeps Bash');
});

test('sync prompt is read-only, directive (no shell/subagents), carries identity + raw-JSON demand', () => {
  const p = buildSyncPrompt({ mapId: 'SPS-81', tracker: 'linear', url: 'https://linear.app/x/issue/SPS-81' });
  assert.ok(/READ-ONLY/.test(p));
  assert.ok(p.includes('SPS-81') && p.includes('linear') && p.includes('https://linear.app/x/issue/SPS-81'));
  assert.ok(/list_issues ONCE with parentId="SPS-81"/.test(p), 'steers to a single compact list call');
  assert.ok(/Do NOT use a shell|do not.*shell/i.test(p) && /spawn subagents/.test(p), 'forbids shell + subagents');
  assert.ok(/ENTIRE final response MUST be exactly this JSON/.test(p));
  assert.ok(p.includes('"map":{"id":"SPS-81"') && p.includes('"tracker":"linear"'));
  assert.ok(p.includes('"tickets":[') && p.includes('"fog":[]') && p.includes('"outOfScope":[]'));
});

test('sync prompt adapts its enumeration step to github and local trackers', () => {
  assert.ok(/gh issue list/.test(buildSyncPrompt({ mapId: 'o/r#1', tracker: 'github', url: 'u' })), 'github → gh');
  assert.ok(/read the markdown files/i.test(buildSyncPrompt({ mapId: 'm', tracker: 'local', url: '/tmp/m' })), 'local → files');
});

test('finalize prompt reads finalize-input.json and scopes to one ticket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-fin-'));
  try {
    writeFileSync(join(dir, 'finalize-input.json'), JSON.stringify({
      ticketId: 'SPS-142', duelSlug: 'sps-142-abc', heldBy: 'codex', resolution: 'Chose the Neon pool approach.',
    }));
    const p = buildFinalizePrompt({ mapId: 'SPS-81', tracker: 'linear' }, dir);
    assert.ok(p.includes('Act ONLY on ticket id SPS-142'), 'scopes strictly to the one ticket');
    assert.ok(p.includes('never any other issue'));
    assert.ok(p.includes('(winner: codex)'), 'threads the holder');
    assert.ok(p.includes('Chose the Neon pool approach.'), 'includes the resolution text');
    assert.ok(p.includes('Decisions so far'), 'updates the map narrative');
    assert.ok(/Do NOT change the ticket's status|not.*mark it Done/i.test(p), 'does NOT close the ticket (human closes when done)');
    assert.ok(!/Close .* \(status Done/.test(p), 'no close instruction');
    assert.ok(p.includes('{"ok":true,"ticket":"SPS-142"}'), 'demands the exact ack payload');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('finalize prompt omits winner clause when no holder (draw/HITL)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-fin2-'));
  try {
    writeFileSync(join(dir, 'finalize-input.json'), JSON.stringify({
      ticketId: 'T9', duelSlug: 'd', heldBy: null, resolution: 'Resolved by hand.',
    }));
    const p = buildFinalizePrompt({ mapId: 'M', tracker: 'local' }, dir);
    assert.ok(!p.includes('(winner:'), 'no winner clause on a neutral resolution');
    assert.ok(p.includes('Act ONLY on ticket id T9'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('decompose prompt splits the plan into small child tickets under the parent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-dec-'));
  try {
    writeFileSync(join(dir, 'decompose-input.json'), JSON.stringify({ parentTicketId: 'SPS-169', parentName: 'Billing page', plan: '# Big billing plan\nlots of steps', maxLoc: 400 }));
    const p = buildDecomposePrompt({ mapId: 'SPS-81', tracker: 'linear' }, dir);
    assert.match(p, /DECOMPOSE agent/);
    assert.match(p, /parentId: "SPS-169"/, 'children go under the parent');
    assert.match(p, /SMALL, self-contained, ordered slices/i);
    assert.match(p, /≤ 400 lines of code/);
    assert.match(p, /wayfinder:task/, 'labels each slice');
    assert.match(p, /Do NOT modify.*close the parent/i, 'never touches the parent');
    assert.match(p, /"created":<number/, 'demands the ack payload');
    assert.ok(p.includes('# Big billing plan'), 'includes the plan');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
