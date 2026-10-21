import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignHexCoords, AXIAL_DIRS, nextBattle, territoryTally, hexSvg } from '../viewer/static/hexmap.mjs';

const key = (h) => h.join(',');
const adjacent = (a, b) => AXIAL_DIRS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);

test('every ticket gets a unique hex coord', () => {
  const tickets = [
    { id: 'A', blockedBy: [] }, { id: 'B', blockedBy: ['A'] },
    { id: 'C', blockedBy: ['A'] }, { id: 'D', blockedBy: ['B', 'C'] },
  ];
  const placed = assignHexCoords(tickets);
  const coords = placed.map(t => key(t.hex));
  assert.equal(new Set(coords).size, coords.length, 'no two tickets share a cell');
  assert.equal(placed.length, 4);
});

test('a blocked ticket is placed adjacent to a blocker (proximity)', () => {
  const placed = assignHexCoords([{ id: 'A', blockedBy: [] }, { id: 'B', blockedBy: ['A'] }]);
  const a = placed.find(t => t.id === 'A').hex;
  const b = placed.find(t => t.id === 'B').hex;
  assert.ok(adjacent(a, b), `B ${key(b)} should be adjacent to its blocker A ${key(a)}`);
});

test('existing coords are preserved; only new tickets are placed', () => {
  const placed = assignHexCoords(
    [{ id: 'A', blockedBy: [] }, { id: 'B', blockedBy: ['A'] }],
    { A: [5, 5] });
  assert.deepEqual(placed.find(t => t.id === 'A').hex, [5, 5]);
  assert.ok(adjacent([5, 5], placed.find(t => t.id === 'B').hex));
});

test('deterministic: same input yields identical layout', () => {
  const t = [{ id: 'A', blockedBy: [] }, { id: 'B', blockedBy: ['A'] }, { id: 'C', blockedBy: ['A'] }];
  assert.deepEqual(assignHexCoords(t), assignHexCoords(t));
});

test('multiple root tickets place without crashing (regression: reused generator)', () => {
  const placed = assignHexCoords([{ id: 'A', blockedBy: [] }, { id: 'B', blockedBy: [] }, { id: 'C', blockedBy: [] }]);
  assert.equal(new Set(placed.map(t => t.hex.join(','))).size, 3, 'three distinct cells, no crash');
});

test('a cyclic or unknown blocker is still placed via the spiral fallback', () => {
  const cyc = assignHexCoords([{ id: 'A', blockedBy: [] }, { id: 'X', blockedBy: ['Y'] }, { id: 'Y', blockedBy: ['X'] }]);
  assert.equal(cyc.length, 3);
  assert.ok(cyc.every(t => Array.isArray(t.hex)), 'cycle members placed (fallback), no crash');
  const unk = assignHexCoords([{ id: 'A', blockedBy: [] }, { id: 'Z', blockedBy: ['NOPE'] }]);
  assert.ok(unk.find(t => t.id === 'Z').hex, 'unknown-blocker ticket still placed');
});

test('a blocker with >6 dependents places them all uniquely and near the blocker', () => {
  const tickets = [{ id: 'R', blockedBy: [] }];
  for (let i = 0; i < 9; i++) tickets.push({ id: `C${i}`, blockedBy: ['R'] });
  const placed = assignHexCoords(tickets);
  assert.equal(new Set(placed.map(t => t.hex.join(','))).size, 10, 'all 10 cells unique (no collision past 6 neighbors)');
  // hex geometry: a center has only 6 strictly-adjacent cells, so 9 dependents cannot all
  // be adjacent — nearest-free clusters the overflow into the next ring (proximity is the goal).
  const R = placed.find(t => t.id === 'R').hex;
  const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[0] + a[1] - b[0] - b[1]) + Math.abs(a[1] - b[1])) / 2;
  assert.ok(placed.filter(t => t.id !== 'R').every(t => dist(R, t.hex) <= 2), 'dependents cluster within 2 rings of the blocker');
});

const mk = (tickets) => ({ tickets });

test('nextBattle returns the first unblocked, unclaimed, open frontier ticket', () => {
  const map = mk([
    { id: 'A', status: 'closed', blockedBy: [], hitl: false },
    { id: 'B', status: 'frontier', blockedBy: ['A'], hitl: false },   // unblocked (A closed)
    { id: 'C', status: 'blocked', blockedBy: ['B'], hitl: false },    // still blocked (B open)
    { id: 'D', status: 'claimed', blockedBy: ['A'], hitl: false },    // already claimed
  ]);
  const nb = nextBattle(map);
  assert.equal(nb.ticket.id, 'B');
  assert.equal(nb.isHitl, false);
});

