import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, tierStats, topicStats, missedDiseases, HISTORY_MAX } from '../web/engine/progress.js';

const e = (over) => ({ at: 1, tier: 'resident', seed: 's', id: 'M1', name: 'One', status: 'won', score: 500, hours: 10, spent: 100, systems: ['nervous system'], ...over });

test('addEntry replaces a replayed code and caps the history', () => {
  let h = addEntry([], e({ seed: 'a', status: 'lost', score: 0 }));
  h = addEntry(h, e({ seed: 'a', status: 'won', score: 700 }));
  assert.equal(h.length, 1); assert.equal(h[0].score, 700);
  for (let i = 0; i < HISTORY_MAX + 20; i++) h = addEntry(h, e({ seed: 'x' + i }));
  assert.equal(h.length, HISTORY_MAX);
});

test('tierStats: win rate, best, trend', () => {
  let h = [];
  for (let i = 0; i < 10; i++) h = addEntry(h, e({ seed: 'r' + i, status: i < 5 ? 'lost' : 'won', score: i < 5 ? 0 : 600 + i }));
  const s = tierStats(h, 'resident');
  assert.equal(s.played, 10); assert.equal(s.won, 5); assert.equal(s.winRate, 0.5); assert.equal(s.best, 609);
  assert.ok(s.trend > 0);
  assert.equal(tierStats(h, 'house').played, 0);
});

test('topicStats ranks the weakest organ systems first; missedDiseases forgets solved ones', () => {
  let h = [];
  h = addEntry(h, e({ seed: '1', status: 'lost', id: 'A', name: 'Alpha', systems: ['eye', 'ear'] }));
  h = addEntry(h, e({ seed: '2', status: 'won', id: 'B', name: 'Beta', systems: ['eye'] }));
  h = addEntry(h, e({ seed: '3', status: 'lost', id: 'A', name: 'Alpha', systems: ['ear'] }));
  const t = topicStats(h);
  assert.equal(t[0].system, 'ear'); assert.equal(t[0].winRate, 0); assert.equal(t[1].system, 'eye'); assert.equal(t[1].winRate, 0.5);
  let missed = missedDiseases(h);
  assert.deepEqual(missed.map((m) => [m.id, m.misses]), [['A', 2]]);
  h = addEntry(h, e({ seed: '4', status: 'won', id: 'A', name: 'Alpha' }));
  assert.equal(missedDiseases(h).length, 0);
});
