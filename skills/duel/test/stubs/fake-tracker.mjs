#!/usr/bin/env node
// Fake tracker agent. Real one (Task 8) is a claude -p spawn. Env: FAKE_TRACKER_JSON (path to canned sync base), FAKE_TRACKER_FAIL=1, FAKE_TRACKER_HANG=1.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const op = opt('op'); const out = opt('out');

// Node's `node --test` default discovery glob matches ANY .mjs file under a
// directory named "test" (not just *.test.mjs) — it will import this file with
// zero argv/env as part of the full-suite run (same hazard documented in
// fake-wrapper.mjs). Without this guard, the auto-discovery invocation (no --op)
// would fall through to the "unknown op" branch and process.exit(1), which node's
// test runner reports as a failing test. Real wayfinder.mjs invocations always
// pass --op and --out, so this is a no-op for every real call path.
if (op) {
  if (process.env.FAKE_TRACKER_FAIL === '1') { console.error('fake tracker failed'); process.exit(1); }
  if (process.env.FAKE_TRACKER_HANG === '1') { setInterval(() => {}, 1000); } // never exits — exercises the runTracker timeout
  const mapdir = dirname(out);
  if (op === 'sync') {
    const base = process.env.FAKE_TRACKER_JSON ? JSON.parse(readFileSync(process.env.FAKE_TRACKER_JSON, 'utf8'))
      : { map: { id: 'M1', name: 'Test Map', destination: 'ship it', tracker: 'local' },
          tickets: [{ id: 'T1', name: 'root research', type: 'research', status: 'frontier', hitl: false, blockedBy: [], duel: null, heldBy: null }],
          fog: ['a later question'], outOfScope: [] };
    // simulate real tracker state: a ticket the finalizer already closed reports closed+held on the next sync
    let finalized = {};
    try { for (const f of readdirSync(mapdir)) { const m = f.match(/^finalized-(.+)\.json$/); if (m) finalized[m[1]] = JSON.parse(readFileSync(join(mapdir, f), 'utf8')); } } catch {}
    for (const t of base.tickets) if (t.id in finalized) { t.status = 'closed'; t.heldBy = finalized[t.id].heldBy ?? null; t.duel = t.duel || finalized[t.id].duelSlug || 'd-final'; }
    writeFileSync(out, JSON.stringify(base));
    console.log(JSON.stringify({ ok: true, op, out }));
  } else if (op === 'finalize') {
    const fin = JSON.parse(readFileSync(join(mapdir, 'finalize-input.json'), 'utf8'));
    writeFileSync(join(mapdir, `finalized-${fin.ticketId}.json`), JSON.stringify(fin));
    writeFileSync(out, JSON.stringify({ ok: true, ticket: fin.ticketId }));
    console.log(JSON.stringify({ ok: true, op, out }));
  } else if (op === 'decompose') {
    const dec = JSON.parse(readFileSync(join(mapdir, 'decompose-input.json'), 'utf8'));
    writeFileSync(out, JSON.stringify({ ok: true, parent: dec.parentTicketId, created: 3 }));
    console.log(JSON.stringify({ ok: true, op, out }));
  } else { console.error(`unknown op ${op}`); process.exit(1); }
}
