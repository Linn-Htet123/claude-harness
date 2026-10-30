import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore, parseCheckState, parseReviewComments, greptilePassed } from '../scripts/greptile.mjs';

// real Greptile issue-comment shape
const scored = (n) => `<h3>Greptile Summary</h3>\nThis PR does a thing.\n<h3>Confidence Score: ${n}/5</h3>\nnotes`;

test('parseScore reads the confidence score from the LATEST Greptile comment', () => {
  const comments = JSON.stringify([
    { user: { login: 'alice' }, body: 'lgtm' },
    { user: { login: 'greptile-apps[bot]' }, body: scored(3) },
    { user: { login: 'greptile-apps[bot]' }, body: scored(5) }, // a later pass — wins
  ]);
  assert.equal(parseScore(comments), 5);
});
test('parseScore ignores non-Greptile authors and returns null when unscored', () => {
  assert.equal(parseScore(JSON.stringify([{ user: { login: 'someone' }, body: 'Confidence Score: 5/5' }])), null);
  assert.equal(parseScore(JSON.stringify([{ user: { login: 'greptile-apps[bot]' }, body: 'still reviewing…' }])), null);
  assert.equal(parseScore('not json'), null);
});

test('parseCheckState maps the Greptile Review check', () => {
  const mk = (state) => JSON.stringify([{ name: 'build', bucket: 'pass' }, { name: 'Greptile Review', state, bucket: state }]);
  assert.equal(parseCheckState(mk('pending')), 'pending');
  assert.equal(parseCheckState(mk('in_progress')), 'pending');
  assert.equal(parseCheckState(mk('pass')), 'pass');
  assert.equal(parseCheckState(mk('fail')), 'fail');
  assert.equal(parseCheckState(JSON.stringify([{ name: 'build', bucket: 'pass' }])), 'absent', 'no greptile check');
  assert.equal(parseCheckState('garbage'), 'absent');
});

test('parseReviewComments extracts actionable Greptile inline comments', () => {
  const json = JSON.stringify([
    { user: { login: 'greptile-apps[bot]' }, path: 'src/a.ts', line: 42, body: 'This can throw on null.' },
    { user: { login: 'alice' }, path: 'src/b.ts', line: 1, body: 'human note' },
    { user: { login: 'greptile-apps[bot]' }, path: 'src/c.ts', original_line: 7, body: '  ' }, // empty → skipped
  ]);
  const out = parseReviewComments(json);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { path: 'src/a.ts', line: 42, body: 'This can throw on null.' });
});

test('greptilePassed is true only at 5/5', () => {
  assert.equal(greptilePassed(5), true);
  assert.equal(greptilePassed(4), false);
  assert.equal(greptilePassed(null), false);
});
