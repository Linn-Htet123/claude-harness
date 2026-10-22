// Shared, dependency-free map logic. Imported by the server, the browser page, and node:test.
export const AXIAL_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (q, r) => `${q},${r}`;

// spiral of axial rings around [0,0]: [0,0], then ring 1, ring 2, …
function* spiral() {
  yield [0, 0];
  for (let radius = 1; radius < 1000; radius++) {
    let q = -radius, r = radius; // start corner
    for (const [dq, dr] of AXIAL_DIRS) {
      for (let step = 0; step < radius; step++) { yield [q, r]; q += dq; r += dr; }
    }
  }
}

// nearest free cell adjacent to anchor, widening by rings if all neighbors are taken
function nearestFree(anchor, occupied) {
  const [aq, ar] = anchor;
  const seen = new Set([key(aq, ar)]);
  let frontier = [[aq, ar]];
  for (let depth = 0; depth < 1000; depth++) {
    const next = [];
    for (const [q, r] of frontier) {
      for (const [dq, dr] of AXIAL_DIRS) {
        const nq = q + dq, nr = r + dr, k = key(nq, nr);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!occupied.has(k)) return [nq, nr];
        next.push([nq, nr]);
      }
    }
    frontier = next;
  }
  return [aq, ar]; // unreachable in practice
}

export function assignHexCoords(tickets, existing = {}) {
  const coords = {};
  const occupied = new Set();
  for (const [id, hex] of Object.entries(existing)) { coords[id] = hex.slice(); occupied.add(key(hex[0], hex[1])); }
  const gen = spiral();
  // drive the generator with .next() — NOT a `for...of`, whose early `return` calls
  // gen.return() and permanently closes the generator, so a 2nd nextSpiralFree() call
  // would iterate zero times and return undefined → crash. Manual .next() keeps it alive.
  const nextSpiralFree = () => { for (let n = gen.next(); !n.done; n = gen.next()) { const [q, r] = n.value; if (!occupied.has(key(q, r))) return [q, r]; } };

  // roots first (stable id order), then repeatedly place any ticket whose a blocker is placed
  const unplaced = tickets.filter(t => !coords[t.id]).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const roots = unplaced.filter(t => !(t.blockedBy || []).length);
  for (const t of roots) { const h = nextSpiralFree(); coords[t.id] = h; occupied.add(key(h[0], h[1])); }

  let remaining = unplaced.filter(t => (t.blockedBy || []).length);
  let progress = true;
  while (remaining.length && progress) {
    progress = false;
    const still = [];
    for (const t of remaining) {
      const anchorId = (t.blockedBy || []).find(b => coords[b]);
      if (!anchorId) { still.push(t); continue; }
      const h = nearestFree(coords[anchorId], occupied);
      coords[t.id] = h; occupied.add(key(h[0], h[1])); progress = true;
    }
    remaining = still;
  }
  // any leftover (cyclic/unknown blockers) → spiral
  for (const t of remaining) { const h = nextSpiralFree(); coords[t.id] = h; occupied.add(key(h[0], h[1])); }

  return tickets.map(t => ({ ...t, hex: coords[t.id] }));
}

function isClosed(t) { return t.status === 'closed'; }

function depth(t, byId, memo = new Map()) {
  if (memo.has(t.id)) return memo.get(t.id);
  memo.set(t.id, 0); // cycle guard
  const d = (t.blockedBy || []).reduce((mx, b) => { const bt = byId.get(b); return bt ? Math.max(mx, 1 + depth(bt, byId, memo)) : mx; }, 0);
  memo.set(t.id, d);
  return d;
}

export function nextBattle(map) {
  const byId = new Map(map.tickets.map(t => [t.id, t]));
  const frontier = map.tickets.filter(t =>
    t.status !== 'closed' && t.status !== 'claimed' &&
    (t.blockedBy || []).every(b => { const bt = byId.get(b); return bt && isClosed(bt); }));
  if (!frontier.length) return null;
  const memo = new Map();
  frontier.sort((a, b) => (depth(a, byId, memo) - depth(b, byId, memo)) || (a.id < b.id ? -1 : 1));
  const ticket = frontier[0];
  return { ticket, isHitl: !!ticket.hitl };
}