test('nextBattle flags a HITL frontier ticket', () => {
  const nb = nextBattle(mk([{ id: 'G', status: 'frontier', blockedBy: [], hitl: true, type: 'grilling' }]));
  assert.equal(nb.ticket.id, 'G');
  assert.equal(nb.isHitl, true);
});

test('nextBattle returns null when nothing is takeable', () => {
  assert.equal(nextBattle(mk([{ id: 'A', status: 'closed', blockedBy: [] }])), null);
  assert.equal(nextBattle(mk([{ id: 'B', status: 'blocked', blockedBy: ['X'] }])), null); // X unknown/open
});

test('territoryTally counts closed hexes by holder', () => {
  const t = territoryTally(mk([
    { id: 'A', status: 'closed', heldBy: 'codex' },
    { id: 'B', status: 'closed', heldBy: 'claude' },
    { id: 'C', status: 'closed', heldBy: 'codex' },
    { id: 'D', status: 'closed', heldBy: null },        // human/draw → neutral
    { id: 'E', status: 'frontier', heldBy: null },      // not closed → not counted
  ]));
  assert.deepEqual(t, { claude: 1, codex: 2, neutral: 1 });
});

test('hexSvg emits one hex group per ticket with status/held/type data', () => {
  const svg = hexSvg({
    map: { name: 'M' },
    tickets: [
      { id: 'A', name: 'root', status: 'closed', heldBy: 'codex', type: 'research', hex: [0, 0], blockedBy: [] },
      { id: 'B', name: 'front', status: 'frontier', heldBy: null, type: 'grilling', hex: [1, 0], blockedBy: ['A'] },
    ],
    fog: ['a suspected question'], outOfScope: ['ruled out'],
  });
  assert.match(svg, /^<svg[\s>]/);
  assert.equal((svg.match(/class="hex"/g) || []).length, 2);
  assert.match(svg, /data-id="A"[^>]*data-status="closed"[^>]*data-held="codex"/);
  assert.match(svg, /data-id="B"[^>]*data-status="frontier"[^>]*data-held=""/);
  assert.match(svg, /<title>root<\/title>/);
  assert.ok(svg.includes('class="fog"'), 'fog tile rendered');
  assert.ok(svg.includes('class="water"'), 'out-of-scope water rendered');
  assert.match(svg, /<\/svg>\s*$/);
});

test('hexSvg escapes ticket names (no markup injection)', () => {
  const svg = hexSvg({ map: {}, tickets: [{ id: 'X', name: '<script>evil</script>', status: 'frontier', hex: [0, 0], blockedBy: [] }], fog: [], outOfScope: [] });
  assert.ok(!svg.includes('<script>evil'), 'name is escaped');
  assert.match(svg, /&lt;script&gt;/);
});

test('hexSvg renders the faux-3D RTS elements: defs gradients, extruded sides, terrain glyph, banner, live pulse', () => {
  const svg = hexSvg({
    map: {},
    tickets: [
      { id: 'A', name: 'held', status: 'closed', heldBy: 'codex', type: 'research', hex: [0, 0], blockedBy: [], duel: 'd1' },
      { id: 'B', name: 'fighting', status: 'claimed', heldBy: null, type: 'task', hex: [1, 0], blockedBy: [], duel: 'd2' },
    ], fog: [], outOfScope: [],
  });
  assert.match(svg, /<defs>[\s\S]*<linearGradient id="g-codex"/, 'terrain gradients in defs');
  assert.ok((svg.match(/class="side/g) || []).length >= 6, 'each hex has extruded side faces');
  assert.match(svg, /url\(#g-codex\)/, 'codex-held hex uses the codex terrain gradient');
  assert.match(svg, /class="banner banner-codex"[^>]*>🚩/, 'held hex flies a banner');
  assert.match(svg, /class="hex live"[^>]*data-id="B"/, 'the live duel hex is marked live');
  assert.match(svg, /class="glyph"[^>]*>⚔️/, 'the live hex shows crossed swords');
  assert.match(svg, /class="glyph"[^>]*>🌲/, 'research hex shows a forest glyph');
});
