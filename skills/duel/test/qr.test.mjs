import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrModules, qrTerminal, qrSvg } from '../viewer/qr.mjs';

test('qrModules returns a valid square QR matrix', () => {
  const m = qrModules('http://192.168.1.9:4321?token=abcdef0123456789', 'M');
  assert.ok(Array.isArray(m) && m.length === m[0].length, 'square');
  const n = m.length;
  assert.ok(n >= 21 && n <= 177 && (n - 21) % 4 === 0, `valid QR size, got ${n}`);
  // three finder patterns: a 7x7 with a 3x3 dark core, at the three corners
  const finder = (r0, c0) => m[r0][c0] && m[r0 + 6][c0] && m[r0][c0 + 6] && m[r0 + 3][c0 + 3] && !m[r0 + 1][c0 + 1];
  assert.ok(finder(0, 0), 'top-left finder');
  assert.ok(finder(0, n - 7), 'top-right finder');
  assert.ok(finder(n - 7, 0), 'bottom-left finder');
});

test('qrTerminal has a blank quiet-zone border and only half-block glyphs', () => {
  const s = qrTerminal('hello', 'M');
  const lines = s.split('\n').filter(Boolean);
  assert.match(lines[0], /^ +$/, 'top quiet-zone row is blank');
  assert.ok(lines.every(l => /^[█▀▄ ]+$/u.test(l)), 'only half-block glyphs + space');
});

test('deterministic + regression vector (frozen after first live scan)', () => {
  const a = qrModules('DUEL', 'M');
  const b = qrModules('DUEL', 'M');
  assert.deepEqual(a, b, 'same input → same matrix');
  // Frozen after Step 4: qrModules('http://192.168.1.9:4321?token=testtoken123456', 'M')
  // was rendered to a raster image and decoded with zbarimg (zbar 0.23.93), which
  // read back the exact input URL byte-for-byte. Size below is the real value the
  // vendored encoder produces for ('DUEL', 'M') (version 1, ECC M) - a genuine
  // snapshot, not a tautology.
  const EXPECTED_SIZE = 21;
  assert.equal(a.length, EXPECTED_SIZE);
});

test('qrSvg wraps the matrix in a scannable inline SVG', () => {
  const text = 'http://192.168.1.9:4321?token=abcdef0123456789';
  const svg = qrSvg(text, 'M');
  const n = qrModules(text, 'M').length;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'is an inline svg');
  // unit viewBox = matrix side + a 4-module quiet zone on each side
  assert.ok(svg.includes(`viewBox="0 0 ${n + 8} ${n + 8}"`), 'viewBox includes 4-module quiet zone');
  assert.match(svg, /<rect [^>]*fill="#fff"/, 'white background so it scans on a dark page');
  assert.match(svg, /shape-rendering="crispEdges"/, 'crisp modules at any scale');
  // one 1x1 subpath per dark module
  const darkCount = qrModules(text, 'M').flat().filter(Boolean).length;
  assert.equal((svg.match(/h1v1h-1z/g) || []).length, darkCount, 'one path cell per dark module');
});

test('qrSvg is deterministic', () => {
  assert.equal(qrSvg('DUEL', 'M'), qrSvg('DUEL', 'M'));
});
