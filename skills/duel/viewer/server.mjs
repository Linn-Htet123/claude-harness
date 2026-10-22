#!/usr/bin/env node
import { createServer } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { watch, statSync, openSync, readSync, closeSync, existsSync, realpathSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { createLauncher } from './launcher.mjs';
import { createWayfinder } from './wayfinder.mjs';
import { nextBattle } from './static/hexmap.mjs';
import { qrTerminal, qrSvg } from './qr.mjs';

const STATIC = join(dirname(fileURLToPath(import.meta.url)), 'static');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const DOC = /^[a-zA-Z0-9._-]+\.md$/;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; let n = 0; let over = false;
    req.on('data', (d) => {
      if (over) return;
      n += d.length;
      // reject WITHOUT destroying the socket — the caller's catch must still be able
      // to write a clean 400 (a mid-flight req.destroy() gives the client ECONNRESET)
      if (n > 1e6) { over = true; reject(new Error('body too large')); return; }
      b += d;
    });
    req.on('end', () => { if (over) return; try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', () => { if (!over) reject(new Error('request error')); });
  });
}

function eq(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }

// A request is loopback when it arrives on the local machine (the desktop
// browser). Those are trusted and skip the token entirely, so auto-token can be
// on by default without breaking `http://localhost`. Only non-loopback (LAN /
// phone) requests must carry the token. Node normalizes IPv4 over IPv6 to the
// `::ffff:` form, so match that too.
export function isLoopback(req) {
  // A tunnel/proxy (cloudflared, ngrok, tailscale serve) forwards EXTERNAL traffic
  // from localhost — which would otherwise be trusted as loopback and bypass the
  // token, exposing the viewer unauthenticated to the internet. Any forwarding
  // header means the real client is remote, so it must present the token.
  const h = req.headers || {};
  if (h['x-forwarded-for'] || h['cf-connecting-ip'] || h['x-real-ip'] || h['forwarded']) return false;
  // DNS rebinding: a web page on evil.com can resolve to 127.0.0.1 and reach us
  // from the desktop browser. Its Host header still says evil.com, so loopback
  // trust needs a localhost Host too; anything else must carry the token.
  const host = String(h.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return false;
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1' || a.startsWith('127.');
}

// Resolve the shared bearer token: an explicit DUEL_TOKEN wins; otherwise
// read-or-create a persisted token under the duels dir so it stays stable across
// restarts (a phone bookmark keeps working). Never throws — on any FS error it
// falls back to an in-memory random token for this process only.
export function resolveToken(duelsDir) {
  if (process.env.DUEL_TOKEN) return process.env.DUEL_TOKEN;
  const file = join(duelsDir, 'viewer-token');
  try { return readFileSync(file, 'utf8').trim() || genToken(file); } catch { return genToken(file); }
}
function genToken(file) {
  const t = randomUUID().replace(/-/g, '');
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, t + '\n', { mode: 0o600 }); } catch {}
  return t;
}

// Build the phone-reachable URL with the token baked in. DUEL_HOST (e.g. a
// Tailscale name) wins; otherwise the first non-internal IPv4.
export function lanUrl(port, token) {
  // A Tailscale-served HTTPS name (set once `tailscale serve` is up) gives the phone
  // a SECURE origin — required for iOS mic capture. Prefer it; it's proxied on 443
  // so there's no port. Otherwise the plain http LAN/Tailscale address works for
  // everything except the iOS mic.
  const https = process.env.DUEL_HTTPS_HOST;
  if (https) return `https://${https.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/?token=${token}`;
  const ip = process.env.DUEL_HOST || Object.values(networkInterfaces()).flat()
    .find(i => i && i.family === 'IPv4' && !i.internal)?.address || 'localhost';
  return `http://${ip}:${port}?token=${token}`;
}

