import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { assignHexCoords } from './static/hexmap.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function trackerSlug(url) {
  let tracker = 'local';
  if (/linear\.app/.test(url)) tracker = 'linear';
  else if (/github\.com/.test(url)) tracker = 'github';
  const seg = url.replace(/\/+$/, '').split('/').filter(Boolean).pop() || 'map';
  const mapSlug = seg.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
  return { tracker, mapSlug, mapId: seg };
}

function mergeTickets(rawTickets, existingMap) {
  const prev = new Map((existingMap?.tickets || []).map(t => [t.id, t]));
  const existingCoords = {};
  for (const [id, t] of prev) if (t.hex) existingCoords[id] = t.hex;
  return assignHexCoords(rawTickets, existingCoords).map(t => {
    const p = prev.get(t.id);
    // carry forward a LOCAL in-flight claim the tracker sync can't know yet: if we
    // locally claimed it (status claimed + a duel) and the agent still reports it
    // open, keep the claim + duel link. The agent wins only once it reports closed.
    if (p && p.status === 'claimed' && p.duel && t.status !== 'closed') return { ...t, status: 'claimed', duel: p.duel, heldBy: t.heldBy ?? p.heldBy ?? null };
    // carry forward a locally-recorded CONQUEST: heldBy is written to map.json on approve
    // (holdTicket), but the tracker has no machine-readable winner, so a later re-sync reports
    // the closed ticket with heldBy=null — retain the local holder + duel link so the hex keeps
    // its colour. The agent's own value always wins when it supplies one (?? order).
    if (p && (p.heldBy || p.duel)) return { ...t, heldBy: t.heldBy ?? p.heldBy ?? null, duel: t.duel ?? p.duel ?? null };
    return t;
  });
}

