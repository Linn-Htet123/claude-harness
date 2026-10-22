import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { createApp, isLoopback, resolveToken, lanUrl, authed, ffmpegArgs, whisperArgs, sttReady } from '../viewer/server.mjs';

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  const d = join(root, '2026-07-14-test-duel');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ task: 't', slug: '2026-07-14-test-duel', phase: 'design', created: '2026-07-14T00:00:00Z' }));
  writeFileSync(join(d, 'events.jsonl'),
    '{"ts":"2026-07-14T00:00:01Z","actor":"orchestrator","role":"status","round":0,"content":"opened"}\n' +
    'THIS LINE IS MALFORMED\n' +
    '{"ts":"2026-07-14T00:00:02Z","actor":"codex","role":"design","round":1,"content":"my design"}\n');
  writeFileSync(join(d, 'design-codex.md'), '# codex design');
  writeFileSync(join(root, 'SCOREBOARD.md'), '# Duel Scoreboard');
  return { root, d };
}

const listen = (app) => new Promise(r => app.listen(0, () => r(`http://localhost:${app.address().port}`)));

test('healthz, duel list, scoreboard, doc, and slug validation', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { ok: true });
  const duels = await (await fetch(`${base}/api/duels`)).json();
  assert.equal(duels[0].slug, '2026-07-14-test-duel');
  assert.match(await (await fetch(`${base}/api/scoreboard`)).text(), /Scoreboard/);
  assert.match(await (await fetch(`${base}/d/2026-07-14-test-duel/doc/design-codex.md`)).text(), /codex design/);
  assert.equal((await fetch(`${base}/d/..%2F..%2Fetc/events`)).status, 404);
  assert.equal((await fetch(`${base}/d/2026-07-14-test-duel/doc/..%2Fduel.json`)).status, 404);
});

test('SSE replays valid lines, skips malformed, and tails live appends', async () => {
  const { root, d } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  const res = await fetch(`${base}/d/2026-07-14-test-duel/events`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const frames = [];
  const readUntil = async (n) => {
    while (frames.length < n) {
      const { value } = await reader.read();
      buf += dec.decode(value);
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (frame.startsWith('data: ')) frames.push(JSON.parse(frame.slice(6)));
      }
    }
  };
  await readUntil(2);                       // replay: 2 valid lines, malformed skipped
  assert.equal(frames[1].content, 'my design');
  appendFileSync(join(d, 'events.jsonl'), '{"actor":"claude","role":"rebuttal","round":2,"content":"attack!"}\n');
  await readUntil(3);                       // live tail
  assert.equal(frames[2].content, 'attack!');
  reader.cancel();
});

function twoDuelRoot() {
  const root = mkdtempSync(join(tmpdir(), 'duels-'));
  const older = join(root, '2026-07-14-alpha');
  const newer = join(root, '2026-07-15-beta');
  mkdirSync(older, { recursive: true });
  mkdirSync(newer, { recursive: true });
  writeFileSync(join(older, 'duel.json'), JSON.stringify({ task: 'alpha task', slug: '2026-07-14-alpha', phase: 'design', created: '2026-07-14T00:00:00Z' }));
  writeFileSync(join(older, 'events.jsonl'), '{"ts":"2026-07-14T00:00:01Z","actor":"orchestrator","role":"status","round":0,"content":"alpha content"}\n');
  writeFileSync(join(newer, 'duel.json'), JSON.stringify({ task: 'beta task', slug: '2026-07-15-beta', phase: 'design', created: '2026-07-15T00:00:00Z' }));
  writeFileSync(join(newer, 'events.jsonl'), '{"ts":"2026-07-15T00:00:01Z","actor":"orchestrator","role":"status","round":0,"content":"beta content"}\n');
  return { root, older, newer };
}

test('/api/duels orders newer-created duel first', async () => {
  const { root } = twoDuelRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  const duels = await (await fetch(`${base}/api/duels`)).json();
  assert.equal(duels.length, 2);
  assert.equal(duels[0].slug, '2026-07-15-beta', 'newer created duel sorts first');
  assert.equal(duels[1].slug, '2026-07-14-alpha');
});

test('SSE stream for one duel replays only that duel\'s events, not a sibling duel\'s', async () => {
  const { root } = twoDuelRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  const res = await fetch(`${base}/d/2026-07-14-alpha/events`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const readOneFrame = async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return null;
      buf += dec.decode(value);
      const idx = buf.indexOf('\n\n');
      if (idx === -1) continue;
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      if (frame.startsWith('data: ')) return JSON.parse(frame.slice(6));
    }
  };
  const first = await readOneFrame();
  assert.equal(first.content, 'alpha content');
  await reader.cancel();
});