// ---- speech-to-text: an audio blob → 16 kHz mono WAV (ffmpeg) → transcript
// (whisper.cpp). All on the laptop; no API key, no cloud. The argv builders are
// pure + exported so tests can assert them without spawning.
// read env per-call so it can be overridden at runtime (and toggled in tests)
const whisperBin = () => process.env.DUEL_WHISPER_BIN || 'whisper-cli';
const ffmpegBin = () => process.env.DUEL_FFMPEG_BIN || 'ffmpeg';
const whisperModel = () => process.env.DUEL_WHISPER_MODEL || join(homedir(), '.cache', 'whisper', 'ggml-base.en.bin');
export const ffmpegArgs = (input, wav) => ['-hide_banner', '-loglevel', 'error', '-i', input, '-ar', '16000', '-ac', '1', '-f', 'wav', '-y', wav];
export const whisperArgs = (model, wav, outPrefix) => ['-m', model, '-f', wav, '-nt', '-np', '-otxt', '-of', outPrefix];
const hasBin = (b) => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; } };
export const sttReady = () => hasBin(ffmpegBin()) && hasBin(whisperBin()) && existsSync(whisperModel());
const execFileP = (bin, args) => new Promise((resolve, reject) =>
  execFile(bin, args, { timeout: 60000, maxBuffer: 8e6 }, (err, so, se) => err ? reject(new Error(String(se || err.message || err).slice(0, 200))) : resolve(so)));
// raw binary body (the JSON readBody is 1 MB + JSON-only; audio is neither)
function readRawBody(req, max = 20e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0; let over = false;
    req.on('data', (d) => { if (over) return; n += d.length; if (n > max) { over = true; reject(new Error('audio too large')); return; } chunks.push(d); });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks)); });
    req.on('error', () => { if (!over) reject(new Error('request error')); });
  });
}

