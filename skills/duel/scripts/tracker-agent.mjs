#!/usr/bin/env node
// The REAL wayfinder tracker agent. Unlike the hermetic duel contestants, this is a
// NON-hermetic `claude -p` spawn (no --strict-mcp-config) so the operator's Linear MCP
// boots and `gh` is reachable. It is the default trackerCmd wayfinder shells out to.
// CLI: --op sync|finalize --config <config.json> --out <file> [--ticket <id>]
//   sync     → READ-ONLY: read the map + its tickets, emit tracker-neutral map JSON.
//   finalize → post a resolution comment, close the ticket, append to the map's
//              Decisions-so-far. Adds scoped tracker-WRITE tools only.
// Neither agent needs a Write tool: its final message IS the payload, and runWrapped
// writes that to --out (join(mapdir, basename(out))), which is the path wayfinder passed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { runWrapped } from './wrapper-core.mjs';
import { linearSync } from './linear-map.mjs';

// Read-only floor, per tracker. Linear/local need no shell (MCP + Read only), so we can
// hard-disallow Bash for them — which both enforces read-only AND stops a big-map sync from
// thrashing on shell/subagents. GitHub needs scoped `gh`.
const LINEAR_READ = 'mcp__linear__get_issue mcp__linear__list_issues mcp__linear__get_document mcp__linear__list_comments';
const GH_READ = 'Bash(gh issue view:*) Bash(gh issue list:*)';
const LINEAR_WRITE = ' mcp__linear__save_comment mcp__linear__save_issue';
const GH_WRITE = ' Bash(gh issue comment:*) Bash(gh issue close:*) Bash(gh issue edit:*)';

// The allow/deny pair for a tracker+op. CRITICAL: --allowedTools ALONE only auto-approves —
// without --disallowedTools the headless agent still reaches Write/Edit/Task/general-Bash and
// (observed on a 68-ticket linear sync) burns its whole budget thrashing on them. The disallow
// list is what actually makes sync read-only and keeps it on the fast MCP path.
export function trackerTools(tracker, isSync) {
  if (tracker === 'github') {
    // github needs the shell for gh; keep Read/Grep for parsing its output. Block mutation+agents.
    const allow = `Read Glob Grep ${GH_READ}` + (isSync ? '' : GH_WRITE);
    return { allow, disallow: 'Write Edit NotebookEdit Task WebFetch WebSearch' };
  }
  if (tracker === 'local') {
    // local maps ARE files — Read/Glob/Grep are the tool. No shell, no writes.
    return { allow: 'Read Glob Grep', disallow: 'Bash Write Edit NotebookEdit Task WebFetch WebSearch' };
  }
  // linear (default): MCP ONLY. Read/Glob/Grep do nothing on a Linear map but are a thrash
  // vector (a 68-ticket sync flailed on 50 Greps) — hard-block them along with shell/mutation/agents.
  const allow = LINEAR_READ + (isSync ? '' : LINEAR_WRITE);
  return { allow, disallow: 'Read Glob Grep Bash Write Edit NotebookEdit Task WebFetch WebSearch' };
}

export function buildTrackerCmd(isSync, tracker) {
  const { allow, disallow } = trackerTools(tracker, isSync);
  const cmd = ['claude', '-p', '--output-format', 'stream-json', '--verbose',
    '--allowedTools', allow, '--disallowedTools', disallow];
  if (!isSync) cmd.push('--permission-mode', 'acceptEdits'); // permit the tracker writes headlessly
  return cmd;
}

export function buildSyncPrompt(cfg) {
  const enumerate = cfg.tracker === 'github'
    ? `run \`gh issue list\` for the children and \`gh issue view ${cfg.mapId}\` for the map body`
    : cfg.tracker === 'local'
      ? `read the markdown files under the map path (${cfg.url}) directly with Read/Glob`
      : `call list_issues ONCE with parentId="${cfg.mapId}" and limit 250 — that returns EVERY child in one call — then call get_issue ONCE on ${cfg.mapId} for the map body`;
  return `You are the wayfinder MAP-SYNC agent (READ-ONLY — you have no write tools). The map is issue ${cfg.mapId} on ${cfg.tracker} (${cfg.url}).

DO EXACTLY THIS, IN ORDER, AND NOTHING ELSE — the map may have dozens of tickets and your time budget is tight:
1. ${enumerate}.
2. From the map body, take the destination line, the "Not yet specified" lines (fog[]), and the "Out of scope" gists (outOfScope[]), plus any dependency notes.
3. As soon as the list call returns, emit the JSON below and STOP — do not call any further tools.
Do NOT read child tickets one-by-one. Do NOT grep, read files, use a shell, run scripts, write files, or spawn subagents — you have tracker-read tools only. If a ticket's blockers aren't already known from the list/map body, use [] rather than fetching more. Speed matters: a few tool calls, then the JSON.

For EACH child ticket determine: id, name, type (research|prototype|grilling|task), hitl (grilling/prototype/HITL-task=true; research/AFK-task=false), blockedBy ids (only if cheaply known, else []), status (closed if the tracker issue is closed/done; claimed if assigned+open; frontier if open+unblocked+unassigned; blocked otherwise), duel (a duel slug the ticket records, else null), heldBy (if closed WITH a duel, the winning model claude|codex; else null).
Your ENTIRE final response MUST be exactly this JSON and NOTHING else — no prose, no markdown fences:
{"map":{"id":"${cfg.mapId}","name":"...","destination":"...","tracker":"${cfg.tracker}"},"tickets":[{"id":"...","name":"...","type":"research","status":"frontier","hitl":false,"blockedBy":[],"duel":null,"heldBy":null}],"fog":[],"outOfScope":[]}`;
}