test('events route 404s for a nonexistent duel', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  assert.equal((await fetch(`${base}/d/no-such-duel/events`)).status, 404);
});

test('serves index and arena pages with mount points', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  const index = await (await fetch(`${base}/duels`)).text();
  assert.match(index, /id="duel-list"/);
  const arena = await (await fetch(`${base}/d/2026-07-14-test-duel`)).text();
  assert.match(arena, /id="feed"/);
  assert.equal((await fetch(`${base}/static/duel.css`)).status, 200);
});

test('/ serves the hex map page; /duels keeps the list', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, launcher: spyLauncher(), wayfinder: spyWayfinder() });
  const base = await listen(app);
  after(() => app.close());
  const home = await (await fetch(`${base}/`)).text();
  assert.match(home, /id="hexmap"/);
  assert.match(home, /Next battle/i);
  assert.equal((await fetch(`${base}/static/map.js`)).status, 200);
  assert.equal((await fetch(`${base}/static/hexmap.mjs`)).headers.get('content-type'), 'text/javascript'); // .mjs served as JS
  assert.match(await (await fetch(`${base}/duels`)).text(), /id="duel-list"/);
});

function spyLauncher() {
  const calls = [];
  return { calls,
    spawnDuel: async (o) => { calls.push(['spawnDuel', o]); return { slug: '2026-07-15-spawned' }; },
    approve: async (s) => calls.push(['approve', s]),
    reject: async (s) => calls.push(['reject', s]),
    sendVerdict: async (s, w) => { if (w === 'nobody') throw new Error('bad winner'); calls.push(['verdict', s, w]); },
    runCheckpoint: async (s) => calls.push(['checkpoint', s]),
    finishDuel: async (s) => calls.push(['finish', s]),
    startHitl: async (o) => { calls.push(['startHitl', o]); return { slug: 'h' }; },
    hitlMessage: async (s, t) => calls.push(['hitl', s, t]),
    openSession: async (s) => { calls.push(['openSession', s]); return { slug: s }; },
    sessionMessage: async (s, t) => { calls.push(['sessionMessage', s, t]); return { edit: false }; },
    setSessionEdit: (s, on) => { calls.push(['setSessionEdit', s, on]); if (on) throw new Error('edit not allowed in phase design'); return { sessionEdit: false }; },
    canEditSession: () => false,
    status: () => ({ running: [], queued: [] }),
  };
}

test('launcher routes: spawn, controls, hitl, status, single-duel metadata', async () => {
  const { root } = fixtureRoot();
  const spy = spyLauncher();
  const app = createApp({ duelsDir: root, launcher: spy });
  const base = await listen(app);
  after(() => app.close());
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const single = await (await fetch(`${base}/api/duels/2026-07-14-test-duel`)).json();
  assert.equal(single.slug, '2026-07-14-test-duel');
  assert.equal((await fetch(`${base}/api/duels/nope-nope`)).status, 404);

  const sp = await post('/api/spawn', { task: 't', repo: '/tmp', pipeline: 'resolution' });
  assert.equal((await sp.json()).slug, '2026-07-15-spawned');
  assert.equal((await post('/api/spawn', { task: 't' })).status, 400);
  await post('/api/spawn', { task: 't', repo: '/tmp', pipeline: 'hitl' });
  assert.ok(spy.calls.some(c => c[0] === 'startHitl'), 'hitl pipeline routes to startHitl');
  // repo validation: nonexistent path and non-absolute path both 400
  assert.equal((await post('/api/spawn', { task: 't', repo: '/does/not/exist/xyz', pipeline: 'resolution' })).status, 400);
  assert.equal((await post('/api/spawn', { task: 't', repo: 'relative', pipeline: 'resolution' })).status, 400);
  // CSRF guard: wrong content-type refused with 415
  const wrongCt = await fetch(base + '/api/spawn', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrongCt.status, 415);

  assert.equal((await post('/api/d/2026-07-14-test-duel/approve', {})).status, 200);
  assert.equal((await post('/api/d/2026-07-14-test-duel/verdict', { winner: 'codex' })).status, 200);
  assert.equal((await post('/api/d/2026-07-14-test-duel/verdict', { winner: 'nobody' })).status, 409);
  assert.equal((await post('/api/hitl/2026-07-14-test-duel/message', { text: 'hi' })).status, 200);
  assert.equal((await post('/api/hitl/2026-07-14-test-duel/message', { text: '' })).status, 400);
  assert.deepEqual(await (await fetch(`${base}/api/launcher`)).json(), { running: [], queued: [] });
  assert.ok(spy.calls.some(c => c[0] === 'spawnDuel'));

  // --- security guard coverage ---
  // cross-site POST refused
  const xsite = await fetch(base + '/api/spawn', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: '{}' });
  assert.equal(xsite.status, 403);
  // --prefix field rejected
  assert.equal((await post('/api/spawn', { task: '--evil', repo: '/tmp', pipeline: 'resolution' })).status, 400);
  // bad category charset rejected
  assert.equal((await post('/api/spawn', { task: 't', repo: '/tmp', pipeline: 'resolution', category: 'a;b' })).status, 400);
  // execution pipeline requires a .git repo (/tmp has none)
  assert.equal((await post('/api/spawn', { task: 't', repo: '/tmp', pipeline: 'execution' })).status, 400);
  // all five control routes reach their launcher method
  for (const action of ['approve', 'reject', 'verdict', 'checkpoint', 'finish']) {
    const body = action === 'verdict' ? { winner: 'codex' } : {};
    assert.equal((await post(`/api/d/2026-07-14-test-duel/${action}`, body)).status, 200);
  }
  // 1MB body cap → clean 400 (not a socket reset)
  const big = await fetch(base + '/api/spawn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1_100_000) });
  assert.equal(big.status, 400);
});

