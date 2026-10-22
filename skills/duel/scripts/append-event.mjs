#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const ACTORS = ['claude', 'codex', 'orchestrator', 'user'];
export const ROLES = ['design', 'rebuttal', 'defense', 'verdict', 'checkpoint-attack', 'status', 'hitl', 'session'];

export function appendEvent(duelDir, evt) {
  if (!evt || typeof evt !== 'object') throw new Error('invalid event: not an object');
  if (!ACTORS.includes(evt.actor)) throw new Error(`invalid event: actor ${evt.actor}`);
  if (!ROLES.includes(evt.role)) throw new Error(`invalid event: role ${evt.role}`);
  if (typeof evt.content !== 'string' || !evt.content) throw new Error('invalid event: content required');
  const out = { ...evt, ts: evt.ts || new Date().toISOString() };
  mkdirSync(duelDir, { recursive: true });
  appendFileSync(join(duelDir, 'events.jsonl'), JSON.stringify(out) + '\n');
  return out;
}

// CLI: append-event.mjs <duel-dir> ['<json>'] (or JSON on stdin)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [dir, jsonArg] = process.argv.slice(2);
  try {
    const raw = jsonArg ?? (await import('node:fs')).readFileSync(0, 'utf8');
    if (!dir) throw new Error('usage: append-event.mjs <duel-dir> [json]');
    appendEvent(dir, JSON.parse(raw));
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
