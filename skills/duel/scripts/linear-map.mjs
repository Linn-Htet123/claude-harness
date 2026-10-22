#!/usr/bin/env node
// Deterministic Linear → wayfinder-map sync. A single LLM agent cannot reliably transform a
// large map (SPS-81 = 82 children, ~126KB from list_issues) within budget — it timed out 4×.
// list_issues returns clean JSON, so the right tool is a parser, not a model. This module does
// the fetch (GraphQL) + the transform (pure, unit-tested against real data). Used by
// tracker-agent.mjs for the sync op when LINEAR_API_KEY is set; otherwise it falls back to the
// LLM agent (fine for small/local maps).

// wayfinder ticket type is carried on a `wayfinder:<type>` label; default to a plain task.
export function ticketType(labels = []) {
  const w = (labels || []).find(l => typeof l === 'string' && l.startsWith('wayfinder:'));
  const t = w ? w.slice('wayfinder:'.length) : 'task';
  return ['research', 'task', 'grilling', 'prototype'].includes(t) ? t : 'task';
}
export const isHitlType = (type) => type === 'grilling' || type === 'prototype';

// Linear workflow-state TYPE → wayfinder status. completed/canceled ⇒ closed; an in-progress
// issue with an assignee ⇒ claimed; everything else open ⇒ frontier. (blockedBy needs the
// relations graph, which we don't fetch here, so the frontier is "unblocked by construction".)
export function ticketStatus(statusType, assignee) {
  if (statusType === 'completed' || statusType === 'canceled') return 'closed';
  if (assignee && statusType === 'started') return 'claimed';
  return 'frontier';
}

// pull the destination line + out-of-scope gists out of the map issue's markdown body. The body
// stores newlines literally as backslash-n inside the JSON string, so match on that.
export function mapNarrative(body = '') {
  let destination = '';
  const outOfScope = [];
  const dm = body.match(/## Destination[^A-Za-z0-9]*?\\n\\n(.+?)\\n/);
  if (dm) {
    // "**… — Route C: Lovable parity core + creator vertical extensions.** …" → after the first "— "
    const seg = dm[1].includes('— ') ? dm[1].split('— ').slice(1).join('— ') : dm[1];
    destination = seg.replace(/\*\*/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').split('.')[0].trim().slice(0, 120);
  }
  const om = body.match(/## Out of scope\\n\\n([\s\S]{0,800}?)(?:\\n## |$)/);
  if (om) for (const m of om[1].matchAll(/\*\s+\*\*([^*]{3,70})\*\*/g)) outOfScope.push(m[1].trim());
  return { destination, outOfScope: outOfScope.slice(0, 6) };
}

// Transform the (normalised) Linear payload into the tracker-neutral map JSON that syncMap
// merges. `issues` items are {id, title, statusType, labels[], assignee}. Pure + deterministic.
export function parseLinearMap({ issues = [], mapBody = '', mapId = '', mapName = '' }) {
  const tickets = issues.map(it => {
    const type = ticketType(it.labels);
    return {
      id: it.id, name: it.title || it.id, type,
      status: ticketStatus(it.statusType, it.assignee),
      hitl: isHitlType(type), blockedBy: [], duel: null, heldBy: null,
    };
  });
  const { destination, outOfScope } = mapNarrative(mapBody);
  return {
    map: { id: mapId, name: mapName || mapId, destination, tracker: 'linear' },
    tickets, fog: [], outOfScope,
  };
}

// ── GraphQL fetch (needs a personal API key; untestable without one, kept thin) ──────────────
const ENDPOINT = 'https://api.linear.app/graphql';

async function gql(apiKey, query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API ${res.status} ${res.statusText}`);
  const j = await res.json();
  if (j.errors) throw new Error('Linear API: ' + JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

// mapId like "SPS-81" → { team key "SPS", number 81 }
function splitId(mapId) {
  const m = String(mapId).match(/^([A-Za-z][A-Za-z0-9]*)-(\d+)$/);
  if (!m) throw new Error(`unrecognised Linear issue id: ${mapId}`);
  return { team: m[1], number: Number(m[2]) };
}

const norm = (n) => ({
  id: n.identifier, title: n.title, statusType: n.state?.type,
  labels: (n.labels?.nodes || []).map(l => l.name), assignee: n.assignee?.name || null,
});

// Fetch the map issue's body + ALL its child tickets (paginated), normalised to the shape
// parseLinearMap expects. Returns { mapBody, mapName, issues }.
export async function fetchLinearMap(mapId, apiKey) {
  const { team, number } = splitId(mapId);
  const head = await gql(apiKey,
    `query($num:Float!,$team:String!){issues(filter:{number:{eq:$num},team:{key:{eq:$team}}},first:1){nodes{id title description}}}`,
    { num: number, team });
  const map = head.issues?.nodes?.[0];
  if (!map) throw new Error(`Linear issue ${mapId} not found`);

  const issues = [];
  let after = null;
  do {
    const page = await gql(apiKey,
      `query($id:ID!,$after:String){issues(filter:{parent:{id:{eq:$id}}},first:250,after:$after){nodes{identifier title state{type} labels{nodes{name}} assignee{name}} pageInfo{hasNextPage endCursor}}}`,
      { id: map.id, after });
    const conn = page.issues;
    for (const n of conn.nodes) issues.push(norm(n));
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);

  return { mapBody: map.description || '', mapName: map.title || mapId, issues };
}

// Full deterministic sync: fetch + parse. Throws if no key (caller falls back to the LLM agent).
export async function linearSync(mapId, apiKey) {
  if (!apiKey) throw new Error('no LINEAR_API_KEY');
  const { mapBody, mapName, issues } = await fetchLinearMap(mapId, apiKey);
  return parseLinearMap({ issues, mapBody, mapId, mapName });
}