test('arena page ships the controls mount and script hooks', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  const arena = await (await fetch(`${base}/d/2026-07-14-test-duel`)).text();
  assert.match(arena, /id="controls"/);
  const js = await (await fetch(`${base}/static/arena.js`)).text();
  assert.match(js, /api\/duels\//);       // polls single-duel metadata
  assert.match(js, /api\/hitl\//);        // hitl send wired
});

test('POST routes 503 without a launcher', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/spawn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 503);
});

// The auth gate is loopback-trusted: a request from the local machine (the test
// client is always loopback) is served WITHOUT a token, even when one is set.
// Only non-loopback (LAN/phone) requests hit authed(); that logic is unit-tested
// directly below with a mock non-loopback request.
test('token gate: loopback is trusted (served without token), healthz exempt', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, token: 'sekret' });
  const base = await listen(app);
  after(() => app.close());
  assert.equal((await fetch(`${base}/api/duels`)).status, 200);         // loopback → trusted
  assert.equal((await fetch(`${base}/healthz`)).status, 200);           // exempt (liveness)
});

const mockReq = (cookie) => ({ headers: cookie ? { cookie } : {} });
const mockRes = () => { const h = {}; return { setHeader: (k, v) => { h[k.toLowerCase()] = v; }, headers: h }; };
const mockUrl = (qs = '') => new URL('http://x/api/duels' + qs);

test('authed(): query token matches, sets the cookie, and rejects a wrong token', () => {
  const res = mockRes();
  assert.equal(authed(mockReq(), res, 'sekret', mockUrl('?token=sekret')), true, 'query match');
  assert.match(res.headers['set-cookie'], /duel_token=/);
  assert.match(res.headers['set-cookie'], /HttpOnly/);
  assert.equal(authed(mockReq(), mockRes(), 'sekret', mockUrl('?token=wrong')), false, 'wrong token');
  assert.equal(authed(mockReq(), mockRes(), 'sekret', mockUrl()), false, 'no token');
});

test('authed(): a valid cookie is accepted', () => {
  assert.equal(authed(mockReq('duel_token=sekret'), mockRes(), 'sekret', mockUrl()), true);
});

test('authed(): a malformed cookie is rejected cleanly, without throwing', () => {
  // a malformed percent-encoding in the cookie must not throw out of authed()
  assert.doesNotThrow(() => authed(mockReq('duel_token=%'), mockRes(), 'sekret', mockUrl()));
  assert.equal(authed(mockReq('duel_token=%'), mockRes(), 'sekret', mockUrl()), false);
});

test('no token configured → no auth gate (phase-1 behavior preserved)', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app);
  after(() => app.close());
  assert.equal((await fetch(`${base}/api/duels`)).status, 200);
});

