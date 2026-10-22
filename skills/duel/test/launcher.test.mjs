import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLauncher, BRIEFS } from '../viewer/launcher.mjs';

const STUB = join(process.cwd(), 'test', 'stubs', 'fake-wrapper.mjs');
const mk = (over = {}) => {
  const duelsDir = mkdtempSync(join(tmpdir(), 'duels-'));
  return { duelsDir, launcher: createLauncher({
    duelsDir, skillDir: process.cwd(),
    claudeCmd: ['node', STUB], codexCmd: ['node', STUB], oracleCmd: ['node', STUB],
    contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex' } },
    ...over,
  }) };
};
const meta = (duelsDir, slug) => JSON.parse(readFileSync(join(duelsDir, slug, 'duel.json'), 'utf8'));
const events = (duelsDir, slug) => readFileSync(join(duelsDir, slug, 'events.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse);
const waitPhase = async (duelsDir, slug, phase, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (meta(duelsDir, slug).phase === phase) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for phase ${phase}; got ${meta(duelsDir, slug).phase}`);
};

test('resolution pipeline: design → cross-exam → drafting → awaiting-approve → approve → finished', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'What DB should we use', repo: '/tmp', pipeline: 'resolution', category: 'research' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  const evs = events(duelsDir, slug);
  assert.ok(evs.some(e => e.actor === 'claude' && e.role === 'design'));
  assert.ok(evs.some(e => e.actor === 'codex' && e.role === 'design'));
  assert.ok(evs.some(e => e.actor === 'claude' && e.role === 'rebuttal'));
  assert.ok(evs.some(e => e.actor === 'codex' && e.role === 'rebuttal'));
  assert.ok(evs.some(e => e.ref === 'draft-resolution.md'));
  await launcher.approve(slug);
  assert.equal(meta(duelsDir, slug).phase, 'finished');
});

test('contestant failure: one retry then one-sided continuation', async () => {
  const { duelsDir, launcher } = mk({
    contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex', FAKE_FAIL: '1' } },
  });
  const { slug } = await launcher.spawnDuel({ task: 'failing codex duel', repo: '/tmp', pipeline: 'resolution', category: 'research' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  const statuses = events(duelsDir, slug).filter(e => e.actor === 'orchestrator').map(e => e.content).join(' | ');
  assert.match(statuses, /retry/i);
  assert.match(statuses, /one-sided|walkover/i);
});

test('concurrency cap queues the overflow duel', async () => {
  const { duelsDir, launcher } = mk({ maxConcurrent: 1,
    contestantEnv: { claude: { FAKE_ACTOR: 'claude', FAKE_DELAY_MS: '400' }, codex: { FAKE_ACTOR: 'codex', FAKE_DELAY_MS: '400' } } });
  const a = await launcher.spawnDuel({ task: 'first slow duel here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  const b = await launcher.spawnDuel({ task: 'second queued duel here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  const st = launcher.status();
  assert.equal(st.running.length, 1);
  assert.deepEqual(st.queued, [b.slug]);
  await waitPhase(duelsDir, a.slug, 'awaiting-approve');
  await waitPhase(duelsDir, b.slug, 'awaiting-approve');   // queue drained
});

test('spawnDuel rejects an unsupported pipeline WITHOUT creating any on-disk duel', async () => {
  const { duelsDir, launcher } = mk();
  await assert.rejects(() => launcher.spawnDuel({ task: 'hitl via wrong entry', repo: '/tmp', pipeline: 'hitl', category: 'x' }), /unsupported pipeline/);
  // no duel dir was created (validation happened before initDuel)
  const dirs = readdirSync(duelsDir).filter(n => n !== 'SCOREBOARD.md');
  assert.equal(dirs.length, 0, 'no orphaned duel dir');
});

function scratchRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'target-'));
  execFileSync('git', ['-C', repo, 'init', '-b', 'main']);
  writeFileSync(join(repo, 'README.md'), '# scratch\n');
  execFileSync('git', ['-C', repo, 'add', '-A']);
  execFileSync('git', ['-C', repo, 'commit', '-m', 'init'], { env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  return repo;
}

test('execution pipeline: verdict creates worktree, implements, checkpoint scores, finish closes', async () => {
  const repo = scratchRepo();
  const { duelsDir, launcher } = mk({
    contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex' } } });
  const { slug } = await launcher.spawnDuel({ task: 'build a widget module now', repo, pipeline: 'execution', category: 'library' });
  await waitPhase(duelsDir, slug, 'awaiting-verdict');

  // stub "implements" by just writing its out file; the launcher's worktree commit tolerates no-change
  await launcher.sendVerdict(slug, 'codex');
  await waitPhase(duelsDir, slug, 'implement');
  const m1 = meta(duelsDir, slug);
  assert.equal(m1.winner, 'codex');
  assert.ok(m1.worktree && existsSync(m1.worktree), 'worktree exists');
  assert.match(m1.branch, /^duel\//);
  const sb = readFileSync(join(duelsDir, 'SCOREBOARD.md'), 'utf8');
  assert.match(sb, /\| codex {2}\| 2 \|/);

  // canned triage: oracle stub replies with a JSON array confirming finding 1
  process.env.FAKE_REPLY = '[{"n":1,"verdict":"CONFIRMED","reason":"real"},{"n":2,"verdict":"REJECTED","reason":"not real"}]';
  await launcher.runCheckpoint(slug);
  delete process.env.FAKE_REPLY;
  const m2 = meta(duelsDir, slug);
  assert.equal(m2.checkpoints, 1);
  assert.equal(m2.phase, 'implement');
  const evs = events(duelsDir, slug);
  assert.ok(evs.some(e => e.role === 'checkpoint-attack'));
  assert.ok(evs.some(e => e.role === 'defense'));
  assert.match(readFileSync(join(duelsDir, 'SCOREBOARD.md'), 'utf8'), /\| claude \| 0 \| 1 \| 0 \|/);

  await launcher.finishDuel(slug);
  assert.equal(meta(duelsDir, slug).phase, 'finished');
});

test('verdict refuses bad winner and wrong phase', async () => {
  const repo = scratchRepo();
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'another widget build task', repo, pipeline: 'execution', category: 'library' });
  await waitPhase(duelsDir, slug, 'awaiting-verdict');
  await assert.rejects(() => launcher.sendVerdict(slug, 'gpt'), /winner/);
  await launcher.sendVerdict(slug, 'claude');
  await waitPhase(duelsDir, slug, 'implement');
  await assert.rejects(() => launcher.sendVerdict(slug, 'claude'), /phase/);
});

test('gitCommit uses the configured git identity, not the duel-bot fallback', async () => {
  const repo = scratchRepo();
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'Real Dev']);
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'real@dev.test']);
  // Isolate from any ambient GIT_AUTHOR_*/GIT_COMMITTER_* env vars the host shell may
  // already export (e.g. an identity-switching dev setup) — those legitimately outrank
  // repo-local config per git's own precedence and would mask what this test checks:
  // that gitCommit doesn't impose ITS OWN hardcoded duel-bot fallback over a real,
  // git-resolvable identity.
  const savedEnv = {};
  for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const { duelsDir, launcher } = mk({ contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex' } } });
    const { slug } = await launcher.spawnDuel({ task: 'identity check build task', repo, pipeline: 'execution', category: 'library' });
    await waitPhase(duelsDir, slug, 'awaiting-verdict');
    await launcher.sendVerdict(slug, 'codex');
    const wt = meta(duelsDir, slug).worktree;
    // simulate the winner's implementation touching a file: the launcher's post-implement
    // gitCommit is a no-op on a clean tree (the fake wrapper only writes into --duel-dir,
    // not the worktree), so without a real change there's nothing for identity to attach to.
    // This write lands synchronously right after sendVerdict resolves, before the enqueued
    // implementKickoff's spawned child process can possibly have closed and triggered gitCommit.
    writeFileSync(join(wt, 'new-file.txt'), 'change\n');
    // wait for the post-commit status line (implementKickoff calls gitCommit, then say())
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      if (events(duelsDir, slug).some(e => e.actor === 'orchestrator' && /finished implementing/i.test(e.content))) break;
      await new Promise(r => setTimeout(r, 50));
    }
    // the launcher's worktree commit must carry the configured identity, not duel-bot
    const author = execFileSync('git', ['-C', wt, 'log', '-1', '--format=%ae'], { encoding: 'utf8' }).trim();
    assert.equal(author, 'real@dev.test');
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('hitl session: opening turn, user message, RESOLUTION promotes to awaiting-approve', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.startHitl({ task: 'pick the auth model please', repo: '/tmp', category: 'design' });
  await waitPhase(duelsDir, slug, 'hitl-active');
  assert.ok(meta(duelsDir, slug).hitlSessionId, 'session id stored');
  assert.ok(events(duelsDir, slug).some(e => e.actor === 'claude' && e.role === 'hitl'));

  await launcher.hitlMessage(slug, 'we want magic links');
  const evs = events(duelsDir, slug);
  assert.ok(evs.some(e => e.actor === 'user' && e.role === 'hitl' && e.content === 'we want magic links'));

  process.env.FAKE_REPLY = 'RESOLUTION: magic links via Supabase auth.';
  await launcher.hitlMessage(slug, 'yes, lock it in');
  delete process.env.FAKE_REPLY;
  assert.equal(meta(duelsDir, slug).phase, 'awaiting-approve');
});

test('concurrent hitlMessage for one session is rejected, not silently clobbered', async () => {
  const { duelsDir, launcher } = mk({ contestantEnv: { claude: { FAKE_ACTOR: 'claude', FAKE_DELAY_MS: '300' } } });
  const { slug } = await launcher.startHitl({ task: 'concurrent hitl guard test', repo: '/tmp', category: 'design' });
  await waitPhase(duelsDir, slug, 'hitl-active');
  const first = launcher.hitlMessage(slug, 'first message');       // in-flight (300ms)
  await new Promise(r => setTimeout(r, 50));
  await assert.rejects(() => launcher.hitlMessage(slug, 'second message'), /already in progress/);
  await first;                                                     // first completes fine
  assert.equal(meta(duelsDir, slug).hitlTurns, 2);                 // exactly one turn advanced
});

test('live session: opens as an overlay on any duel WITHOUT changing its phase, and takes turns', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'attach a live session here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  await launcher.openSession(slug);
  const m = meta(duelsDir, slug);
  assert.equal(m.sessionOpen, true);
  assert.ok(m.sessionId, 'session id stored');
  assert.equal(m.phase, 'awaiting-approve', 'the session is an overlay — it must not hijack the duel phase');
  assert.ok(events(duelsDir, slug).some(e => e.actor === 'claude' && e.role === 'session'), 'opening turn streamed');

  await launcher.sessionMessage(slug, 'what is the status here?');
  const evs = events(duelsDir, slug);
  assert.ok(evs.some(e => e.actor === 'user' && e.role === 'session' && e.content === 'what is the status here?'), 'user turn recorded');
  assert.ok(evs.filter(e => e.actor === 'claude' && e.role === 'session').length >= 2, 'opening + reply');
  assert.equal(meta(duelsDir, slug).sessionTurns, 2);
});

test('sessionMessage before opening a session is rejected', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'no session opened yet here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  await assert.rejects(() => launcher.sessionMessage(slug, 'hi'), /no live session/);
});

test('edit guardrail: refused without a worktree / in a running phase; effective only when idle + worktree', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'edit guardrail duel goes here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  await launcher.openSession(slug);
  const patch = (o) => writeFileSync(join(duelsDir, slug, 'duel.json'), JSON.stringify({ ...meta(duelsDir, slug), ...o }));

  // no worktree → edit refused, and a turn stays read-only
  assert.throws(() => launcher.setSessionEdit(slug, true), /edit not allowed/);
  assert.equal(launcher.canEditSession(slug), false);

  // worktree + an idle/gated phase → edit granted, turn runs in edit mode
  const wt = mkdtempSync(join(tmpdir(), 'wt-'));
  patch({ worktree: wt, phase: 'implement' });
  assert.equal(launcher.canEditSession(slug), true);
  assert.deepEqual(launcher.setSessionEdit(slug, true), { sessionEdit: true });
  assert.equal((await launcher.sessionMessage(slug, 'apply the fix')).edit, true);

  // phase advances into a running round → edit silently drops to read-only at send time,
  // even though the sessionEdit flag is still set in meta (it can never leak into a live round)
  patch({ phase: 'design' });
  assert.equal(launcher.canEditSession(slug), false);
  assert.equal((await launcher.sessionMessage(slug, 'sneak an edit in')).edit, false);
});

test('non-array triage JSON does not crash runCheckpoint or wedge the phase', async () => {
  const repo = scratchRepo();
  const { duelsDir, launcher } = mk({ contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex' } } });
  const { slug } = await launcher.spawnDuel({ task: 'triage robustness build task', repo, pipeline: 'execution', category: 'library' });
  await waitPhase(duelsDir, slug, 'awaiting-verdict');
  await launcher.sendVerdict(slug, 'codex');
  await waitPhase(duelsDir, slug, 'implement');
  process.env.FAKE_REPLY = '{"not":"an array"}'; // valid JSON, not an array
  await launcher.runCheckpoint(slug); // must not throw
  delete process.env.FAKE_REPLY;
  assert.equal(meta(duelsDir, slug).phase, 'implement'); // recovered, not wedged at 'checkpoint'
  assert.ok(events(duelsDir, slug).some(e => /not a JSON array/i.test(e.content)));
});

test('checkpoint/finish are gated: phase is implementing (not implement) until the build completes', async () => {
  const repo = scratchRepo();
  // delayed impl so the implementing phase is observable
  const { duelsDir, launcher } = mk({ contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex', FAKE_DELAY_MS: '400' } } });
  const { slug } = await launcher.spawnDuel({ task: 'phase gate build task here', repo, pipeline: 'execution', category: 'library' });
  await waitPhase(duelsDir, slug, 'awaiting-verdict');
  await launcher.sendVerdict(slug, 'codex');
  await waitPhase(duelsDir, slug, 'implementing');
  await assert.rejects(() => launcher.runCheckpoint(slug), /wrong phase/);   // rejected while implementing
  await waitPhase(duelsDir, slug, 'implement');                             // impl finished → buttons live
});

test('approve records heldBy in duel.json (conquest)', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'conquest resolution duel here', repo: '/tmp', pipeline: 'resolution', category: 'research' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  await launcher.approve(slug, 'codex');           // codex holds this hex
  const m = meta(duelsDir, slug);
  assert.equal(m.phase, 'finished');
  assert.equal(m.heldBy, 'codex');
});

test('approve with no holder is neutral', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'neutral resolution duel here', repo: '/tmp', pipeline: 'resolution', category: 'research' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  await launcher.approve(slug);
  assert.equal(meta(duelsDir, slug).heldBy, null);
});

test('same-named task on a repeated run gets a distinct worktree, not a wedged verdict', async () => {
  const repo = scratchRepo();
  const { duelsDir, launcher } = mk({ contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex' } } });
  const { slug } = await launcher.spawnDuel({ task: 'collision widget build now', repo, pipeline: 'execution', category: 'library' });
  await waitPhase(duelsDir, slug, 'awaiting-verdict');
  const short = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  // duel-init refuses to create a second duel dir with an identical slug (same day +
  // same 5-word task tail => byte-identical full slug), so two LIVE duels can never
  // actually reach sendVerdict with a colliding `short` within a single test run --
  // the literal "spawn two duels with the same task" scenario is unreachable through
  // the public API (confirmed: doing exactly that throws "duel dir already exists"
  // from duel-init before either duel's sendVerdict ever runs). Instead we pre-occupy
  // sendVerdict's target worktree/branch name the way a genuine second duel (e.g. the
  // same 5-word task tail run on an EARLIER DAY, so duel-init's own slug differs but
  // `short` still collides) would find it already taken, and confirm sendVerdict's
  // while-loop works around it instead of throwing and wedging the verdict.
  execFileSync('git', ['-C', repo, 'worktree', 'add', `${repo}-duel-${short}`, '-b', `duel/${short}`]);
  await launcher.sendVerdict(slug, 'codex');   // must not throw despite the name already being taken
  await waitPhase(duelsDir, slug, 'implement');
  const wt = meta(duelsDir, slug).worktree;
  assert.notEqual(wt, `${repo}-duel-${short}`, 'collision guard picked a distinct worktree');
  assert.match(meta(duelsDir, slug).branch, /-2$/);
});

test('buildResolution: resolution → codex builds the merged plan in a worktree off the real repo', async () => {
  const repo = scratchRepo();
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'build the resolved plan now', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');   // resolution ran; draft-resolution.md exists
  const r = await launcher.buildResolution(slug, repo);
  assert.ok(r.building && r.worktree && existsSync(r.worktree), 'worktree created off the real repo');
  await waitPhase(duelsDir, slug, 'implement');          // codex "implemented" the plan
  const m = meta(duelsDir, slug);
  assert.equal(m.winner, 'codex');
  assert.equal(m.repo, repo, 'retargeted from /tmp to the real build repo');
  assert.equal(m.branch, `duel/${slug.replace(/^\d{4}-\d{2}-\d{2}-/, '')}`);
  assert.ok(existsSync(join(duelsDir, slug, 'impl-notes.md')), 'codex produced implementation notes');
  // building twice is a phase error
  await assert.rejects(() => launcher.buildResolution(slug, repo), /phase/);
});

test('buildResolution requires a build repo', async () => {
  const { duelsDir, launcher } = mk();
  const { slug } = await launcher.spawnDuel({ task: 'plan with no repo set here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  await assert.rejects(() => launcher.buildResolution(slug, null), /repo/);
});

test('greptile PR loop: openPR → codex fixes to 5/5 → ready-to-merge → merge', async () => {
  const wt = scratchRepo(); // stands in for the built worktree (real repo so gitCommit is happy)
  let pushes = 0;
  const gitRun = async (args) => {
    if (args.includes('remote')) return 'git@github.com:o/r.git\n';
    if (args.includes('push')) { pushes++; return ''; }
    return '';
  };
  const ghRun = async (args) => {
    if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/o/r/pull/42\n';
    if (args[0] === 'pr' && args[1] === 'checks') return JSON.stringify([{ name: 'Greptile Review', bucket: 'pass' }]);
    if (args[0] === 'api' && /issues\/42\/comments/.test(args[1] || '')) return JSON.stringify([{ user: { login: 'greptile-apps[bot]' }, body: `Confidence Score: ${pushes >= 2 ? 5 : 3}/5` }]);
    if (args[0] === 'api' && /pulls\/42\/comments/.test(args[1] || '')) return JSON.stringify([{ user: { login: 'greptile-apps[bot]' }, path: 'a.ts', line: 5, body: 'handle null here' }]);
    if (args[0] === 'pr' && args[1] === 'merge') return '';
    return '';
  };
  const { duelsDir, launcher } = mk({ ghRun, gitRun, greptilePollMs: 5, greptilePollTries: 2 });
  const slug = '2026-07-16-greptile-loop';
  mkdirSync(join(duelsDir, slug), { recursive: true });
  writeFileSync(join(duelsDir, slug, 'duel.json'), JSON.stringify({ slug, phase: 'implement', task: 'ship the thing', worktree: wt, branch: 'duel/greptile-loop', winner: 'codex', checkpoints: 0, pipeline: 'resolution' }));

  const r = await launcher.openPR(slug);
  assert.equal(r.pr, '42');
  assert.match(r.prUrl, /pull\/42/);
  await waitPhase(duelsDir, slug, 'ready-to-merge'); // 3/5 → codex fix → push → 5/5
  const m = meta(duelsDir, slug);
  assert.equal(m.pr, '42');
  assert.equal(m.ghRepo, 'o/r');
  assert.ok(pushes >= 2, `pushed the branch + at least one fix (got ${pushes})`);

  const mg = await launcher.mergePR(slug);
  assert.deepEqual([mg.merged, mg.pr], [true, '42']);
  assert.equal(meta(duelsDir, slug).phase, 'merged');
});

test('mergePR refuses before Greptile 5/5 (phase not ready-to-merge)', async () => {
  const { duelsDir, launcher } = mk();
  const slug = '2026-07-16-not-ready';
  mkdirSync(join(duelsDir, slug), { recursive: true });
  writeFileSync(join(duelsDir, slug, 'duel.json'), JSON.stringify({ slug, phase: 'reviewing', pr: '9', ghRepo: 'o/r' }));
  await assert.rejects(() => launcher.mergePR(slug), /not ready/);
});

test('greptile loop stops at review-stuck when Greptile never reaches 5/5', async () => {
  const wt = scratchRepo();
  const gitRun = async (args) => (args.includes('remote') ? 'git@github.com:o/r.git\n' : '');
  const ghRun = async (args) => {
    if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/o/r/pull/7\n';
    if (args[0] === 'pr' && args[1] === 'checks') return JSON.stringify([{ name: 'Greptile Review', bucket: 'pass' }]);
    if (args[0] === 'api' && /issues\/7\/comments/.test(args[1] || '')) return JSON.stringify([{ user: { login: 'greptile-apps[bot]' }, body: 'Confidence Score: 3/5' }]);
    if (args[0] === 'api' && /pulls\/7\/comments/.test(args[1] || '')) return JSON.stringify([{ user: { login: 'greptile-apps[bot]' }, path: 'a.ts', line: 1, body: 'still wrong' }]);
    return '';
  };
  const { duelsDir, launcher } = mk({ ghRun, gitRun, greptilePollMs: 3, greptilePollTries: 1, greptileMaxRounds: 1 });
  const slug = '2026-07-16-stuck';
  mkdirSync(join(duelsDir, slug), { recursive: true });
  writeFileSync(join(duelsDir, slug, 'duel.json'), JSON.stringify({ slug, phase: 'implement', task: 't', worktree: wt, branch: 'duel/stuck', winner: 'codex', checkpoints: 0, pipeline: 'resolution' }));
  await launcher.openPR(slug);
  await waitPhase(duelsDir, slug, 'review-stuck');
  await assert.rejects(() => launcher.mergePR(slug), /not ready/); // never merges below 5/5
});

test('implement brief bounds the build to a LOC slice and demands follow-up tickets', () => {
  const b = BRIEFS.implement('# a big design', 300);
  assert.match(b, /UNDER ~300 lines/, 'states the LOC budget');
  assert.match(b, /first coherent, self-contained SLICE/i, 'build one slice, not the whole plan');
  assert.match(b, /giant PR is a failure/i, 'discourages the monster PR');
  assert.match(b, /FOLLOW-UPS:/, 'demands the remaining slices as follow-up tickets');
});

test('an empty build (codex produced no changes) surfaces as build-empty, not implement', async () => {
  const repo = scratchRepo();
  // FAKE_NOOP makes the fake wrapper write its out file but change NO repo files → clean tree
  const { duelsDir, launcher } = mk({ contestantEnv: { claude: { FAKE_ACTOR: 'claude' }, codex: { FAKE_ACTOR: 'codex', FAKE_NOOP: '1' } } });
  const { slug } = await launcher.spawnDuel({ task: 'a task too hard to build here', repo: '/tmp', pipeline: 'resolution', category: 'x' });
  await waitPhase(duelsDir, slug, 'awaiting-approve');
  // point the build at a real repo, then build — codex writes nothing
  const r = await launcher.buildResolution(slug, repo);
  assert.ok(r.building);
  await waitPhase(duelsDir, slug, 'build-empty');
  const m = meta(duelsDir, slug);
  assert.equal(m.phase, 'build-empty', 'empty build does not present as ready-to-PR');
  // and openPR refuses (wrong phase)
  await assert.rejects(() => launcher.openPR(slug), /phase/);
});