export function createWayfinder({ duelsDir = process.env.DUELS_DIR || join(homedir(), '.claude', 'duels'), trackerCmd, trackerEnv = {}, trackerTimeoutS = Number(process.env.DUEL_TRACKER_TIMEOUT) || 660 } = {}) {
  trackerCmd = trackerCmd || ['node', join(REPO_ROOT, 'scripts', 'tracker-agent.mjs')];
  const wfDir = (slug) => join(duelsDir, 'wayfinder', slug);
  const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  // the sync agent emits JSON as its final message (read-only, no Write tool) which may
  // arrive wrapped in ```json fences — tolerate them.
  const readJsonLoose = (p) => { try { return JSON.parse(readFileSync(p, 'utf8').replace(/^```(json)?|```$/gm, '').trim()); } catch { return null; } };

  function runTracker(op, mapdir, extra = {}) {
    return new Promise((resolve) => {
      const outFile = join(mapdir, op === 'sync' ? 'sync-raw.json' : op === 'decompose' ? 'decompose-result.json' : 'finalize-result.json');
      const args = [...trackerCmd.slice(1), '--op', op, '--config', join(mapdir, 'config.json'), '--out', outFile];
      for (const [k, v] of Object.entries(extra)) args.push(`--${k}`, v);
      const child = spawn(trackerCmd[0], args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...trackerEnv } });
      let err = '';
      // drain BOTH streams — a real claude -p agent is chatty on stderr; an undrained pipe
      // fills the ~64KB OS buffer, the child blocks on write(), and this await hangs forever.
      child.stdout.on('data', () => {});
      child.stderr.on('data', d => { err = (err + d).slice(-4000); });
      // On timeout, SIGTERM the tracker-agent FIRST: its runWrapped signal handler
      // group-kills the detached `claude` grandchild before exiting. A direct SIGKILL
      // is untrappable, so the handler never runs and the grandchild orphans (verified).
      // Escalate to SIGKILL only if the node process ignores SIGTERM past a short grace.
      let hardTimer = null;
      const timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
        hardTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
        resolve({ ok: false, code: 124, err });
      }, trackerTimeoutS * 1000);
      child.on('error', () => { clearTimeout(timer); if (hardTimer) clearTimeout(hardTimer); resolve({ ok: false, code: 127, err }); });
      child.on('close', (code) => { clearTimeout(timer); if (hardTimer) clearTimeout(hardTimer); resolve({ ok: code === 0 && existsSync(outFile), outFile, code, err }); });
    });
  }

  return {
    async setConfig(url) {
      const { tracker, mapSlug, mapId } = trackerSlug(url);
      const dir = wfDir(mapSlug); mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ url, tracker, mapId }, null, 2));
      return { mapSlug };
    },
    getMap(mapSlug) { return readJson(join(wfDir(mapSlug), 'map.json')); },
    // the repo a resolution build targets (stored on the map config); null if none set
    mapRepo(mapSlug) { const cfg = readJson(join(wfDir(mapSlug), 'config.json')); return cfg?.repo || null; },
    async syncMap(mapSlug) {
      const dir = wfDir(mapSlug);
      if (!existsSync(join(dir, 'config.json'))) throw new Error(`no config for map ${mapSlug}`);
      const res = await runTracker('sync', dir);
      if (!res.ok) throw new Error(`tracker sync agent failed for ${mapSlug} (exit ${res.code})${res.err ? ': ' + res.err.slice(-200) : ''}`);
      const raw = readJsonLoose(res.outFile);
      if (!raw || !Array.isArray(raw.tickets)) throw new Error(`tracker sync produced no tickets for ${mapSlug}`);
      const existing = readJson(join(dir, 'map.json'));
      const map = { map: raw.map || {}, tickets: mergeTickets(raw.tickets, existing), fog: raw.fog || [], outOfScope: raw.outOfScope || [] };
      writeFileSync(join(dir, 'map.json'), JSON.stringify(map, null, 2));
      return map;
    },
    async finalizeTicket(mapSlug, ticketId, { duelSlug, heldBy, resolution }) {
      const dir = wfDir(mapSlug);
      if (!existsSync(join(dir, 'config.json'))) throw new Error(`no config for map ${mapSlug}`);
      writeFileSync(join(dir, 'finalize-input.json'), JSON.stringify({ ticketId, duelSlug, heldBy, resolution }, null, 2));
      const res = await runTracker('finalize', dir, { ticket: ticketId });
      if (!res.ok) throw new Error(`tracker finalize agent failed for ${ticketId}`);
      // reflect the close + conquest LOCALLY instead of a full tracker re-sync. A re-sync here
      // re-runs the sync agent, which on a large Linear map with no API key HANGS for the whole
      // timeout and blocks the approve HTTP request — so users double-click and stack finalizes.
      // finalize touches exactly one ticket, so a single-ticket local update is sufficient and
      // instant; a fuller reconcile happens on the next explicit Sync.
      const p = join(dir, 'map.json');
      const map = readJson(p);
      if (map) {
        const t = (map.tickets || []).find(x => x.id === ticketId);
        if (t) {
          t.status = 'closed';
          t.heldBy = (heldBy === 'claude' || heldBy === 'codex') ? heldBy : null;
          t.duel = duelSlug || t.duel;
          writeFileSync(p, JSON.stringify(map, null, 2));
        }
      }
      return map || this.getMap(mapSlug);
    },
    // decompose a too-big resolved plan into small Linear CHILD tickets of the parent, so the
    // huge ticket becomes many small buildable ones. Runs the (write-capable) tracker agent.
    async decomposeTicket(mapSlug, parentTicketId, parentName, plan, maxLoc = 500) {
      const dir = wfDir(mapSlug);
      if (!existsSync(join(dir, 'config.json'))) throw new Error(`no config for map ${mapSlug}`);
      writeFileSync(join(dir, 'decompose-input.json'), JSON.stringify({ parentTicketId, parentName, plan, maxLoc }, null, 2));
      const res = await runTracker('decompose', dir, { ticket: parentTicketId });
      if (!res.ok) throw new Error(`tracker decompose agent failed for ${parentTicketId} (exit ${res.code})${res.err ? ': ' + res.err.slice(-160) : ''}`);
      return readJsonLoose(res.outFile) || { ok: true, parent: parentTicketId, created: 0 };
    },
    // local claim: mark a ticket claimed + attach its duel in map.json immediately, so the
    // hex reflects it and nextBattle skips it before the next tracker sync. No tracker write.
    claimTicket(mapSlug, ticketId, duelSlug) {
      const p = join(wfDir(mapSlug), 'map.json');
      const map = readJson(p); if (!map) return;
      const t = (map.tickets || []).find(x => x.id === ticketId);
      if (t) { t.status = 'claimed'; t.duel = duelSlug; writeFileSync(p, JSON.stringify(map, null, 2)); }
    },
    // local conquest: stamp the winning model onto a resolved ticket in map.json so its hex
    // holds that colour. The tracker records no machine-readable winner, so this local write —
    // not the sync agent — is the source of truth for conquest; mergeTickets carries it across
    // subsequent re-syncs. draw / human / invalid holder → null (neutral). Called AFTER
    // finalizeTicket's internal re-sync so it isn't clobbered.
    holdTicket(mapSlug, ticketId, heldBy) {
      const holder = (heldBy === 'claude' || heldBy === 'codex') ? heldBy : null;
      const p = join(wfDir(mapSlug), 'map.json');
      const map = readJson(p); if (!map) return;
      const t = (map.tickets || []).find(x => x.id === ticketId);
      if (t) { t.heldBy = holder; writeFileSync(p, JSON.stringify(map, null, 2)); }
    },
    listMaps() {
      const root = join(duelsDir, 'wayfinder');
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => {
        const cfg = readJson(join(root, e.name, 'config.json')) || {};
        const map = readJson(join(root, e.name, 'map.json'));
        return { mapSlug: e.name, name: map?.map?.name || cfg.mapId || e.name, url: cfg.url };
      });
    },
    _internals: { trackerSlug, mergeTickets, runTracker },
  };
}