function spyWayfinder() {
  const calls = [];
  const map = { map: { name: 'M' }, tickets: [{ id: 'T1', name: 'r', type: 'research', status: 'frontier', hitl: false, blockedBy: [], hex: [0, 0], heldBy: null }], fog: [], outOfScope: [] };
  return { calls, _map: map,
    setConfig: async (url) => { calls.push(['setConfig', url]); return { mapSlug: 'm' }; },
    getMap: () => map,
    syncMap: async (s) => { calls.push(['syncMap', s]); return map; },
    listMaps: () => [{ mapSlug: 'm', name: 'M', url: 'u' }],
    finalizeTicket: async (...a) => { calls.push(['finalize', ...a]); return map; },
    claimTicket: (...a) => { calls.push(['claimTicket', ...a]); },   // next-battle / hitl-open call this
    holdTicket: (...a) => { calls.push(['holdTicket', ...a]); },     // approve/finish call this after finalize
  };
}

test('map routes: config, sync, get, maps list, next-battle', async () => {
  const { root } = fixtureRoot();
  const wf = spyWayfinder();
  const spy = spyLauncher();
  const app = createApp({ duelsDir: root, launcher: spy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

  assert.equal((await post('/api/map/config', { url: 'https://linear.app/x/issue/M/m' })).status, 200);
  assert.ok(wf.calls.some(c => c[0] === 'setConfig'));
  assert.equal((await (await post('/api/map/sync', { slug: 'm' })).json()).map.name, 'M');
  assert.equal((await (await fetch(`${base}/api/map?slug=m`)).json()).map.name, 'M');
  assert.equal((await (await fetch(`${base}/api/maps`)).json())[0].mapSlug, 'm');
  // next-battle: frontier research ticket → claims + spawns a resolution duel
  const nb = await (await post('/api/map/next-battle', { slug: 'm' })).json();
  assert.ok(nb.slug || nb.hitl || nb.done);
  assert.ok(spy.calls.some(c => c[0] === 'spawnDuel'));
  assert.ok(wf.calls.some(c => c[0] === 'claimTicket'), 'next-battle claims the ticket');
});

test('battle-all fans out every unblocked frontier AFK ticket', async () => {
  const { root } = fixtureRoot();
  // two takeable frontier tickets; the spy's getMap flips a claimed ticket out of the frontier each call
  let claimed = new Set();
  const wf = spyWayfinder();
  wf.getMap = () => ({ map: { name: 'M' }, tickets: [
    { id: 'T1', name: 'a', type: 'research', status: claimed.has('T1') ? 'claimed' : 'frontier', hitl: false, blockedBy: [], hex: [0, 0], heldBy: null },
    { id: 'T2', name: 'b', type: 'research', status: claimed.has('T2') ? 'claimed' : 'frontier', hitl: false, blockedBy: [], hex: [1, 0], heldBy: null },
  ] });
  wf.claimTicket = (slug, id) => { claimed.add(id); wf.calls.push(['claimTicket', id]); };
  const spy = spyLauncher();
  const app = createApp({ duelsDir: root, launcher: spy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await (await fetch(base + '/api/map/battle-all', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: 'm' }) })).json();
  assert.equal(r.spawned.length, 2, 'both frontier tickets spawned');
  assert.equal(spy.calls.filter(c => c[0] === 'spawnDuel').length, 2);
});

test('map routes 503 without a wayfinder', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, launcher: spyLauncher() });
  const base = await listen(app);
  after(() => app.close());
  assert.equal((await fetch(base + '/api/map/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"slug":"m"}' })).status, 503);
});

test('wayfinder approve finalizes the tracker BEFORE completing locally (retry-safe)', async () => {
  const { root } = fixtureRoot();
  // a wayfinder-originated duel: duel.json carries map+ticket
  const d = join(root, '2026-07-15-wf-duel'); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ slug: '2026-07-15-wf-duel', phase: 'awaiting-approve', map: 'm', ticket: 'T1', winner: null, heldBy: null }));
  const order = [];
  const spawnSpy = spyLauncher(); spawnSpy.approve = async (s, h) => order.push(['approve', s, h]);
  const wf = spyWayfinder(); wf.finalizeTicket = async (...a) => { order.push(['finalize', ...a]); };
  const app = createApp({ duelsDir: root, launcher: spawnSpy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/d/2026-07-15-wf-duel/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ heldBy: 'codex' }) });
  assert.equal(r.status, 200);
  assert.deepEqual(order.map(x => x[0]), ['finalize', 'approve'], 'finalize runs before approve');
  // order[0] = ['finalize', mapSlug, ticketId, opts] — finalizeTicket's real signature is
  // (mapSlug, ticketId, opts), so the holder rides in the 4th element (index 3).
  assert.equal(order[0][3].heldBy, 'codex'); // finalize got the holder
  // durable conquest: the winner is also stamped into map.json (holdTicket) after finalize,
  // so the hex holds its colour even though the tracker records no machine-readable winner.
  const hold = wf.calls.find(c => c[0] === 'holdTicket');
  assert.ok(hold, 'approve stamps the local conquest');
  assert.deepEqual([hold[1], hold[2], hold[3]], ['m', 'T1', 'codex'], 'holdTicket got map, ticket, winner');
});

