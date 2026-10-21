// viewer/static/panzoom.mjs — zero-dependency pinch-zoom + drag-pan for the hex
// board. Wraps the existing #hexmap SVG (hexmap.mjs is untouched); applies a CSS
// transform to it and translates touch/mouse gestures into that transform.
//
// The math lives in small pure functions (exported, unit-tested with node:test,
// no DOM). mountPanzoom() is the thin DOM/Pointer-Events wiring around them.

export const MAX_SCALE = 4;     // deepest zoom
export const TAP_SLOP = 8;      // px of movement still counted as a tap, not a drag
export const TAP_MS = 300;      // max duration of a tap
export const DOUBLE_TAP_MS = 300;

export function clampScale(s, max = MAX_SCALE) {
  return Math.min(max, Math.max(1, s));   // never below fit (1), never past max
}

// Keep the scaled board from being dragged into dead space: center it on an axis
// when it's smaller than the viewport, otherwise clamp so an edge can't come
// inside the viewport. viewport/content are {w,h}; the board's SVG element fills
// the container so content == viewport, but this stays general.
export function clampTranslate(T, viewport, content) {
  const axis = (t, scaled, view) =>
    scaled <= view ? (view - scaled) / 2 : Math.min(0, Math.max(view - scaled, t));
  return {
    scale: T.scale,
    tx: axis(T.tx, content.w * T.scale, viewport.w),
    ty: axis(T.ty, content.h * T.scale, viewport.h),
  };
}

// Zoom to `nextScale` while keeping the layout point under (ax, ay) — a cursor or
// pinch midpoint, in container-local px — visually fixed. Result is clamped.
export function zoomAround(T, ax, ay, nextScale, viewport, content) {
  const scale = clampScale(nextScale);
  const k = scale / T.scale;
  return clampTranslate(
    { scale, tx: ax - k * (ax - T.tx), ty: ay - k * (ay - T.ty) },
    viewport, content,
  );
}

export function panBy(T, dx, dy, viewport, content) {
  return clampTranslate({ scale: T.scale, tx: T.tx + dx, ty: T.ty + dy }, viewport, content);
}

// A gesture is a tap (not a drag/pinch) when a single pointer barely moved and
// was brief. `multi` is true if a second pointer was ever down during it.
export function isTap({ dx, dy, dt, multi }) {
  return !multi && Math.hypot(dx, dy) <= TAP_SLOP && dt <= TAP_MS;
}

// ── DOM wiring ──────────────────────────────────────────────────────────────

// mountPanzoom(container, { onTap }) → { refresh, reset, destroy }
//   container  the #hexmap element; the board SVG is its child
//   onTap(id)  called when the user taps (not drags) a `.hex` group
// refresh() re-binds to a freshly re-rendered SVG, PRESERVING the current zoom/pan
// (a background sync must not yank the view back). Listeners live on the container,
// which survives innerHTML swaps, so only the SVG ref + transform are re-applied.
export function mountPanzoom(container, { onTap } = {}) {
  let svg = container.querySelector('svg');
  let T = { scale: 1, tx: 0, ty: 0 };
  const pointers = new Map();          // pointerId -> {x, y} in container-local px
  let start = null;                    // first-pointer gesture record (tap detection)
  let pinch = null;                    // { dist, mx, my } from the previous 2-pointer frame
  let lastEmptyTap = 0;                // for double-tap-empty → reset
  let vp = { w: 0, h: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  function measure() {
    const r = container.getBoundingClientRect();
    vp = { w: r.width, h: r.height };
  }
  const apply = () => { if (svg) svg.style.transform = `translate(${T.tx}px, ${T.ty}px) scale(${T.scale})`; };
  const setT = (next) => { T = next; apply(); };
  const local = (e) => { const r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pair = () => [...pointers.values()];
  const pinchState = () => { const [a, b] = pair(); return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };

  function onDown(e) {
    container.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      measure();
      const p = local(e);
      start = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, t: now(), moved: false };
      pinch = null;
    } else if (pointers.size === 2) {
      if (start) start.moved = true;       // two fingers → never a tap
      pinch = pinchState();
    }
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      const ns = pinchState();
      if (pinch) {
        let next = panBy(T, ns.mx - pinch.mx, ns.my - pinch.my, vp, vp);          // pan with the midpoint
        next = zoomAround(next, ns.mx, ns.my, next.scale * (ns.dist / pinch.dist), vp, vp); // zoom around it
        setT(next);
      }
      pinch = ns;
      if (start) start.moved = true;
    } else {
      setT(panBy(T, p.x - prev.x, p.y - prev.y, vp, vp));
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) start.moved = true;
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0 && start) {
      const tap = isTap({ dx: local(e).x - start.x, dy: local(e).y - start.y, dt: now() - start.t, multi: start.moved });
      if (tap) handleTap(start.cx, start.cy);
      start = null;
    }
  }

  function handleTap(cx, cy) {
    const hex = document.elementFromPoint(cx, cy)?.closest?.('.hex');
    if (hex && hex.dataset.id) { onTap?.(hex.dataset.id); return; }
    // tap on empty board: a quick second one resets the view to fit
    const t = now();
    if (t - lastEmptyTap < DOUBLE_TAP_MS) { reset(); lastEmptyTap = 0; }
    else lastEmptyTap = t;
  }

  function onWheel(e) {
    e.preventDefault();
    measure();
    const p = local(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setT(zoomAround(T, p.x, p.y, T.scale * factor, vp, vp));
  }

  function reset() { measure(); setT(clampTranslate({ scale: 1, tx: 0, ty: 0 }, vp, vp)); }
  function refresh() { svg = container.querySelector('svg'); measure(); setT(clampTranslate(T, vp, vp)); }

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  container.addEventListener('wheel', onWheel, { passive: false });
  const onResize = () => { measure(); setT(clampTranslate(T, vp, vp)); };
  window.addEventListener('resize', onResize);

  refresh();
  return {
    refresh,
    reset,
    destroy() {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    },
  };
}