export function territoryTally(map) {
  const t = { claude: 0, codex: 0, neutral: 0 };
  for (const tk of map.tickets) {
    if (tk.status !== 'closed') continue;
    if (tk.heldBy === 'claude') t.claude++;
    else if (tk.heldBy === 'codex') t.codex++;
    else t.neutral++;
  }
  return t;
}

// --- faux-3D isometric RTS renderer -----------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HEX_W = 60, HEX_H = 34, DEPTH = 14; // flat-top, ~2:1 foreshortening, extruded prism height

// axial [q,r] → isometric screen center. The y-step is 3·HEX_H/4 (NOT HEX_H/2): that is the
// vertical distance at which a diagonal neighbour's lower edge coincides with this hex's upper
// edge, so the flat-top hexes tessellate edge-to-edge instead of stacking on top of each other.
function iso(q, r) { return { x: (q - r) * (HEX_W / 2), y: (q + r) * (HEX_H * 3 / 4) }; }

// flat-top hex outline points, centered at (cx,cy). Returns [[x,y]...] (6 verts, clockwise from top)
function hexVerts(cx, cy) {
  const hw = HEX_W / 2, hh = HEX_H / 2;
  return [[cx, cy - hh], [cx + hw, cy - hh / 2], [cx + hw, cy + hh / 2], [cx, cy + hh], [cx - hw, cy + hh / 2], [cx - hw, cy - hh / 2]];
}
const pts = (verts) => verts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');

// which top-face gradient this hex uses (terrain by state/holder/type)
function terrain(t) {
  if (t.status === 'closed') return t.heldBy === 'claude' ? 'g-claude' : t.heldBy === 'codex' ? 'g-codex' : 'g-settled';
  if (t.status === 'blocked') return 'g-rock';
  if (t.status === 'claimed') return 'g-claimed';
  // frontier / open: terrain by ticket type
  return t.type === 'research' ? 'g-forest' : t.type === 'task' ? 'g-quarry' : (t.type === 'grilling' || t.type === 'prototype') ? 'g-village' : 'g-grass';
}
const GLYPH = { research: '🌲', task: '⛏️', grilling: '🏰', prototype: '🏰' };

// empty cells hugging the occupied landmass — so decorative fog/sea FRAME the island
// instead of floating in the void. Deterministic order (outer-first, then by key).
function perimeter(occupied) {
  const seen = new Set(), out = [];
  for (const cellKey of occupied) {
    const [q, r] = cellKey.split(',').map(Number);
    for (const [dq, dr] of AXIAL_DIRS) {
      const nq = q + dq, nr = r + dr, k = key(nq, nr);
      if (occupied.has(k) || seen.has(k)) continue;
      seen.add(k); out.push([nq, nr]);
    }
  }
  out.sort((a, b) => (Math.abs(b[0]) + Math.abs(b[1]) - Math.abs(a[0]) - Math.abs(a[1])) ||
    (key(a[0], a[1]) < key(b[0], b[1]) ? -1 : 1));
  return out;
}

