#!/usr/bin/env node
import { spawn, execFile, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { appendEvent } from '../scripts/append-event.mjs';
import { applyScore } from '../scripts/score.mjs';
import * as greptile from '../scripts/greptile.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// The branch duel PRs target and diff against. MMV uses dev: DUEL_BASE=dev.
export const BASE = process.env.DUEL_BASE || 'main';

// Phases where a live session may hold EDIT access: the duel has a worktree AND
// it's human-gated/idle, never mid-autonomous-round — so a session can't clobber
// a pipeline that is actively writing to the same worktree.
export const EDIT_OK_PHASES = new Set(['awaiting-verdict', 'awaiting-approve', 'implement', 'finished', 'review-stuck', 'ready-to-merge']);

// ---------- prompt templates (exported for tests and 2b reuse) ----------
export const BRIEFS = {
  design: (task, other) => `You are {NAME}, one of two rival AI engineers in a scored duel; your opponent is ${other}. Task: ${task}\n\nDO YOUR HOMEWORK BEFORE YOU DESIGN — in this order:\n1. READ THE PROJECT CONTEXT so you get the architecture and decisions right, not a generic guess: the repo's agent guide (AGENTS.md and/or CLAUDE.md — conventions + workflow), the domain docs (CONTEXT.md / CONTEXT-MAP.md), the architecture decision records (docs/adr/ — you must NOT contradict an accepted ADR), and any design spec relevant to this task (search docs/, e.g. docs/superpowers/specs). Use Glob/Grep to find them.\n2. STUDY THE ACTUAL CODE for this task — Read/Glob/Grep the REAL files, modules, functions, and types you'll touch. Quote real file paths and real symbols.\n\nYour design MUST be grounded in code that actually exists AND consistent with the docs/ADRs: reuse the real patterns already here, respect how the current system actually works, and cite the real files it changes. Do NOT invent files, functions, APIs, or architecture — a confident plan written against a codebase that does not exist is worthless and will LOSE. If the task can't be grounded (the code isn't here, or the premise contradicts the real code/ADRs), SAY SO plainly instead of inventing.\n\nThen produce your best complete answer/design in markdown: concrete, opinionated, tied to the real files it changes, and citing the docs/ADRs it relies on. Never read or quote .env files or secret values. Your ENTIRE final response must be the deliverable itself.`,
  rebuttal: (task, rivalDoc) => `You are {NAME} in a scored duel. Task: ${task}\n\nBelow is your rival's answer. Write a rebuttal that tears it down: concrete flaws, risks, missed requirements. FIRST AND MOST IMPORTANT — VERIFY IT AGAINST THE REAL CODEBASE with Read/Glob/Grep: every file path, function, type, and API the rival references must actually EXIST here and work the way they claim. Any file/symbol that is fictional, any API used wrongly, or any change that contradicts how the real code actually behaves is a FATAL flaw — call out each one by its real path and prove it (quote the real code). A plan against a codebase that doesn't exist must not win. No style nits. Your ENTIRE final response must be the rebuttal.\n\n---\n\n# RIVAL'S ANSWER (attack this):\n\n${rivalDoc}`,
  draft: (task, docs) => `You are a neutral synthesis judge. Task under dispute: ${task}\n\nBelow are two rival answers and their mutual rebuttals. Synthesize the strongest single resolution: adopt what survives attack, discard what doesn't, and note (in one line each) which side contributed what. Your ENTIRE final response must be the resolution document.\n\n${docs}`,
  implement: (design, maxLoc = 500) => `You won the duel. Implement the design (below) in this working directory — but keep this build SMALL and reviewable: the diff must stay UNDER ~${maxLoc} lines changed.\n\nIf the full design is larger than that (most are), implement ONLY the first coherent, self-contained SLICE that stands on its own and passes tests — follow the design's own build order if it has one. Do NOT build the whole thing in one shot; a giant PR is a failure here, not a win. Follow existing conventions, write tests, run them.\n\nYour ENTIRE final response must be, in order:\n1. A short summary of the slice you built and how you verified it (type-check/tests).\n2. A line exactly \`FOLLOW-UPS:\` then a numbered list of the REMAINING slices as small, self-contained, ticket-sized items — each \`<title> — <one-line scope, ~${maxLoc} LOC or less>\` — so they can each be built as their own small PR. If nothing remains, write \`FOLLOW-UPS: none\`.\n\n---\n\n# DESIGN:\n\n${design}`,
  attack: (design, diff) => `You lost the design duel. Redemption: tear this implementation down. Below: the winning design and the current diff. Find REAL defects — bugs, missed requirements, security holes, broken edge cases. Number each finding with severity (high/med/low). If the work is solid, say so — false attacks cost you credibility.\n\n# WINNING DESIGN:\n\n${design}\n\n# DIFF:\n\n\`\`\`diff\n${diff}\n\`\`\``,
  triage: (attack) => `You are the duel orchestrator triaging checkpoint findings. For each numbered finding below, judge CONFIRMED / REJECTED / UNCLEAR with one line of reasoning. Reply ONLY with a JSON array: [{"n":1,"verdict":"CONFIRMED","reason":"..."}]. Findings:\n\n${attack}`,
  defense: (findings) => `Your rival attacked your implementation; the orchestrator confirmed these findings. For each: FIX it in this working directory (and say what you changed) or REBUT it (prove it wrong). Run the tests when done. Findings:\n\n${findings}`,
  hitlOpening: (task, skill) => `You are working a human-in-the-loop wayfinder ticket with the human, via chat. Ticket: ${task}\n\nOpen the session the way ${skill} would: lay out the options and evidence you can gather, then ask the single sharpest question. One question at a time, always ending with a question for the human — until the decision is clearly made, then propose a final resolution prefixed with RESOLUTION:.`,
  sessionOpening: (task, phase, duelDir, worktree) => `You are a live assistant helping the human steer an ongoing AI duel, via chat. You are NOT one of the two contestants — you're their co-pilot on this duel.\n\nDuel task: ${task}\nCurrent phase: ${phase}\nThe full transcript and design docs are in ${duelDir} (events.jsonl, and design-*.md / rebuttal-*.md / resolution.md if present).${worktree ? ` The build worktree is ${worktree} — read it to see the actual changes.` : ''}\n\nFirst, quickly read the transcript and any docs to get context. Then give a 2–3 sentence status of where this duel stands and ask how you can help. Keep every reply SHORT and conversational — the human may be on a phone, possibly hands-free by voice — so no walls of text, one thing at a time.`,
  greptileFix: (comments) => `You are addressing a Greptile code review on this PR, in this working directory. For each actionable comment below, fix the ROOT CAUSE (not just the cited line). Skip any that are clearly informational or incorrect — say which and why. Run the relevant tests after your fixes. Your final response: a short summary of what you changed. Greptile comments:\n\n${comments}`,
};

export function createLauncher({
  duelsDir = process.env.DUELS_DIR || join(homedir(), '.claude', 'duels'),
  skillDir = REPO_ROOT,
  claudeCmd, codexCmd, oracleCmd,
  contestantEnv = { claude: {}, codex: {} },
  maxConcurrent = 3,
  // Greptile PR-loop deps (injectable for tests): async gh/git runners + timing.
  ghRun = greptile.gh, gitRun = greptile.git,
  greptilePollMs = Number(process.env.DUEL_GREPTILE_POLL_MS) || 15000,
  greptilePollTries = Number(process.env.DUEL_GREPTILE_POLL_TRIES) || 40,
  greptileMaxRounds = Number(process.env.DUEL_GREPTILE_ROUNDS) || 4,
  // how long a codex build (implement / greptile-fix) may run before it's killed. Raised from
  // the 900s research default to 30min because real feature builds take a while; set
  // DUEL_BUILD_TIMEOUT (seconds) higher for very large plans. It's a runaway backstop, not a
  // deadline — a genuinely stuck build still shouldn't hang forever.
  buildTimeoutS = Number(process.env.DUEL_BUILD_TIMEOUT) || 1800,
  // keep each build a small, reviewable SLICE — codex builds under this line budget and lists
  // the rest as follow-up tickets, so a huge plan becomes many small PRs instead of one monster.
  buildMaxLoc = Number(process.env.DUEL_BUILD_MAX_LOC) || 500,
} = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  claudeCmd = claudeCmd || ['node', join(skillDir, 'scripts', 'claude-duel.mjs')];
  codexCmd = codexCmd || ['node', join(skillDir, 'scripts', 'codex-duel.mjs')];
  oracleCmd = oracleCmd || claudeCmd;
  const running = new Map();   // key -> {pipeline}
  const queue = [];            // [{key, start}]
  const activeChildren = new Set();  // live wrapper child processes (for shutdown teardown)
  const hitlBusy = new Set();        // slugs with an in-flight hitlMessage turn
  const sessionBusy = new Set();     // slugs with an in-flight sessionMessage turn

  const dd = (slug) => join(duelsDir, slug);
  const meta = (slug) => JSON.parse(readFileSync(join(dd(slug), 'duel.json'), 'utf8'));
  const patchMeta = (slug, patch) => {
    const j = { ...meta(slug), ...patch };
    writeFileSync(join(dd(slug), 'duel.json'), JSON.stringify(j, null, 2));
    return j;
  };
  const say = (slug, round, content) => { try { appendEvent(dd(slug), { actor: 'orchestrator', role: 'status', round, content }); } catch (e) { console.error(String(e)); } };
  const setPhase = (slug, phase, round, note) => { patchMeta(slug, { phase }); say(slug, round, note || `phase → ${phase}`); };

  function initDuel({ task, repo, pipeline, category, ticket, map }) {
    // defense-in-depth: a field equal to a flag token (e.g. task "--repo") would
    // corrupt duel-init's positional opt() parser. The route validates too (Task 6).
    for (const [k, v] of Object.entries({ task, repo, category, ticket, map })) {
      if (typeof v === 'string' && v.startsWith('--')) return Promise.reject(new Error(`invalid ${k}: must not start with --`));
    }
    return new Promise((resolve, reject) => {
      const args = [join(skillDir, 'scripts', 'duel-init.mjs'), '--task', task, '--repo', repo,
        '--category', category || 'general', '--pipeline', pipeline];
      if (ticket) args.push('--ticket', ticket);
      if (map) args.push('--map', map);
      execFile('node', args, { env: { ...process.env, DUELS_DIR: duelsDir } }, (err, stdout) => {
        if (err) return reject(err);
        resolve(JSON.parse(stdout.trim()));
      });
    });
  }

  // run one wrapper call; returns parsed result JSON ({ok:false,...} on hard failure)
  function callWrapper(who, slug, { role, round, out, brief, briefName, resume, cd, mode, sandbox, timeoutS = 900 }) {
    const cmd = who === 'claude' ? claudeCmd : who === 'codex' ? codexCmd : oracleCmd;
    const env = { ...process.env, ...(contestantEnv[who] || {}) };
    return new Promise((resolve) => {
      const briefPath = join(dd(slug), briefName);
      try { writeFileSync(briefPath, brief); } catch (e) { return resolve({ ok: false, threadId: null, out, exitCode: 1, err: String(e) }); }
      const args = [...cmd.slice(1), '--duel-dir', dd(slug), '--role', role, '--round', String(round),
        '--out', out, '--prompt-file', briefPath, '--timeout', String(timeoutS)];
      if (resume) args.push('--resume', resume);
      if (cd) args.push('--cd', cd);
      if (who === 'claude' || who === 'oracle') { if (mode) args.push('--mode', mode); }
      if (who === 'codex') args.push('--sandbox', sandbox || 'read-only');
      const child = spawn(cmd[0], args, { stdio: ['ignore', 'pipe', 'pipe'], env });
      activeChildren.add(child);
      let outBuf = '';
      child.stdout.on('data', (d) => { outBuf += d; });
      child.on('error', () => { activeChildren.delete(child); resolve({ ok: false, threadId: null, out, exitCode: 127 }); });
      child.on('close', () => {
        activeChildren.delete(child);
        const last = outBuf.trim().split('\n').pop();
        try { resolve(JSON.parse(last)); } catch { resolve({ ok: false, threadId: null, out, exitCode: 1 }); }
      });
    });
  }

  // retry-once wrapper with one-sided continuation semantics
  async function callWithRetry(who, slug, opts) {
    let r = await callWrapper(who, slug, opts);
    if (!r.ok) {
      say(slug, opts.round, `${who} ${opts.role} failed (exit ${r.exitCode}) — retry 1 of 1`);
      r = await callWrapper(who, slug, opts);
      if (!r.ok) say(slug, opts.round, `${who} ${opts.role} failed twice — continuing one-sided (walkover risk noted)`);
    }
    return r;
  }

  const readDoc = (slug, name) => { try { return readFileSync(join(dd(slug), name), 'utf8'); } catch { return ''; } };

  // A duel can grant a live session edit access only with a real worktree in an
  // idle/human-gated phase. Read-mode chat is always allowed (this only gates writes).
  const canEdit = (m) => !!(m.worktree && existsSync(m.worktree) && EDIT_OK_PHASES.has(m.phase));

  async function resolutionPipeline(slug) {
    const m = meta(slug);
    const researchDir = researchCwd(m.repo); // contestants study origin/<BASE>, not the working branch
    setPhase(slug, 'design', 1, '⚔️ Round 1 — both contestants answering…');
    const [c, x] = await Promise.all([
      callWithRetry('claude', slug, { role: 'design', round: 1, out: 'design-claude.md', mode: 'read', cd: researchDir, briefName: 'brief-design-claude.md', brief: BRIEFS.design(m.task, 'codex').replace('{NAME}', 'claude') }),
      callWithRetry('codex', slug, { role: 'design', round: 1, out: 'design-codex.md', sandbox: 'read-only', cd: researchDir, briefName: 'brief-design-codex.md', brief: BRIEFS.design(m.task, 'claude').replace('{NAME}', 'codex') }),
    ]);
    patchMeta(slug, { codexThreadId: x.threadId || meta(slug).codexThreadId });
    setPhase(slug, 'cross-exam', 2, '⚔️ Round 2 — cross-examination.');
    await Promise.all([
      c.ok && x.ok ? callWithRetry('claude', slug, { role: 'rebuttal', round: 2, out: 'rebuttal-claude.md', mode: 'read', cd: researchDir, briefName: 'brief-rebuttal-claude.md', brief: BRIEFS.rebuttal(m.task, readDoc(slug, 'design-codex.md')).replace('{NAME}', 'claude') }) : null,
      c.ok && x.ok ? callWithRetry('codex', slug, { role: 'rebuttal', round: 2, out: 'rebuttal-codex.md', sandbox: 'read-only', cd: researchDir, resume: x.threadId, briefName: 'brief-rebuttal-codex.md', brief: BRIEFS.rebuttal(m.task, readDoc(slug, 'design-claude.md')).replace('{NAME}', 'codex') }) : null,
    ]);
    setPhase(slug, 'drafting', 3, 'Synthesizing a draft resolution…');
    const docs = `# CLAUDE'S ANSWER\n\n${readDoc(slug, 'design-claude.md')}\n\n# CODEX'S ANSWER\n\n${readDoc(slug, 'design-codex.md')}\n\n# CLAUDE'S REBUTTAL\n\n${readDoc(slug, 'rebuttal-claude.md')}\n\n# CODEX'S REBUTTAL\n\n${readDoc(slug, 'rebuttal-codex.md')}`;
    await callWithRetry('oracle', slug, { role: 'status', round: 3, out: 'draft-resolution.md', mode: 'read', briefName: 'brief-draft.md', brief: BRIEFS.draft(m.task, docs) });
    setPhase(slug, 'awaiting-approve', 3, '📜 Draft resolution ready — awaiting your Approve/Reject in the arena.');
  }

  // execution pipeline: rounds 1-2 are identical to resolutionPipeline's design +
  // cross-exam, but there's no synthesis draft — a human picks the winner instead.
  async function executionDesignPhase(slug) {
    const m = meta(slug);
    const researchDir = researchCwd(m.repo); // contestants study origin/<BASE>, not the working branch
    setPhase(slug, 'design', 1, '⚔️ Round 1 — both contestants answering…');
    const [c, x] = await Promise.all([
      callWithRetry('claude', slug, { role: 'design', round: 1, out: 'design-claude.md', mode: 'read', cd: researchDir, briefName: 'brief-design-claude.md', brief: BRIEFS.design(m.task, 'codex').replace('{NAME}', 'claude') }),
      callWithRetry('codex', slug, { role: 'design', round: 1, out: 'design-codex.md', sandbox: 'read-only', cd: researchDir, briefName: 'brief-design-codex.md', brief: BRIEFS.design(m.task, 'claude').replace('{NAME}', 'codex') }),
    ]);
    patchMeta(slug, { codexThreadId: x.threadId || meta(slug).codexThreadId });
    setPhase(slug, 'cross-exam', 2, '⚔️ Round 2 — cross-examination.');
    await Promise.all([
      c.ok && x.ok ? callWithRetry('claude', slug, { role: 'rebuttal', round: 2, out: 'rebuttal-claude.md', mode: 'read', cd: researchDir, briefName: 'brief-rebuttal-claude.md', brief: BRIEFS.rebuttal(m.task, readDoc(slug, 'design-codex.md')).replace('{NAME}', 'claude') }) : null,
      c.ok && x.ok ? callWithRetry('codex', slug, { role: 'rebuttal', round: 2, out: 'rebuttal-codex.md', sandbox: 'read-only', cd: researchDir, resume: x.threadId, briefName: 'brief-rebuttal-codex.md', brief: BRIEFS.rebuttal(m.task, readDoc(slug, 'design-claude.md')).replace('{NAME}', 'codex') }) : null,
    ]);
    setPhase(slug, 'awaiting-verdict', 2, '⚖️ Designs and rebuttals in — verdict buttons live in the arena.');
  }

  async function implementKickoff(slug, winner, designDoc) {
    const m = meta(slug);
    // designDoc lets a resolution build implement the merged plan (draft-resolution.md)
    // instead of the winner's own design doc.
    const design = readDoc(slug, designDoc || `design-${winner}.md`);
    const r = await callWithRetry(winner, slug, {
      role: 'status', round: 3, out: 'impl-notes.md', briefName: 'brief-implement.md',
      brief: BRIEFS.implement(design, buildMaxLoc), cd: m.worktree, timeoutS: buildTimeoutS,
      ...(winner === 'claude' ? { mode: 'write' } : { sandbox: 'workspace-write' }),
    });
    patchMeta(slug, winner === 'codex' ? { codexThreadId: r.threadId } : { claudeThreadId: r.threadId });
    gitCommit(m.worktree, `feat: duel implementation (${winner})`);
    // report the slice size so an over-budget build is visible at a glance (the whole point of
    // slicing) — count insertions+deletions vs the branch base.
    let loc = 0;
    try {
      const ns = execFileSync('git', ['-C', m.worktree, 'diff', m.base || `origin/${BASE}`, '--numstat'], { maxBuffer: 8e6 }).toString();
      loc = ns.trim().split('\n').filter(Boolean).reduce((n, l) => { const [a, d] = l.split('\t'); return n + (Number(a) || 0) + (Number(d) || 0); }, 0);
    } catch {}
    const over = loc > buildMaxLoc * 1.5;
    // an EMPTY build must NOT present as ready-to-PR. codex can burn its whole budget reading
    // + reasoning (esp. on a hard, deploy-critical task) and produce zero changes; gitCommit
    // no-ops on a clean tree, so without this guard the duel would advance to 'implement' and
    // let you open a PR on an empty branch. Surface it as build-empty (a distinct, honest state).
    if (loc === 0) {
      patchMeta(slug, winner === 'codex' ? { codexThreadId: r.threadId } : { claudeThreadId: r.threadId });
      setPhase(slug, 'build-empty', 3, `⚠️ ${winner} produced NO changes${r.ok ? '' : ' (timed out/failed)'} — the task may be too big or too hard for one build. Decompose it, retry with a bigger budget, or hand it to the other model.`);
      return;
    }
    // NOW the checkpoint/finish/PR buttons may go live — impl is committed and the
    // winner's session id is patched for defense resumes
    setPhase(slug, 'implement', 3, `🏗️ ${winner} built a ${loc}-line slice (budget ~${buildMaxLoc})${over ? ' ⚠️ over budget — see FOLLOW-UPS to slice further' : ''} — checkpoint, or open a PR when ready.`);
  }

  // The Greptile PR review loop (AGENTS.md): poll the "Greptile Review" check + confidence score;
  // while below 5/5 with actionable comments, codex fixes the ROOT causes, commits, pushes, and we
  // re-poll — up to greptileMaxRounds. Lands at 'ready-to-merge' (5/5) or 'review-stuck' (needs you).
  async function greptileLoop(slug) {
    const m = meta(slug);
    const { ghRepo: repo, pr, worktree } = m;
    for (let round = 0; round <= greptileMaxRounds; round++) {
      // Poll until the Greptile check REACHES a verdict. 'absent' (check not posted yet, the
      // first ~2min after push) and 'pending' both mean "Greptile hasn't finished" — keep
      // waiting through both, or the loop would bail to review-stuck before Greptile even starts.
      let state = 'pending';
      for (let i = 0; i < greptilePollTries; i++) {
        if (i) await sleep(greptilePollMs);
        try { state = greptile.parseCheckState(await ghRun(['pr', 'checks', String(pr), '--repo', repo, '--json', 'name,state,bucket'])); } catch { state = 'pending'; }
        if (state !== 'pending' && state !== 'absent') break;
      }
      let score = null;
      try { score = greptile.parseScore(await ghRun(['api', `repos/${repo}/issues/${pr}/comments`, '--paginate'])); } catch {}
      say(slug, 3, `🔬 Greptile: check ${state}, confidence ${score ?? '?'}/5 (round ${round + 1}).`);
      if (greptile.greptilePassed(score)) { setPhase(slug, 'ready-to-merge', 3, '✅ Greptile 5/5 — ready to merge into main.'); return; }
      let comments = [];
      try { comments = greptile.parseReviewComments(await ghRun(['api', `repos/${repo}/pulls/${pr}/comments`, '--paginate'])); } catch {}
      // still no verdict after all polls (Greptile slow/absent) → stuck-but-pending, honestly said
      if ((state === 'pending' || state === 'absent') && score === null && !comments.length) {
        setPhase(slug, 'review-stuck', 3, `⏳ Greptile hasn't posted a verdict yet (check ${state}) after ${round + 1} round(s) — press 🔬 Re-check to keep polling.`);
        return;
      }
      if (round >= greptileMaxRounds || !comments.length) {
        setPhase(slug, 'review-stuck', 3, `⚠️ Greptile at ${score ?? '?'}/5 with ${comments.length} open comment(s) after ${round + 1} round(s) — over to you.`);
        return;
      }
      const brief = comments.map((c, i) => `${i + 1}. ${c.path}:${c.line ?? '?'} — ${c.body}`).join('\n\n');
      say(slug, 3, `🔧 codex addressing ${comments.length} Greptile comment(s)…`);
      await callWithRetry('codex', slug, {
        role: 'status', round: 3, out: `greptile-fix-${round + 1}.md`, briefName: `brief-greptile-fix-${round + 1}.md`,
        brief: BRIEFS.greptileFix(brief), cd: worktree, timeoutS: buildTimeoutS, sandbox: 'workspace-write',
      });
      gitCommit(worktree, `fix: address Greptile review round ${round + 1}`);
      try { await gitRun(['-C', worktree, 'push']); } catch (e) { say(slug, 3, `push failed: ${String(e.message || e).slice(0, 150)}`); }
    }
  }

  // true if a local branch already exists (collision guard for worktree naming)
  function branchExists(repo, branch) {
    try { execFileSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { stdio: 'ignore' }); return true; }
    catch { return false; }
  }

  // where contestants RESEARCH: a fresh, read-only checkout of origin/<BASE> — NOT the user's
  // working branch (which may be a feature branch missing the code the ticket targets, so a
  // grounded contestant still can't find it). One reusable detached worktree per repo, kept
  // current. Non-git repos (local map dir, /tmp) are used as-is.
  function researchCwd(repo) {
    try { execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { stdio: 'ignore' }); }
    catch { return repo; } // not a git repo
    const wt = `${repo}-research`;
    try { execFileSync('git', ['-C', repo, 'fetch', 'origin', BASE, '--quiet'], { stdio: 'ignore' }); } catch {}
    try {
      if (!existsSync(wt)) execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, `origin/${BASE}`], { stdio: 'ignore' });
      else execFileSync('git', ['-C', wt, 'checkout', '--detach', '--force', `origin/${BASE}`], { stdio: 'ignore' });
    } catch { return repo; } // worktree failed → fall back to the repo as-is
    return wt;
  }

  // collision-safe `duel/<short>` worktree+branch off `repo` (a same-named task on another
  // day would otherwise reuse the name and `git worktree add` would throw). Used by both the
  // execution verdict and the resolution build.
  function makeWorktree(repo, slug) {
    const stem = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    let short = stem, worktree = `${repo}-duel-${short}`, n = 2;
    while (existsSync(worktree) || branchExists(repo, `duel/${short}`)) { short = `${stem}-${n++}`; worktree = `${repo}-duel-${short}`; }
    // Branch off the PR base (origin/<BASE>), NOT the repo's current HEAD — otherwise a build
    // started while the user is on a feature branch would carry that branch's commits into the
    // duel branch, and the PR diff would be wrong. Fetch first for freshness; fall back to a
    // local <BASE>, then HEAD, if origin/<BASE> isn't available (offline / fresh repo / tests).
    const verify = (ref) => { try { execFileSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', ref], { stdio: 'ignore' }); return true; } catch { return false; } };
    try { execFileSync('git', ['-C', repo, 'fetch', 'origin', BASE, '--quiet'], { stdio: 'ignore' }); } catch {}
    const baseRef = verify(`origin/${BASE}`) ? `origin/${BASE}` : verify(BASE) ? BASE : 'HEAD';
    // PIN the base to the SHA at creation time — NOT the ref name. origin/<BASE> moves when
    // something merges during a (possibly hour-long) build; diffing against the moved ref shows
    // phantom deletions of files added to main meanwhile and miscounts the slice's LOC. The PR
    // still targets the <BASE> branch (gh computes the merge-base); this SHA is only for our own
    // diff panel + LOC gate, which must reflect exactly what THIS build changed.
    let baseSha = baseRef;
    try { baseSha = execFileSync('git', ['-C', repo, 'rev-parse', baseRef], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || baseRef; } catch {}
    try { execFileSync('git', ['-C', repo, 'worktree', 'add', worktree, '-b', `duel/${short}`, baseRef]); }
    catch (e) { throw new Error(`could not create worktree ${worktree}: ${String(e.stderr || e.message || e).slice(0, 200)}`); }
    return { short, worktree, branch: `duel/${short}`, base: baseSha };
  }

  // commits the worktree on the winner's behalf: codex's sandbox can't reach the
  // parent repo's .git, and claude in write mode is trusted to do it itself but we
  // commit centrally either way for a uniform, verifiable history. No-op (skips the
  // commit) when the tree is clean — tests don't need a real diff, and a genuinely
  // no-op implementation shouldn't manufacture an empty commit.
  function gitCommit(worktree, msg) {
    try {
      execFileSync('git', ['-C', worktree, 'add', '-A']);
      const st = execFileSync('git', ['-C', worktree, 'status', '--porcelain']).toString();
      if (!st.trim()) return;
      // Use the user's configured git identity for real commits; only supply a
      // fallback when git genuinely can't resolve one (fresh CI/sandbox with no
      // ~/.gitconfig). Gating on env-var presence would wrongly override every
      // real developer's identity (they configure via ~/.gitconfig, not env).
      let env = process.env;
      let hasIdentity = false;
      try { hasIdentity = !!execFileSync('git', ['-C', worktree, 'config', 'user.email']).toString().trim(); } catch {}
      if (!hasIdentity && !process.env.GIT_AUTHOR_EMAIL) {
        env = { ...process.env, GIT_AUTHOR_NAME: 'duel-bot', GIT_AUTHOR_EMAIL: 'duel-bot@local', GIT_COMMITTER_NAME: 'duel-bot', GIT_COMMITTER_EMAIL: 'duel-bot@local' };
      }
      execFileSync('git', ['-C', worktree, 'commit', '-m', msg], { env });
    } catch (e) { console.error('gitCommit:', String(e).slice(0, 300)); }
  }

  // `key` may be a synthetic composite like `<slug>#impl` (Task 7 re-enqueues the
  // implementation step); `base` is the real duel dir — NEVER feed `key` to meta()/dd().
  function enqueue(key, run) {
    const base = key.replace(/#(impl|greptile)$/, '');
    const start = () => {
      running.set(key, { pipeline: meta(base).pipeline });
      run().catch((e) => say(base, 0, `pipeline crashed: ${String(e).slice(0, 300)}`))
        .finally(() => { running.delete(key); const next = queue.shift(); if (next) next.start(); });
    };
    if (running.size < maxConcurrent) start();
    else { queue.push({ key, start }); say(base, 0, `queued (cap ${maxConcurrent} reached)`); }
  }

  return {
    async spawnDuel({ task, repo, pipeline, category, ticket, map }) {
      // validate BEFORE initDuel's on-disk side effects — else an unsupported-but-
      // duel-init-valid pipeline (e.g. 'hitl', which uses startHitl) creates an
      // orphaned duel dir wedged at phase:'design', never enqueued, never cleaned up
      if (pipeline !== 'resolution' && pipeline !== 'execution') throw new Error(`spawnDuel: unsupported pipeline ${pipeline} (hitl uses startHitl)`);
      const { slug } = await initDuel({ task, repo, pipeline, category, ticket, map });
      if (pipeline === 'resolution') enqueue(slug, () => resolutionPipeline(slug));
      else enqueue(slug, () => executionDesignPhase(slug));
      return { slug };
    },
    async approve(slug, heldBy = null) {
      if (meta(slug).phase !== 'awaiting-approve') throw new Error('not awaiting approval');
      const holder = (heldBy === 'claude' || heldBy === 'codex') ? heldBy : null;
      patchMeta(slug, { heldBy: holder });
      setPhase(slug, 'finished', 9, `✅ Resolution approved${holder ? ` — ${holder} holds this hex` : ' (neutral)'}.`);
    },
    // build the RESOLVED PLAN with codex: a resolution decided the approach, now implement it.
    // Reuses the execution machinery — a worktree+branch off the REAL repo (resolution duels ran
    // against /tmp), codex implements draft-resolution.md, then checkpoints/finish as usual. Never
    // touches main; the human merges. Conquest waits until finish (the build, not the decision).
    async buildResolution(slug, repo) {
      const m = meta(slug);
      if (m.phase !== 'awaiting-approve') throw new Error(`wrong phase ${m.phase} (need awaiting-approve)`);
      if (!repo) throw new Error('buildResolution needs a build repo (set one on the map)');
      const { worktree, branch, base } = makeWorktree(repo, slug);
      patchMeta(slug, { repo, worktree, branch, base, winner: 'codex' }); // retarget from /tmp to the real repo
      try { appendEvent(dd(slug), { actor: 'user', role: 'verdict', round: 3, content: `Building the resolved plan with **codex** in ${worktree} (branch ${branch}).` }); } catch {}
      setPhase(slug, 'implementing', 3, '🏗️ codex is building the resolved plan…');
      enqueue(`${slug}#impl`, () => implementKickoff(slug, 'codex', 'draft-resolution.md'));
      return { building: true, worktree, branch };
    },
    // push the built branch, open a PR, and start the Greptile review loop.
    async openPR(slug) {
      const m = meta(slug);
      if (m.phase !== 'implement') throw new Error(`wrong phase ${m.phase} (need implement)`);
      if (!m.worktree || !m.branch) throw new Error('no built worktree/branch to open a PR from');
      const repo = greptile.parseRepoSlug(await gitRun(['-C', m.worktree, 'remote', 'get-url', 'origin']));
      await gitRun(['-C', m.worktree, 'push', '-u', 'origin', m.branch]);
      const title = `duel: ${String(m.task).slice(0, 90)}`;
      const body = `Built by the duel arena from the resolved plan of \`${slug}\` (see draft-resolution.md / the duel transcript). Greptile-reviewed via the arena loop.`;
      const out = await ghRun(['pr', 'create', '--repo', repo, '--head', m.branch, '--base', BASE, '--title', title, '--body', body], m.worktree);
      const prUrl = (out.match(/https?:\/\/\S+\/pull\/\d+/) || [String(out).trim()])[0];
      const pr = (prUrl.match(/\/pull\/(\d+)/) || [])[1] || null;
      patchMeta(slug, { pr, prUrl, ghRepo: repo });
      say(slug, 3, `🔀 PR opened: ${prUrl}`);
      setPhase(slug, 'reviewing', 3, '🔬 Greptile is reviewing the PR…');
      enqueue(`${slug}#greptile`, () => greptileLoop(slug));
      return { pr, prUrl };
    },
    // re-enter the Greptile loop (poll again) after review-stuck — Greptile may have posted since.
    async reviewPR(slug) {
      const m = meta(slug);
      if (!['review-stuck', 'reviewing'].includes(m.phase)) throw new Error(`wrong phase ${m.phase} (need review-stuck/reviewing)`);
      if (!m.pr) throw new Error('no PR to review');
      setPhase(slug, 'reviewing', 3, '🔬 Re-checking Greptile…');
      enqueue(`${slug}#greptile`, () => greptileLoop(slug));
      return { reviewing: true, pr: m.pr };
    },
    // merge into main — only once Greptile reached 5/5 (phase ready-to-merge).
    async mergePR(slug) {
      const m = meta(slug);
      if (m.phase !== 'ready-to-merge') throw new Error(`not ready to merge (phase ${m.phase}; Greptile must be 5/5)`);
      await ghRun(['pr', 'merge', String(m.pr), '--repo', m.ghRepo, '--squash', '--delete-branch']);
      say(slug, 9, `⛙ Merged PR #${m.pr} into main.`);
      setPhase(slug, 'merged', 9, '⛙ Merged into main.');
      return { merged: true, pr: m.pr };
    },
    // the resolution's plan was too big; it's been split into Linear sub-tickets. Terminal state.
    markDecomposed(slug, created) {
      setPhase(slug, 'decomposed', 9, `🧩 Plan split into ${created} sub-ticket(s) — re-sync the map to see them, then build each small.`);
    },
    async reject(slug) {
      if (meta(slug).phase !== 'awaiting-approve') throw new Error('not awaiting approval');
      setPhase(slug, 'rejected', 9, '❌ Resolution rejected — ticket un-claimed (2b).');
    },
    async sendVerdict(slug, winner) {
      if (!['claude', 'codex'].includes(winner)) throw new Error('winner must be claude or codex');
      const m = meta(slug);
      if (m.phase !== 'awaiting-verdict') throw new Error(`wrong phase ${m.phase} (need awaiting-verdict)`);
      const { worktree, branch, base } = makeWorktree(m.repo, slug);
      patchMeta(slug, { winner, worktree, branch, base, heldBy: winner });
      try { appendEvent(dd(slug), { actor: 'user', role: 'verdict', round: 3, content: `**${winner} wins the design duel** (+2). Implementation begins in ${worktree}.` }); } catch {}
      applyScore(join(duelsDir, 'SCOREBOARD.md'), { type: 'design-win', winner, category: m.category, slug });
      // 'implementing' (not 'implement') until the build actually finishes — otherwise the
      // arena's checkpoint/finish buttons go live over a still-running impl (empty diff,
      // null resume id). implementKickoff flips it to 'implement' when done.
      setPhase(slug, 'implementing', 3, `🏗️ ${winner} is implementing…`);
      enqueue(`${slug}#impl`, () => implementKickoff(slug, winner));
    },
    async runCheckpoint(slug) {
      const m = meta(slug);
      if (m.phase !== 'implement') throw new Error(`wrong phase ${m.phase} (need implement)`);
      const n = m.checkpoints + 1; const round = 3 + n;
      patchMeta(slug, { checkpoints: n });
      setPhase(slug, 'checkpoint', round, `🗡️ Checkpoint ${n} — ${m.winner === 'claude' ? 'codex' : 'claude'} attacks.`);
      let diff = '';
      try { diff = execFileSync('git', ['-C', m.worktree, 'diff', 'main...HEAD'], { maxBuffer: 8e6 }).toString(); } catch {}
      if (!diff.trim()) { try { diff = execFileSync('git', ['-C', m.worktree, 'diff', 'HEAD'], { maxBuffer: 8e6 }).toString(); } catch {} }
      const loser = m.winner === 'claude' ? 'codex' : 'claude';
      const design = readDoc(slug, `design-${m.winner}.md`);
      await callWithRetry(loser, slug, {
        role: 'checkpoint-attack', round, out: `checkpoint-${n}-attack.md`, briefName: `brief-checkpoint-${n}-attack.md`,
        brief: BRIEFS.attack(design, diff.slice(0, 200000)), cd: m.worktree,
        ...(loser === 'claude' ? { mode: 'read' } : { sandbox: 'read-only' }),
      });
      const attack = readDoc(slug, `checkpoint-${n}-attack.md`);
      await callWithRetry('oracle', slug, { role: 'status', round, out: `checkpoint-${n}-triage.json`, mode: 'read', briefName: `brief-checkpoint-${n}-triage.md`, brief: BRIEFS.triage(attack) });
      let triage = [];
      try {
        const parsed = JSON.parse(readDoc(slug, `checkpoint-${n}-triage.json`).replace(/^```(json)?|```$/gm, '').trim());
        if (Array.isArray(parsed)) triage = parsed;
        else say(slug, round, 'triage output was not a JSON array — treating all findings as UNCLEAR');
      } catch { say(slug, round, 'triage output unparseable — treating all findings as UNCLEAR'); }
      const confirmed = triage.filter(t => t.verdict === 'CONFIRMED');
      const unclear = triage.filter(t => t.verdict === 'UNCLEAR');
      say(slug, round, `Triage: ${confirmed.length} confirmed, ${triage.filter(t => t.verdict === 'REJECTED').length} rejected, ${unclear.length} unclear.`);
      const forDefense = [...confirmed, ...unclear];
      if (forDefense.length || !triage.length) {
        const findingsText = forDefense.length ? JSON.stringify(forDefense, null, 2) : attack;
        const resumeId = m.winner === 'codex' ? meta(slug).codexThreadId : meta(slug).claudeThreadId;
        await callWithRetry(m.winner, slug, {
          role: 'defense', round, out: `checkpoint-${n}-defense.md`, briefName: `brief-checkpoint-${n}-defense.md`,
          brief: BRIEFS.defense(findingsText), cd: m.worktree, resume: resumeId,
          ...(m.winner === 'claude' ? { mode: 'write' } : { sandbox: 'workspace-write' }),
        });
        gitCommit(m.worktree, `fix: checkpoint-${n} defense`);
      }
      applyScore(join(duelsDir, 'SCOREBOARD.md'), { type: 'checkpoint', attacker: loser, attackPoints: confirmed.length, defender: m.winner, defensePoints: 0, category: m.category, slug, note: `headless triage: ${confirmed.length} confirmed (defense points require human review)` });
      setPhase(slug, 'implement', round, `Checkpoint ${n} complete: ${loser} +${confirmed.length} attack.`);
    },
    async finishDuel(slug) {
      const m = meta(slug);
      if (m.phase !== 'implement') throw new Error(`wrong phase ${m.phase} (need implement)`);
      if (m.checkpoints === 0) await this.runCheckpoint(slug);
      setPhase(slug, 'finished', 3 + meta(slug).checkpoints, `🏁 Duel finished. Branch ${meta(slug).branch} awaits YOUR merge decision — the launcher never merges.`);
    },
    // HITL sessions are idle between human turns — they never enqueue against the
    // concurrency cap (unlike spawnDuel's pipelines, which run start-to-finish unattended).
    async startHitl({ task, repo, category, ticket, map, skill = '/grilling' }) {
      const { slug } = await initDuel({ task, repo, pipeline: 'hitl', category, ticket, map });
      setPhase(slug, 'hitl-active', 1, '🎙️ Live session opened — the agent will lay out the terrain and ask its first question.');
      const r = await callWithRetry('claude', slug, {
        role: 'hitl', round: 1, out: 'hitl-turn-1.md', mode: 'read', cd: repo,
        briefName: 'brief-hitl-opening.md', brief: BRIEFS.hitlOpening(task, skill),
      });
      patchMeta(slug, { hitlSessionId: r.threadId, hitlTurns: 1 });
      return { slug };
    },
    async hitlMessage(slug, text) {
      const m = meta(slug);
      if (m.phase !== 'hitl-active') throw new Error(`wrong phase ${m.phase} (need hitl-active)`);
      if (!m.hitlSessionId) throw new Error('hitl session not ready yet');
      // serialize turns per session: two concurrent messages would compute the same
      // turn number, resume the same stale session id, and clobber the same turn file
      if (hitlBusy.has(slug)) throw new Error('a turn is already in progress for this session');
      hitlBusy.add(slug);
      try {
        try { appendEvent(dd(slug), { actor: 'user', role: 'hitl', round: 1, content: text }); } catch {}
        const k = (m.hitlTurns || 1) + 1;
        const r = await callWithRetry('claude', slug, {
          role: 'hitl', round: 1, out: `hitl-turn-${k}.md`, mode: 'read', cd: m.repo,
          resume: m.hitlSessionId, briefName: `brief-hitl-${k}.md`, brief: text,
        });
        patchMeta(slug, { hitlSessionId: r.threadId || m.hitlSessionId, hitlTurns: k });
        if (readDoc(slug, `hitl-turn-${k}.md`).trimStart().startsWith('RESOLUTION:')) {
          setPhase(slug, 'awaiting-approve', 1, '📜 The session reached a resolution — Approve to record it.');
        }
      } finally { hitlBusy.delete(slug); }
    },
    // ---- live session: a chat/terminal channel attachable to ANY duel, in
    // parallel to its pipeline. Unlike HITL it does NOT change the duel's phase.
    async openSession(slug) {
      const m = meta(slug);
      if (m.sessionOpen && m.sessionId) return { slug, already: true };
      const cd = (m.worktree && existsSync(m.worktree)) ? m.worktree : m.repo;
      const r = await callWithRetry('claude', slug, {
        role: 'session', round: 1, out: 'session-turn-1.md', mode: 'read', cd,
        briefName: 'brief-session-open.md', brief: BRIEFS.sessionOpening(m.task, m.phase, dd(slug), m.worktree),
      });
      patchMeta(slug, { sessionOpen: true, sessionId: r.threadId, sessionTurns: 1, sessionEdit: false });
      return { slug };
    },
    async sessionMessage(slug, text) {
      const m = meta(slug);
      if (!m.sessionOpen || !m.sessionId) throw new Error('no live session — open one first');
      // serialize turns per session: two concurrent messages would compute the same
      // turn number, resume the same stale session id, and clobber the same turn file
      if (sessionBusy.has(slug)) throw new Error('a turn is already in progress for this session');
      sessionBusy.add(slug);
      try {
        try { appendEvent(dd(slug), { actor: 'user', role: 'session', round: 1, content: text }); } catch {}
        // edit access is re-checked at send time against the LIVE phase (it may have
        // advanced since the toggle was flipped), so it can never leak into a running round
        const edit = !!m.sessionEdit && canEdit(m);
        const k = (m.sessionTurns || 1) + 1;
        const r = await callWithRetry('claude', slug, {
          role: 'session', round: 1, out: `session-turn-${k}.md`,
          mode: edit ? 'write' : 'read', cd: edit ? m.worktree : ((m.worktree && existsSync(m.worktree)) ? m.worktree : m.repo),
          resume: m.sessionId, briefName: `brief-session-${k}.md`, brief: text,
        });
        patchMeta(slug, { sessionId: r.threadId || m.sessionId, sessionTurns: k });
        return { edit };
      } finally { sessionBusy.delete(slug); }
    },
    // toggle edit access; returns the effective state (false if the guardrail refuses)
    setSessionEdit(slug, on) {
      const m = meta(slug);
      const effective = !!on && canEdit(m);
      if (on && !effective) throw new Error(`edit not allowed in phase ${m.phase}${m.worktree ? '' : ' (no worktree)'}`);
      patchMeta(slug, { sessionEdit: effective });
      return { sessionEdit: effective };
    },
    canEditSession(slug) { try { return canEdit(meta(slug)); } catch { return false; } },
    status() {
      return {
        running: [...running.entries()].map(([key, r]) => { const base = key.replace(/#(impl|greptile)$/, ''); return { slug: base, pipeline: r.pipeline, phase: meta(base).phase }; }),
        queued: queue.map(q => q.key.replace(/#(impl|greptile)$/, '')),
      };
    },
    // kill every live wrapper (each propagates SIGTERM to its detached model group);
    // the server registers this on its own SIGTERM/SIGINT so a viewer shutdown never
    // orphans running claude/codex processes.
    shutdown() { for (const c of activeChildren) { try { c.kill('SIGTERM'); } catch {} } activeChildren.clear(); },
    // internals exposed for Tasks 7/8 (same module) and tests:
    _internals: { callWrapper, callWithRetry, meta, patchMeta, say, setPhase, enqueue, readDoc, duelsDir, BRIEFS },
  };
}
