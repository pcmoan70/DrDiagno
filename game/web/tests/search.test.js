import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDb } from './helpers.js';
import { searchTerms } from '../engine/search.js';
import { suggest } from '../engine/scoring.js';

const db = loadTestDb();

test('term search finds seizure first and matches lay names', () => {
  const r = searchTerms(db, 'seizure');
  assert.equal(r[0].id, 'HP:0001250');
  assert.ok(searchTerms(db, 'foot drop').length > 0);
  assert.equal(searchTerms(db, 'x').length, 0);
  assert.ok(searchTerms(db, 'seizure', 5, new Set(['HP:0001250'])).every((e) => e.id !== 'HP:0001250'));
});

test('watch-along ranking: a textbook triad ranks its disease in the top 10', () => {
  // Rett syndrome: regression, stereotypic hand movements, microcephaly (postnatal)
  const state = { findings: [{ t: 'HP:0002376' }, { t: 'HP:0012171' }, { t: 'HP:0005484' }], negatives: [] };
  const top = suggest(db, state, 10).map((r) => db.disease(r.id).n.toLowerCase());
  assert.ok(top.some((n) => n.includes('rett')), top.join(' | '));
});