export function hexSvg(map) {
  const tickets = map.tickets || [];
  const occupied = new Set(tickets.map(t => key(t.hex[0], t.hex[1])));
  const cells = tickets.map(t => ({ t, ...iso(t.hex[0], t.hex[1]) }));
  // frame the landmass: fog on the nearer border cells, sea on the outer ones — never floating
  const border = perimeter(occupied);
  const fogN = (map.fog || []).length, waterN = (map.outOfScope || []).length;
  const scope = border.slice(0, waterN).map(([q, r]) => iso(q, r));           // outermost → sea
  const fog = border.slice(waterN, waterN + fogN).map(([q, r]) => iso(q, r)); // next ring in → fog
  const all = [...cells, ...fog, ...scope];
  const minX = Math.min(0, ...all.map(c => c.x)) - HEX_W, maxX = Math.max(0, ...all.map(c => c.x)) + HEX_W;
  const minY = Math.min(0, ...all.map(c => c.y)) - HEX_H - DEPTH, maxY = Math.max(0, ...all.map(c => c.y)) + HEX_H + DEPTH * 2;
  const W = Math.max(1, maxX - minX), H = Math.max(1, maxY - minY);

  // extruded prism: top face + left/right side faces (side verts = bottom edge of top, dropped by DEPTH)
  const prism = (cx, cy, topGrad, cls, extra = '') => {
    const v = hexVerts(cx, cy);
    const drop = (p) => [p[0], p[1] + DEPTH];
    const right = pts([v[1], v[2], drop(v[2]), drop(v[1])]);
    const left = pts([v[3], v[4], drop(v[4]), drop(v[3])]);
    const mid = pts([v[2], v[3], drop(v[3]), drop(v[2])]);
    return `<polygon class="side side-l" points="${left}"/><polygon class="side side-m" points="${mid}"/><polygon class="side side-r" points="${right}"/>` +
      `<polygon class="${cls}" points="${pts(v)}" fill="url(#${topGrad})"${extra}/>`;
  };

  const hex = (c) => {
    const t = c.t;
    const held = (t.heldBy === 'claude' || t.heldBy === 'codex') ? t.heldBy : '';
    const lift = t.status === 'frontier' ? -8 : t.status === 'blocked' ? 6 : 0; // raise frontier, sink blocked
    const cx = c.x, cy = c.y + lift;
    const live = t.status === 'claimed' && t.duel;
    const glyph = live ? '⚔️' : (GLYPH[t.type] || '');
    const banner = held ? `<text class="banner banner-${held}" x="${cx.toFixed(1)}" y="${(cy - HEX_H / 2 - 3).toFixed(1)}" text-anchor="middle">🚩</text>` : '';
    return `<g class="hex${live ? ' live' : ''}" data-id="${esc(t.id)}" data-status="${esc(t.status)}" data-held="${held}" data-type="${esc(t.type || '')}">` +
      `<title>${esc(t.name)}</title>` +
      prism(cx, cy, terrain(t), 'top') +
      (glyph ? `<text class="glyph" x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle">${glyph}</text>` : '') +
      banner +
      `</g>`;
  };
  const tile = (cls, grad, c) => `<g class="${cls}">${prism(c.x, c.y, grad, 'top-plain')}</g>`;

  // painter's algorithm: draw every tile back-to-front (top-of-screen first, then left-to-right)
  // so a nearer hex's extruded body correctly overlaps the one behind it. Sorting all three tile
  // kinds together keeps sea/fog layered with the terrain instead of always behind it.
  const drawn = [
    ...scope.map(c => ({ y: c.y, x: c.x, s: tile('water', 'g-water', c) })),
    ...fog.map(c => ({ y: c.y, x: c.x, s: tile('fog', 'g-fog', c) })),
    ...cells.map(c => ({ y: c.y, x: c.x, s: hex(c) })),
  ].sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return `<svg viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" class="hexmap">` +
    `<defs>` +
    grad('g-grass', '#7fb84a', '#4d7a2a') + grad('g-forest', '#3f7d3a', '#244a1f') +
    grad('g-quarry', '#b08a5a', '#6e5334') + grad('g-village', '#c9a86a', '#8a6f42') +
    grad('g-settled', '#5a6270', '#363c47') + grad('g-rock', '#2b2f38', '#171a20') +
    grad('g-claimed', '#8a7d3a', '#5c531f') +
    grad('g-claude', '#e0a94e', '#a6741f') + grad('g-codex', '#3fa9e0', '#1f6ba6') +
    grad('g-fog', '#3a4150', '#2a2f3a') + grad('g-water', '#1f6a9c', '#0d2f47') +
    `<filter id="drop"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-opacity="0.5"/></filter>` +
    `</defs>` +
    drawn.map(d => d.s).join('') +
    `</svg>`;
}

// vertical linear gradient (light top → dark bottom) for a terrain top face
function grad(id, light, dark) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
}
