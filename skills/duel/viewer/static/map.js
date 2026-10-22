import { hexSvg, territoryTally } from '/static/hexmap.mjs';
import { mountPanzoom } from '/static/panzoom.mjs';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const post = (p, b) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
const $ = (id) => document.getElementById(id);
let slug = null, map = null, busy = false, pz = null;

// ── feedback: full-screen overlay for the slow reads, toast for quick results ──
function overlay(show, text, sub) {
  busy = !!show;
  if (show) { $('overlay-text').textContent = text || 'Working…'; $('overlay-sub').textContent = sub || ''; $('overlay').hidden = false; }
  else $('overlay').hidden = true;
}
let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 250); }, 4500);
}
// spin a button for the duration of an async action (and stop double-fires)
async function spin(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.classList.add('loading'); btn.disabled = true;
  try { return await fn(); }
  catch (e) { toast(`⚠︎ ${String(e.message || e).slice(0, 160)}`); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

async function loadMaps() {
  let maps = [];
  try { maps = await (await fetch('/api/maps')).json(); } catch {}
  const sel = $('mapsel');
  sel.innerHTML = maps.map(m => `<option value="${esc(m.mapSlug)}">${esc(m.name)}</option>`).join('');
  if (maps.length) { slug = sel.value; await refresh(); }
  else { emptyState('🗺️', 'No maps yet', 'Press <b>＋</b> to paste a wayfinder map URL and scan your first battlefield.'); setup(true); }
  sel.onchange = () => { slug = sel.value; refresh(); };
}
function emptyState(big, title, body) {
  $('hexmap').classList.remove('panning');   // no board to pan in the empty state
  $('hexmap').innerHTML = `<div class="empty"><div class="big">${big}</div><h2>${title}</h2><p>${body}</p></div>`;
  $('legend').hidden = true; $('progress').hidden = true;
}
function setup(show) { $('setup').hidden = !show; if (show) $('mapurl').focus(); }
async function refresh() {
  if (!slug) return;
  let r;
  try { r = await fetch(`/api/map?slug=${encodeURIComponent(slug)}`); } catch { return; }
  if (!r.ok) { emptyState('🛰️', 'Not scanned yet', 'Press <b>⟲ Sync</b> to read this map from the tracker and render the terrain.'); $('tally').innerHTML = ''; return; }
  map = await r.json();
  $('dest').innerHTML = `<span class="camp-name">${esc(map.map.name || slug)}</span>`
    + (map.map.destination ? `<span class="camp-dest">→ ${esc(map.map.destination)}</span>` : '');
  const t = territoryTally(map);
  $('tally').innerHTML =
    `<span class="chip claude"><span class="dot">●</span>claude <b>${t.claude}</b></span>`
    + `<span class="chip codex"><span class="dot">●</span>codex <b>${t.codex}</b></span>`
    + `<span class="chip"><span class="dot">▫︎</span>neutral <b>${t.neutral}</b></span>`;
  // conquest progress: how much of the map is resolved (closed) out of the whole campaign
  const total = map.tickets.length;
  const done = map.tickets.filter(x => x.status === 'closed').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  $('progress').hidden = false;
  $('progress-fill').style.width = pct + '%';
  $('progress-label').textContent = `${done}/${total} taken`;
  $('hexmap').innerHTML = hexSvg(map);
  $('hexmap').classList.add('panning');   // turn the board into a pinch-zoom / drag-pan viewport
  $('legend').hidden = false;
  // mount once; on later re-renders refresh() re-binds to the new SVG and keeps the current zoom/pan
  if (pz) pz.refresh();
  else pz = mountPanzoom($('hexmap'), { onTap: showPanel });
}
function showPanel(id) {
  const t = map.tickets.find(x => x.id === id); if (!t) return;
  const panel = $('panel');
  if (t.duel && t.status !== 'closed') { location.href = `/d/${t.duel}`; return; }
  const takeable = t.status === 'frontier';
  const held = t.heldBy ? ` · held by ${t.heldBy}` : '';
  panel.innerHTML = `<div class="card"><b>${esc(t.name)}</b><span class="meta">${esc(t.type)} · ${esc(t.status)}${held}</span>`
    + (takeable ? (t.hitl ? `<button data-act="hitl">🎙️ Open session</button>` : `<button data-act="battle">⚔️ Start battle</button>`) : '')
    + `<button data-act="close">Close</button></div>`;
  panel.querySelectorAll('button').forEach(b => b.onclick = () => {
    if (b.dataset.act === 'close') { panel.innerHTML = ''; return; }
    spin(b, () => b.dataset.act === 'battle' ? startBattle() : startHitl(t));
  });
}
async function startBattle() { const r = await post('/api/map/next-battle', { slug }); if (r.slug) location.href = `/d/${r.slug}`; else await refresh(); }
async function startHitl(t) { const r = await post('/api/spawn', { task: t.name, repo: '/tmp', pipeline: 'hitl', category: t.type, ticket: t.id, map: slug }); if (r.slug) location.href = `/d/${r.slug}`; }

// ── phone connect: fetch the LAN URL + its QR and show them in a modal ──
function closeQr() { $('qrmodal').hidden = true; }
$('connect').onclick = () => spin($('connect'), async () => {
  let data;
  try { data = await (await fetch('/connect')).json(); }
  catch { toast('⚠︎ could not build a phone link'); return; }
  if (data.local) { toast('Phone link needs the LAN: restart the viewer with DUEL_BIND=0.0.0.0'); return; }
  $('qrcode').innerHTML = data.svg;
  $('qrurl').textContent = data.url;
  $('qrcopy').onclick = async () => {
    try { await navigator.clipboard.writeText(data.url); toast('Link copied.'); }
    catch { toast('Copy failed — long-press the link to copy.'); }
  };
  $('qrmodal').hidden = false;
});
$('qrclose').onclick = closeQr;
$('qrmodal').onclick = (e) => { if (e.target.id === 'qrmodal') closeQr(); };   // backdrop click
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQr(); });

