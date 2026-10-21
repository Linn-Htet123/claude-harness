import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWayfinder } from '../viewer/wayfinder.mjs';

const STUB = join(process.cwd(), 'test', 'stubs', 'fake-tracker.mjs');
const mk = (over = {}) => {
  const duelsDir = mkdtempSync(join(tmpdir(), 'duels-'));
  return { duelsDir, wf: createWayfinder({ duelsDir, trackerCmd: ['node', STUB], ...over }) };
};

test('setConfig derives tracker + slug and writes config.json', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/spases/issue/SPS-81/studios-engine-map');
  assert.equal(mapSlug, 'studios-engine-map');
  const cfg = JSON.parse(readFileSync(join(duelsDir, 'wayfinder', mapSlug, 'config.json'), 'utf8'));
  assert.equal(cfg.tracker, 'linear');
  assert.equal(cfg.url, 'https://linear.app/spases/issue/SPS-81/studios-engine-map');
});

test('mapRepo returns the build repo stored on the map config (null by default)', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  assert.equal(wf.mapRepo(mapSlug), null, 'no build repo until one is set');
  const cp = join(duelsDir, 'wayfinder', mapSlug, 'config.json');
  const c = JSON.parse(readFileSync(cp, 'utf8')); c.repo = '/Users/x/work/spases'; writeFileSync(cp, JSON.stringify(c));
  assert.equal(wf.mapRepo(mapSlug), '/Users/x/work/spases');
});

test('syncMap spawns the agent, merges hex coords, writes map.json', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://github.com/o/r/issues/42');
  const map = await wf.syncMap(mapSlug);
  assert.equal(map.map.name, 'Test Map');
  assert.equal(map.tickets.length, 1);
  assert.ok(Array.isArray(map.tickets[0].hex), 'server assigned a hex coord');
  assert.deepEqual(map.tickets[0].hex, [0, 0]);
  assert.ok(existsSync(join(duelsDir, 'wayfinder', mapSlug, 'map.json')));
});

test('a second sync preserves the coord of an already-placed ticket', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  await wf.syncMap(mapSlug);
  // force T1 to a nonzero coord, then re-sync — it must not move
  const p = join(duelsDir, 'wayfinder', mapSlug, 'map.json');
  const m = JSON.parse(readFileSync(p, 'utf8')); m.tickets[0].hex = [7, 7]; writeFileSync(p, JSON.stringify(m));
  const m2 = await wf.syncMap(mapSlug);
  assert.deepEqual(m2.tickets[0].hex, [7, 7]);
});

test('a second sync preserves a local in-flight claim while the agent still reports the ticket open', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  await wf.syncMap(mapSlug);
  // simulate a local claim taken between syncs: status claimed + a duel link + holder
  const p = join(duelsDir, 'wayfinder', mapSlug, 'map.json');
  const m = JSON.parse(readFileSync(p, 'utf8'));
  m.tickets[0].status = 'claimed'; m.tickets[0].duel = 'x-y-claude'; m.tickets[0].heldBy = 'claude';
  writeFileSync(p, JSON.stringify(m));
  // re-sync: the fake tracker's canned T1 is still 'frontier' (tracker hasn't caught up) —
  // the local claim must survive, NOT revert to frontier.
  const m2 = await wf.syncMap(mapSlug);
  assert.equal(m2.tickets[0].status, 'claimed');
  assert.equal(m2.tickets[0].duel, 'x-y-claude');
  assert.equal(m2.tickets[0].heldBy, 'claude');

  // once the agent reports it closed, the agent wins and the claim state is superseded
  const closedJson = join(duelsDir, 'closed.json');
  writeFileSync(closedJson, JSON.stringify({
    map: { id: 'M1', name: 'Test Map', destination: 'ship it', tracker: 'local' },
    tickets: [{ id: 'T1', name: 'root research', type: 'research', status: 'closed', hitl: false, blockedBy: [], duel: null, heldBy: null }],
    fog: [], outOfScope: [],
  }));
  const { wf: wf2 } = { wf: createWayfinder({ duelsDir, trackerCmd: ['node', STUB], trackerEnv: { FAKE_TRACKER_JSON: closedJson } }) };
  const m3 = await wf2.syncMap(mapSlug);
  assert.equal(m3.tickets[0].status, 'closed', 'the agent reporting closed overrides the local claim');
});

test('syncMap throws cleanly on agent failure and keeps the old map.json', async () => {
  const { duelsDir, wf } = mk({ trackerEnv: { FAKE_TRACKER_FAIL: '1' } });
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  await assert.rejects(() => wf.syncMap(mapSlug), /tracker/i);
  assert.equal(existsSync(join(duelsDir, 'wayfinder', mapSlug, 'map.json')), false);
});

test('a hanging tracker agent is killed by the timeout, not left to hang forever', async () => {
  const { wf } = mk({ trackerTimeoutS: 1, trackerEnv: { FAKE_TRACKER_HANG: '1' } });
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  const t0 = Date.now();
  await assert.rejects(() => wf.syncMap(mapSlug), /tracker sync agent failed/);
  assert.ok(Date.now() - t0 < 4000, 'timed out promptly (did not hang)');
});