test('a failing finalize 409s and does NOT complete the duel locally (retryable)', async () => {
  const { root } = fixtureRoot();
  const d = join(root, '2026-07-15-wf-fail'); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ slug: '2026-07-15-wf-fail', phase: 'awaiting-approve', map: 'm', ticket: 'T1' }));
  let approved = false;
  const spawnSpy = spyLauncher(); spawnSpy.approve = async () => { approved = true; };
  const wf = spyWayfinder(); wf.finalizeTicket = async () => { throw new Error('tracker down'); };
  const app = createApp({ duelsDir: root, launcher: spawnSpy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/d/2026-07-15-wf-fail/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ heldBy: 'codex' }) });
  assert.equal(r.status, 409);
  assert.equal(approved, false, 'approve did NOT run after finalize failed — duel stays retryable');
});

test('approve build:true → codex builds in the map repo (finalize, NO conquest, NO finish)', async () => {
  const { root } = fixtureRoot();
  const d = join(root, '2026-07-16-wf-build'); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ slug: '2026-07-16-wf-build', phase: 'awaiting-approve', map: 'm', ticket: 'T1' }));
  const order = [];
  const spawnSpy = spyLauncher();
  spawnSpy.approve = async () => order.push(['approve']);
  spawnSpy.buildResolution = async (s, repo) => { order.push(['build', s, repo]); return { building: true }; };
  const wf = spyWayfinder();
  wf.finalizeTicket = async () => { order.push(['finalize']); };
  wf.mapRepo = () => process.cwd(); // the duel repo has a .git → passes validateRepo(execution)
  const app = createApp({ duelsDir: root, launcher: spawnSpy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/d/2026-07-16-wf-build/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ heldBy: 'codex', build: true }) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, building: true });
  assert.deepEqual(order.map(x => x[0]), ['build'], 'goes straight to the build — decision recorded on finish, not now');
  assert.equal(order.find(x => x[0] === 'build')[2], process.cwd(), 'build got the map repo');
  assert.ok(!order.some(x => x[0] === 'finalize'), 'no finalize yet — deferred to finish so the ticket gets ONE comment');
  assert.ok(!wf.calls.some(c => c[0] === 'holdTicket'), 'no conquest yet — the hex is held only on finish');
  assert.ok(!order.some(x => x[0] === 'approve'), 'the duel is NOT finished — it moves to implementing');
});

test('approve build:true 400s when the map has no build repo configured', async () => {
  const { root } = fixtureRoot();
  const d = join(root, '2026-07-16-wf-norepo'); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ slug: '2026-07-16-wf-norepo', phase: 'awaiting-approve', map: 'm', ticket: 'T1' }));
  let built = false;
  const spawnSpy = spyLauncher();
  spawnSpy.buildResolution = async () => { built = true; };
  const wf = spyWayfinder();
  wf.finalizeTicket = async () => {};
  wf.mapRepo = () => null; // no repo on the map
  const app = createApp({ duelsDir: root, launcher: spawnSpy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/d/2026-07-16-wf-norepo/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ heldBy: 'codex', build: true }) });
  assert.equal(r.status, 400);
  assert.equal(built, false, 'no build without a valid repo');
});