$('addmaptoggle').onclick = () => setup($('setup').hidden);
$('addmap').onclick = () => spin($('addmap'), async () => {
  const url = $('mapurl').value.trim(); if (!url) return;
  overlay(true, 'Scanning the map…', 'Reading the tracker with a live agent — large maps can take a minute.');
  try {
    const { mapSlug } = await post('/api/map/config', { url });
    slug = mapSlug;
    const res = await post('/api/map/sync', { slug });
    if (res && res.error) { toast(`⚠︎ sync failed: ${res.error}`); }
    await loadMaps(); $('mapsel').value = mapSlug; setup(false); await refresh();
    if (map) toast(`Scanned ${map.tickets.length} tickets.`);
  } finally { overlay(false); }
});
$('sync').onclick = () => spin($('sync'), async () => {
  if (!slug) { toast('Add a map first.'); return; }
  overlay(true, 'Re-scanning the map…', 'Reading the tracker with a live agent — large maps can take a minute.');
  try {
    const res = await post('/api/map/sync', { slug });
    if (res && res.error) { toast(`⚠︎ sync failed: ${res.error}`); return; }
    await refresh();
    if (map) toast(`Map updated — ${map.tickets.length} tickets.`);
  } finally { overlay(false); }
});
$('next').onclick = () => spin($('next'), async () => {
  if (!slug) { toast('Add and sync a map first.'); return; }
  const r = await post('/api/map/next-battle', { slug });
  if (r.error) toast(`⚠︎ ${r.error}`);
  else if (r.done) { toast('🏁 Frontier clear — the way to the destination is open.'); await refresh(); }
  else if (r.hitl) { toast(`🎙️ Next is a HITL ticket (${r.ticket.id}) — opening a session…`); await startHitl(r.ticket); }
  else if (r.slug) { location.href = `/d/${r.slug}`; }
});
$('battleall').onclick = () => spin($('battleall'), async () => {
  if (!slug) { toast('Add and sync a map first.'); return; }
  const r = await post('/api/map/battle-all', { slug });
  if (r.error) { toast(`⚠︎ ${r.error}`); return; }
  const n = r.spawned ? r.spawned.length : 0;
  toast(`⚔️ Sent ${n} battle${n === 1 ? '' : 's'} to the front${r.skippedHitl ? ' (a HITL ticket is next — open it manually)' : ''}. They drain up to the concurrency cap.`);
  await refresh();
});

loadMaps();
// live poll — silent, and it steps aside while a sync/scan overlay is up so it can't clobber it
setInterval(() => { if (slug && !busy) refresh(); }, 8000);
