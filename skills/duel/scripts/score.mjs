#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const SEED = `# Duel Scoreboard

## Score

| Model  | Design wins | Attack points | Defense points |
|--------|-------------|---------------|----------------|
| claude | 0 | 0 | 0 |
| codex  | 0 | 0 | 0 |

## By category

| Category | Claude | Codex |
|----------|--------|-------|

## Runtime Facts

- (none yet)

## Duel log

`;

// escape any user-supplied value before interpolating into a RegExp — category
// flows from a POST body, so an unescaped `.`/`+`/`(` would mis-match, duplicate
// rows, corrupt a neighbouring category, or throw (verified in review).
const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MODEL_ROW = (m) => new RegExp(`^\\| ${m}\\s*\\| (\\d+) \\| (\\d+) \\| (\\d+) \\|$`, 'm');

function bump(s, model, col, by) {
  return s.replace(MODEL_ROW(model), (row, d, a, def) => {
    const v = [Number(d), Number(a), Number(def)];
    v[col] += by;
    const pad = model === 'codex' ? 'codex ' : model; // preserve seed's column alignment
    return `| ${pad} | ${v[0]} | ${v[1]} | ${v[2]} |`;
  });
}

function upsertCategory(s, category, model, by) {
  const rowRe = new RegExp(`^\\| ${escapeRe(category)} \\| (\\d+) \\| (\\d+) \\|$`, 'm');
  if (rowRe.test(s)) {
    return s.replace(rowRe, (row, c, x) => {
      let claude = Number(c), codex = Number(x);
      if (model === 'claude') claude += by; else codex += by;
      return `| ${category} | ${claude} | ${codex} |`;
    });
  }
  const claude = model === 'claude' ? by : 0;
  const codex = model === 'codex' ? by : 0;
  return s.replace(/\| Category \| Claude \| Codex \|\n\|[-| ]+\|/,
    (hdr) => `${hdr}\n| ${category} | ${claude} | ${codex} |`);
}

const logLine = (s, text) => s.replace(/## Duel log\n/, `## Duel log\n\n- ${text}\n`).replace(/\n\n\n+/g, '\n\n');

export function applyScore(scoreboardPath, action) {
  let s = existsSync(scoreboardPath) ? readFileSync(scoreboardPath, 'utf8') : SEED;
  if (action.type === 'design-win') {
    s = bump(s, action.winner, 0, 2);
    s = upsertCategory(s, action.category, action.winner, 2);
    s = logLine(s, `${action.slug} (${action.category}) — design win: ${action.winner} (+2)`);
  } else if (action.type === 'checkpoint') {
    if (action.attackPoints) s = bump(s, action.attacker, 1, action.attackPoints);
    if (action.defensePoints) s = bump(s, action.defender, 2, action.defensePoints);
    s = logLine(s, `${action.slug} (${action.category}) — checkpoint: ${action.attacker} +${action.attackPoints} attack, ${action.defender} +${action.defensePoints} defense. ${action.note || ''}`.trim());
  } else if (action.type === 'runtime-fact') {
    if (s.includes('- (none yet)')) s = s.replace('- (none yet)', `- ${action.text}`);
    else s = s.replace(/(## Runtime Facts\n\n)((?:- .*\n)*)/, (m, hdr, facts) => {
      const list = facts.trim().split('\n').filter(Boolean);
      list.push(`- ${action.text}`);
      while (list.length > 5) list.shift();
      return hdr + list.join('\n') + '\n';
    });
  } else throw new Error(`unknown score action: ${action.type}`);
  writeFileSync(scoreboardPath, s);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const DUELS_DIR = process.env.DUELS_DIR || join(homedir(), '.claude', 'duels');
  try { applyScore(join(DUELS_DIR, 'SCOREBOARD.md'), JSON.parse(process.argv[2])); }
  catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