test('opening a HITL live session claims its ticket (one session = one ticket)', async () => {
  const { root } = fixtureRoot();
  const wf = spyWayfinder();
  const spy = spyLauncher(); // startHitl returns { slug: 'h' }
  const app = createApp({ duelsDir: root, launcher: spy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/spawn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: 'grill it', repo: '/tmp', pipeline: 'hitl', category: 'grilling', ticket: 'T1', map: 'm' }) });
  assert.equal(r.status, 200);
  assert.ok(spy.calls.some(c => c[0] === 'startHitl'), 'routed to startHitl');
  const claim = wf.calls.find(c => c[0] === 'claimTicket');
  assert.ok(claim, 'HITL open claims the ticket');
  assert.deepEqual([claim[1], claim[2], claim[3]], ['m', 'T1', 'h'], 'claimTicket got map, ticket, session slug');
});

test('a HITL spawn with a traversal map slug does NOT claim (slug guarded)', async () => {
  const { root } = fixtureRoot();
  const wf = spyWayfinder();
  const spy = spyLauncher();
  const app = createApp({ duelsDir: root, launcher: spy, wayfinder: wf, token: null });
  const base = await listen(app);
  after(() => app.close());
  const r = await fetch(base + '/api/spawn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: 't', repo: '/tmp', pipeline: 'hitl', ticket: 'T1', map: '../evil' }) });
  assert.equal(r.status, 200); // the spawn itself still succeeds
  assert.ok(!wf.calls.some(c => c[0] === 'claimTicket'), 'a bad map slug is not written into the wayfinder dir');
});

test('map routes reject a path-traversal slug', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, launcher: spyLauncher(), wayfinder: spyWayfinder(), token: null });
  const base = await listen(app);
  after(() => app.close());
  assert.equal((await fetch(base + '/api/map?slug=' + encodeURIComponent('../../secrets'))).status, 400);
  const r = await fetch(base + '/api/map/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: '../evil' }) });
  assert.equal(r.status, 400);
});

test('decompose route splits the resolved plan into sub-tickets', async () => {
  const { root } = fixtureRoot();
  const d = join(root, '2026-07-16-wf-decompose'); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ slug: '2026-07-16-wf-decompose', phase: 'awaiting-approve', map: 'm', ticket: 'SPS-9', task: 'big thing' }));
  writeFileSync(join(d, 'draft-resolution.md'), '# a big plan\n...');
  const calls = [];
  const spawnSpy = spyLauncher(); spawnSpy.markDecomposed = (s, n) => calls.push(['markDecomposed', s, n]);
  const wf = spyWayfinder(); wf.decomposeTicket = async (map, ticket) => { calls.push(['decompose', map, ticket]); return { ok: true, parent: ticket, created: 4 }; };
  const app = createApp({ duelsDir: root, launcher: spawnSpy, wayfinder: wf, token: null });
  const base = await listen(app); after(() => app.close());
  const r = await fetch(base + '/api/d/2026-07-16-wf-decompose/decompose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).created, 4);
  assert.ok(calls.some(c => c[0] === 'decompose' && c[2] === 'SPS-9'), 'decomposed the parent ticket');
  assert.ok(calls.some(c => c[0] === 'markDecomposed'), 'marked the duel decomposed');
});

test('decompose 400s when there is no resolved plan to split', async () => {
  const { root } = fixtureRoot();
  const d = join(root, '2026-07-16-wf-noplan'); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'duel.json'), JSON.stringify({ slug: '2026-07-16-wf-noplan', phase: 'awaiting-approve', map: 'm', ticket: 'SPS-9' }));
  let decomposed = false;
  const wf = spyWayfinder(); wf.decomposeTicket = async () => { decomposed = true; };
  const app = createApp({ duelsDir: root, launcher: spyLauncher(), wayfinder: wf, token: null });
  const base = await listen(app); after(() => app.close());
  const r = await fetch(base + '/api/d/2026-07-16-wf-noplan/decompose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 400);
  assert.equal(decomposed, false);
});

// ---- phone connect: auto-token, loopback trust, /connect QR ----

test('isLoopback recognizes loopback addresses only', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.5'])
    assert.equal(isLoopback({ socket: { remoteAddress: a }, headers: { host: 'localhost:4321' } }), true, a);
  for (const a of ['192.168.1.9', '10.0.0.2', '100.64.1.1', ''])
    assert.equal(isLoopback({ socket: { remoteAddress: a }, headers: { host: 'localhost:4321' } }), false, a);
});

test('isLoopback refuses a loopback socket with a foreign Host (DNS rebinding)', () => {
  for (const host of ['evil.com', 'evil.com:4321', '192.168.1.9:4321', ''])
    assert.equal(isLoopback({ socket: { remoteAddress: '127.0.0.1' }, headers: { host } }), false, host || '(none)');
  for (const host of ['localhost', '127.0.0.1:4321', '[::1]:4321', 'LOCALHOST:4321'])
    assert.equal(isLoopback({ socket: { remoteAddress: '127.0.0.1' }, headers: { host } }), true, host);
});

