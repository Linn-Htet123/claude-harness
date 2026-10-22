import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampScale, clampTranslate, zoomAround, panBy, isTap, MAX_SCALE } from '../viewer/static/panzoom.mjs';

const VP = { w: 1000, h: 800 };   // viewport == content (the SVG element fills the container)

test('clampScale keeps scale within [1, MAX]', () => {
  assert.equal(clampScale(0.2), 1, 'never below fit');
  assert.equal(clampScale(2.5), 2.5, 'passes through in range');
  assert.equal(clampScale(99), MAX_SCALE, 'capped at max');
});

test('clampTranslate centers the board when it fits, no dead space when larger', () => {
  // at fit (scale 1, content == viewport) any offset snaps back to centered (0,0)
  assert.deepEqual(clampTranslate({ scale: 1, tx: 120, ty: -50 }, VP, VP), { scale: 1, tx: 0, ty: 0 });
  // zoomed in: valid range is [view - scaled, 0]; positive offset clamps to 0
  assert.deepEqual(clampTranslate({ scale: 2, tx: 300, ty: 300 }, VP, VP), { scale: 2, tx: 0, ty: 0 });
  // over-panned clamps to the far edge (view - scaled)
  assert.deepEqual(clampTranslate({ scale: 2, tx: -9999, ty: -9999 }, VP, VP),
    { scale: 2, tx: VP.w - 2 * VP.w, ty: VP.h - 2 * VP.h });
  // an in-range offset is preserved
  assert.deepEqual(clampTranslate({ scale: 2, tx: -400, ty: -300 }, VP, VP), { scale: 2, tx: -400, ty: -300 });
});

test('zoomAround keeps the anchor point visually fixed', () => {
  const T = { scale: 2, tx: -100, ty: -100 };
  const ax = 500, ay = 400;
  const before = { x: (ax - T.tx) / T.scale, y: (ay - T.ty) / T.scale };   // layout point under the anchor
  const next = zoomAround(T, ax, ay, 3, VP, VP);
  assert.equal(next.scale, 3);
  // the same layout point must still land under (ax, ay): scale*L + t == anchor
  assert.ok(Math.abs(next.scale * before.x + next.tx - ax) < 1e-9, 'x anchor fixed');
  assert.ok(Math.abs(next.scale * before.y + next.ty - ay) < 1e-9, 'y anchor fixed');
});

test('zoomAround respects the scale clamp', () => {
  assert.equal(zoomAround({ scale: 1, tx: 0, ty: 0 }, 0, 0, 0.1, VP, VP).scale, 1);
  assert.equal(zoomAround({ scale: 1, tx: 0, ty: 0 }, 0, 0, 999, VP, VP).scale, MAX_SCALE);
});

test('panBy moves then clamps', () => {
  const T = { scale: 2, tx: -100, ty: -100 };
  assert.deepEqual(panBy(T, -50, -20, VP, VP), { scale: 2, tx: -150, ty: -120 });
  // panning past the edge clamps rather than exposing dead space
  assert.deepEqual(panBy({ scale: 2, tx: -10, ty: -10 }, 100, 100, VP, VP), { scale: 2, tx: 0, ty: 0 });
});

test('isTap distinguishes taps from drags and pinches', () => {
  assert.equal(isTap({ dx: 3, dy: 3, dt: 120, multi: false }), true);
  assert.equal(isTap({ dx: 20, dy: 0, dt: 120, multi: false }), false, 'moved too far');
  assert.equal(isTap({ dx: 1, dy: 1, dt: 600, multi: false }), false, 'held too long');
  assert.equal(isTap({ dx: 1, dy: 1, dt: 100, multi: true }), false, 'a second finger was down');
});
