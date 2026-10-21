const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
(async () => {
  const duels = await (await fetch('/api/duels')).json();
  document.getElementById('duel-list').innerHTML = duels.map(d => `
    <a class="card" href="/d/${esc(d.slug)}">
      <div>${esc(d.task || d.slug)}</div>
      <div class="meta">phase: ${esc(d.phase)} · category: ${esc(d.category || '–')} ·
        winner: ${esc(d.winner || '–')} · ${esc(String(d.created).slice(0, 10))}</div>
    </a>`).join('') || '<p>No duels yet. Start one with <code>/duel &lt;task&gt;</code>.</p>';
  const sb = await fetch('/api/scoreboard');
  if (sb.ok) document.getElementById('scoreboard').textContent = await sb.text();
})();
