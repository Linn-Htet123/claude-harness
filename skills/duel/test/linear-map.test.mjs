import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinearMap, ticketType, ticketStatus, isHitlType, mapNarrative } from '../scripts/linear-map.mjs';

test('ticketType reads the wayfinder:<type> label, defaults to task', () => {
  assert.equal(ticketType(['wayfinder:research']), 'research');
  assert.equal(ticketType(['area:ui', 'wayfinder:grilling']), 'grilling');
  assert.equal(ticketType(['wayfinder:nonsense']), 'task', 'unknown → task');
  assert.equal(ticketType([]), 'task', 'no label → task');
  assert.equal(ticketType(), 'task', 'undefined → task');
});

test('isHitlType: grilling/prototype are HITL, research/task are not', () => {
  assert.equal(isHitlType('grilling'), true);
  assert.equal(isHitlType('prototype'), true);
  assert.equal(isHitlType('research'), false);
  assert.equal(isHitlType('task'), false);
});

test('ticketStatus maps Linear state types', () => {
  assert.equal(ticketStatus('completed', 'alice'), 'closed');
  assert.equal(ticketStatus('canceled', null), 'closed');
  assert.equal(ticketStatus('started', 'alice'), 'claimed', 'in-progress + assignee → claimed');
  assert.equal(ticketStatus('started', null), 'frontier', 'in-progress, unassigned → frontier');
  assert.equal(ticketStatus('backlog', null), 'frontier');
  assert.equal(ticketStatus('unstarted', 'alice'), 'frontier', 'assigned but not started → still frontier');
});

test('parseLinearMap transforms a normalised payload into the map shape', () => {
  const issues = [
    { id: 'X-1', title: 'Which parser?', statusType: 'backlog', labels: ['wayfinder:research'], assignee: null },
    { id: 'X-2', title: 'Ship it', statusType: 'completed', labels: ['wayfinder:task'], assignee: 'A' },
    { id: 'X-3', title: 'Grill the model', statusType: 'started', labels: ['wayfinder:grilling'], assignee: 'A' },
    { id: 'X-4', title: 'No label', statusType: 'unstarted', labels: [], assignee: null },
  ];
  const map = parseLinearMap({ issues, mapId: 'X-99', mapName: 'Test', mapBody: '' });
  assert.equal(map.map.id, 'X-99');
  assert.equal(map.map.tracker, 'linear');
  assert.equal(map.tickets.length, 4);
  assert.deepEqual(map.tickets[0], { id: 'X-1', name: 'Which parser?', type: 'research', status: 'frontier', hitl: false, blockedBy: [], duel: null, heldBy: null });
  assert.equal(map.tickets[1].status, 'closed');
  assert.deepEqual([map.tickets[2].status, map.tickets[2].hitl], ['claimed', true]);
  assert.deepEqual([map.tickets[3].type, map.tickets[3].name], ['task', 'No label']);
});

test('mapNarrative pulls destination + out-of-scope out of a Linear body', () => {
  const body = '## Destination\\n\\n**Redrawn 2026-07-13 (alice, via [ABC-143](<https://x>)) — Route C: Lovable parity core + creator vertical extensions.** more\\n\\n## Out of scope\\n\\n* **Full 1:1 Lovable clone (D0-A)** — rejected\\n* **Native mobile** — later\\n\\n## Next';
  const { destination, outOfScope } = mapNarrative(body);
  assert.equal(destination, 'Route C: Lovable parity core + creator vertical extensions');
  assert.deepEqual(outOfScope, ['Full 1:1 Lovable clone (D0-A)', 'Native mobile']);
});

// A large generated payload (82 children, the size of a real map) → a valid map, deterministically.
test('parseLinearMap handles a large 82-ticket payload deterministically', () => {
  const types = ['research', 'task', 'grilling', 'prototype'];
  const issues = Array.from({ length: 82 }, (_, i) => {
    const n = i + 1;
    const statusType = n <= 58 ? 'completed' : n <= 73 ? 'canceled' : n <= 80 ? 'backlog' : 'started';
    return {
      id: `ABC-${n}`, title: `Ticket ${n}`, statusType,
      labels: n % 5 === 0 ? [] : [`wayfinder:${types[n % types.length]}`],
      assignee: statusType === 'started' ? 'alice' : null,
    };
  });
  const map = parseLinearMap({ issues, mapId: 'ABC-0', mapName: 'Engine — Map', mapBody: '' });
  assert.equal(map.tickets.length, 82, 'every child becomes a ticket');
  // every ticket is well-formed
  for (const t of map.tickets) {
    assert.ok(t.id && /^ABC-\d+$/.test(t.id), `id ${t.id}`);
    assert.ok(types.includes(t.type));
    assert.ok(['closed', 'claimed', 'frontier'].includes(t.status));
    assert.equal(t.hitl, t.type === 'grilling' || t.type === 'prototype');
    assert.deepEqual(t.blockedBy, []);
  }
  // this map is mostly shipped — the majority of tickets are closed, and there IS a live frontier
  const closed = map.tickets.filter(t => t.status === 'closed').length;
  const frontier = map.tickets.filter(t => t.status === 'frontier').length;
  assert.equal(closed, 73, 'completed + canceled are closed');
  assert.equal(frontier, 7, 'backlog tickets are the frontier');
  assert.equal(map.tickets.filter(t => t.status === 'claimed').length, 2);
});