export function authed(req, res, token, url) {
  const q = url.searchParams.get('token');
  if (q != null && eq(q, token)) {
    res.setHeader('set-cookie', `duel_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
    return true;
  }
  // guard the decode: a malformed cookie (e.g. `duel_token=%`) throws a URIError,
  // and this runs OUTSIDE the route try/catch with no global handler — an unguarded
  // throw would crash the whole server on any anonymous pre-auth request (DoS)
  try {
    const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('duel_token='));
    return !!c && eq(decodeURIComponent(c.slice('duel_token='.length)), token);
  } catch { return false; }
}

// JSON-read <DUELS>/<slug>/duel.json, or null if missing/malformed — used by the
// approve/finish routes to decide whether a duel is wayfinder-originated (has map+ticket).
function readDuelMeta(DUELS, slug) {
  try { return JSON.parse(readFileSync(join(DUELS, slug, 'duel.json'), 'utf8')); } catch { return null; }
}

// Shared repo validation for anything that turns into a git worktree root or cwd.
// `/api/spawn`'s body.repo is client-controlled; the wayfinder map routes' repo is
// tracker-sourced (semi-trusted at best) — both must pass through here before a
// `git worktree add`/cwd ever touches them.
function validateRepo(repo, pipeline) {
  if (typeof repo !== 'string' || !repo.startsWith('/') || !existsSync(repo)) return 'repo must be an existing absolute path';
  try { if (!statSync(repo).isDirectory()) return 'repo must be a directory'; } catch { return 'repo not accessible'; }
  if (pipeline === 'execution' && !existsSync(join(repo, '.git'))) return 'execution repo must be a git repository';
  return null;
}

export function createApp({ duelsDir, launcher, wayfinder, token = process.env.DUEL_TOKEN || null } = {}) {
  const DUELS = duelsDir || process.env.DUELS_DIR || join(homedir(), '.claude', 'duels');

  async function listDuels() {
    let names = [];
    try { names = (await readdir(DUELS, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name); } catch {}
    const out = [];
    for (const slug of names) {
      try { out.push({ slug, ...JSON.parse(await readFile(join(DUELS, slug, 'duel.json'), 'utf8')) }); } catch {}
    }
    return out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }

  function sse(res, file) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    let offset = 0, buf = '';
    // push runs from watch/interval callbacks OUTSIDE the request handler's
    // try/catch — it must never throw, or one deleted duel dir kills the server
    const push = () => { try {
      let size = 0;
      try { size = statSync(file).size; } catch { return; }
      if (size <= offset) { if (size < offset) { offset = 0; buf = ''; } else return; }
      const fd = openSync(file, 'r');
      const chunk = Buffer.alloc(size - offset);
      readSync(fd, chunk, 0, chunk.length, offset);
      closeSync(fd); offset = size; buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        try { JSON.parse(line); } catch { continue; }
        res.write(`data: ${line}\n\n`);
      }
    } catch {} };
    push();
    res.write(': replay-done\n\n');
    let watcher = null;
    // the watcher's own async 'error' events (dir removed mid-stream, ENOSPC)
    // are EventEmitter errors — unhandled, they crash the process
    try { watcher = watch(dirname(file), () => push()); watcher.on('error', () => {}); } catch {}
    const poll = setInterval(push, 2000);
    const beat = setInterval(() => res.write(': ping\n\n'), 15000);
    res.on('close', () => { watcher?.close(); clearInterval(poll); clearInterval(beat); });
  }

  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'x-content-type-options': 'nosniff' }); res.end(body); };

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (token && p !== '/healthz' && !isLoopback(req) && !authed(req, res, token, url)) return send(res, 401, '{"error":"unauthorized"}');
    try {
      if (p === '/healthz') return send(res, 200, '{"ok":true}');
      // Phone-connect payload: the LAN URL (token baked in) + its QR as SVG. The
      // desktop UI (loopback, trusted) calls this to render the Connect-phone modal.
      if (p === '/connect') {
        const u = lanUrl(req.socket.localPort, token || '');
        // local = bound to loopback with no Tailscale HTTPS proxy: a phone cannot reach it
        const local = !process.env.DUEL_HTTPS_HOST && ['127.0.0.1', '::1'].includes(req.socket.server?.address?.()?.address);
        return send(res, 200, JSON.stringify({ url: u, svg: qrSvg(u), local }));
      }
      // Voice input: POST a raw audio blob → transcript. Handled here (before the
      // JSON body block) so the audio bytes never hit the JSON parser. Degrades to
      // 503 with an install hint when ffmpeg/whisper aren't set up.
      if (p === '/api/stt' && req.method === 'POST') {
        if (!sttReady()) return send(res, 503, JSON.stringify({ error: 'stt unavailable', hint: `brew install ffmpeg whisper-cpp, and put a model at ${whisperModel()}` }));
        let tmp;
        try {
          const buf = await readRawBody(req);
          if (!buf.length) return send(res, 400, '{"error":"empty audio"}');
          tmp = mkdtempSync(join(tmpdir(), 'stt-'));
          const inFile = join(tmp, 'in');   // ffmpeg sniffs the container (webm/mp4/…)
          writeFileSync(inFile, buf);
          const wav = join(tmp, 'a.wav'), prefix = join(tmp, 'out');
          await execFileP(ffmpegBin(), ffmpegArgs(inFile, wav));
          await execFileP(whisperBin(), whisperArgs(whisperModel(), wav, prefix));
          return send(res, 200, JSON.stringify({ text: readFileSync(prefix + '.txt', 'utf8').trim() }));
        } catch (e) {
          return send(res, 500, JSON.stringify({ error: 'transcription failed', detail: String(e.message || e).slice(0, 200) }));
        } finally { if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch {} } }
      }
      if (p === '/api/duels') return send(res, 200, JSON.stringify(await listDuels()));
      if (p === '/api/scoreboard') {
        const f = join(DUELS, 'SCOREBOARD.md');
        return existsSync(f) ? send(res, 200, await readFile(f, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, 'no scoreboard', 'text/plain');
      }
      if (p === '/api/maps') return send(res, 200, JSON.stringify(wayfinder ? wayfinder.listMaps() : []));
      if (p === '/api/map') { if (!wayfinder) return send(res, 503, '{"error":"no wayfinder"}');
        const s = url.searchParams.get('slug');
        if (!SLUG.test(s || '')) return send(res, 400, '{"error":"bad slug"}'); // no ../ traversal into the wayfinder dir
        const mp = wayfinder.getMap(s);
        return mp ? send(res, 200, JSON.stringify(mp)) : send(res, 404, '{"error":"map not synced"}'); }
      let m;
      if ((m = p.match(/^\/d\/([^/]+)\/events$/)) && SLUG.test(m[1])) {
        if (!existsSync(join(DUELS, m[1]))) return send(res, 404, 'no such duel', 'text/plain');
        return sse(res, join(DUELS, m[1], 'events.jsonl')); // events.jsonl itself may not exist yet — sse tails it into existence
      }
      if ((m = p.match(/^\/d\/([^/]+)\/doc\/([^/]+)$/)) && SLUG.test(m[1]) && DOC.test(m[2])) {
        const f = join(DUELS, m[1], m[2]);
        return existsSync(f) ? send(res, 200, await readFile(f, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, 'not found', 'text/plain');
      }
      // the live build diff: working tree vs origin/main (all committed + in-progress changes).
      if ((m = p.match(/^\/api\/d\/([^/]+)\/diff$/)) && SLUG.test(m[1])) {
        const dm = readDuelMeta(DUELS, m[1]);
        if (!dm || !dm.worktree || !existsSync(dm.worktree)) return send(res, 200, '', 'text/plain; charset=utf-8');
        let diff = '';
        try { diff = execFileSync('git', ['-C', dm.worktree, 'diff', dm.base || 'origin/main'], { maxBuffer: 8e6 }).toString(); } catch {}
        if (!diff.trim()) { try { diff = execFileSync('git', ['-C', dm.worktree, 'diff', 'HEAD'], { maxBuffer: 8e6 }).toString(); } catch {} }
        return send(res, 200, diff, 'text/plain; charset=utf-8');
      }
      if ((m = p.match(/^\/d\/([^/]+)$/)) && SLUG.test(m[1])) return send(res, 200, await readFile(join(STATIC, 'arena.html')), MIME['.html']);
      if (p === '/') return send(res, 200, await readFile(join(STATIC, 'map.html')), MIME['.html']);
      if (p === '/duels') return send(res, 200, await readFile(join(STATIC, 'index.html')), MIME['.html']);
      if ((m = p.match(/^\/static\/([a-zA-Z0-9._-]+)$/))) {
        const f = join(STATIC, m[1]);
        if (!existsSync(f)) return send(res, 404, 'not found', 'text/plain');
        // no-cache: this is a local dev tool that changes often — the browser must never serve a
        // stale CSS/JS bundle after an edit (and it keeps headless screenshots honest).
        res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
        return send(res, 200, await readFile(f), MIME[extname(f)] || 'application/octet-stream');
      }
      if (req.method === 'POST') {
        if (!launcher) return send(res, 503, '{"error":"launcher disabled"}');
        // CSRF hardening: only same-origin JSON posts. A cross-site form/img can't set
        // application/json (it forces a CORS preflight the server never answers); a cross-site
        // fetch is blocked by the absent CORS headers; Sec-Fetch-Site catches modern browsers.
        const ct = (req.headers['content-type'] || '').split(';')[0].trim();
        if (ct !== 'application/json') return send(res, 415, '{"error":"content-type must be application/json"}');
        const sfs = req.headers['sec-fetch-site'];
        if (sfs && sfs !== 'same-origin' && sfs !== 'none') return send(res, 403, '{"error":"cross-site request refused"}');
        let body;
        try { body = await readBody(req); } catch (e) { return send(res, 400, JSON.stringify({ error: String(e.message) })); }
        try {
          if (p === '/api/spawn') {
            if (!body.task || !body.repo || !body.pipeline) return send(res, 400, '{"error":"task, repo, pipeline required"}');
            // validate untrusted fields before they become argv / a git root / a cwd
            const bad = ['task', 'repo', 'category', 'ticket', 'map'].find(k => typeof body[k] === 'string' && body[k].startsWith('--'));
            if (bad) return send(res, 400, JSON.stringify({ error: `${bad} must not start with --` }));
            // category becomes a scoreboard table key + a RegExp needle — keep it a plain label
            if (body.category != null && !/^[\w -]{1,40}$/.test(body.category)) return send(res, 400, '{"error":"category must be letters/digits/underscore/space/hyphen, <=40 chars"}');
            const repoErr = validateRepo(body.repo, body.pipeline);
            if (repoErr) return send(res, 400, JSON.stringify({ error: repoErr }));
            const result = body.pipeline === 'hitl' ? await launcher.startHitl(body) : await launcher.spawnDuel(body);
            // opening a HITL live session claims its ticket too (spec: one session = one ticket);
            // SLUG-guard the client-supplied map slug before it becomes a wayfinder dir path.
            if (body.pipeline === 'hitl' && wayfinder && body.map && body.ticket && result.slug && SLUG.test(body.map))
              wayfinder.claimTicket(body.map, body.ticket, result.slug);
            return send(res, 200, JSON.stringify(result));
          }
          if ((m = p.match(/^\/api\/d\/([^/]+)\/(approve|reject|verdict|checkpoint|finish|open-pr|merge|decompose|review)$/)) && SLUG.test(m[1])) {
            const [, slug, action] = m;
            if (action === 'approve') {
              // finalize the tracker FIRST for a wayfinder duel — if it throws, the outer
              // catch 409s and the duel stays awaiting-approve so the user can retry;
              // only then complete locally. Avoids a finished-but-un-finalized wedge.
              const dm = wayfinder ? readDuelMeta(DUELS, slug) : null;
              if (body.build && wayfinder && dm?.map && dm?.ticket) {
                // resolution → BUILD the plan with codex in the map's repo (worktree, never main).
                // Do NOT finalize/conquer here: the decision is recorded and the hex conquered on
                // FINISH (after the code is actually built), so the ticket gets ONE resolution comment.
                const repo = wayfinder.mapRepo(dm.map);
                const repoErr = validateRepo(repo, 'execution');
                if (repoErr) return send(res, 400, JSON.stringify({ error: `build repo: ${repoErr}` }));
                await launcher.buildResolution(slug, repo);
                return send(res, 200, '{"ok":true,"building":true}');
              }
              if (wayfinder && dm?.map && dm?.ticket) {
                await wayfinder.finalizeTicket(dm.map, dm.ticket, { duelSlug: slug, heldBy: body.heldBy || null, resolution: 'see duel transcript' });
                // durable conquest: stamp the winner into map.json so the hex holds its colour
                // even though the tracker records no machine-readable winner.
                wayfinder.holdTicket(dm.map, dm.ticket, body.heldBy);
              }
              await launcher.approve(slug, body.heldBy);
            }
            else if (action === 'reject') await launcher.reject(slug);
            else if (action === 'verdict') await launcher.sendVerdict(slug, body.winner);
            else if (action === 'checkpoint') await launcher.runCheckpoint(slug);
            else if (action === 'finish') {
              // execution duels finalize + conquer on finish (winner = holder); finalize
              // before finishing locally, same retry-safety as approve.
              const dm = wayfinder ? readDuelMeta(DUELS, slug) : null;
              if (wayfinder && dm?.map && dm?.ticket) {
                const holder = dm.heldBy || dm.winner || null;
                await wayfinder.finalizeTicket(dm.map, dm.ticket, { duelSlug: slug, heldBy: holder, resolution: 'see duel transcript' });
                wayfinder.holdTicket(dm.map, dm.ticket, holder); // durable conquest, same as approve
              }
              await launcher.finishDuel(slug);
            }
            else if (action === 'decompose') {
              // split the too-big resolved plan into small Linear sub-tickets of the parent.
              const dm = wayfinder ? readDuelMeta(DUELS, slug) : null;
              if (!wayfinder || !dm?.map || !dm?.ticket) return send(res, 400, '{"error":"not a wayfinder duel"}');
              const planPath = join(DUELS, slug, 'draft-resolution.md');
              if (!existsSync(planPath)) return send(res, 400, '{"error":"no resolved plan to decompose"}');
              const r = await wayfinder.decomposeTicket(dm.map, dm.ticket, dm.task || dm.ticket, readFileSync(planPath, 'utf8'));
              launcher.markDecomposed(slug, r.created ?? 0);
              return send(res, 200, JSON.stringify(r));
            }
            else if (action === 'open-pr') { const r = await launcher.openPR(slug); return send(res, 200, JSON.stringify(r)); }
            else if (action === 'review') { const r = await launcher.reviewPR(slug); return send(res, 200, JSON.stringify(r)); }
            else if (action === 'merge') {
              // merge the built+reviewed branch into main, then record + conquer (like finish).
              const r = await launcher.mergePR(slug);
              const dm = wayfinder ? readDuelMeta(DUELS, slug) : null;
              if (wayfinder && dm?.map && dm?.ticket) {
                const holder = dm.heldBy || dm.winner || 'codex';
                await wayfinder.finalizeTicket(dm.map, dm.ticket, { duelSlug: slug, heldBy: holder, resolution: 'built + Greptile-reviewed + merged via the duel arena' });
                wayfinder.holdTicket(dm.map, dm.ticket, holder);
              }
              return send(res, 200, JSON.stringify(r));
            }
            return send(res, 200, '{"ok":true}');
          }
          if ((m = p.match(/^\/api\/hitl\/([^/]+)\/message$/)) && SLUG.test(m[1])) {
            if (typeof body.text !== 'string' || !body.text.trim()) return send(res, 400, '{"error":"text required"}');
            await launcher.hitlMessage(m[1], body.text);
            return send(res, 200, '{"ok":true}');
          }
          // live session (any duel): open a chat channel, send a turn, toggle edit access.
          // launcher throws on bad state (no session, guardrail refusal) → 409.
          if ((m = p.match(/^\/api\/session\/([^/]+)\/(open|message|edit)$/)) && SLUG.test(m[1])) {
            const [, slug, action] = m;
            if (!existsSync(join(DUELS, slug))) return send(res, 404, '{"error":"no such duel"}');
            try {
              if (action === 'open') return send(res, 200, JSON.stringify(await launcher.openSession(slug)));
              if (action === 'message') {
                if (typeof body.text !== 'string' || !body.text.trim()) return send(res, 400, '{"error":"text required"}');
                return send(res, 200, JSON.stringify(await launcher.sessionMessage(slug, body.text.trim())));
              }
              return send(res, 200, JSON.stringify(launcher.setSessionEdit(slug, !!body.on)));
            } catch (e) { return send(res, 409, JSON.stringify({ error: String(e.message || e) })); }
          }
          if (p === '/api/map/config') { if (!wayfinder) return send(res, 503, '{"error":"no wayfinder"}');
            if (!body.url) return send(res, 400, '{"error":"url required"}');
            return send(res, 200, JSON.stringify(await wayfinder.setConfig(body.url))); }
          if (p === '/api/map/sync') { if (!wayfinder) return send(res, 503, '{"error":"no wayfinder"}');
            if (!SLUG.test(body.slug || '')) return send(res, 400, '{"error":"bad slug"}');
            return send(res, 200, JSON.stringify(await wayfinder.syncMap(body.slug))); }
          if (p === '/api/map/next-battle') { if (!wayfinder) return send(res, 503, '{"error":"no wayfinder"}');
            if (!SLUG.test(body.slug || '')) return send(res, 400, '{"error":"bad slug"}');
            const map = wayfinder.getMap(body.slug);
            if (!map) return send(res, 404, '{"error":"map not synced"}');
            const nb = nextBattle(map);
            if (!nb) return send(res, 200, '{"done":true}');
            if (nb.isHitl) return send(res, 200, JSON.stringify({ hitl: true, ticket: nb.ticket }));
            const pipeline = nb.ticket.execution ? 'execution' : 'resolution';   // execution only when the ticket is flagged repo-work
            const repo = nb.ticket.repo || map.map.repo || body.repo || '/tmp';
            const repoErr = validateRepo(repo, pipeline);   // tracker-sourced repo — validate before it becomes a worktree root
            if (repoErr) return send(res, 400, JSON.stringify({ error: `ticket ${nb.ticket.id}: ${repoErr}` }));
            const category = /^[\w -]{1,40}$/.test(nb.ticket.type) ? nb.ticket.type : 'general'; // tracker-sourced → sanitize
            const r = await launcher.spawnDuel({ task: nb.ticket.name, repo, pipeline, category, ticket: nb.ticket.id, map: body.slug });
            // claim locally: flip the hex to claimed + attach the duel so the map reflects it and Next-battle skips it
            wayfinder.claimTicket(body.slug, nb.ticket.id, r.slug);
            return send(res, 200, JSON.stringify({ slug: r.slug, ticket: nb.ticket }));
          }
          if (p === '/api/map/battle-all') { if (!wayfinder) return send(res, 503, '{"error":"no wayfinder"}');
            if (!SLUG.test(body.slug || '')) return send(res, 400, '{"error":"bad slug"}');
            // fan out EVERY currently-unblocked AFK frontier ticket at once; they drain
            // through the launcher's concurrency cap. HITL tickets are skipped (human-driven).
            const map = wayfinder.getMap(body.slug);
            if (!map) return send(res, 404, '{"error":"map not synced"}');
            const spawned = [], skipped = [];
            // walk a WORKING COPY: mark each taken ticket claimed in the copy so nextBattle
            // advances, but persist a real claim only for tickets we actually spawn. A bad-repo
            // ticket is stepped over in the copy (so the fan-out continues) yet stays takeable
            // on the real map. Nothing closes mid-fan-out, so a single snapshot is correct.
            const work = JSON.parse(JSON.stringify(map));
            const byId = new Map(work.tickets.map(t => [t.id, t]));
            let nb, guard = 0;
            while ((nb = nextBattle(work)) && !nb.isHitl && guard++ <= work.tickets.length) {
              const t = nb.ticket;
              byId.get(t.id).status = 'claimed'; // advance the working copy past this ticket
              const pipeline = t.execution ? 'execution' : 'resolution';
              const repo = t.repo || map.map.repo || body.repo || '/tmp';
              if (validateRepo(repo, pipeline)) { skipped.push({ ticket: t.id, reason: 'invalid repo' }); continue; }
              const category = /^[\w -]{1,40}$/.test(t.type) ? t.type : 'general';
              const r = await launcher.spawnDuel({ task: t.name, repo, pipeline, category, ticket: t.id, map: body.slug });
              wayfinder.claimTicket(body.slug, t.id, r.slug); // persist the real claim only for spawned
              spawned.push({ slug: r.slug, ticket: t.id });
            }
            return send(res, 200, JSON.stringify({ spawned, skipped, skippedHitl: !!(nb && nb.isHitl) }));
          }
        } catch (e) { return send(res, 409, JSON.stringify({ error: String(e.message || e) })); }
      }
      if (p === '/api/launcher') return send(res, 200, JSON.stringify(launcher ? launcher.status() : { running: [], queued: [] }));
      if ((m = p.match(/^\/api\/duels\/([^/]+)$/)) && SLUG.test(m[1])) {
        const f = join(DUELS, m[1], 'duel.json');
        if (!existsSync(f)) return send(res, 404, '{"error":"no such duel"}', 'application/json');
        // enrich with a live edit-permission flag so the arena knows whether to enable the 🔓 toggle
        const dm = JSON.parse(await readFile(f, 'utf8'));
        dm.sessionCanEdit = launcher ? launcher.canEditSession(m[1]) : false;
        return send(res, 200, JSON.stringify(dm));
      }
      send(res, 404, 'not found', 'text/plain');
    } catch (e) { send(res, 500, String(e), 'text/plain'); }
  });
}

// realpathSync both sides: the skill is invoked through the ~/.claude/skills/duel
// symlink (and /tmp is itself a symlink on macOS), so a plain argv[1] comparison
// silently fails and the server never listens
const isMain = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) {
  const port = Number(process.env.PORT || 4321);
  const DUELS = process.env.DUELS_DIR || join(homedir(), '.claude', 'duels');
  // Auto-token by default, so phone-connect works once DUEL_BIND=0.0.0.0; loopback is trusted, so
  // this never gets in the desktop browser's way. Localhost-only by default;
  // DUEL_BIND=0.0.0.0 opens it to the LAN so a phone can reach it.
  const token = resolveToken(DUELS);
  const HOST = process.env.DUEL_BIND || '127.0.0.1';
  const launcher = createLauncher({ maxConcurrent: Number(process.env.DUEL_MAX_CONCURRENT) || 3 });
  const wayfinder = createWayfinder({});
  const server = createApp({ launcher, wayfinder, token });
  // shutdown() kills every live model wrapper child before the server closes — an
  // un-registered SIGTERM/SIGINT would otherwise orphan running claude/codex processes
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { launcher.shutdown(); } catch {} server.close(); process.exit(0); });
  server.listen(port, HOST, () => {
    console.log(`duel viewer listening on http://localhost:${port}`);
    if (HOST !== '127.0.0.1') {
      const url = lanUrl(port, token);
      console.log('\nScan to open on your phone (same Tailscale/LAN), or use the 📱 button in the app:\n');
      console.log(qrTerminal(url));
      console.log(url + '\n');
    }
  });
}