test('a re-sync preserves a locally-claimed ticket instead of reverting it to frontier', async () => {
  const { duelsDir, wf } = mk();                 // default canned sync reports T1 as frontier
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  await wf.syncMap(mapSlug);
  wf.claimTicket(mapSlug, 'T1', 'duel-xyz');     // local claim
  const p = join(duelsDir, 'wayfinder', mapSlug, 'map.json');
  assert.equal(JSON.parse(readFileSync(p, 'utf8')).tickets[0].status, 'claimed');
  const m2 = await wf.syncMap(mapSlug);          // agent STILL reports T1 open/frontier
  assert.equal(m2.tickets[0].status, 'claimed', 'claim survives the re-sync');
  assert.equal(m2.tickets[0].duel, 'duel-xyz', 'duel link survives');
});

test('holdTicket stamps the winner; draw/invalid holder is neutral; missing map is a no-op', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  await wf.syncMap(mapSlug);
  const p = join(duelsDir, 'wayfinder', mapSlug, 'map.json');
  wf.holdTicket(mapSlug, 'T1', 'codex');
  assert.equal(JSON.parse(readFileSync(p, 'utf8')).tickets[0].heldBy, 'codex');
  wf.holdTicket(mapSlug, 'T1', 'claude');
  assert.equal(JSON.parse(readFileSync(p, 'utf8')).tickets[0].heldBy, 'claude');
  for (const bad of [null, 'draw', 'nobody', '']) {
    wf.holdTicket(mapSlug, 'T1', bad);
    assert.equal(JSON.parse(readFileSync(p, 'utf8')).tickets[0].heldBy, null, `holder ${JSON.stringify(bad)} → neutral`);
  }
  assert.doesNotThrow(() => wf.holdTicket('no-such-map', 'T1', 'codex'));
});

test('conquest survives a re-sync whose agent reports the ticket closed with heldBy=null (real tracker)', async () => {
  // The REAL tracker records no machine-readable winner, so the sync agent returns the closed
  // ticket with heldBy=null. Without local persistence the hex would go neutral (the defect the
  // fake-tracker marker masked). holdTicket writes the winner into map.json and mergeTickets must
  // carry it across the next sync that can't see it.
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  await wf.syncMap(mapSlug);
  wf.claimTicket(mapSlug, 'T1', 'd1');   // spawn-time claim
  wf.holdTicket(mapSlug, 'T1', 'codex'); // approve-time conquest write
  // an agent that reports T1 CLOSED with NO winner and NO duel — exactly the real round-trip
  const closedNull = join(duelsDir, 'closed-null.json');
  writeFileSync(closedNull, JSON.stringify({
    map: { id: 'M1', name: 'Test Map', destination: 'ship it', tracker: 'local' },
    tickets: [{ id: 'T1', name: 'root research', type: 'research', status: 'closed', hitl: false, blockedBy: [], duel: null, heldBy: null }],
    fog: [], outOfScope: [],
  }));
  const wf2 = createWayfinder({ duelsDir, trackerCmd: ['node', STUB], trackerEnv: { FAKE_TRACKER_JSON: closedNull } });
  const m = await wf2.syncMap(mapSlug);
  assert.equal(m.tickets[0].status, 'closed', 'agent still wins the status');
  assert.equal(m.tickets[0].heldBy, 'codex', 'conquest colour survives a winner-blind re-sync');
  assert.equal(m.tickets[0].duel, 'd1', 'duel link survives too (click-through preserved)');
});

test('finalizeTicket runs the finalize agent, then reflects the close+hold LOCALLY (no re-sync)', async () => {
  // finalize used to re-sync the whole map afterwards; on a large Linear map with no API key that
  // re-sync hangs for the full timeout and blocks the approve request (users double-click →
  // stacked finalizes). Now it runs the finalize agent, then marks just this ticket closed+held
  // in map.json. Test starts from a FRONTIER T1, so a closed+codex result proves finalize acted.
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/M/m');
  const before = await wf.syncMap(mapSlug);
  assert.equal(before.tickets[0].status, 'frontier', 'T1 starts open');
  const map = await wf.finalizeTicket(mapSlug, 'T1', { duelSlug: 'd1', heldBy: 'codex', resolution: 'use X' });
  assert.equal(map.tickets[0].status, 'closed', 'ticket marked closed locally');
  assert.equal(map.tickets[0].heldBy, 'codex', 'winner stamped locally');
  assert.equal(map.tickets[0].duel, 'd1', 'duel link recorded');
  // persisted to map.json, not just the returned object
  const onDisk = JSON.parse(readFileSync(join(duelsDir, 'wayfinder', mapSlug, 'map.json'), 'utf8'));
  assert.equal(onDisk.tickets[0].status, 'closed');
  // the finalize agent was actually invoked with the right instruction
  const fin = JSON.parse(readFileSync(join(duelsDir, 'wayfinder', mapSlug, 'finalize-input.json'), 'utf8'));
  assert.deepEqual([fin.ticketId, fin.heldBy, fin.duelSlug], ['T1', 'codex', 'd1']);
});

test('decomposeTicket runs the write agent to split a plan into child tickets', async () => {
  const { duelsDir, wf } = mk();
  const { mapSlug } = await wf.setConfig('https://linear.app/x/issue/SPS-81/m');
  const r = await wf.decomposeTicket(mapSlug, 'SPS-169', 'Billing page', '# a huge plan\n...', 400);
  assert.deepEqual([r.ok, r.parent, r.created], [true, 'SPS-169', 3]);
  // it handed the agent the right input
  const dec = JSON.parse(readFileSync(join(duelsDir, 'wayfinder', mapSlug, 'decompose-input.json'), 'utf8'));
  assert.deepEqual([dec.parentTicketId, dec.maxLoc], ['SPS-169', 400]);
  assert.ok(dec.plan.includes('a huge plan'));
});
