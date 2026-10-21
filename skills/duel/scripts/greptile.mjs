#!/usr/bin/env node
// Greptile PR-review-loop helpers. Greptile runs as a GitHub App on the repo: it posts a
// "Greptile Review" CHECK (pending → pass/fail) and an issue comment carrying
// "Confidence Score: N/5" plus inline review comments. This module parses those surfaces so the
// duel launcher can drive the AGENTS.md loop: open PR → poll → codex fixes actionable comments →
// re-push → re-poll until 5/5. Parsers are pure (tested against real Greptile output); the gh
// calls are thin wrappers.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

const isGreptile = (login) => /greptile/i.test(login || '');

// Latest Greptile confidence score (0..5) from an issues/<n>/comments JSON array, or null if
// Greptile hasn't scored yet. Greptile re-comments each pass, so the LAST score wins.
export function parseScore(commentsJson) {
  let comments; try { comments = JSON.parse(commentsJson); } catch { return null; }
  if (!Array.isArray(comments)) return null;
  let score = null;
  for (const c of comments) {
    if (!isGreptile(c.user?.login)) continue;
    const m = (c.body || '').match(/Confidence Score:\s*(\d)\s*\/\s*5/i);
    if (m) score = Number(m[1]);
  }
  return score;
}

// The "Greptile Review" check state from `gh pr checks --json name,state,bucket`:
// 'pending' (still running), 'pass', 'fail', or 'absent' (no Greptile check yet).
export function parseCheckState(checksJson) {
  let checks; try { checks = JSON.parse(checksJson); } catch { return 'absent'; }
  if (!Array.isArray(checks)) return 'absent';
  const g = checks.find((c) => isGreptile(c.name));
  if (!g) return 'absent';
  const s = String(g.state || g.bucket || '').toLowerCase();
  if (['pending', 'queued', 'in_progress', 'waiting', ''].includes(s)) return 'pending';
  if (['pass', 'success', 'neutral', 'skipping', 'skipped'].includes(s)) return 'pass';
  return 'fail';
}

// Actionable Greptile inline comments from a pulls/<n>/comments JSON array. Each → {path,line,body}.
// (Informational/resolved filtering is left to the fixer's judgment — the brief tells it to skip
// clearly-informational or incorrect ones, per AGENTS.md step 4.)
export function parseReviewComments(commentsJson) {
  let comments; try { comments = JSON.parse(commentsJson); } catch { return []; }
  if (!Array.isArray(comments)) return [];
  return comments
    .filter((c) => isGreptile(c.user?.login) && (c.body || '').trim())
    .map((c) => ({ path: c.path || '', line: c.line ?? c.original_line ?? null, body: (c.body || '').trim() }));
}

// true when Greptile is satisfied: 5/5 confidence. (Zero actionable comments alone is NOT
// enough — Greptile scores below 5 with only nits sometimes; the score is the gate per AGENTS.md.)
export function greptilePassed(score) { return score === 5; }

// ── thin gh/git wrappers (not unit-tested; exercised live) ───────────────────────────────────
export async function gh(args, cwd) {
  const { stdout } = await pexec('gh', args, { cwd, maxBuffer: 16e6 });
  return stdout;
}
export async function git(args, cwd) {
  const { stdout } = await pexec('git', args, { cwd, maxBuffer: 16e6 });
  return stdout;
}

// owner/repo from a git remote URL (git@host:owner/repo.git or https://host/owner/repo.git). Pure.
export function parseRepoSlug(url) {
  const m = String(url).trim().match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`cannot parse repo slug from origin: ${url}`);
  return m[1];
}
export async function repoSlug(cwd) { return parseRepoSlug(await git(['remote', 'get-url', 'origin'], cwd)); }