export function buildFinalizePrompt(cfg, mapdir) {
  const fin = JSON.parse(readFileSync(join(mapdir, 'finalize-input.json'), 'utf8'));
  return `You are the wayfinder FINALIZER agent on ${cfg.tracker} (map ${cfg.mapId}). Act ONLY on ticket id ${fin.ticketId} — never any other issue.
The duel ${fin.duelSlug} resolved it${fin.heldBy ? ` (winner: ${fin.heldBy})` : ''}. Using the tracker WRITE tools:
1. Post a resolution comment on ${fin.ticketId}: ${fin.resolution}
2. Append ONE line to the MAP issue ${cfg.mapId}'s "Decisions so far" section linking ${fin.ticketId} with a one-line gist.
Do NOT change the ticket's status or mark it Done/closed — a decision (or even a follow-on code build) is not the same as the work being finished; the human closes the ticket when it's actually done. Comment only.
Your ENTIRE final response MUST be exactly: {"ok":true,"ticket":"${fin.ticketId}"}`;
}

export function buildDecomposePrompt(cfg, mapdir) {
  const dec = JSON.parse(readFileSync(join(mapdir, 'decompose-input.json'), 'utf8'));
  return `You are the wayfinder DECOMPOSE agent on ${cfg.tracker} (map ${cfg.mapId}). The parent ticket ${dec.parentTicketId} ("${dec.parentName}") has a resolved plan that is TOO BIG to build in one PR. Break it into small, buildable sub-tickets using the tracker WRITE tools.

Read the RESOLVED PLAN below and split it into 3–8 SMALL, self-contained, ordered slices — each buildable in ≤ ${dec.maxLoc} lines of code on its own, following the plan's own build order. For EACH slice, in order, CREATE a Linear issue as a CHILD of ${dec.parentTicketId}:
- parentId: "${dec.parentTicketId}"
- title: a short imperative title
- description: one paragraph of scope (what to build, ≤ ${dec.maxLoc} LOC), citing the relevant plan section
- labels: exactly one wayfinder:<type> label — wayfinder:task (code), wayfinder:research (a decision), wayfinder:grilling (needs a human), or wayfinder:prototype (a spike)
- ordering: give each slice after the first a blockedBy pointing at the PREVIOUS slice you created (use the id the create call returned), so the chain renders on the map. If chaining is impractical, create them in plan order without blockedBy.

Create ONLY the child slices. Do NOT modify, comment on, or close the parent ticket, and touch no other issue.

Your ENTIRE final response MUST be exactly this JSON and NOTHING else: {"ok":true,"parent":"${dec.parentTicketId}","created":<number of sub-tickets you created>}

# RESOLVED PLAN:

${dec.plan}`;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
  const op = opt('op'); const configPath = opt('config'); const out = opt('out');
  if (!op || !configPath || !out || !['sync', 'finalize', 'decompose'].includes(op)) {
    console.error('usage: tracker-agent.mjs --op sync|finalize|decompose --config <config.json> --out <file> [--ticket <id>]');
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const mapdir = dirname(configPath);
  const isSync = op === 'sync';

  // DETERMINISTIC Linear sync: when a personal API key is present, hit the Linear API directly
  // and skip the LLM entirely. A single agent can't reliably transform a large map (SPS-81 = 82
  // children, ~126KB → timed out 4×), whereas the JSON parse is instant and exact. Falls through
  // to the LLM agent below when there's no key (fine for small/local maps).
  if (isSync && cfg.tracker === 'linear' && process.env.LINEAR_API_KEY) {
    linearSync(cfg.mapId, process.env.LINEAR_API_KEY).then((map) => {
      writeFileSync(join(mapdir, basename(out)), JSON.stringify(map));
      console.log(JSON.stringify({ ok: true, threadId: null, out: basename(out), exitCode: 0 }));
      process.exit(0);
    }).catch((e) => {
      console.error('deterministic linear sync failed: ' + (e.message || e));
      console.log(JSON.stringify({ ok: false, threadId: null, out: basename(out), exitCode: 1 }));
      process.exit(1);
    });
    return;
  }

  const prompt = op === 'sync' ? buildSyncPrompt(cfg)
    : op === 'decompose' ? buildDecomposePrompt(cfg, mapdir)
      : buildFinalizePrompt(cfg, mapdir);

  runWrapped({
    duelDir: mapdir, role: 'status', round: 0, outName: basename(out), actor: 'orchestrator',
    // big real maps (dozens of tickets read over MCP) need more than a few minutes; the
    // wayfinder runTracker timeout is set higher so this inner budget fires first (graceful).
    timeoutS: Number(process.env.DUEL_TRACKER_AGENT_TIMEOUT) || 600, argv: buildTrackerCmd(isSync, cfg.tracker), promptText: prompt,
    handleLine(line, ctx) {
      let e; try { e = JSON.parse(line); } catch { return; }
      if (e.type === 'result' && e.subtype === 'success') ctx.setFinal(String(e.result || '').trim());
      else if (e.type === 'result') ctx.setError(JSON.stringify(e).slice(0, 300));
      else if (e.type === 'assistant' && e.message?.content) for (const b of e.message.content) if (b.type === 'tool_use') ctx.log({ role: 'status', content: `⚒ ${b.name}` });
    },
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