test('isLoopback treats proxied/tunneled requests as remote (token required)', () => {
  // cloudflared/ngrok forward from localhost but add a forwarding header — must NOT be trusted
  for (const hdr of ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'forwarded'])
    assert.equal(isLoopback({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost', [hdr]: '1.2.3.4' } }), false, hdr);
  // a genuine local request (no forwarding header) is still trusted
  assert.equal(isLoopback({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost' } }), true);
});

test('resolveToken persists a stable token and honors the env override', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tok-'));
  const saved = process.env.DUEL_TOKEN; delete process.env.DUEL_TOKEN;
  try {
    const a = resolveToken(dir);
    assert.ok(a && a.length >= 16, 'generated a token');
    assert.equal(readFileSync(join(dir, 'viewer-token'), 'utf8').trim(), a, 'persisted to disk');
    assert.equal(resolveToken(dir), a, 'second call reuses the persisted token');
    process.env.DUEL_TOKEN = 'explicit-override';
    assert.equal(resolveToken(dir), 'explicit-override', 'env wins over the file');
  } finally { if (saved === undefined) delete process.env.DUEL_TOKEN; else process.env.DUEL_TOKEN = saved; }
});

test('lanUrl bakes the token in and honors DUEL_HOST', () => {
  const saved = process.env.DUEL_HOST;
  try {
    process.env.DUEL_HOST = 'my-box.tail.ts.net';
    assert.equal(lanUrl(4321, 'abc'), 'http://my-box.tail.ts.net:4321?token=abc');
  } finally { if (saved === undefined) delete process.env.DUEL_HOST; else process.env.DUEL_HOST = saved; }
});

test('lanUrl prefers a Tailscale HTTPS host (secure origin for the iOS mic), no port', () => {
  const saved = process.env.DUEL_HTTPS_HOST;
  try {
    process.env.DUEL_HTTPS_HOST = 'my-box.tail.ts.net';
    assert.equal(lanUrl(4321, 'abc'), 'https://my-box.tail.ts.net/?token=abc');
    process.env.DUEL_HTTPS_HOST = 'https://my-box.tail.ts.net/';   // tolerate scheme/trailing slash
    assert.equal(lanUrl(4321, 'abc'), 'https://my-box.tail.ts.net/?token=abc');
  } finally { if (saved === undefined) delete process.env.DUEL_HTTPS_HOST; else process.env.DUEL_HTTPS_HOST = saved; }
});

test('/connect returns the LAN URL with token baked in + a QR svg (loopback trusted)', async () => {
  const { root } = fixtureRoot();
  // token is set, but the test client is loopback → trusted, no token needed on the request
  const app = createApp({ duelsDir: root, token: 'secret-token-123' });
  const base = await listen(app); after(() => app.close());
  const r = await fetch(base + '/connect');
  assert.equal(r.status, 200);
  const { url, svg } = await r.json();
  assert.match(url, /^http:\/\/.+:\d+\?token=secret-token-123$/, 'url carries the token');
  assert.match(svg, /^<svg xmlns/, 'svg payload');
});

test('/connect says local when bound to loopback without a Tailscale HTTPS host', async () => {
  const { root } = fixtureRoot();
  const saved = process.env.DUEL_HTTPS_HOST; delete process.env.DUEL_HTTPS_HOST;
  const at = (app, host) => new Promise(r => app.listen(0, host, () => r(`http://127.0.0.1:${app.address().port}`)));
  let a, b;
  try {
    a = createApp({ duelsDir: root, token: 't' }); const ba = await at(a, '127.0.0.1');
    assert.equal((await (await fetch(ba + '/connect')).json()).local, true, 'loopback bind -> local');
    b = createApp({ duelsDir: root, token: 't' }); const bb = await at(b, '0.0.0.0');
    assert.equal((await (await fetch(bb + '/connect')).json()).local, false, 'LAN bind -> not local');
    process.env.DUEL_HTTPS_HOST = 'box.tail.ts.net';
    assert.equal((await (await fetch(ba + '/connect')).json()).local, false, 'tailscale https -> not local');
  } finally {
    a?.close(); b?.close();
    if (saved === undefined) delete process.env.DUEL_HTTPS_HOST; else process.env.DUEL_HTTPS_HOST = saved;
  }
});

test('loopback requests bypass the token entirely', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, token: 'secret-token-123' });
  const base = await listen(app); after(() => app.close());
  // no token on the request, but we connect over loopback → allowed
  assert.equal((await fetch(base + '/api/duels')).status, 200);
});

// ---- live session routes (open / message / edit) ----

test('session routes: open, message, and edit dispatch to the launcher', async () => {
  const { root } = fixtureRoot();
  const spy = spyLauncher();
  const app = createApp({ duelsDir: root, launcher: spy });
  const base = await listen(app); after(() => app.close());
  const slug = '2026-07-14-test-duel';
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });

  assert.equal((await post(`/api/session/${slug}/open`)).status, 200);
  assert.ok(spy.calls.some(c => c[0] === 'openSession' && c[1] === slug));

  const rm = await post(`/api/session/${slug}/message`, { text: 'hello session' });
  assert.equal(rm.status, 200);
  assert.ok(spy.calls.some(c => c[0] === 'sessionMessage' && c[2] === 'hello session'));

  // empty text → 400, no dispatch
  assert.equal((await post(`/api/session/${slug}/message`, { text: '   ' })).status, 400);
});

test('session message on a nonexistent duel → 404', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, launcher: spyLauncher() });
  const base = await listen(app); after(() => app.close());
  const r = await fetch(base + '/api/session/2026-01-01-nope/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"hi"}' });
  assert.equal(r.status, 404);
});

test('session edit that the guardrail refuses → 409', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, launcher: spyLauncher() });   // spy throws when on=true
  const base = await listen(app); after(() => app.close());
  const r = await fetch(base + '/api/session/2026-07-14-test-duel/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"on":true}' });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /edit not allowed/);
});

test('/api/duels/<slug> is enriched with sessionCanEdit', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root, launcher: spyLauncher() });
  const base = await listen(app); after(() => app.close());
  const j = await (await fetch(base + '/api/duels/2026-07-14-test-duel')).json();
  assert.equal(j.sessionCanEdit, false);
  assert.equal(j.slug, '2026-07-14-test-duel');   // still the duel meta
});

// ---- speech-to-text (/api/stt) ----

test('ffmpegArgs / whisperArgs build the expected argv', () => {
  assert.deepEqual(ffmpegArgs('/t/in', '/t/a.wav'), ['-hide_banner', '-loglevel', 'error', '-i', '/t/in', '-ar', '16000', '-ac', '1', '-f', 'wav', '-y', '/t/a.wav']);
  assert.deepEqual(whisperArgs('/m.bin', '/t/a.wav', '/t/out'), ['-m', '/m.bin', '-f', '/t/a.wav', '-nt', '-np', '-otxt', '-of', '/t/out']);
});

test('/api/stt degrades to 503 with an install hint when the binaries are missing', async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app); after(() => app.close());
  const saved = { b: process.env.DUEL_WHISPER_BIN, m: process.env.DUEL_WHISPER_MODEL };
  process.env.DUEL_WHISPER_BIN = 'definitely-not-a-real-binary-xyz';
  process.env.DUEL_WHISPER_MODEL = '/nope/model.bin';
  try {
    const r = await fetch(base + '/api/stt', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.from([1, 2, 3]) });
    assert.equal(r.status, 503);
    assert.match((await r.json()).hint, /whisper/);
  } finally {
    if (saved.b === undefined) delete process.env.DUEL_WHISPER_BIN; else process.env.DUEL_WHISPER_BIN = saved.b;
    if (saved.m === undefined) delete process.env.DUEL_WHISPER_MODEL; else process.env.DUEL_WHISPER_MODEL = saved.m;
  }
});

// live smoke: real ffmpeg + whisper on the bundled JFK sample. Skipped unless the
// binaries + a model are present (mirrors the other live-only steps in the suite).
const JFK = '/opt/homebrew/share/whisper-cpp/jfk.wav';
test('live: /api/stt transcribes a real WAV', { skip: !(sttReady() && existsSync(JFK)) }, async () => {
  const { root } = fixtureRoot();
  const app = createApp({ duelsDir: root });
  const base = await listen(app); after(() => app.close());
  const r = await fetch(base + '/api/stt', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: readFileSync(JFK) });
  assert.equal(r.status, 200);
  assert.match((await r.json()).text.toLowerCase(), /country/);
});
